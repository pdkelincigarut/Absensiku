/* ============================================================
   face.route.test.js — Pendaftaran wajah & absen lewat kamera

   Dua sisi diuji di sini:
     - /api/face  butuh login, dan penulisannya khusus Owner
     - /api/kiosk/face/check-in TIDAK butuh login sama sekali

   Yang paling penting: descriptor wajah tidak boleh keluar dari
   server lewat pintu mana pun, dan tombol manual tidak boleh
   bisa dipakai untuk melewati kamera.
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { useTempDb, mountWithSession, startServer } = require('./helpers');
const { PANJANG_DESCRIPTOR } = require('../faceMatcher');

let db;
let serverKios, portKios;
let serverOwner, portOwner;
let serverHr, portHr;
let budi, siti, belumDaftar;

const AKAR_128 = Math.sqrt(PANJANG_DESCRIPTOR);
const buat = nilai => new Array(PANJANG_DESCRIPTOR).fill(nilai);
const berjarak = jarak => buat(jarak / AKAR_128);

/* JPEG 1x1 piksel yang sah. Cukup untuk menguji alur foto bukti tanpa
   menyeret berkas gambar ke dalam repo. */
const FOTO_KECIL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const pad2 = n => String(n).padStart(2, '0');
const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

test.before(async () => {
  db = useTempDb();

  // Kios: tanpa middleware sesi sama sekali, persis seperti pengunjung nyata.
  const appKios = express();
  appKios.use(express.json({ limit: '2mb' }));
  appKios.use('/api/kiosk', require('../routes/kiosk'));
  serverKios = await startServer(appKios);
  portKios = serverKios.address().port;

  const routerFace = require('../routes/face');
  serverOwner = await startServer(mountWithSession('/api/face', routerFace,
    { accountId: 1, name: 'Owner Uji', role: 'owner' }));
  portOwner = serverOwner.address().port;

  serverHr = await startServer(mountWithSession('/api/face', routerFace,
    { accountId: 2, name: 'HR Uji', role: 'hr' }));
  portHr = serverHr.address().port;

  const insert = db.prepare(
    'INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,?,?,?)'
  );
  insert.run('Budi Wajah', 150000, 1, Date.now(), 'FW-1');
  insert.run('Siti Wajah', 160000, 1, Date.now(), 'FW-2');
  insert.run('Karyawan Baru', 140000, 1, Date.now(), 'FW-3');
  budi = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('FW-1').id;
  siti = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('FW-2').id;
  belumDaftar = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('FW-3').id;
});

test.after(() => { serverKios.close(); serverOwner.close(); serverHr.close(); });

test.beforeEach(() => {
  db.prepare('DELETE FROM attendance').run();
  db.prepare('DELETE FROM check_in_photos').run();
});

const daftarkan = (port, id, descriptors) =>
  fetch(`http://localhost:${port}/api/face/enroll/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descriptors })
  });

const absenWajah = (descriptor, photo = FOTO_KECIL) =>
  fetch(`http://localhost:${portKios}/api/kiosk/face/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descriptor, photo })
  });

/* ---------------- Pendaftaran ---------------- */

test('Owner bisa mendaftarkan wajah', async () => {
  const res = await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.sampleCount, 3);
});

test('HR tidak boleh mendaftarkan wajah', async () => {
  const res = await daftarkan(portHr, siti, [berjarak(0.9), berjarak(0.91), berjarak(0.92)]);
  assert.equal(res.status, 403);
});

test('pendaftaran dengan sampel kurang dari tiga ditolak', async () => {
  const res = await daftarkan(portOwner, siti, [berjarak(0.9)]);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /minimal 3/);
});

test('pendaftaran dengan descriptor cacat ditolak', async () => {
  const cacat = buat(0.1); cacat[0] = NaN;
  const res = await daftarkan(portOwner, siti, [berjarak(0.9), berjarak(0.91), cacat]);
  assert.equal(res.status, 400);
});

test('pendaftaran ulang mengganti sampel lama, bukan menumpuk', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04), berjarak(0.05)]);
  const n = db.prepare('SELECT COUNT(*) AS n FROM face_descriptors WHERE employee_id = ?').get(budi).n;
  assert.equal(n, 4);
});

/* Kalau wajah lama ikut tersimpan, pendaftaran ulang setelah berganti
   penampilan jadi tidak ada gunanya -- wajah lama tetap diterima. */
test('wajah lama tidak lagi dikenali setelah pendaftaran ulang', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  await daftarkan(portOwner, budi, [berjarak(5.0), berjarak(5.01), berjarak(5.02)]);
  const res = await absenWajah(buat(0));
  assert.equal(res.status, 404);
  // dikembalikan seperti semula untuk test berikutnya
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
});

test('daftar pendaftaran tidak pernah memuat descriptor', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  const res = await fetch(`http://localhost:${portHr}/api/face/enrollments`);
  const teks = await res.text();
  assert.equal(res.status, 200);
  assert.equal(teks.includes('descriptor'), false);
  const body = JSON.parse(teks);
  const baris = body.find(b => b.employeeId === budi);
  assert.equal(baris.sampleCount, 3);
  assert.equal(body.find(b => b.employeeId === belumDaftar).sampleCount, 0);
});

/* ---------------- Absen lewat kamera ---------------- */

