const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

/* Semua tanggal di file ini harus SESUDAH atau SAMA DENGAN
   WAGE_ENGINE_V2_FROM (routes/payroll.js), supaya menguji rumus gaji dari
   jam kerja aktual -- bukan rumus lama -- dan payroll.js (yang berhenti di
   cursor <= todayS) pasti memprosesnya. "Hari ini" adalah satu-satunya
   tanggal yang selalu memenuhi keduanya, karena WAGE_ENGINE_V2_FROM sudah
   lampau atau sama dengan hari ini kapan pun test ini dijalankan. */
const CUTOVER_DAY_AFTER = (() => {
  const d = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
})();

let db, server, port;

test.before(async () => {
  db = useTempDb();
  const app = mountWithSession('/api/payroll', require('../routes/payroll'), { accountId: 1, role: 'owner', name: 'Owner Test' });
  server = await startServer(app);
  port = server.address().port;

  // Jadwal baku 07:30-16:30 berlaku dari awal waktu di database test ini,
  // supaya seluruh baris yang dites resolve ke jendela itu (540 menit).
  db.prepare(`
    UPDATE work_schedules SET start_time = '07:30', end_time = '16:30'
    WHERE employee_id IS NULL AND effective_from = '1970-01-01'
  `).run();
});

test.after(() => { server.close(); });

function insertEmployee(name, dailyWage) {
  db.prepare(`INSERT INTO employees (name, daily_wage, active, created_at) VALUES (?, ?, 1, ?)`)
    .run(name, dailyWage, Date.now());
  return db.prepare('SELECT id FROM employees WHERE name = ?').get(name).id;
}

function insertHadir(employeeId, checkInTime, checkOutTime) {
  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, check_out_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, ?, ?, '', 'Test', ?)
  `).run(employeeId, CUTOVER_DAY_AFTER, checkInTime, checkOutTime, Date.now());
}

async function payrollRow(employeeId) {
  const res = await fetch(`http://localhost:${port}/api/payroll`);
  const data = await res.json();
  return data.rows.find(r => r.employeeId === employeeId);
}

test('tepat waktu penuh dibayar upah harian utuh', async () => {
  const id = insertEmployee('Tepat Waktu', 150000);
  insertHadir(id, '07:30', '16:30');

  const row = await payrollRow(id);
  assert.equal(row.totalWage, 150000);
  assert.equal(row.overtimeMinutesTotal, 0);
});

test('telat masuk memotong upah dari jam masuk sungguhan, sampai ke menit', async () => {
  const id = insertEmployee('Telat Masuk', 150000);
  insertHadir(id, '07:50', '16:30'); // 20 menit telat dari 540

  const row = await payrollRow(id);
  assert.equal(Math.round(row.totalWage), Math.round((520 / 540) * 150000));
});

test('pulang cepat memotong upah sampai jam checkout sungguhan', async () => {
  const id = insertEmployee('Pulang Cepat', 150000);
  insertHadir(id, '07:30', '16:00'); // pulang 30 menit lebih awal

  const row = await payrollRow(id);
  assert.equal(Math.round(row.totalWage), Math.round((510 / 540) * 150000));
});

test('telat masuk dan pulang cepat digabung', async () => {
  const id = insertEmployee('Telat Dan Cepat', 150000);
  insertHadir(id, '07:40', '16:15'); // -10 dan -15

  const row = await payrollRow(id);
  assert.equal(Math.round(row.totalWage), Math.round((515 / 540) * 150000));
});

test('lembur dicatat sebagai menit terpisah, tidak menambah upah', async () => {
  const id = insertEmployee('Lembur', 150000);
  insertHadir(id, '07:30', '17:10'); // checkout 40 menit lewat jadwal

  const row = await payrollRow(id);
  assert.equal(row.totalWage, 150000, 'upah tetap dipatok ke jendela jadwal');
  assert.equal(row.overtimeMinutesTotal, 40);
  assert.equal(row.deductionAmount, 0, 'lembur bukan potongan');
});

test('lupa checkout membuat upah hari itu 0', async () => {
  const id = insertEmployee('Lupa Checkout', 150000);
  insertHadir(id, '07:30', null);

  const row = await payrollRow(id);
  assert.equal(row.totalWage, 0);
  assert.equal(row.hadir, 1, 'tetap tercatat hadir, hanya upahnya yang 0');
});

test('potongan late_policies tetap jadi lapisan tambahan di atas rumus jam baru', async () => {
  const id = insertEmployee('Telat Berlapis', 150000);
  insertHadir(id, '08:10', '16:30'); // 40 menit telat dari 07:30
  db.prepare(`
    INSERT INTO late_policies (employee_id, grace_minutes, threshold_minutes, deduction_type, deduction_flat_amount, effective_from, created_at)
    VALUES (?, 0, 30, 'flat', 20000, '1970-01-01', ?)
  `).run(id, Date.now());

  const row = await payrollRow(id);
  const expectedWage = (500 / 540) * 150000; // 540 - 40 menit telat
  assert.equal(row.lateMinutesTotal, 40);
  assert.equal(row.deductionAmount, 20000);
  assert.equal(Math.round(row.totalWage), Math.round(expectedWage));
  assert.equal(row.finalWage, Math.max(0, row.totalWage - row.deductionAmount));
});
