/* ============================================================
   routes/employees.js — Data karyawan
   GET tersedia untuk HR & Owner (HR tidak dapat field dailyWage,
   otorisasi ini dijalankan di server, bukan cuma disembunyikan
   di UI). Kode karyawan, jabatan, dan divisi boleh dilihat HR —
   tidak rahasia, dan HR butuh untuk membedakan nama yang mirip.
   Tulis/hapus khusus Owner.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

const SELECT_WITH_LOOKUPS = `
  SELECT e.*, j.name AS job_name, o.name AS organization_name
  FROM employees e
  LEFT JOIN jobs j ON j.id = e.job_id
  LEFT JOIN organizations o ON o.id = e.organization_id
`;

function toJson(row, includeWage) {
  const emp = {
    id: row.id,
    employeeCode: row.employee_code,
    name: row.name,
    birthDate: row.birth_date,
    job: row.job_id ? { id: row.job_id, name: row.job_name } : null,
    organization: row.organization_id ? { id: row.organization_id, name: row.organization_name } : null,
    active: !!row.active,
    createdAt: row.created_at
  };
  if (includeWage) emp.dailyWage = row.daily_wage;
  return emp;
}

function getById(id) {
  return db.prepare(`${SELECT_WITH_LOOKUPS} WHERE e.id = ?`).get(id);
}

/* Validasi bersama POST & PUT. `selfId` diisi saat PUT supaya karyawan
   yang sedang diubah tidak dianggap bentrok dengan kodenya sendiri.
   Mengembalikan string pesan error, atau null kalau semuanya sah. */
function validateEmployeeBody(body, selfId) {
  const { name, dailyWage, employeeCode, jobId, organizationId } = body;

  if (!name || !name.trim() || !Number.isFinite(Number(dailyWage))) {
    return 'Nama dan upah harian wajib diisi.';
  }

  const code = String(employeeCode == null ? '' : employeeCode).trim();
  if (!code) return 'Employee ID wajib diisi.';

  const clash = selfId
    ? db.prepare('SELECT id FROM employees WHERE LOWER(employee_code) = ? AND id <> ?').get(code.toLowerCase(), selfId)
    : db.prepare('SELECT id FROM employees WHERE LOWER(employee_code) = ?').get(code.toLowerCase());
  if (clash) return `Employee ID "${code}" sudah dipakai karyawan lain.`;

  if (jobId != null && jobId !== '' && !db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId)) {
    return 'Jabatan yang dipilih tidak ditemukan.';
  }
  if (organizationId != null && organizationId !== '' && !db.prepare('SELECT id FROM organizations WHERE id = ?').get(organizationId)) {
    return 'Divisi yang dipilih tidak ditemukan.';
  }

  return null;
}

function normalizeLookupId(value) {
  return value == null || value === '' ? null : Number(value);
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT_WITH_LOOKUPS} ORDER BY e.name`).all();
  const includeWage = req.session.role === 'owner';
  res.json(rows.map(r => toJson(r, includeWage)));
});

router.post('/', requireOwner, (req, res) => {
  const body = req.body || {};
  const error = validateEmployeeBody(body, null);
  if (error) return res.status(400).json({ error });

  const info = db.prepare(`
    INSERT INTO employees (name, daily_wage, birth_date, active, created_at, employee_code, job_id, organization_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.name.trim(),
    Number(body.dailyWage),
    body.birthDate || null,
    body.active === false ? 0 : 1,
    Date.now(),
    String(body.employeeCode).trim(),
    normalizeLookupId(body.jobId),
    normalizeLookupId(body.organizationId)
  );

  res.status(201).json(toJson(getById(info.lastInsertRowid), true));
});

router.put('/:id', requireOwner, (req, res) => {
  const row = db.prepare('SELECT id FROM employees WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

  const body = req.body || {};
  const error = validateEmployeeBody(body, row.id);
  if (error) return res.status(400).json({ error });

  db.prepare(`
    UPDATE employees
    SET name = ?, daily_wage = ?, birth_date = ?, active = ?, employee_code = ?, job_id = ?, organization_id = ?
    WHERE id = ?
  `).run(
    body.name.trim(),
    Number(body.dailyWage),
    body.birthDate || null,
    body.active === false ? 0 : 1,
    String(body.employeeCode).trim(),
    normalizeLookupId(body.jobId),
    normalizeLookupId(body.organizationId),
    row.id
  );

  res.json(toJson(getById(row.id), true));
});

router.delete('/:id', requireOwner, (req, res) => {
  const row = db.prepare('SELECT id FROM employees WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
