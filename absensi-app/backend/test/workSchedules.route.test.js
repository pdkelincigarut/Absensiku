const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

let db, server, port, hrServer, hrPort, employeeId;

test.before(async () => {
  db = useTempDb();
  const router = require('../routes/workSchedules');

  const ownerApp = mountWithSession('/api/work-schedules', router, { accountId: 1, role: 'owner', name: 'Owner Test' });
  server = await startServer(ownerApp);
  port = server.address().port;

  const hrApp = mountWithSession('/api/work-schedules', router, { accountId: 2, role: 'hr', name: 'HR Test' });
  hrServer = await startServer(hrApp);
  hrPort = hrServer.address().port;

  db.prepare('INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,1,?,?)')
    .run('Karyawan Jadwal', 100000, Date.now(), 'JDW-1');
  employeeId = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('JDW-1').id;
});

test.after(() => { server.close(); hrServer.close(); });

function put(body) {
  return fetch(`http://localhost:${port}/api/work-schedules`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('GET mengembalikan jadwal baku hasil migrasi', async () => {
  const data = await (await fetch(`http://localhost:${port}/api/work-schedules`)).json();
  assert.ok(Array.isArray(data.company));
  assert.equal(data.company.length, 1);
  assert.equal(data.company[0].workDays, '1,2,3,4,5');
  assert.equal(data.company[0].startTime, '08:00');
  assert.equal(data.company[0].effectiveFrom, '1970-01-01');
});

test('PUT dengan employeeIds null menambah versi jadwal baku', async () => {
  const res = await put({ employeeIds: null, workDays: '1,2,3,4,5,6', startTime: '07:30', endTime: '16:00', effectiveFrom: '2026-06-01' });
  assert.equal(res.status, 200);

  const data = await (await fetch(`http://localhost:${port}/api/work-schedules`)).json();
  assert.equal(data.company.length, 2, 'versi baru disisipkan, bukan menimpa');
  assert.ok(data.company.some(s => s.effectiveFrom === '2026-06-01' && s.startTime === '07:30'));
});

test('PUT dengan daftar employeeIds membuat pengecualian per karyawan', async () => {
  const res = await put({ employeeIds: [employeeId], workDays: '1,2,3', startTime: '09:00', endTime: '15:00', effectiveFrom: '2026-07-01' });
  assert.equal(res.status, 200);

  const data = await (await fetch(`http://localhost:${port}/api/work-schedules`)).json();
  const own = data.exceptions.filter(s => s.employeeId === employeeId);
  assert.equal(own.length, 1);
  assert.equal(own[0].startTime, '09:00');
  assert.equal(own[0].employeeName, 'Karyawan Jadwal');
});

test('PUT menolak workDays kosong', async () => {
  const res = await put({ employeeIds: null, workDays: '', startTime: '08:00', endTime: '17:00', effectiveFrom: '2026-06-01' });
  assert.equal(res.status, 400);
});

test('PUT menolak hari di luar 0-6', async () => {
  const res = await put({ employeeIds: null, workDays: '1,2,9', startTime: '08:00', endTime: '17:00', effectiveFrom: '2026-06-01' });
  assert.equal(res.status, 400);
});

test('PUT menolak format jam yang salah', async () => {
  const res = await put({ employeeIds: null, workDays: '1,2,3', startTime: '8 pagi', endTime: '17:00', effectiveFrom: '2026-06-01' });
  assert.equal(res.status, 400);
});

test('PUT menolak jam pulang yang tidak lebih akhir dari jam masuk', async () => {
  const res = await put({ employeeIds: null, workDays: '1,2,3', startTime: '17:00', endTime: '08:00', effectiveFrom: '2026-06-01' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /jam pulang/i);
});

test('PUT menolak effectiveFrom yang bukan YYYY-MM-DD', async () => {
  const res = await put({ employeeIds: null, workDays: '1,2,3', startTime: '08:00', endTime: '17:00', effectiveFrom: '1 Juni 2026' });
  assert.equal(res.status, 400);
});

test('PUT menolak employeeId yang tidak dikenal', async () => {
  const res = await put({ employeeIds: [999999], workDays: '1,2,3', startTime: '08:00', endTime: '17:00', effectiveFrom: '2026-06-01' });
  assert.equal(res.status, 404);
});

test('DELETE menghapus satu versi jadwal', async () => {
  await put({ employeeIds: [employeeId], workDays: '1,2', startTime: '10:00', endTime: '14:00', effectiveFrom: '2026-09-01' });
  const before = await (await fetch(`http://localhost:${port}/api/work-schedules`)).json();
  const target = before.exceptions.find(s => s.effectiveFrom === '2026-09-01');

  const res = await fetch(`http://localhost:${port}/api/work-schedules/${target.id}`, { method: 'DELETE' });
  assert.equal(res.status, 200);

  const after = await (await fetch(`http://localhost:${port}/api/work-schedules`)).json();
  assert.ok(!after.exceptions.some(s => s.id === target.id));
});

test('DELETE menolak menghapus versi terakhir jadwal baku', async () => {
  const data = await (await fetch(`http://localhost:${port}/api/work-schedules`)).json();
  // hapus semua kecuali satu
  for (const s of data.company.slice(1)) {
    await fetch(`http://localhost:${port}/api/work-schedules/${s.id}`, { method: 'DELETE' });
  }
  const remaining = (await (await fetch(`http://localhost:${port}/api/work-schedules`)).json()).company;
  assert.equal(remaining.length, 1);

  const res = await fetch(`http://localhost:${port}/api/work-schedules/${remaining[0].id}`, { method: 'DELETE' });
  assert.equal(res.status, 400, 'perusahaan harus selalu punya jadwal baku');
});

test('akun HR ditolak mengakses endpoint jadwal', async () => {
  const res = await fetch(`http://localhost:${hrPort}/api/work-schedules`);
  assert.equal(res.status, 403);
});
