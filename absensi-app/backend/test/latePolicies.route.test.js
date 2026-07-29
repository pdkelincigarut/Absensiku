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
  db.prepare(`INSERT INTO employees (name, daily_wage, active, created_at) VALUES (?, ?, 1, ?)`)
    .run(name, 100000, Date.now());
  return db.prepare('SELECT id FROM employees WHERE name = ?').get(name).id;
}

test('PUT /api/late-policies upsert aturan, GET menampilkannya', async () => {
  const employeeId = insertEmployee('Budi Upsert Test');

  const putRes = await fetch(`http://localhost:${port}/api/late-policies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employeeIds: [employeeId], checkInLimit: '08:30', thresholdMinutes: 60,
      deductionType: 'flat', deductionFlatAmount: 50000
    })
  });
  assert.equal(putRes.status, 200);

  const getRes = await fetch(`http://localhost:${port}/api/late-policies`);
  const list = await getRes.json();
  const found = list.find(row => row.employeeId === employeeId);
  assert.equal(found.latePolicy.checkInLimit, '08:30');
  assert.equal(found.latePolicy.deductionFlatAmount, 50000);
});

test('PUT /api/late-policies menolak deductionType yang tidak dikenal', async () => {
  const employeeId = insertEmployee('Siti Reject Test');
  const res = await fetch(`http://localhost:${port}/api/late-policies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeIds: [employeeId], checkInLimit: '08:30', thresholdMinutes: 60, deductionType: 'bogus' })
  });
  assert.equal(res.status, 400);
});

test('DELETE /api/late-policies/:employeeId menghapus aturan', async () => {
  const employeeId = insertEmployee('Andi Delete Test');
  await fetch(`http://localhost:${port}/api/late-policies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeIds: [employeeId], checkInLimit: '08:30', thresholdMinutes: 60, deductionType: 'flat', deductionFlatAmount: 10000 })
  });

  const delRes = await fetch(`http://localhost:${port}/api/late-policies/${employeeId}`, { method: 'DELETE' });
  assert.equal(delRes.status, 200);

  const getRes = await fetch(`http://localhost:${port}/api/late-policies`);
  const list = await getRes.json();
  const found = list.find(row => row.employeeId === employeeId);
  assert.equal(found.latePolicy, null);
});
