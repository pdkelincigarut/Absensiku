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

/* ---------------- Foto karyawan ---------------- */

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

function putEmployee(id, body) {
  return fetch(`http://localhost:${port}/api/employees/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('POST dengan foto menyimpannya dan hasPhoto jadi true', async () => {
  const res = await createEmployee({ name: 'Berfoto', dailyWage: 100000, employeeCode: 'FOTO-001', photo: PNG_1PX });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.hasPhoto, true);
  assert.ok(created.photoVersion);
  assert.equal(created.photo, undefined, 'BLOB foto tidak boleh ikut di respons');
});

test('GET /:id/photo mengembalikan gambar dengan Content-Type yang benar', async () => {
  const created = await (await createEmployee({ name: 'Ambil Foto', dailyWage: 100000, employeeCode: 'FOTO-002', photo: PNG_1PX })).json();
  const res = await fetch(`http://localhost:${port}/api/employees/${created.id}/photo`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.ok((await res.arrayBuffer()).byteLength > 0);
});

test('GET /:id/photo membalas 404 untuk karyawan tanpa foto', async () => {
  const created = await (await createEmployee({ name: 'Tanpa Foto', dailyWage: 100000, employeeCode: 'FOTO-003' })).json();
  assert.equal(created.hasPhoto, false);
  const res = await fetch(`http://localhost:${port}/api/employees/${created.id}/photo`);
  assert.equal(res.status, 404);
});

test('POST menolak format gambar yang tidak didukung', async () => {
  const res = await createEmployee({
    name: 'Gif Ditolak', dailyWage: 100000, employeeCode: 'FOTO-004',
    photo: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /JPG, PNG, atau WebP/);
});

test('POST menolak data URL yang bentuknya tidak dikenali', async () => {
  const res = await createEmployee({ name: 'Rusak', dailyWage: 100000, employeeCode: 'FOTO-005', photo: 'bukan-data-url' });
  assert.equal(res.status, 400);
});

test('POST menolak foto yang melebihi 500 KB', async () => {
  const bigBase64 = Buffer.alloc(600 * 1024, 1).toString('base64');
  const res = await createEmployee({
    name: 'Kebesaran', dailyWage: 100000, employeeCode: 'FOTO-006',
    photo: `data:image/jpeg;base64,${bigBase64}`
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /maksimal 500 KB/);
});

test('PUT tanpa menyertakan field photo tidak menghapus foto yang sudah ada', async () => {
  const created = await (await createEmployee({ name: 'Foto Bertahan', dailyWage: 100000, employeeCode: 'FOTO-007', photo: PNG_1PX })).json();

  const res = await putEmployee(created.id, { name: 'Foto Bertahan Diubah', dailyWage: 110000, employeeCode: 'FOTO-007' });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.name, 'Foto Bertahan Diubah');
  assert.equal(updated.hasPhoto, true, 'foto seharusnya tetap ada');
});

test('PUT dengan photo null menghapus foto', async () => {
  const created = await (await createEmployee({ name: 'Foto Dihapus', dailyWage: 100000, employeeCode: 'FOTO-008', photo: PNG_1PX })).json();

  const res = await putEmployee(created.id, { name: 'Foto Dihapus', dailyWage: 100000, employeeCode: 'FOTO-008', photo: null });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).hasPhoto, false);

  const photoRes = await fetch(`http://localhost:${port}/api/employees/${created.id}/photo`);
  assert.equal(photoRes.status, 404);
});

test('PUT dengan foto baru menggantikan foto lama dan memperbarui versinya', async () => {
  const created = await (await createEmployee({ name: 'Foto Diganti', dailyWage: 100000, employeeCode: 'FOTO-009', photo: PNG_1PX })).json();
  const firstVersion = created.photoVersion;

  await new Promise(resolve => setTimeout(resolve, 5));
  const res = await putEmployee(created.id, {
    name: 'Foto Diganti', dailyWage: 100000, employeeCode: 'FOTO-009',
    photo: 'data:image/jpeg;base64,' + Buffer.alloc(64, 7).toString('base64')
  });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.hasPhoto, true);
  assert.ok(updated.photoVersion > firstVersion, 'photoVersion harus naik supaya cache browser tidak menahan foto lama');
});

/* ---------------- Tanggal masuk & catatan ---------------- */

test('POST menyimpan tanggal masuk dan catatan', async () => {
  const res = await createEmployee({
    name: 'Karyawan Baru', dailyWage: 100000, employeeCode: 'JD-1',
    joinDate: '2026-03-01', notes: 'Masa percobaan sampai Juni.'
  });
  assert.equal(res.status, 201);

  const body = await res.json();
  assert.equal(body.joinDate, '2026-03-01');
  assert.equal(body.notes, 'Masa percobaan sampai Juni.');
});

test('tanggal masuk dan catatan boleh dikosongkan', async () => {
  const res = await createEmployee({ name: 'Tanpa Keduanya', dailyWage: 100000, employeeCode: 'JD-2' });
  assert.equal(res.status, 201);

  const body = await res.json();
  assert.equal(body.joinDate, null);
  assert.equal(body.notes, null);
});

/* Catatan berisi spasi saja disimpan NULL, bukan string kosong, supaya
   "belum diisi" tidak terpecah jadi dua keadaan yang berbeda di database. */
test('catatan berisi spasi saja disimpan sebagai kosong', async () => {
  const res = await createEmployee({ name: 'Spasi Saja', dailyWage: 100000, employeeCode: 'JD-3', notes: '    ' });
  assert.equal((await res.json()).notes, null);
});

test('POST menolak tanggal masuk yang bukan tanggal', async () => {
  const res = await createEmployee({ name: 'Tanggal Ngawur', dailyWage: 100000, employeeCode: 'JD-4', joinDate: '1 Maret' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Tanggal masuk/i);
});

test('PUT bisa mengubah dan mengosongkan tanggal masuk serta catatan', async () => {
  const dibuat = await (await createEmployee({
    name: 'Diubah', dailyWage: 100000, employeeCode: 'JD-5',
    joinDate: '2025-01-10', notes: 'catatan awal'
  })).json();

  const res = await fetch(`http://localhost:${port}/api/employees/${dibuat.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Diubah', dailyWage: 100000, employeeCode: 'JD-5', joinDate: '', notes: '' })
  });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.joinDate, null);
  assert.equal(body.notes, null);
});

test('GET daftar karyawan ikut membawa tanggal masuk dan catatan', async () => {
  const list = await (await fetch(`http://localhost:${port}/api/employees`)).json();
  const target = list.find(e => e.employeeCode === 'JD-1');
  assert.equal(target.joinDate, '2026-03-01');
  assert.equal(target.notes, 'Masa percobaan sampai Juni.');
});
