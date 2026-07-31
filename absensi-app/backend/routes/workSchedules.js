/* ============================================================
   routes/workSchedules.js — Jadwal kerja berversi.
   employee_id NULL = jadwal baku perusahaan; baris dengan
   employee_id terisi = pengecualian untuk karyawan itu.
   Menyimpan versi baru, bukan menimpa, supaya perhitungan
   periode lampau tidak ikut berubah. Owner only.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { timeToMinutes } = require('../scheduleResolver');

const router = express.Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function toJson(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || null,
    workDays: row.work_days,
    startTime: row.start_time,
    endTime: row.end_time,
    effectiveFrom: row.effective_from
  };
}

/* Mengembalikan pesan error, atau null kalau body-nya sah. */
function validateBody(body) {
  const { workDays, startTime, endTime, effectiveFrom } = body;

  const days = String(workDays == null ? '' : workDays).split(',').filter(s => s !== '');
  if (days.length === 0) return 'Pilih minimal satu hari kerja.';
  for (const d of days) {
    const n = Number(d);
    if (!Number.isInteger(n) || n < 0 || n > 6) return 'Hari kerja harus angka 0 sampai 6.';
  }

  if (!TIME_PATTERN.test(String(startTime || ''))) return 'Jam masuk wajib diisi format HH:MM.';
  if (!TIME_PATTERN.test(String(endTime || ''))) return 'Jam pulang wajib diisi format HH:MM.';
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return 'Jam pulang harus lebih akhir dari jam masuk.';
  }
  if (!DATE_PATTERN.test(String(effectiveFrom || ''))) {
    return 'Tanggal berlaku wajib diisi format YYYY-MM-DD.';
  }
  return null;
}

router.get('/', requireOwner, (req, res) => {
  const rows = db.prepare(`
    SELECT w.*, e.name AS employee_name
    FROM work_schedules w
    LEFT JOIN employees e ON e.id = w.employee_id
    ORDER BY w.effective_from DESC, w.id DESC
  `).all();

  res.json({
    company: rows.filter(r => r.employee_id === null).map(toJson),
    exceptions: rows.filter(r => r.employee_id !== null).map(toJson)
  });
});

router.put('/', requireOwner, (req, res) => {
  const body = req.body || {};
  const error = validateBody(body);
  if (error) return res.status(400).json({ error });

  const { employeeIds, workDays, startTime, endTime, effectiveFrom } = body;

  // null = jadwal baku perusahaan; array = pengecualian untuk tiap karyawan
  let targets;
  if (employeeIds === null || employeeIds === undefined) {
    targets = [null];
  } else if (Array.isArray(employeeIds) && employeeIds.length > 0) {
    const known = new Set(db.prepare('SELECT id FROM employees').all().map(r => r.id));
    for (const id of employeeIds) {
      if (!known.has(Number(id))) {
        return res.status(404).json({ error: `Karyawan dengan id ${id} tidak ditemukan.` });
      }
    }
    targets = employeeIds.map(Number);
  } else {
    return res.status(400).json({ error: 'Pilih minimal satu karyawan, atau kirim null untuk jadwal baku.' });
  }

  const cleanDays = String(workDays).split(',').filter(s => s !== '').map(Number).sort().join(',');
  const insert = db.prepare(`
    INSERT INTO work_schedules (employee_id, work_days, start_time, end_time, effective_from, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  for (const target of targets) {
    insert.run(target, cleanDays, startTime, endTime, effectiveFrom, now);
  }

  res.json({ ok: true, saved: targets.length });
});

router.delete('/:id', requireOwner, (req, res) => {
  const row = db.prepare('SELECT * FROM work_schedules WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Jadwal tidak ditemukan.' });

  if (row.employee_id === null) {
    // Tanpa jadwal baku, karyawan tanpa pengecualian tidak punya hari kerja sama
    // sekali dan seluruh perhitungan gaji berhenti bekerja. Sisa satu wajib ada.
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM work_schedules WHERE employee_id IS NULL').get();
    if (n <= 1) {
      return res.status(400).json({ error: 'Jadwal baku perusahaan tidak boleh dihapus semuanya. Tambahkan versi baru dulu kalau ingin menggantinya.' });
    }
  }

  db.prepare('DELETE FROM work_schedules WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

module.exports = router;
