const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

function todayStr() {
  const d = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function insertHadirToday(employeeId, checkInTime) {
  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, ?, '', 'Test', ?)
  `).run(employeeId, todayStr(), checkInTime, Date.now());
}

test('GET /api/payroll memotong gaji saat total menit telat melebihi ambang batas', async () => {
  const employeeId = insertEmployee('Telat Test', 100000);
  insertHadirToday(employeeId, '09:15');
  db.prepare(`
    INSERT INTO late_policies (employee_id, check_in_limit, threshold_minutes, deduction_type, deduction_flat_amount, updated_at)
    VALUES (?, '08:30', 30, 'flat', 20000, ?)
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
  insertHadirToday(employeeId, '09:15');

  const res = await fetch(`http://localhost:${port}/api/payroll`);
  const data = await res.json();
  const row = data.rows.find(r => r.employeeId === employeeId);

  assert.equal(row.lateMinutesTotal, 0);
  assert.equal(row.deductionAmount, 0);
  assert.equal(row.finalWage, row.totalWage);
  assert.equal(row.latePolicy, null);
});
