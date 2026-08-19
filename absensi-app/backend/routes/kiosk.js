/* ============================================================
   routes/kiosk.js — Absen mandiri di komputer bersama

   TANPA LOGIN. Route di sini terbuka untuk siapa pun yang bisa
   menjangkau server, karena memang dipakai di PC umum yang
   didatangi semua karyawan tiap pagi.

   Karena terbuka, kemampuannya sengaja dipersempit sesempit
   mungkin:
     - hanya bisa mencatat HADIR dan jam pulang
     - TIDAK bisa menandai izin / sakit / alpa
     - TIDAK bisa menandai banyak orang sekaligus
     - TIDAK bisa mengubah atau menimpa catatan yang sudah ada
     - TIDAK pernah mengembalikan data upah
     - TIDAK pernah mengembalikan descriptor wajah siapa pun

   Yang boleh menimpa catatan tetap hanya HR/Owner lewat panel
   mereka, yang mewajibkan alasan dan tercatat di Log Perubahan.

   PENCOCOKAN WAJAH DIKERJAKAN DI SINI, BUKAN DI BROWSER.
   Mencocokkan di browser berarti mengirim seluruh basis data
   wajah ke PC umum, dan membiarkan PC itu yang memutuskan
   "ini si A" -- padahal siapa pun bisa memanggil endpoint ini
   langsung dan mengaku sebagai siapa saja. Browser hanya boleh
   mengirim satu descriptor hasil kamera; server yang menentukan
   itu siapa.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { recordAudit } = require('../auditLog');
const { cocokkanWajah, validasiDescriptor } = require('../faceMatcher');

const router = express.Router();

/* Kios tidak punya akun. Nilai ini yang tercatat di Log Perubahan supaya
   owner bisa membedakan absen mandiri dari yang diketik HR. account_id 0
   dipakai karena kolomnya NOT NULL dan tidak ada akun nomor 0.

   Dibedakan antara wajah dan manual: kalau nanti ada sengketa, Owner perlu
   tahu absen itu lewat kamera (ada foto buktinya) atau lewat daftar nama. */
const AKUN_KIOS_WAJAH = { accountId: 0, name: 'Absen Mandiri (wajah)' };
const AKUN_KIOS_MANUAL = { accountId: 0, name: 'Absen Mandiri (kios)' };

const FOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const FOTO_MAX_BYTES = 200 * 1024;

function pad2(n) { return String(n).padStart(2, '0'); }

function serverTimeStr() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function tanggalHariIni() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function cariAbsensi(employeeId, tanggal) {
  return db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, tanggal);
}

function karyawanAktif(id) {
  return db.prepare(
    'SELECT id, name FROM employees WHERE id = ? AND deleted_at IS NULL AND active = 1'
  ).get(id);
}

function sudahDaftarWajah(employeeId) {
  return db.prepare('SELECT 1 FROM face_descriptors WHERE employee_id = ? LIMIT 1').get(employeeId) != null;
}

/* Foto bukti dari kamera kios. Divalidasi walau browser sudah mengecilkan:
   pengirimnya tidak punya sesi, jadi tidak ada yang bisa dipercaya soal
   ukuran maupun jenis isinya. */
function parseFoto(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!match) return { error: 'Foto bukti tidak terkirim.' };
  const mime = match[1].toLowerCase();
  if (!FOTO_MIMES.includes(mime)) return { error: 'Format foto bukti tidak dikenali.' };
  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch (err) {
    return { error: 'Data foto bukti rusak.' };
  }
  if (buffer.length === 0) return { error: 'Data foto bukti rusak.' };
  if (buffer.length > FOTO_MAX_BYTES) {
    return { error: `Foto bukti maksimal ${Math.round(FOTO_MAX_BYTES / 1024)} KB.` };
  }
  return { buffer, mime };
}

