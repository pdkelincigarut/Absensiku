/* ============================================================
   routes/latePolicies.js — Aturan keterlambatan & potongan gaji
   per karyawan. Owner only. employee_id adalah primary key di
   late_policies, jadi PUT selalu upsert (satu aturan per karyawan).
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();

const DEDUCTION_TYPES = ['flat', 'per_minute', 'percentage'];

function toLatePolicyJson(row) {
  if (!row) return null;
  return {
    checkInLimit: row.check_in_limit,
    thresholdMinutes: row.threshold_minutes,
    deductionType: row.deduction_type,
    deductionFlatAmount: row.deduction_flat_amount,
    deductionPerMinuteAmount: row.deduction_per_minute_amount,
    deductionPercentage: row.deduction_percentage
  };
}

router.get('/', requireOwner, (req, res) => {
  const employees = db.prepare('SELECT id, name FROM employees ORDER BY name').all();
  const policies = new Map(
    db.prepare('SELECT * FROM late_policies').all().map(row => [row.employee_id, row])
  );
  res.json(employees.map(emp => ({
    employeeId: emp.id,
    name: emp.name,
    latePolicy: toLatePolicyJson(policies.get(emp.id))
  })));
});

router.put('/', requireOwner, (req, res) => {
  const {
    employeeIds, checkInLimit, thresholdMinutes, deductionType,
    deductionFlatAmount, deductionPerMinuteAmount, deductionPercentage
  } = req.body || {};

  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    return res.status(400).json({ error: 'Pilih minimal satu karyawan.' });
  }
  if (!checkInLimit || !/^\d{2}:\d{2}$/.test(checkInLimit)) {
    return res.status(400).json({ error: 'Jam batas masuk wajib diisi format HH:MM.' });
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

  const existingIds = new Set(db.prepare('SELECT id FROM employees').all().map(r => r.id));
  for (const id of employeeIds) {
    if (!existingIds.has(Number(id))) {
      return res.status(404).json({ error: `Karyawan dengan id ${id} tidak ditemukan.` });
    }
  }

  const upsert = db.prepare(`
    INSERT INTO late_policies (
      employee_id, check_in_limit, threshold_minutes, deduction_type,
      deduction_flat_amount, deduction_per_minute_amount, deduction_percentage, updated_at
    ) VALUES (@employeeId, @checkInLimit, @thresholdMinutes, @deductionType,
      @deductionFlatAmount, @deductionPerMinuteAmount, @deductionPercentage, @updatedAt)
    ON CONFLICT(employee_id) DO UPDATE SET
      check_in_limit = excluded.check_in_limit,
      threshold_minutes = excluded.threshold_minutes,
      deduction_type = excluded.deduction_type,
      deduction_flat_amount = excluded.deduction_flat_amount,
      deduction_per_minute_amount = excluded.deduction_per_minute_amount,
      deduction_percentage = excluded.deduction_percentage,
      updated_at = excluded.updated_at
  `);

  const now = Date.now();
  for (const id of employeeIds) {
    upsert.run({
      employeeId: Number(id),
      checkInLimit,
      thresholdMinutes: Number(thresholdMinutes),
      deductionType,
      deductionFlatAmount: deductionType === 'flat' ? Number(deductionFlatAmount) : null,
      deductionPerMinuteAmount: deductionType === 'per_minute' ? Number(deductionPerMinuteAmount) : null,
      deductionPercentage: deductionType === 'percentage' ? Number(deductionPercentage) : null,
      updatedAt: now
    });
  }

  const placeholders = employeeIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM late_policies WHERE employee_id IN (${placeholders})`)
    .all(...employeeIds.map(Number));
  res.json(rows.map(row => ({ employeeId: row.employee_id, ...toLatePolicyJson(row) })));
});

router.delete('/:employeeId', requireOwner, (req, res) => {
  const row = db.prepare('SELECT employee_id FROM late_policies WHERE employee_id = ?').get(req.params.employeeId);
  if (!row) return res.status(404).json({ error: 'Karyawan ini belum punya aturan keterlambatan.' });
  db.prepare('DELETE FROM late_policies WHERE employee_id = ?').run(req.params.employeeId);
  res.json({ ok: true });
});

module.exports = router;