test('wajah yang dikenali tercatat hadir, dan fotonya tersimpan', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  const res = await absenWajah(buat(0));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.name, 'Budi Wajah');
  assert.equal(body.kind, 'check_in');
  assert.match(body.checkInTime, /^\d{2}:\d{2}$/);

  const baris = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(budi, hariIni());
  assert.equal(baris.status, 'hadir');
  assert.equal(baris.marked_by, 'Absen Mandiri (wajah)');

  const foto = db.prepare('SELECT * FROM check_in_photos WHERE employee_id = ?').get(budi);
  assert.equal(foto.kind, 'check_in');
  assert.ok(foto.photo.length > 0);
  assert.ok(foto.distance < 0.5);
});

test('absen kedua di hari yang sama otomatis jadi jam pulang', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  await absenWajah(buat(0));
  const res = await absenWajah(buat(0));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.kind, 'check_out');
  assert.match(body.checkOutTime, /^\d{2}:\d{2}$/);
});

test('wajah asing ditolak dan tidak menyebut nama siapa pun', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  const res = await absenWajah(berjarak(3.0));
  assert.equal(res.status, 404);
  const teks = await res.text();
  assert.equal(teks.includes('Budi'), false);
  assert.equal(JSON.parse(teks).reason, 'tidak_dikenali');
});

test('percobaan yang gagal tidak meninggalkan foto maupun absensi', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  await absenWajah(berjarak(3.0));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM check_in_photos').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attendance').get().n, 0);
});

test('absen wajah tanpa foto bukti ditolak', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  const res = await absenWajah(buat(0), null);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Foto bukti/);
});

test('foto bukti yang kebesaran ditolak', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  const besar = 'data:image/jpeg;base64,' + 'A'.repeat(400 * 1024);
  const res = await absenWajah(buat(0), besar);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /maksimal/);
});

test('kios tidak bisa menimpa catatan izin yang dibuat HR lewat wajah', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, note, marked_by, updated_at)
    VALUES (?, ?, 'izin', 'full', 0, 'acara keluarga', 'HR Uji', ?)
  `).run(budi, hariIni(), Date.now());

  const res = await absenWajah(buat(0));
  assert.equal(res.status, 409);
  assert.equal(
    db.prepare('SELECT status FROM attendance WHERE employee_id = ? AND date = ?').get(budi, hariIni()).status,
    'izin'
  );
});

/* ---------------- Jalur manual tidak boleh jadi pintu belakang ---------- */

/* Ini inti seluruh fiturnya. Kalau tombol manual masih bisa dipakai untuk
   karyawan yang wajahnya terdaftar, siapa pun tetap bisa menitipkan absen
   dan kameranya cuma jadi hiasan. Penguncian harus di server: menyembunyikan
   tombolnya di halaman tidak menghalangi siapa pun memanggil endpoint. */
test('karyawan yang wajahnya terdaftar tidak bisa absen lewat tombol manual', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  const res = await fetch(`http://localhost:${portKios}/api/kiosk/check-in/${budi}`, { method: 'POST' });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.reason, 'harus_pakai_wajah');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attendance').get().n, 0);
});

test('jam pulang manual juga terkunci untuk yang wajahnya terdaftar', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  await absenWajah(buat(0));
  const res = await fetch(`http://localhost:${portKios}/api/kiosk/check-out/${budi}`, { method: 'POST' });
  assert.equal(res.status, 403);
});

/* Penerapan bertahap: karyawan baru yang belum sempat didaftarkan tetap
   harus bisa absen, kalau tidak fiturnya justru menghalangi pekerjaan. */
test('karyawan yang belum terdaftar wajahnya masih bisa pakai tombol manual', async () => {
  const res = await fetch(`http://localhost:${portKios}/api/kiosk/check-in/${belumDaftar}`, { method: 'POST' });
  assert.equal(res.status, 201);
  assert.equal(
    db.prepare('SELECT marked_by FROM attendance WHERE employee_id = ?').get(belumDaftar).marked_by,
    'Absen Mandiri (kios)'
  );
});

test('daftar kios menandai siapa yang sudah punya wajah, tanpa membocorkan datanya', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  const res = await fetch(`http://localhost:${portKios}/api/kiosk/employees`);
  const teks = await res.text();
  assert.equal(teks.includes('descriptor'), false);
  assert.equal(teks.includes('150000'), false); // upah tetap tidak ikut
  const body = JSON.parse(teks);
  assert.equal(body.employees.find(e => e.id === budi).hasFace, true);
  assert.equal(body.employees.find(e => e.id === belumDaftar).hasFace, false);
});

/* ---------------- Penghapusan pendaftaran ---------------- */

test('Owner bisa menghapus pendaftaran, dan tombol manual terbuka lagi', async () => {
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
  const res = await fetch(`http://localhost:${portOwner}/api/face/enroll/${budi}`, { method: 'DELETE' });
  assert.equal(res.status, 200);

  const manual = await fetch(`http://localhost:${portKios}/api/kiosk/check-in/${budi}`, { method: 'POST' });
  assert.equal(manual.status, 201);

  // dipasang lagi supaya test lain yang berjalan setelah ini tidak terpengaruh
  await daftarkan(portOwner, budi, [berjarak(0.02), berjarak(0.03), berjarak(0.04)]);
});

test('HR tidak boleh menghapus pendaftaran', async () => {
  const res = await fetch(`http://localhost:${portHr}/api/face/enroll/${budi}`, { method: 'DELETE' });
  assert.equal(res.status, 403);
});
