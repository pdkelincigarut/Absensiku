const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

let db, server, port, employeeId;

test.before(async () => {
  db = useTempDb();
  const app = mountWithSession('/api/attendance', require('../routes/attendance'), { accountId: 1, role: 'hr', name: 'HR Test' });
  server = await startServer(app);
  port = server.address().port;

  db.prepare('INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,1,?,?)')
    .run('Karyawan Pulang', 100000, Date.now(), 'CO-1');
  employeeId = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('CO-1').id;
});

test.after(() => { server.close(); });

function markAttendance(date, status) {
  return fetch(`http://localhost:${port}/api/attendance/${employeeId}/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, attendanceType: 'full' })
  });
}

function checkOut(date) {
  return fetch(`http://localhost:${port}/api/attendance/${employeeId}/${date}/check-out`, { method: 'POST' });
}

test('check-out mengisi check_out_time dari jam server', async () => {
  await markAttendance('2026-08-03', 'hadir');

  const res = await checkOut('2026-08-03');
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.match(body.checkOutTime, /^\d{2}:\d{2}$/);
});

test('check_out_time ikut di GET /api/attendance', async () => {
  await markAttendance('2026-08-04', 'hadir');
  await checkOut('2026-08-04');

  const list = await (await fetch(`http://localhost:${port}/api/attendance?date=2026-08-04`)).json();
  const record = list.find(r => r.employeeId === employeeId);
  assert.match(record.checkOutTime, /^\d{2}:\d{2}$/);
});

test('check-out menolak hari yang statusnya bukan hadir', async () => {
  await markAttendance('2026-08-05', 'izin');

  const res = await checkOut('2026-08-05');
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /hadir/i);
});

test('check-out menolak hari yang belum ada catatan absensinya', async () => {
  const res = await checkOut('2026-08-06');
  assert.equal(res.status, 404);
});

test('check-out kedua kali menimpa dengan jam terbaru (koreksi)', async () => {
  await markAttendance('2026-08-07', 'hadir');

  const first = await (await checkOut('2026-08-07')).json();
  db.prepare('UPDATE attendance SET check_out_time = ? WHERE employee_id = ? AND date = ?')
    .run('01:00', employeeId, '2026-08-07');

  const second = await (await checkOut('2026-08-07')).json();
  assert.notEqual(second.checkOutTime, '01:00', 'harus diganti dengan jam server terbaru');
  assert.equal(second.checkOutTime, first.checkOutTime);
});

test('hari tanpa check-out mengembalikan checkOutTime null, bukan string kosong', async () => {
  await markAttendance('2026-08-10', 'hadir');

  const list = await (await fetch(`http://localhost:${port}/api/attendance?date=2026-08-10`)).json();
  const record = list.find(r => r.employeeId === employeeId);
  assert.equal(record.checkOutTime, null);
});

test('mengubah status hadir menjadi izin ikut menghapus jam pulang', async () => {
  await markAttendance('2026-08-11', 'hadir');
  await checkOut('2026-08-11');

  await markAttendance('2026-08-11', 'izin');

  const list = await (await fetch(`http://localhost:${port}/api/attendance?date=2026-08-11`)).json();
  const record = list.find(r => r.employeeId === employeeId);
  assert.equal(record.checkOutTime, null, 'jam pulang tidak boleh tertinggal di hari yang jadi izin');
});
