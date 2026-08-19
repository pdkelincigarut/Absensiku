/* ============================================================
   periksaDatabase.js — Memeriksa berkas database sebelum dipakai

   Dipakai saat memindahkan database dari komputer lain (mis. dari
   iMac ke PC Windows). Jalankan SEBELUM menaruhnya di data/,
   supaya kesalahan ketahuan selagi masih mudah dibatalkan.

     npm run periksa-db -- "D:\salinan\absensiku-2026-08-19.db"

   Yang diperiksa, dan alasannya:

     - integritas berkas. Berkas .db yang disalin mentah selagi
       server hidup bisa terpotong di tengah transaksi; kerusakan
       seperti itu sering baru terasa berminggu-minggu kemudian
       saat baris tertentu dibaca.

     - versi migrasi. Database dari aplikasi yang LEBIH BARU
       daripada kode di komputer ini tidak boleh dipakai: kodenya
       tidak tahu cara membaca kolom yang belum dikenalnya, dan
       tidak ada jalan mundur.

     - isi pokoknya. Berkas yang sah tapi kosong biasanya berarti
       salah ambil berkas -- misalnya menyalin database yang baru
       dibuat, bukan yang berisi data karyawan.

   TIDAK mengubah apa pun. Hanya membaca dan melapor.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const berkas = process.argv[2];

if (!berkas) {
  console.error('Pemakaian: npm run periksa-db -- "<path berkas .db>"');
  process.exit(1);
}
if (!fs.existsSync(berkas)) {
  console.error(`Berkas tidak ditemukan: ${berkas}`);
  process.exit(1);
}

const migrationsDir = path.join(__dirname, 'migrations');
const migrasiDiKode = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
  .sort();

let db;
try {
  db = new DatabaseSync(berkas);
} catch (err) {
  console.error(`Bukan berkas database SQLite yang bisa dibuka: ${err.message}`);
  process.exit(1);
}

let bermasalah = false;
const catat = (label, nilai, buruk) => {
  if (buruk) bermasalah = true;
  console.log(`  ${buruk ? '[X]' : '[v]'} ${label.padEnd(28)} ${nilai}`);
};

console.log(`\nMemeriksa: ${berkas}`);
console.log(`Ukuran   : ${(fs.statSync(berkas).size / 1024).toFixed(1)} KB\n`);

// ---------- 1. Integritas ----------
console.log('1. Keutuhan berkas');
try {
  const hasil = db.prepare('PRAGMA integrity_check').get();
  const nilai = Object.values(hasil)[0];
  catat('integrity_check', nilai, nilai !== 'ok');
} catch (err) {
  catat('integrity_check', `gagal: ${err.message}`, true);
}

// ---------- 2. Versi migrasi ----------
console.log('\n2. Versi struktur data');
let migrasiDiBerkas = [];
try {
  migrasiDiBerkas = db.prepare('SELECT name FROM _migrations ORDER BY name').all().map(r => r.name);
} catch (err) {
  catat('tabel _migrations', 'TIDAK ADA — berkas ini bukan database AbsensiKu', true);
}

if (migrasiDiBerkas.length) {
  const terakhirBerkas = migrasiDiBerkas[migrasiDiBerkas.length - 1];
  const terakhirKode = migrasiDiKode[migrasiDiKode.length - 1];
  catat('migrasi di berkas', terakhirBerkas, false);
  catat('migrasi di kode ini', terakhirKode, false);

  const asing = migrasiDiBerkas.filter(m => !migrasiDiKode.includes(m));
  if (asing.length) {
    catat('versi berkas lebih baru', `${asing.join(', ')} — JANGAN dipakai, perbarui dulu kodenya (git pull)`, true);
  } else {
    const akanJalan = migrasiDiKode.filter(m => !migrasiDiBerkas.includes(m));
    catat('akan dimigrasikan', akanJalan.length ? akanJalan.join(', ') : 'tidak ada, sudah sama', false);
  }
}

// ---------- 3. Isi pokok ----------
console.log('\n3. Isi database');
const hitung = (tabel) => {
  try { return db.prepare(`SELECT COUNT(*) AS n FROM ${tabel}`).get().n; }
  catch (err) { return null; }
};

const karyawan = hitung('employees');
const absensi = hitung('attendance');
const akun = hitung('accounts');

catat('akun login', akun === null ? 'tabel tidak ada' : akun, !akun);
catat('karyawan', karyawan === null ? 'tabel tidak ada' : karyawan, !karyawan);
catat('baris absensi', absensi === null ? 'tabel tidak ada' : absensi, false);

for (const t of ['jobs', 'organizations', 'holidays', 'late_policies', 'work_schedules', 'audit_log']) {
  const n = hitung(t);
  if (n !== null) console.log(`      ${t.padEnd(24)} ${n}`);
}

/* Sesi login dari komputer lama tidak berguna di komputer baru dan sebaiknya
   dibuang, tapi itu bukan alasan menolak berkasnya. */
const sesi = hitung('sessions');
if (sesi) {
  console.log(`\n  Catatan: ada ${sesi} sesi login bawaan dari komputer lama.`);
  console.log('  Semuanya otomatis terhapus saat Anda menjalankan "npm run set-password".');
}

db.close();

console.log('\n' + '='.repeat(60));
if (bermasalah) {
  console.log('HASIL: JANGAN dipakai. Perbaiki dulu hal bertanda [X] di atas.');
  process.exit(1);
}
console.log('HASIL: Berkas sehat dan cocok. Aman disalin ke backend/data/absensiku.db');
console.log('       Migrasi yang kurang akan dipasang sendiri saat server dijalankan.');
