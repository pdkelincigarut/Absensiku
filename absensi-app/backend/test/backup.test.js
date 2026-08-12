/* ============================================================
   backup.test.js — Salinan harian & pembuangan yang terlama
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { useTempDb } = require('./helpers');

let db, backupDir, backup;

const pad2 = n => String(n).padStart(2, '0');
const tanggalHariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

test.before(() => {
  db = useTempDb();
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'absensiku-backup-'));
  process.env.BACKUP_DIR = backupDir;

  delete require.cache[require.resolve('../backup')];
  backup = require('../backup');

  db.prepare('INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,1,?,?)')
    .run('Karyawan Backup', 100000, Date.now(), 'BK-1');
});

test.after(() => { fs.rmSync(backupDir, { recursive: true, force: true }); });

function isiFolder() {
  return fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort();
}

test('membuat satu salinan bernama tanggal hari ini', () => {
  const hasil = backup.backupHariIni();
  assert.equal(hasil.dibuat, true);
  assert.equal(hasil.berkas, `absensiku-${tanggalHariIni()}.db`);
  assert.deepEqual(isiFolder(), [`absensiku-${tanggalHariIni()}.db`]);
});

/* Salinannya harus bisa dibuka dan isinya sama, bukan sekadar berkas
   sebesar aslinya. Inilah alasan penyalinan memakai VACUUM INTO. */
test('salinan bisa dibuka dan isinya utuh', () => {
  const salinan = new DatabaseSync(path.join(backupDir, `absensiku-${tanggalHariIni()}.db`));
  assert.equal(salinan.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(salinan.prepare('SELECT COUNT(*) AS n FROM employees').get().n, 1);
  assert.equal(salinan.prepare('SELECT name FROM employees').get().name, 'Karyawan Backup');
  salinan.close();
});

test('dipanggil dua kali dalam sehari tidak membuat salinan kedua', () => {
  const hasil = backup.backupHariIni();
  assert.equal(hasil.dibuat, false);
  assert.equal(hasil.alasan, 'sudah ada');
  assert.equal(isiFolder().length, 1);
});

test('--force menimpa salinan hari ini, tetap satu berkas', () => {
  const hasil = backup.backupHariIni({ paksa: true });
  assert.equal(hasil.dibuat, true);
  assert.equal(isiFolder().length, 1);
});

/* Inti aturannya: folder tidak boleh menyimpan lebih dari 30 salinan, dan
   yang dibuang selalu yang paling lama. */
test('menyimpan maksimal 30 salinan dan membuang yang paling awal', () => {
  // 34 tanggal lampau dibuat manual, ditambah punya hari ini dari test
  // sebelumnya, sehingga jumlahnya jelas melewati batas.
  for (let i = 1; i <= 34; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const nama = `absensiku-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.db`;
    fs.writeFileSync(path.join(backupDir, nama), 'salinan lama');
  }
  assert.equal(isiFolder().length, 35, 'prasyarat: folder melewati batas');

  const sebelum = isiFolder();
  const hasil = backup.backupHariIni({ paksa: true });

  const sesudah = isiFolder();
  assert.equal(sesudah.length, 30, 'harus tersisa tepat 30');
  assert.equal(hasil.dibuang.length, 5);

  // Yang dibuang adalah lima nama paling awal, bukan yang sembarangan.
  assert.deepEqual(hasil.dibuang, sebelum.slice(0, 5));

  // Dan yang paling baru -- salinan hari ini -- tidak ikut terbuang.
  assert.ok(sesudah.includes(`absensiku-${tanggalHariIni()}.db`));
});

test('berkas asing di folder yang sama tidak ikut terhitung atau terhapus', () => {
  const asing = path.join(backupDir, 'catatan-owner.txt');
  fs.writeFileSync(asing, 'jangan dihapus');

  backup.backupHariIni({ paksa: true });

  assert.equal(fs.existsSync(asing), true, 'berkas non-backup harus dibiarkan');
  assert.equal(isiFolder().length, 30);
});
