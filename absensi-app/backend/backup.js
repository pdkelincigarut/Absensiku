/* ============================================================
   backup.js — Salinan harian database

   Dipakai dua cara:
     - otomatis, dijadwalkan dari server.js selama server hidup
     - manual, lewat `npm run backup`

   Menyalin dengan `VACUUM INTO`, BUKAN menyalin berkas .db begitu
   saja. Database ini berjalan dalam mode WAL: tulisan terbaru
   masih menumpuk di berkas -wal dan belum tentu masuk ke .db.
   Menyalin .db-nya sendiri saat server sedang jalan berpotensi
   menghasilkan berkas yang isinya tertinggal, atau rusak. VACUUM
   INTO menuliskan snapshot yang konsisten dalam satu berkas utuh,
   tanpa menghentikan server.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const db = require('./db');

/* Folder tujuan bisa diarahkan ke luar aplikasi lewat BACKUP_DIR --
   mis. ke hard disk eksternal atau folder yang tersinkron ke cloud.
   Backup di disk yang sama dengan aslinya tetap menolong saat data
   salah terhapus, tapi tidak menolong saat disknya yang rusak. */
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'data', 'backups');

/* Berapa banyak salinan harian yang disimpan. Yang terlama dibuang
   begitu jumlahnya melewati angka ini. */
const SIMPAN_MAKS = Number(process.env.BACKUP_KEEP || 30);

const POLA_NAMA = /^absensiku-(\d{4}-\d{2}-\d{2})\.db$/;

function pad2(n) { return String(n).padStart(2, '0'); }

/* Tanggal lokal, bukan UTC. Kantor di WIB: memakai UTC membuat backup
   yang dibuat sebelum pukul 07:00 tercatat sebagai tanggal kemarin. */
function tanggalHariIni() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function daftarBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => POLA_NAMA.test(f))
    // Nama berkas memakai YYYY-MM-DD, jadi urutan abjad = urutan tanggal.
    .sort();
}

/* Membuang salinan terlama sampai jumlahnya kembali ke batas. */
function pangkas() {
  const semua = daftarBackup();
  const berlebih = semua.length - SIMPAN_MAKS;
  if (berlebih <= 0) return [];

  const dibuang = semua.slice(0, berlebih);
  for (const f of dibuang) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
  return dibuang;
}

/* Membuat salinan untuk hari ini kalau belum ada.
   Mengembalikan keterangan apa yang terjadi, supaya pemanggilnya bisa
   memutuskan sendiri mau mencetak apa. */
function backupHariIni({ paksa = false } = {}) {
  const tanggal = tanggalHariIni();
  const namaBerkas = `absensiku-${tanggal}.db`;
  const tujuan = path.join(BACKUP_DIR, namaBerkas);

  if (!paksa && fs.existsSync(tujuan)) {
    return { dibuat: false, alasan: 'sudah ada', berkas: namaBerkas, dibuang: [] };
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  /* Ditulis ke berkas sementara dulu, baru diganti namanya. Kalau proses
     mati di tengah penyalinan, yang tertinggal adalah berkas .tmp --
     bukan berkas backup setengah jadi yang tampak sah dan baru ketahuan
     rusak saat dibutuhkan. */
  const sementara = path.join(BACKUP_DIR, `.${namaBerkas}.tmp`);
  fs.rmSync(sementara, { force: true });

  // SQLite butuh garis miring maju, termasuk di Windows.
  db.exec(`VACUUM INTO '${sementara.replace(/\\/g, '/')}'`);
  fs.renameSync(sementara, tujuan);

  return {
    dibuat: true,
    berkas: namaBerkas,
    ukuran: fs.statSync(tujuan).size,
    dibuang: pangkas()
  };
}

/* Pemeriksaan berkala, bukan pengatur waktu 24 jam sekali. Server bisa
   di-restart atau iMac-nya dimatikan semalaman; penjadwal yang menunggu
   tepat 24 jam akan melewatkan harinya begitu saja. Memeriksa "apakah
   backup hari ini sudah ada" tiap jam selalu mengejar ketinggalan. */
const SELANG_PERIKSA = 60 * 60 * 1000;

function mulaiJadwalBackup() {
  const jalankan = () => {
    try {
      const hasil = backupHariIni();
      if (hasil.dibuat) {
        console.log(`Backup harian dibuat: ${hasil.berkas} (${(hasil.ukuran / 1024).toFixed(0)} KB)`);
        if (hasil.dibuang.length) console.log(`Backup lama dibuang: ${hasil.dibuang.join(', ')}`);
      }
    } catch (err) {
      /* Kegagalan backup tidak boleh mematikan server -- absensi harian
         jauh lebih penting daripada salinannya. Mis. saat BACKUP_DIR
         menunjuk hard disk eksternal yang sedang dicabut. */
      console.error('Backup harian GAGAL:', err.message);
    }
  };

  jalankan();
  const timer = setInterval(jalankan, SELANG_PERIKSA);
  timer.unref?.();   // jangan menahan proses tetap hidup hanya karena timer ini
  return timer;
}

module.exports = { backupHariIni, mulaiJadwalBackup, daftarBackup, BACKUP_DIR, SIMPAN_MAKS };

/* Dijalankan langsung dari terminal: `npm run backup` */
if (require.main === module) {
  const paksa = process.argv.includes('--force');
  try {
    const hasil = backupHariIni({ paksa });
    if (!hasil.dibuat) {
      console.log(`\nBackup hari ini sudah ada: ${hasil.berkas}`);
      console.log('Pakai --force kalau mau menimpanya dengan kondisi terbaru.\n');
    } else {
      console.log(`\nBackup dibuat: ${hasil.berkas} (${(hasil.ukuran / 1024).toFixed(0)} KB)`);
      if (hasil.dibuang.length) console.log(`Dibuang karena melewati ${SIMPAN_MAKS} hari: ${hasil.dibuang.join(', ')}`);
    }
    const semua = daftarBackup();
    console.log(`Tersimpan ${semua.length} dari maksimal ${SIMPAN_MAKS} salinan, di:\n  ${BACKUP_DIR}\n`);
  } catch (err) {
    console.error('\nBackup GAGAL:', err.message, '\n');
    process.exit(1);
  }
}
