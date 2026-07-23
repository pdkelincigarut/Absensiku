/* ============================================================
   routes/attendance.js — Ceklis kehadiran & riwayat
   Jam masuk (check_in_time) SELALU diisi dari jam server saat
   status 'hadir' — field itu di body request diabaikan kalau ada.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function pad2(n) { return String(n).padStart(2, '0'); }
function serverTimeStr() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function toJson(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    date: row.date,
    status: row.status,
    attendanceType: row.attendance_type,
    hoursWorked: row.hours_worked,
    checkInTime: row.check_in_time,
    note: row.note,
    markedBy: row.marked_by,
    updatedAt: row.updated_at
  };
}

router.get('/', requireAuth, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Parameter date wajib diisi.' });

  const rows = db.prepare(`
    SELECT a.*, e.name AS employee_name
    FROM attendance a JOIN employees e ON e.id = a.employee_id
    WHERE a.date = ?
  `).all(date);
  res.json(rows.map(toJson));
});

router.get('/history', requireAuth, (req, res) => {
  const { employeeId, month } = req.query;
  if (!month) return res.status(400).json({ error: 'Parameter month wajib diisi.' });

  let sql = `
    SELECT a.*, e.name AS employee_name
    FROM attendance a JOIN employees e ON e.id = a.employee_id
    WHERE a.date LIKE ?
  `;
  const params = [`${month}%`];
  if (employeeId && employeeId !== 'all') {
    sql += ' AND a.employee_id = ?';
    params.push(employeeId);
  }
  sql += ' ORDER BY a.date DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(toJson));
});

router.put('/:employeeId/:date', requireAuth, (req, res) => {
  const { employeeId, date } = req.params;
  const { status, attendanceType, hoursWorked, note } = req.body || {};

  if (!['hadir', 'izin', 'sakit', 'alpa'].includes(status)) {
    return res.status(400).json({ error: 'Status tidak valid.' });
  }
  const employee = db.prepare('SELECT id FROM employees WHERE id = ?').get(employeeId);
  if (!employee) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

  let finalType = null, finalHours = null, checkInTime = null;
  if (status === 'hadir') {
    finalType = ['full', 'half', 'custom'].includes(attendanceType) ? attendanceType : 'full';
    if (finalType === 'full') finalHours = 8;
    else if (finalType === 'half') finalHours = 4;
    else {
      finalHours = Number(hoursWorked);
      if (!finalHours || finalHours <= 0) {
        return res.status(400).json({ error: 'Jumlah jam kerja harus lebih dari 0.' });
      }
    }
    checkInTime = serverTimeStr(); // jam server, BUKAN dari client
  }

  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (@employeeId, @date, @status, @attendanceType, @hoursWorked, @checkInTime, @note, @markedBy, @updatedAt)
    ON CONFLICT(employee_id, date) DO UPDATE SET
      status = excluded.status,
      attendance_type = excluded.attendance_type,
      hours_worked = excluded.hours_worked,
      check_in_time = excluded.check_in_time,
      note = excluded.note,
      marked_by = excluded.marked_by,
      updated_at = excluded.updated_at
  `).run({
    employeeId,
    date,
    status,
    attendanceType: finalType,
    hoursWorked: finalHours,
    checkInTime,
    note: note || '',
    markedBy: req.session.name,
    updatedAt: Date.now()
  });

  const row = db.prepare(`
    SELECT a.*, e.name AS employee_name
    FROM attendance a JOIN employees e ON e.id = a.employee_id
    WHERE a.employee_id = ? AND a.date = ?
  `).get(employeeId, date);
  res.json(toJson(row));
});

module.exports = router;
