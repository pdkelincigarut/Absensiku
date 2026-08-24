const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

const pad2 = n => String(n).padStart(2, '0');
const dateToStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/* Sama seperti payroll.js: periode berjalan mulai tanggal 28 bulan lalu. */
const PERIOD_START_DAY = 28;

/* Tanggal ini dites lewat rumus gaji LAMA (jam tetap, cap 8) -- lihat
   WAGE_ENGINE_V2_FROM di routes/payroll.js. Dipakai awal periode berjalan,
   bukan tanggal tetap, supaya selalu ada di dalam periode yang dibaca
   endpoint tanpa perlu tahu tanggal hari ini menjalankan test. Begitu
   tanggal ini sendiri lewat cutover (berbulan-bulan ke depan), test ini
   perlu tanggal lain -- keterbatasan yang sama seperti setiap batas
   berbasis waktu, bukan sesuatu yang perlu "diperbaiki" sekarang. */
function preCutoverDate() {
  const now = new Date();
  const startMonth = now.getDate() >= PERIOD_START_DAY ? now.getMonth() : now.getMonth() - 1;
  return dateToStr(new Date(now.getFullYear(), startMonth, PERIOD_START_DAY));
}

let db, server, port;

test.before(async () => {
  db = useTempDb();
  const router = require('../routes/payroll');
  const app = mountWithSession('/api/payroll', router, { accountId: 1, role: 'owner', name: 'Owner Test' });
  server = await startServer(app);
  port = server.address().port;
});

test.after(() => { server.close(); });

function insertEmployee(name, dailyWage) {
  db.prepare(`INSERT INTO employees (name, daily_wage, active, created_at) VALUES (?, ?, 1, ?)`)
    .run(name, dailyWage, Date.now());
  return db.prepare('SELECT id FROM employees WHERE name = ?').get(name).id;
}

function insertHadirPreCutover(employeeId, checkInTime) {
  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, ?, '', 'Test', ?)
  `).run(employeeId, preCutoverDate(), checkInTime, Date.now());
}

test('GET /api/payroll memotong gaji saat total menit telat melebihi ambang batas', async () => {
  const employeeId = insertEmployee('Telat Test', 100000);
  insertHadirPreCutover(employeeId, '09:15');
  // jadwal baku masuk 08:00 + toleransi 30 menit = batas 08:30, sama seperti sebelumnya
  db.prepare(`
    INSERT INTO late_policies (employee_id, grace_minutes, threshold_minutes, deduction_type, deduction_flat_amount, effective_from, created_at)
    VALUES (?, 30, 30, 'flat', 20000, '1970-01-01', ?)
  `).run(employeeId, Date.now());

  const res = await fetch(`http://localhost:${port}/api/payroll`);
  const data = await res.json();
  const row = data.rows.find(r => r.employeeId === employeeId);

  assert.equal(row.lateMinutesTotal, 45);
  assert.equal(row.deductionAmount, 20000);
  assert.equal(row.totalWage, 100000);
  assert.equal(row.finalWage, 80000);
});

test('GET /api/payroll tidak memotong gaji kalau karyawan belum punya aturan keterlambatan', async () => {
  const employeeId = insertEmployee('Tanpa Aturan', 100000);
  insertHadirPreCutover(employeeId, '09:15');

  const res = await fetch(`http://localhost:${port}/api/payroll`);
  const data = await res.json();
  const row = data.rows.find(r => r.employeeId === employeeId);

  assert.equal(row.lateMinutesTotal, 0);
  assert.equal(row.deductionAmount, 0);
  assert.equal(row.finalWage, row.totalWage);
  assert.equal(row.latePolicy, null);
});
