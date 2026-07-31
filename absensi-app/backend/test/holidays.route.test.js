const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

let server, port, hrServer, hrPort;

test.before(async () => {
  useTempDb();
  const router = require('../routes/holidays');

  const ownerApp = mountWithSession('/api/holidays', router, { accountId: 1, role: 'owner', name: 'Owner Test' });
  server = await startServer(ownerApp);
  port = server.address().port;

  const hrApp = mountWithSession('/api/holidays', router, { accountId: 2, role: 'hr', name: 'HR Test' });
  hrServer = await startServer(hrApp);
  hrPort = hrServer.address().port;
});

test.after(() => { server.close(); hrServer.close(); });

function post(body) {
  return fetch(`http://localhost:${port}/api/holidays`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('POST menambah hari libur dan GET menampilkannya', async () => {
  const res = await post({ date: '2026-08-17', name: 'Hari Kemerdekaan' });
  assert.equal(res.status, 201);

  const list = await (await fetch(`http://localhost:${port}/api/holidays`)).json();
  assert.ok(list.some(h => h.date === '2026-08-17' && h.name === 'Hari Kemerdekaan'));
});

test('POST menolak tanggal yang sudah terdaftar', async () => {
  await post({ date: '2026-12-25', name: 'Natal' });
  const res = await post({ date: '2026-12-25', name: 'Natal Lagi' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /sudah terdaftar/i);
});

test('POST menolak nama kosong', async () => {
  const res = await post({ date: '2026-11-01', name: '   ' });
  assert.equal(res.status, 400);
});

test('POST menolak format tanggal yang salah', async () => {
  const res = await post({ date: '17 Agustus 2026', name: 'Kemerdekaan' });
  assert.equal(res.status, 400);
});

test('GET menyaring berdasarkan tahun', async () => {
  await post({ date: '2027-01-01', name: 'Tahun Baru 2027' });

  const y2026 = await (await fetch(`http://localhost:${port}/api/holidays?year=2026`)).json();
  assert.ok(y2026.every(h => h.date.startsWith('2026')));
  assert.ok(!y2026.some(h => h.date === '2027-01-01'));

  const y2027 = await (await fetch(`http://localhost:${port}/api/holidays?year=2027`)).json();
  assert.equal(y2027.length, 1);
});

test('GET mengurutkan tanggal menaik', async () => {
  const list = await (await fetch(`http://localhost:${port}/api/holidays?year=2026`)).json();
  const sorted = list.map(h => h.date).slice().sort();
  assert.deepEqual(list.map(h => h.date), sorted);
});

test('DELETE menghapus hari libur', async () => {
  await post({ date: '2026-10-10', name: 'Libur Uji' });
  const res = await fetch(`http://localhost:${port}/api/holidays/2026-10-10`, { method: 'DELETE' });
  assert.equal(res.status, 200);

  const list = await (await fetch(`http://localhost:${port}/api/holidays`)).json();
  assert.ok(!list.some(h => h.date === '2026-10-10'));
});

test('DELETE tanggal yang tidak ada membalas 404', async () => {
  const res = await fetch(`http://localhost:${port}/api/holidays/2030-01-01`, { method: 'DELETE' });
  assert.equal(res.status, 404);
});

test('akun HR ditolak mengakses endpoint hari libur', async () => {
  const res = await fetch(`http://localhost:${hrPort}/api/holidays`);
  assert.equal(res.status, 403);
});
