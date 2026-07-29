/* ============================================================
   routes/payroll.js — Laporan gaji (dipindah dari owner.js lama)
   Periode 27 bulan lalu s/d 26 bulan berjalan; upah = (min(jam,8)/8)
   x upah harian per hari status hadir. Owner only.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { computeLateMinutes, computeDeduction } = require('../lateCalculator');

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
  const offset = Number(req.query.periodOffset || 0);
  const period = getPeriodByOffset(offset);
  const startS = dateToStr(period.start);
  const endS = dateToStr(period.end);
  const todayS = todayStr();

  const employees = db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY name').all();

  const rows = employees.map(emp => {
    const records = db.prepare(
      `SELECT date, status, hours_worked, check_in_time FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`
    ).all(emp.id, startS, endS);
    const byDate = new Map(records.map(r => [r.date, r]));
    const policyRow = db.prepare('SELECT * FROM late_policies WHERE employee_id = ?').get(emp.id);

    const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, totalHoursPaid: 0, totalWage: 0, lateMinutesTotal: 0 };
    let cursor = startS;
    while (cursor <= endS && cursor <= todayS) {
      const rec = byDate.get(cursor);
      if (rec) {
        bumpStatus(counts, rec.status);
        if (rec.status === 'hadir') {
          const paidHours = Math.min(rec.hours_worked || 0, 8);
          counts.totalHoursPaid += paidHours;
          counts.totalWage += (paidHours / 8) * emp.daily_wage;
          if (policyRow) {
            counts.lateMinutesTotal += computeLateMinutes(rec.check_in_time, policyRow.check_in_limit);
          }
        }
      } else if (cursor < todayS) {
        counts.alpa++; // hari lampau tanpa data dianggap Alpa
      }
      cursor = addDaysStr(cursor, 1);
    }

    const latePolicy = toLatePolicyJson(policyRow);
    const deductionAmount = policyRow
      ? computeDeduction({
          thresholdMinutes: policyRow.threshold_minutes,
          deductionType: policyRow.deduction_type,
          deductionFlatAmount: policyRow.deduction_flat_amount,
          deductionPerMinuteAmount: policyRow.deduction_per_minute_amount,
          deductionPercentage: policyRow.deduction_percentage
        }, counts.lateMinutesTotal, counts.totalWage)
      : 0;
    const finalWage = Math.max(0, counts.totalWage - deductionAmount);

    return {
      employeeId: emp.id, name: emp.name, dailyWage: emp.daily_wage,
      ...counts, latePolicy, deductionAmount, finalWage
    };
  });

  const grandTotal = rows.reduce((sum, r) => sum + r.totalWage, 0);
  const grandFinalTotal = rows.reduce((sum, r) => sum + r.finalWage, 0);
  res.json({ period: { start: startS, end: endS, offset }, rows, grandTotal, grandFinalTotal });
});

module.exports = router;