function simpanFotoBukti({ employeeId, tanggal, kind, foto, jarak }) {
  db.prepare(`
    INSERT INTO check_in_photos (employee_id, date, kind, photo, photo_mime, distance, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(employeeId, tanggal, kind, foto.buffer, foto.mime, jarak ?? null, Date.now());
}

/* ---------------- Pencatatan (dipakai jalur wajah & jalur manual) ------- */

function catatMasuk(karyawan, akun) {
  const tanggal = tanggalHariIni();

  /* Menolak, bukan menimpa. Dua alasannya:
     - kalau HR sudah menandai orang ini izin/sakit, kios tidak boleh
       diam-diam mengubahnya jadi hadir
     - menstempel ulang jam masuk hanya akan memundurkannya ke jam
       sekarang, dan potongan telat dihitung dari kolom itu */
  const sudahAda = cariAbsensi(karyawan.id, tanggal);
  if (sudahAda) {
    return {
      status: 409,
      body: {
        error: `${karyawan.name} sudah tercatat hari ini.`,
        status: sudahAda.status,
        checkInTime: sudahAda.check_in_time
      }
    };
  }

  const jam = serverTimeStr();
  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, ?, '', ?, ?)
  `).run(karyawan.id, tanggal, jam, akun.name, Date.now());

  const tersimpan = cariAbsensi(karyawan.id, tanggal);
  recordAudit(akun, {
    action: 'create',
    entity: 'attendance',
    entityId: tersimpan.id,
    before: null,
    after: tersimpan
  });

  return { status: 201, body: { name: karyawan.name, checkInTime: jam }, tanggal };
}

function catatPulang(karyawan, akun) {
  const tanggal = tanggalHariIni();
  const baris = cariAbsensi(karyawan.id, tanggal);
  if (!baris) return { status: 400, body: { error: `${karyawan.name} belum absen masuk hari ini.` } };
  if (baris.status !== 'hadir') {
    return { status: 400, body: { error: `Hari ini ${karyawan.name} tercatat ${baris.status}, bukan hadir.` } };
  }
  if (baris.check_out_time) {
    return { status: 409, body: { error: `Jam pulang ${karyawan.name} sudah tercatat.`, checkOutTime: baris.check_out_time } };
  }

  const jam = serverTimeStr();
  db.prepare('UPDATE attendance SET check_out_time = ?, marked_by = ?, updated_at = ? WHERE id = ?')
    .run(jam, akun.name, Date.now(), baris.id);

  recordAudit(akun, {
    action: 'check_out',
    entity: 'attendance',
    entityId: baris.id,
    before: baris,
    after: cariAbsensi(karyawan.id, tanggal)
  });

  return { status: 200, body: { name: karyawan.name, checkOutTime: jam }, tanggal };
}

/* ---------------- Daftar karyawan ---------------- */

/* Daftar karyawan beserta keadaan absensinya hari ini.

   Sengaja TIDAK memakai toJson dari routes/employees.js: fungsi itu
   membawa upah harian untuk Owner, dan halaman ini terbuka tanpa login.
   Bentuk yang dikirim di sini dibatasi manual supaya tidak ada kolom
   sensitif yang ikut terbawa kalau nanti tabelnya bertambah kolom. */
router.get('/employees', (req, res) => {
  const tanggal = tanggalHariIni();

  const rows = db.prepare(`
    SELECT e.id, e.name, e.employee_code, e.photo_updated_at,
           (e.photo IS NOT NULL) AS punya_foto,
           (SELECT COUNT(*) FROM face_descriptors f WHERE f.employee_id = e.id) AS jumlah_wajah,
           a.status, a.check_in_time, a.check_out_time, a.marked_by
    FROM employees e
    LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
    WHERE e.deleted_at IS NULL AND e.active = 1
    ORDER BY e.name
  `).all(tanggal);

  res.json({
    date: tanggal,
    serverTime: serverTimeStr(),
    employees: rows.map(r => ({
      id: r.id,
      name: r.name,
      employeeCode: r.employee_code,
      hasPhoto: !!r.punya_foto,
      photoVersion: r.photo_updated_at,
      /* Cuma penanda ya/tidak. Jumlah sampelnya pun tidak dikirim: itu
         keterangan pendaftaran, bukan urusan layar kios. */
      hasFace: r.jumlah_wajah > 0,
      status: r.status || null,
      checkInTime: r.check_in_time || null,
      checkOutTime: r.check_out_time || null,
      markedBy: r.marked_by || null
    }))
  });
});

/* ---------------- Jalur wajah ---------------- */

/* Satu endpoint untuk masuk dan pulang. Yang menentukan bukan tombol yang
   ditekan, melainkan keadaan absensi orangnya hari ini -- karyawan tidak
   perlu memilih apa pun, cukup menghadap kamera. */
