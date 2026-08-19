/* ============================================================
   kiosk.route.test.js — Absen mandiri tanpa login

   Route ini terbuka tanpa sesi, jadi yang paling penting diuji
   bukan hanya "berhasil mencatat", tapi juga apa yang TIDAK
   boleh bisa dilakukan dari sana.
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { useTempDb, startServer } = require('./helpers');

let db, server, port, budi, siti;

const pad2 = n => String(n).padStart(2, '0');
const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

test.before(async () => {
  db = useTempDb();

  // Tanpa middleware sesi sama sekali -- persis seperti pengunjung kios.
  const app = express();
  app.use(express.json());
  app.use('/api/kiosk', require('../routes/kiosk'));
  server = await startServer(app);
  port = server.address().port;

  const insert = db.prepare(
    'INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,?,?,?)'
  );
  insert.run('Budi Kios', 123456, 1, Date.now(), 'KS-1');
  insert.run('Siti Kios', 234567, 1, Date.now(), 'KS-2');
  insert.run('Mantan Karyawan', 100000, 0, Date.now(), 'KS-3');
  budi = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('KS-1').id;
  siti = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('KS-2').id;
});

test.after(() => { server.close(); });

const ambilDaftar = () => fetch(`http://localhost:${port}/api/kiosk/employees`).then(r => r.json());
const checkIn = id => fetch(`http://localhost:${port}/api/kiosk/check-in/${id}`, { method: 'POST' });
const checkOut = id => fetch(`http://localhost:${port}/api/kiosk/check-out/${id}`, { method: 'POST' });

test('daftar karyawan bisa dibuka tanpa login', async () => {
  const body = await ambilDaftar();
  assert.equal(body.date, hariIni());
  assert.match(body.serverTime, /^\d{2}:\d{2}$/);
  assert.ok(body.employees.length >= 2);
});

/* Halaman ini terbuka untuk siapa pun yang bisa menjangkau server, jadi
   satu kolom upah yang lolos ke sini sama saja dengan mengumumkan gaji
   seluruh karyawan di layar yang berdiri di ruang bersama. */
test('daftar TIDAK memuat data upah', async () => {
  const body = await ambilDaftar();
  const mentah = JSON.stringify(body);

  assert.equal(mentah.includes('123456'), false, 'upah harian tidak boleh ikut terkirim');
  assert.equal(mentah.includes('234567'), false);
  for (const e of body.employees) {
    assert.equal('dailyWage' in e, false);
    assert.equal('daily_wage' in e, false);
  }
});

test('karyawan nonaktif tidak muncul di kios', async () => {
  const body = await ambilDaftar();
  assert.equal(body.employees.some(e => e.employeeCode === 'KS-3'), false);
});

test('check-in mencatat hadir dengan jam server', async () => {
  const res = await checkIn(budi);
  assert.equal(res.status, 201);

  const body = await res.json();
  assert.equal(body.name, 'Budi Kios');
  assert.match(body.checkInTime, /^\d{2}:\d{2}$/);

  const baris = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(budi, hariIni());
  assert.equal(baris.status, 'hadir');
  assert.equal(baris.attendance_type, 'full');
  assert.equal(baris.hours_worked, 8);
  assert.equal(baris.marked_by, 'Absen Mandiri (kios)');
});

test('check-in tercatat di Log Perubahan atas nama kios', async () => {
  const log = db.prepare("SELECT * FROM audit_log WHERE entity = 'attendance' ORDER BY id DESC LIMIT 1").get();
  assert.equal(log.account_name, 'Absen Mandiri (kios)');
  assert.equal(log.action, 'create');
  assert.equal(JSON.parse(log.after_json).status, 'hadir');
});

/* Menolak, bukan menimpa: menstempel ulang hanya memundurkan jam masuk ke
   jam sekarang, dan potongan telat dihitung dari kolom itu. */
test('check-in kedua kali ditolak, jam masuk pertama dipertahankan', async () => {
  const sebelum = db.prepare('SELECT check_in_time FROM attendance WHERE employee_id = ? AND date = ?').get(budi, hariIni());

  const res = await checkIn(budi);
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /sudah tercatat/i);

  const sesudah = db.prepare('SELECT check_in_time FROM attendance WHERE employee_id = ? AND date = ?').get(budi, hariIni());
  assert.equal(sesudah.check_in_time, sebelum.check_in_time);
});

/* Kalau HR sudah menandai seseorang izin, kios tidak boleh diam-diam
   mengubahnya jadi hadir. */
test('kios tidak bisa menimpa catatan izin yang dibuat HR', async () => {
  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, note, marked_by, updated_at)
    VALUES (?, ?, 'izin', 'surat izin', 'Rina (HR)', ?)
  `).run(siti, hariIni(), Date.now());

  const res = await checkIn(siti);
  assert.equal(res.status, 409);

  const baris = db.prepare('SELECT status, marked_by FROM attendance WHERE employee_id = ? AND date = ?').get(siti, hariIni());
  assert.equal(baris.status, 'izin', 'status dari HR harus utuh');
  assert.equal(baris.marked_by, 'Rina (HR)');
});

test('check-out mencatat jam pulang', async () => {
  const res = await checkOut(budi);
  assert.equal(res.status, 200);
  assert.match((await res.json()).checkOutTime, /^\d{2}:\d{2}$/);

  const baris = db.prepare('SELECT check_out_time FROM attendance WHERE employee_id = ? AND date = ?').get(budi, hariIni());
  assert.match(baris.check_out_time, /^\d{2}:\d{2}$/);
});

test('check-out kedua kali ditolak', async () => {
  const res = await checkOut(budi);
  assert.equal(res.status, 409);
});

test('check-out ditolak untuk yang belum absen masuk', async () => {
  db.prepare('INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,1,?,?)')
    .run('Belum Absen', 100000, Date.now(), 'KS-4');
  const id = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('KS-4').id;

  const res = await checkOut(id);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /belum absen masuk/i);
});

test('check-in untuk karyawan yang tidak ada dibalas 404', async () => {
  assert.equal((await checkIn(999999)).status, 404);
});
