/* ============================================================
   routes/latePolicies.js — Aturan keterlambatan & potongan gaji
   per karyawan, BERVERSI. Setiap penyimpanan membuat versi baru
   dengan tanggal mulai berlaku, bukan menimpa yang lama —
   supaya perhitungan periode lampau tidak ikut berubah saat
   owner mengganti aturan hari ini.

   Toleransi dinyatakan sebagai MENIT SETELAH JAM MASUK
   TERJADWAL (grace_minutes), bukan jam absolut, supaya
   menggeser jam masuk di jadwal ikut menggeser batas telat.
   Owner only.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { recordAudit } = require('../auditLog');

const router = express.Router();

const DEDUCTION_TYPES = ['flat', 'per_minute', 'percentage'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toJson(row) {
  return {
    id: row.id,
    graceMinutes: row.grace_minutes,
    thresholdMinutes: row.threshold_minutes,
    deductionType: row.deduction_type,
    deductionFlatAmount: row.deduction_flat_amount,
    deductionPerMinuteAmount: row.deduction_per_minute_amount,
    deductionPercentage: row.deduction_percentage,
    effectiveFrom: row.effective_from
  };
}

router.get('/', requireOwner, (req, res) => {
  const employees = db.prepare('SELECT id, name FROM employees WHERE deleted_at IS NULL ORDER BY name').all();
  const all = db.prepare('SELECT * FROM late_policies ORDER BY effective_from DESC, id DESC').all();

  const byEmployee = new Map();
  for (const row of all) {
    if (!byEmployee.has(row.employee_id)) byEmployee.set(row.employee_id, []);
    byEmployee.get(row.employee_id).push(toJson(row));
  }

  res.json(employees.map(emp => ({
    employeeId: emp.id,
    name: emp.name,
    versions: byEmployee.get(emp.id) || []
  })));
});

router.put('/', requireOwner, (req, res) => {
  const {
    employeeIds, graceMinutes, thresholdMinutes, deductionType,
    deductionFlatAmount, deductionPerMinuteAmount, deductionPercentage, effectiveFrom
  } = req.body || {};

  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    return res.status(400).json({ error: 'Pilih minimal satu karyawan.' });
  }
  if (!Number.isFinite(Number(graceMinutes)) || Number(graceMinutes) < 0) {
    return res.status(400).json({ error: 'Toleransi keterlambatan wajib diisi angka 0 atau lebih.' });
  }
  if (!Number.isFinite(Number(thresholdMinutes)) || Number(thresholdMinutes) < 0) {
    return res.status(400).json({ error: 'Ambang menit telat wajib diisi angka 0 atau lebih.' });
  }
  if (!DEDUCTION_TYPES.includes(deductionType)) {
    return res.status(400).json({ error: 'Skema potongan tidak valid.' });
  }
  if (deductionType === 'flat' && !Number.isFinite(Number(deductionFlatAmount))) {
    return res.status(400).json({ error: 'Nominal potongan tetap wajib diisi.' });
  }
  if (deductionType === 'per_minute' && !Number.isFinite(Number(deductionPerMinuteAmount))) {
    return res.status(400).json({ error: 'Tarif potongan per menit wajib diisi.' });
  }
  if (deductionType === 'percentage' && !Number.isFinite(Number(deductionPercentage))) {
    return res.status(400).json({ error: 'Persentase potongan wajib diisi.' });
  }
  if (!DATE_PATTERN.test(String(effectiveFrom || ''))) {
    return res.status(400).json({ error: 'Tanggal berlaku wajib diisi format YYYY-MM-DD.' });
  }

  const existingIds = new Set(db.prepare('SELECT id FROM employees WHERE deleted_at IS NULL').all().map(r => r.id));
  for (const id of employeeIds) {
    if (!existingIds.has(Number(id))) {
      return res.status(404).json({ error: `Karyawan dengan id ${id} tidak ditemukan.` });
    }
  }

  const insert = db.prepare(`
    INSERT INTO late_policies (
      employee_id, grace_minutes, threshold_minutes, deduction_type,
      deduction_flat_amount, deduction_per_minute_amount, deduction_percentage,
      effective_from, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  for (const id of employeeIds) {
    const info = insert.run(
      Number(id),
      Number(graceMinutes),
      Number(thresholdMinutes),
      deductionType,
      deductionType === 'flat' ? Number(deductionFlatAmount) : null,
      deductionType === 'per_minute' ? Number(deductionPerMinuteAmount) : null,
      deductionType === 'percentage' ? Number(deductionPercentage) : null,
      effectiveFrom,
      now
    );
    recordAudit(req.session, {
      action: 'create', entity: 'late_policy', entityId: info.lastInsertRowid,
      before: null,
      after: db.prepare('SELECT * FROM late_policies WHERE id = ?').get(info.lastInsertRowid),
      createdAt: now
    });
  }

  res.json({ ok: true, saved: employeeIds.length });
});

/* Menghapus SATU versi berdasarkan id versinya, bukan semua aturan karyawan —
   owner bisa membatalkan satu perubahan tanpa kehilangan riwayat lainnya. */
router.delete('/:id', requireOwner, (req, res) => {
  const row = db.prepare('SELECT * FROM late_policies WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Versi aturan tidak ditemukan.' });

  db.prepare('DELETE FROM late_policies WHERE id = ?').run(row.id);
  // Sama seperti jadwal kerja: menghapus satu versi menggeser potongan gaji
  // periode lampau, jadi isinya harus tersimpan sebelum hilang.
  recordAudit(req.session, {
    action: 'delete', entity: 'late_policy', entityId: row.id,
    before: row, after: null, reason: (req.body || {}).reason
  });
  res.json({ ok: true });
});

module.exports = router;
