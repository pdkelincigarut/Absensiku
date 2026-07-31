const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

let db, server, port;

test.before(async () => {
  db = useTempDb();
  const router = require('../routes/latePolicies');
  const app = mountWithSession('/api/late-policies', router, { accountId: 1, role: 'owner', name: 'Owner Test' });
  server = await startServer(app);
  port = server.address().port;
});

test.after(() => { server.close(); });

function insertEmployee(name) {
  db.prepare(`INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?, ?, 1, ?, ?)`)
    .run(name, 100000, Date.now(), 'LP-' + name.replace(/\s+/g, ''));
  return db.prepare('SELECT id FROM employees WHERE name = ?').get(name).id;
}

function put(body) {
  return fetch(`http://localhost:${port}/api/late-policies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function versionsOf(employeeId) {
  const list = await (await fetch(`http://localhost:${port}/api/late-policies`)).json();
  return list.find(row => row.employeeId === employeeId).versions;
}

test('PUT menyimpan aturan dan GET menampilkannya', async () => {
  const employeeId = insertEmployee('Budi Versi');

  const res = await put({
    employeeIds: [employeeId], graceMinutes: 30, thresholdMinutes: 60,
    deductionType: 'flat', deductionFlatAmount: 50000, effectiveFrom: '2026-01-01'
  });
  assert.equal(res.status, 200);

  const versions = await versionsOf(employeeId);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].graceMinutes, 30);
  assert.equal(versions[0].deductionFlatAmount, 50000);
  assert.equal(versions[0].effectiveFrom, '2026-01-01');
});

test('PUT dua kali dengan effectiveFrom berbeda menyimpan dua versi, bukan menimpa', async () => {
  const employeeId = insertEmployee('Siti Dua Versi');

  await put({ employeeIds: [employeeId], graceMinutes: 30, thresholdMinutes: 60, deductionType: 'flat', deductionFlatAmount: 50000, effectiveFrom: '2026-01-01' });
  await put({ employeeIds: [employeeId], graceMinutes: 10, thresholdMinutes: 30, deductionType: 'flat', deductionFlatAmount: 75000, effectiveFrom: '2026-07-01' });

  const versions = await versionsOf(employeeId);
  assert.equal(versions.length, 2);
  // urut menurun: versi terbaru di atas
  assert.equal(versions[0].effectiveFrom, '2026-07-01');
  assert.equal(versions[0].graceMinutes, 10);
  assert.equal(versions[1].effectiveFrom, '2026-01-01');
  assert.equal(versions[1].graceMinutes, 30);
});

test('PUT menerapkan aturan yang sama ke beberapa karyawan sekaligus', async () => {
  const a = insertEmployee('Massal Satu');
  const b = insertEmployee('Massal Dua');

  await put({ employeeIds: [a, b], graceMinutes: 15, thresholdMinutes: 45, deductionType: 'per_minute', deductionPerMinuteAmount: 1000, effectiveFrom: '2026-03-01' });

  assert.equal((await versionsOf(a))[0].graceMinutes, 15);
  assert.equal((await versionsOf(b))[0].graceMinutes, 15);
});

test('PUT menolak graceMinutes negatif', async () => {
  const employeeId = insertEmployee('Negatif Toleransi');
  const res = await put({ employeeIds: [employeeId], graceMinutes: -5, thresholdMinutes: 60, deductionType: 'flat', deductionFlatAmount: 10000, effectiveFrom: '2026-01-01' });
  assert.equal(res.status, 400);
});

test('PUT menolak effectiveFrom yang bukan YYYY-MM-DD', async () => {
  const employeeId = insertEmployee('Tanggal Ngawur');
  const res = await put({ employeeIds: [employeeId], graceMinutes: 10, thresholdMinutes: 60, deductionType: 'flat', deductionFlatAmount: 10000, effectiveFrom: '1 Januari' });
  assert.equal(res.status, 400);
});

test('PUT menolak deductionType yang tidak dikenal', async () => {
  const employeeId = insertEmployee('Skema Ngawur');
  const res = await put({ employeeIds: [employeeId], graceMinutes: 10, thresholdMinutes: 60, deductionType: 'bogus', effectiveFrom: '2026-01-01' });
  assert.equal(res.status, 400);
});

test('DELETE menghapus satu versi berdasarkan id', async () => {
  const employeeId = insertEmployee('Hapus Versi');
  await put({ employeeIds: [employeeId], graceMinutes: 30, thresholdMinutes: 60, deductionType: 'flat', deductionFlatAmount: 50000, effectiveFrom: '2026-01-01' });
  await put({ employeeIds: [employeeId], graceMinutes: 10, thresholdMinutes: 30, deductionType: 'flat', deductionFlatAmount: 75000, effectiveFrom: '2026-07-01' });

  const before = await versionsOf(employeeId);
  assert.equal(before.length, 2);

  const res = await fetch(`http://localhost:${port}/api/late-policies/${before[0].id}`, { method: 'DELETE' });
  assert.equal(res.status, 200);

  const after = await versionsOf(employeeId);
  assert.equal(after.length, 1);
  assert.equal(after[0].effectiveFrom, '2026-01-01');
});

test('DELETE versi yang tidak ada membalas 404', async () => {
  const res = await fetch(`http://localhost:${port}/api/late-policies/999999`, { method: 'DELETE' });
  assert.equal(res.status, 404);
});

test('karyawan tanpa aturan tampil dengan daftar versi kosong', async () => {
  const employeeId = insertEmployee('Tanpa Aturan');
  assert.deepEqual(await versionsOf(employeeId), []);
});
