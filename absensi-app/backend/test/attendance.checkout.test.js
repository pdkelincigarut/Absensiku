const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

/* Checkout tanpa koreksi (plain, jam server) sekarang cuma diterima kalau
   tanggalnya hari ini -- lihat serverDateStr() di routes/attendance.js.
   Tes yang menguji jalur itu wajib pakai tanggal hari ini yang sungguhan,
   bukan tanggal tetap yang ditulis saat file ini dibuat. */
function todayDateStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const HARI_INI = todayDateStr();

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

/* reason selalu ikut: mengubah absensi yang sudah tercatat mewajibkannya,
   dan diabaikan begitu saja saat baris itu baru dibuat. */
function markAttendance(date, status) {
  return fetch(`http://localhost:${port}/api/attendance/${employeeId}/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, attendanceType: 'full', reason: 'penyesuaian di test' })
  });
}

function checkOut(date) {
  return fetch(`http://localhost:${port}/api/attendance/${employeeId}/${date}/check-out`, { method: 'POST' });
}

test('check-out mengisi check_out_time dari jam server', async () => {
  await markAttendance(HARI_INI, 'hadir');

  const res = await checkOut(HARI_INI);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.match(body.checkOutTime, /^\d{2}:\d{2}$/);
});

test('check_out_time ikut di GET /api/attendance', async () => {
  await markAttendance(HARI_INI, 'hadir');
  await checkOut(HARI_INI);

  const list = await (await fetch(`http://localhost:${port}/api/attendance?date=${HARI_INI}`)).json();
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
  await markAttendance(HARI_INI, 'hadir');

  const first = await (await checkOut(HARI_INI)).json();
  db.prepare('UPDATE attendance SET check_out_time = ? WHERE employee_id = ? AND date = ?')
    .run('01:00', employeeId, HARI_INI);

  const second = await (await checkOut(HARI_INI)).json();
  assert.notEqual(second.checkOutTime, '01:00', 'harus diganti dengan jam server terbaru');
  assert.equal(second.checkOutTime, first.checkOutTime);
});

test('hari tanpa check-out mengembalikan checkOutTime null, bukan string kosong', async () => {
  await markAttendance('2026-08-10', 'hadir');

  const list = await (await fetch(`http://localhost:${port}/api/attendance?date=2026-08-10`)).json();
  const record = list.find(r => r.employeeId === employeeId);
  assert.equal(record.checkOutTime, null);
});

test('check-out tanpa koreksi ditolak untuk tanggal selain hari ini', async () => {
  await markAttendance('2026-08-12', 'hadir');

  const res = await checkOut('2026-08-12');
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /hari ini/i);

  // Jam pulang jangan sampai ikut kestempel jam server meski ditolak.
  const list = await (await fetch(`http://localhost:${port}/api/attendance?date=2026-08-12`)).json();
  assert.equal(list.find(r => r.employeeId === employeeId).checkOutTime, null);
});

/* ---------------- Checkout dengan koreksi (izin mendadak / lupa checkout) ---------------- */

function checkOutCorrection(date, body) {
  return fetch(`http://localhost:${port}/api/attendance/${employeeId}/${date}/check-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('checkout dengan time dan reason menyimpan jam yang dikirim', async () => {
  await markAttendance('2026-08-20', 'hadir');
  db.prepare('UPDATE attendance SET check_in_time = ? WHERE employee_id = ? AND date = ?')
    .run('07:30', employeeId, '2026-08-20');

  const res = await checkOutCorrection('2026-08-20', { time: '13:00', reason: 'izin mendadak, pulang lebih awal' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.checkOutTime, '13:00');
});

test('checkout dengan time tanpa reason ditolak', async () => {
  await markAttendance('2026-08-21', 'hadir');
  db.prepare('UPDATE attendance SET check_in_time = ? WHERE employee_id = ? AND date = ?')
    .run('07:30', employeeId, '2026-08-21');

  const res = await checkOutCorrection('2026-08-21', { time: '13:00' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /alasan/i);
});

test('checkout dengan time lebih awal dari jam masuk ditolak', async () => {
  await markAttendance('2026-08-22', 'hadir');
  db.prepare('UPDATE attendance SET check_in_time = ? WHERE employee_id = ? AND date = ?')
    .run('07:30', employeeId, '2026-08-22');

  const res = await checkOutCorrection('2026-08-22', { time: '06:00', reason: 'salah catat' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /lebih awal/i);
});

test('checkout dengan format time tidak valid ditolak', async () => {
  await markAttendance('2026-08-23', 'hadir');

  const res = await checkOutCorrection('2026-08-23', { time: '25:99', reason: 'apa saja' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /format/i);
});

test('checkout dengan koreksi tercatat di audit log lengkap dengan alasan', async () => {
  await markAttendance('2026-08-24', 'hadir');
  db.prepare('UPDATE attendance SET check_in_time = ? WHERE employee_id = ? AND date = ?')
    .run('07:30', employeeId, '2026-08-24');

  await checkOutCorrection('2026-08-24', { time: '13:30', reason: 'anak sakit, izin pulang cepat' });

  const id = db.prepare('SELECT id FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, '2026-08-24').id;
  const log = db.prepare("SELECT * FROM audit_log WHERE entity = 'attendance' AND entity_id = ? AND action = 'check_out' ORDER BY id DESC LIMIT 1").get(String(id));
  assert.equal(log.reason, 'anak sakit, izin pulang cepat');
  assert.equal(JSON.parse(log.after_json).check_out_time, '13:30');
});

test('checkout tanpa body tetap memakai jam server, tidak wajib alasan', async () => {
  await markAttendance(HARI_INI, 'hadir');

  const res = await checkOut(HARI_INI);
  assert.equal(res.status, 200);
  assert.match((await res.json()).checkOutTime, /^\d{2}:\d{2}$/);
});

test('mengubah status hadir menjadi izin ikut menghapus jam pulang', async () => {
  await markAttendance(HARI_INI, 'hadir');
  await checkOut(HARI_INI);

  await markAttendance(HARI_INI, 'izin');

  const list = await (await fetch(`http://localhost:${port}/api/attendance?date=${HARI_INI}`)).json();
  const record = list.find(r => r.employeeId === employeeId);
  assert.equal(record.checkOutTime, null, 'jam pulang tidak boleh tertinggal di hari yang jadi izin');
});
