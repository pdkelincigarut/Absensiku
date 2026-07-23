/* ============================================================
   routes/employees.js — Data karyawan
   GET tersedia untuk HR & Owner (HR tidak dapat field dailyWage,
   otorisasi ini dijalankan di server, bukan cuma disembunyikan
   di UI). Tulis/hapus khusus Owner.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

function toJson(row, includeWage) {
  const emp = {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    active: !!row.active,
    createdAt: row.created_at
  };
  if (includeWage) emp.dailyWage = row.daily_wage;
  return emp;
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM employees ORDER BY name').all();
  const includeWage = req.session.role === 'owner';
  res.json(rows.map(r => toJson(r, includeWage)));
});

router.post('/', requireOwner, (req, res) => {
  const { name, dailyWage, birthDate, active } = req.body || {};
  if (!name || !name.trim() || !Number.isFinite(Number(dailyWage))) {
    return res.status(400).json({ error: 'Nama dan upah harian wajib diisi.' });
  }
  const info = db.prepare(
    `INSERT INTO employees (name, daily_wage, birth_date, active, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(name.trim(), Number(dailyWage), birthDate || null, active === false ? 0 : 1, Date.now());

  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(toJson(row, true));
});

router.put('/:id', requireOwner, (req, res) => {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

  const { name, dailyWage, birthDate, active } = req.body || {};
  if (!name || !name.trim() || !Number.isFinite(Number(dailyWage))) {
    return res.status(400).json({ error: 'Nama dan upah harian wajib diisi.' });
  }

  db.prepare(
    `UPDATE employees SET name = ?, daily_wage = ?, birth_date = ?, active = ? WHERE id = ?`
  ).run(name.trim(), Number(dailyWage), birthDate || null, active === false ? 0 : 1, req.params.id);

  const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  res.json(toJson(updated, true));
});

router.delete('/:id', requireOwner, (req, res) => {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