router.post('/face/check-in', (req, res) => {
  const { descriptor, photo } = req.body || {};

  const salahDescriptor = validasiDescriptor(descriptor);
  if (salahDescriptor) return res.status(400).json({ error: salahDescriptor });

  const foto = parseFoto(photo);
  if (foto.error) return res.status(400).json({ error: foto.error });

  const terdaftar = db.prepare(`
    SELECT f.employee_id, f.descriptor, e.name
    FROM face_descriptors f
    JOIN employees e ON e.id = f.employee_id
    WHERE e.deleted_at IS NULL AND e.active = 1
  `).all().map(r => ({
    employeeId: r.employee_id,
    name: r.name,
    descriptor: JSON.parse(r.descriptor)
  }));

  const hasil = cocokkanWajah(descriptor, terdaftar);
  if (!hasil.cocok) {
    /* Nama kandidat terdekat SENGAJA tidak diberitahukan saat gagal. Kalau
       diberitahu, layar kios berubah jadi alat menebak: orang bisa mencoba
       berkali-kali sampai tahu wajah siapa yang paling mendekati. */
    return res.status(404).json({ error: hasil.pesan, reason: hasil.alasan });
  }

  const karyawan = karyawanAktif(hasil.employeeId);
  if (!karyawan) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

  const tanggal = tanggalHariIni();
  const baris = cariAbsensi(karyawan.id, tanggal);

  /* Sudah hadir dan belum ada jam pulang -> yang dimaksud pasti pulang. */
  const mauPulang = baris && baris.status === 'hadir' && !baris.check_out_time;
  const hasilCatat = mauPulang
    ? catatPulang(karyawan, AKUN_KIOS_WAJAH)
    : catatMasuk(karyawan, AKUN_KIOS_WAJAH);

  /* Foto bukti hanya disimpan kalau pencatatannya benar-benar terjadi.
     Menyimpan foto tiap percobaan gagal cuma menumpuk gambar orang yang
     tidak jadi absen. */
  if (hasilCatat.status === 200 || hasilCatat.status === 201) {
    simpanFotoBukti({
      employeeId: karyawan.id,
      tanggal,
      kind: mauPulang ? 'check_out' : 'check_in',
      foto,
      jarak: hasil.jarak
    });
  }

  res.status(hasilCatat.status).json({
    ...hasilCatat.body,
    matched: true,
    kind: mauPulang ? 'check_out' : 'check_in',
    distance: Number(hasil.jarak.toFixed(3))
  });
});

/* ---------------- Jalur manual (cadangan) ---------------- */

/* Jalur manual TIDAK dihapus, tapi dikunci untuk karyawan yang wajahnya
   sudah terdaftar. Alasannya: tombol manual yang bisa dipakai siapa saja
   membuat pengenalan wajah tidak ada gunanya -- yang mau menitipkan absen
   tinggal menekan tombol itu. Yang tersisa hanya untuk karyawan baru yang
   belum sempat didaftarkan wajahnya, supaya penerapannya bisa bertahap.

   Penguncian dikerjakan di server, bukan dengan menyembunyikan tombolnya
   di halaman: yang disembunyikan di browser tetap bisa dipanggil langsung. */
function tolakKalauSudahPunyaWajah(karyawan, res) {
  if (!sudahDaftarWajah(karyawan.id)) return false;
  res.status(403).json({
    error: `Wajah ${karyawan.name} sudah terdaftar, jadi absennya lewat kamera.`,
    reason: 'harus_pakai_wajah'
  });
  return true;
}

router.post('/check-in/:employeeId', (req, res) => {
  const karyawan = karyawanAktif(req.params.employeeId);
  if (!karyawan) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
  if (tolakKalauSudahPunyaWajah(karyawan, res)) return;

  const hasil = catatMasuk(karyawan, AKUN_KIOS_MANUAL);
  res.status(hasil.status).json(hasil.body);
});

router.post('/check-out/:employeeId', (req, res) => {
  const karyawan = karyawanAktif(req.params.employeeId);
  if (!karyawan) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
  if (tolakKalauSudahPunyaWajah(karyawan, res)) return;

  const hasil = catatPulang(karyawan, AKUN_KIOS_MANUAL);
  res.status(hasil.status).json(hasil.body);
});

/* Foto karyawan untuk kios. Endpoint foto yang lama butuh login, sedangkan
   halaman ini tidak punya sesi. Yang dibuka di sini hanya fotonya -- tanpa
   upah, tanpa data pribadi lain -- dan hanya untuk karyawan aktif. Foto
   membantu orang menemukan namanya sendiri dengan cepat di layar bersama. */
router.get('/photo/:employeeId', (req, res) => {
  const row = db.prepare(
    'SELECT photo, photo_mime FROM employees WHERE id = ? AND deleted_at IS NULL AND active = 1'
  ).get(req.params.employeeId);
  if (!row || !row.photo) return res.status(404).json({ error: 'Karyawan ini belum punya foto.' });

  res.set('Content-Type', row.photo_mime || 'image/jpeg');
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(Buffer.from(row.photo));
});

module.exports = router;
