const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

let db, server, port, jobId, orgId;

test.before(async () => {
  db = useTempDb();
  const app = mountWithSession('/api/employees', require('../routes/employees'), { accountId: 1, role: 'owner', name: 'Owner Test' });
  server = await startServer(app);
  port = server.address().port;

  db.prepare('INSERT INTO jobs (name, created_at) VALUES (?, ?)').run('Supervisor Accounting', Date.now());
  jobId = db.prepare('SELECT id FROM jobs WHERE name = ?').get('Supervisor Accounting').id;
  db.prepare('INSERT INTO organizations (name, created_at) VALUES (?, ?)').run('Finance & Accounting', Date.now());
  orgId = db.prepare('SELECT id FROM organizations WHERE name = ?').get('Finance & Accounting').id;
});

test.after(() => { server.close(); });

function createEmployee(body) {
  return fetch(`http://localhost:${port}/api/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('POST menolak karyawan tanpa employeeCode', async () => {
  const res = await createEmployee({ name: 'Tanpa Kode', dailyWage: 100000 });
  assert.equal(res.status, 400);
});

test('POST menyimpan employeeCode, jabatan, dan divisi', async () => {
  const res = await createEmployee({
    name: 'Zoey Dell', dailyWage: 120000, employeeCode: 'TDI-008', jobId, organizationId: orgId
  });
  assert.equal(res.status, 201);

  const created = await res.json();
  assert.equal(created.employeeCode, 'TDI-008');
  assert.equal(created.job.name, 'Supervisor Accounting');
  assert.equal(created.organization.name, 'Finance & Accounting');
});

test('POST menolak employeeCode yang sudah dipakai karyawan lain', async () => {
  await createEmployee({ name: 'Pemilik Kode', dailyWage: 100000, employeeCode: 'TDI-100' });
  const res = await createEmployee({ name: 'Perebut Kode', dailyWage: 100000, employeeCode: 'TDI-100' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /sudah dipakai/i);
});

test('POST menolak jobId yang tidak dikenal', async () => {
  const res = await createEmployee({ name: 'Jabatan Ngawur', dailyWage: 100000, employeeCode: 'TDI-200', jobId: 999999 });
  assert.equal(res.status, 400);
});

test('PUT dengan employeeCode milik karyawan itu sendiri tetap diterima', async () => {
  const created = await (await createEmployee({ name: 'Tetap Sama', dailyWage: 100000, employeeCode: 'TDI-300' })).json();

  const res = await fetch(`http://localhost:${port}/api/employees/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tetap Sama Diubah', dailyWage: 110000, employeeCode: 'TDI-300' })
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).name, 'Tetap Sama Diubah');
});

test('karyawan tanpa jabatan/divisi mengembalikan null, bukan error', async () => {
  const created = await (await createEmployee({ name: 'Belum Ditugaskan', dailyWage: 100000, employeeCode: 'TDI-400' })).json();
  assert.equal(created.job, null);
  assert.equal(created.organization, null);
});

test('GET membawa nama jabatan dan divisi hasil join', async () => {
  await createEmployee({ name: 'Ada Di Daftar', dailyWage: 100000, employeeCode: 'TDI-500', jobId, organizationId: orgId });

  const list = await (await fetch(`http://localhost:${port}/api/employees`)).json();
  const found = list.find(e => e.employeeCode === 'TDI-500');
  assert.equal(found.job.name, 'Supervisor Accounting');
  assert.equal(found.organization.name, 'Finance & Accounting');
});
