/* ============================================================
   routes/payroll.js — Laporan gaji (dipindah dari owner.js lama)
   Periode 27 bulan lalu s/d 26 bulan berjalan; upah = (min(jam,8)/8)
   x upah harian per hari status hadir. Owner only.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();

function pad2(n) { return String(n).padStart(2, '0'); }

function dateToStr(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function todayStr() {
  return dateToStr(new Date());
}

function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dateToStr(dt);
}

function getPeriodByOffset(offset) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const day = now.getDate();
  let startMonth = day >= 27 ? month : month - 1;
  let startYear = year;
  if (startMonth < 0) { startMonth = 11; startYear--; }

  startMonth += offset;
  while (startMonth < 0) { startMonth += 12; startYear--; }
  while (startMonth > 11) { startMonth -= 12; startYear++; }

  const start = new Date(startYear, startMonth, 27);
  let endMonth = startMonth + 1, endYear = startYear;
  if (endMonth > 11) { endMonth = 0; endYear++; }
  const end = new Date(endYear, endMonth, 26);
  return { start, end, offset };
}

function bumpStatus(counts, status) {
  if (status === 'hadir') counts.hadir++;
  else if (status === 'izin') counts.izin++;
  else if (status === 'sakit') counts.sakit++;
  else counts.alpa++;
}

router.get('/', requireOwner, (req, res) => {
  const offset = Number(req.query.periodOffset || 0);
  const period = getPeriodByOffset(offset);
  const startS = dateToStr(period.start);
  const endS = dateToStr(period.end);
  const todayS = todayStr();

  const employees = db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY name').all();

  const rows = employees.map(emp => {
    const records = db.prepare(
      `SELECT date, status, hours_worked FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`
    ).all(emp.id, startS, endS);
    const byDate = new Map(records.map(r => [r.date, r]));

    const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, totalHoursPaid: 0, totalWage: 0 };
    let cursor = startS;
    while (cursor <= endS && cursor <= todayS) {
      const rec = byDate.get(cursor);
      if (rec) {
        bumpStatus(counts, rec.status);
        if (rec.status === 'hadir') {
          const paidHours = Math.min(rec.hours_worked || 0, 8);
          counts.totalHoursPaid += paidHours;
          counts.totalWage += (paidHours / 8) * emp.daily_wage;
        }
      } else if (cursor < todayS) {
        counts.alpa++; // hari lampau tanpa data dianggap Alpa
      }
      cursor = addDaysStr(cursor, 1);
    }

    return { employeeId: emp.id, name: emp.name, dailyWage: emp.daily_wage, ...counts };
  });

  const grandTotal = rows.reduce((sum, r) => sum + r.totalWage, 0);
  res.json({ period: { start: startS, end: endS, offset }, rows, grandTotal });
});

module.exports = router;
