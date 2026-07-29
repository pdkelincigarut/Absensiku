const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

let db, server, port, hrServer, hrPort;

test.before(async () => {
  db = useTempDb();
  const createLookupRouter = require('../routes/lookupRouter');
  const config = { table: 'jobs', employeeColumn: 'job_id', label: 'Jabatan' };

  const ownerApp = mountWithSession('/api/jobs', createLookupRouter(config), { accountId: 1, role: 'owner', name: 'Owner Test' });
  server = await startServer(ownerApp);
  port = server.address().port;

  const hrApp = mountWithSession('/api/jobs', createLookupRouter(config), { accountId: 2, role: 'hr', name: 'HR Test' });
  hrServer = await startServer(hrApp);
  hrPort = hrServer.address().port;
});

test.after(() => { server.close(); hrServer.close(); });

function post(name) {
  return fetch(`http://localhost:${port}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
}

test('POST membuat entri baru dan GET menampilkannya', async () => {
  const res = await post('Manager Keuangan');
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.name, 'Manager Keuangan');
  assert.ok(created.id);

  const list = await (await fetch(`http://localhost:${port}/api/jobs`)).json();
  assert.ok(list.some(row => row.name === 'Manager Keuangan'));
});

test('POST menolak nama kosong', async () => {
  const res = await post('   ');
  assert.equal(res.status, 400);
});

test('POST menolak nama yang sudah ada, tanpa peduli besar-kecil huruf', async () => {
  await post('Supervisor Gudang');
  const res = await post('supervisor gudang');
  assert.equal(res.status, 400);
});

test('PUT mengganti nama entri', async () => {
  const created = await (await post('Staf Sementara')).json();
  const res = await fetch(`http://localhost:${port}/api/jobs/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Staf Tetap' })
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).name, 'Staf Tetap');
});

test('PUT menolak nama yang sudah dipakai entri lain', async () => {
  await post('Direktur');
  const other = await (await post('Wakil Direktur')).json();
  const res = await fetch(`http://localhost:${port}/api/jobs/${other.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Direktur' })
  });
  assert.equal(res.status, 400);
});

test('PUT dengan nama entri itu sendiri tetap diterima', async () => {
  const created = await (await post('Kepala Cabang')).json();
  const res = await fetch(`http://localhost:${port}/api/jobs/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Kepala Cabang' })
  });
  assert.equal(res.status, 200);
});

test('DELETE menghapus entri yang tidak dipakai karyawan', async () => {
  const created = await (await post('Jabatan Tak Terpakai')).json();
  const res = await fetch(`http://localhost:${port}/api/jobs/${created.id}`, { method: 'DELETE' });
  assert.equal(res.status, 200);

  const list = await (await fetch(`http://localhost:${port}/api/jobs`)).json();
  assert.ok(!list.some(row => row.id === created.id));
});

test('DELETE menolak entri yang masih dipakai karyawan', async () => {
  const created = await (await post('Jabatan Terpakai')).json();
  db.prepare(`INSERT INTO employees (name, daily_wage, active, created_at, employee_code, job_id) VALUES (?, ?, 1, ?, ?, ?)`)
    .run('Karyawan Pemakai', 100000, Date.now(), 'TEST-PAKAI', created.id);

  const res = await fetch(`http://localhost:${port}/api/jobs/${created.id}`, { method: 'DELETE' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /masih dipakai 1 karyawan/);
});

test('DELETE entri yang tidak ada membalas 404', async () => {
  const res = await fetch(`http://localhost:${port}/api/jobs/999999`, { method: 'DELETE' });
  assert.equal(res.status, 404);
});

test('akun HR ditolak mengakses endpoint ini', async () => {
  const res = await fetch(`http://localhost:${hrPort}/api/jobs`);
  assert.equal(res.status, 403);
});
