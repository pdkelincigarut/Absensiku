/* ============================================================
   routes/face.js — Pendaftaran wajah & foto bukti absen

   BUTUH LOGIN. Pendaftaran wajah mengikuti aturan data karyawan
   lainnya: hanya Owner yang boleh menulis, HR boleh melihat.

   Yang keluar dari sini TIDAK PERNAH memuat descriptor mentah.
   Angka ciri wajah tidak boleh meninggalkan server: pencocokan
   dikerjakan di server (lihat routes/kiosk.js), jadi tidak ada
   satu pun halaman yang perlu memegangnya. Kalau nanti ada yang
   menambah descriptor ke respons demi "biar cepat di browser",
   itu memindahkan seluruh basis data biometrik ke PC umum.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { recordAudit } = require('../auditLog');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { validasiDescriptor, PANJANG_DESCRIPTOR } = require('../faceMatcher');

const router = express.Router();

/* Minimal beberapa sudut pengambilan. Satu sampel membuat pengenalan gagal
   begitu orangnya sedikit memiringkan kepala atau lampunya berubah, dan
   karyawan yang berulang kali ditolak akan berhenti memakai kiosnya. */
const MIN_SAMPEL = 3;
const MAX_SAMPEL = 8;

/* Foto bukti disimpan berapa lama. Gunanya menyelesaikan sengketa absensi,
   dan sengketa muncul saat gajian -- satu periode gaji plus kelonggaran.
   Menyimpannya selamanya cuma menumpuk foto wajah tanpa keperluan. */
const SIMPAN_FOTO_HARI = 40;

router.get('/enrollments', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT e.id, e.name, e.employee_code,
           COUNT(f.id) AS jumlah,
           MAX(f.created_at) AS terakhir,
           MAX(f.created_by) AS oleh
    FROM employees e
    LEFT JOIN face_descriptors f ON f.employee_id = e.id
    WHERE e.deleted_at IS NULL AND e.active = 1
    GROUP BY e.id
    ORDER BY e.name
  `).all();

  res.json(rows.map(r => ({
    employeeId: r.id,
    name: r.name,
    employeeCode: r.employee_code,
    sampleCount: r.jumlah,
    enrolledAt: r.terakhir || null,
    enrolledBy: r.jumlah ? r.oleh : null
  })));
});

router.post('/enroll/:employeeId', requireOwner, (req, res) => {
  const karyawan = db.prepare(
    'SELECT id, name FROM employees WHERE id = ? AND deleted_at IS NULL AND active = 1'
  ).get(req.params.employeeId);
  if (!karyawan) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

  const { descriptors } = req.body || {};
  if (!Array.isArray(descriptors)) {
    return res.status(400).json({ error: 'Data wajah tidak dikirim.' });
  }
  if (descriptors.length < MIN_SAMPEL) {
    return res.status(400).json({ error: `Butuh minimal ${MIN_SAMPEL} pengambilan wajah, baru terkumpul ${descriptors.length}.` });
  }
  if (descriptors.length > MAX_SAMPEL) {
    return res.status(400).json({ error: `Maksimal ${MAX_SAMPEL} pengambilan wajah.` });
  }
  for (const d of descriptors) {
    const salah = validasiDescriptor(d);
    if (salah) return res.status(400).json({ error: salah });
  }

  const sebelum = db.prepare('SELECT COUNT(*) AS n FROM face_descriptors WHERE employee_id = ?').get(karyawan.id).n;

  /* Ganti seluruhnya, bukan menambah. Pendaftaran ulang biasanya dilakukan
     justru karena yang lama tidak lagi cocok (potong rambut, kacamata baru,
     berjenggot). Menyisakan yang lama membuat wajah lama tetap diterima dan
     pendaftaran ulangnya jadi percuma. */
  const tulis = db.prepare(`
    INSERT INTO face_descriptors (employee_id, descriptor, created_at, created_by)
    VALUES (?, ?, ?, ?)
  `);
  const sekarang = Date.now();

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM face_descriptors WHERE employee_id = ?').run(karyawan.id);
    for (const d of descriptors) {
      tulis.run(karyawan.id, JSON.stringify(d), sekarang, req.session.name);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  /* Descriptor-nya sendiri TIDAK ikut masuk log: isinya data biometrik, dan
     audit_log dibaca dari panel Owner. Yang perlu tercatat cuma bahwa
     pendaftarannya berubah, oleh siapa, dan kapan. */
  recordAudit(req.session, {
    action: sebelum ? 'update' : 'create',
    entity: 'face_enrollment',
    entityId: karyawan.id,
    before: sebelum ? { employee_id: karyawan.id, sample_count: sebelum } : null,
    after: { employee_id: karyawan.id, sample_count: descriptors.length }
  });

  res.status(201).json({ employeeId: karyawan.id, name: karyawan.name, sampleCount: descriptors.length });
});

router.delete('/enroll/:employeeId', requireOwner, (req, res) => {
  const karyawan = db.prepare('SELECT id, name FROM employees WHERE id = ?').get(req.params.employeeId);
  if (!karyawan) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

  const sebelum = db.prepare('SELECT COUNT(*) AS n FROM face_descriptors WHERE employee_id = ?').get(karyawan.id).n;
  if (!sebelum) return res.status(404).json({ error: `${karyawan.name} memang belum terdaftar wajahnya.` });

  db.prepare('DELETE FROM face_descriptors WHERE employee_id = ?').run(karyawan.id);

  recordAudit(req.session, {
    action: 'delete',
    entity: 'face_enrollment',
    entityId: karyawan.id,
    before: { employee_id: karyawan.id, sample_count: sebelum },
    after: null
  });

  res.json({ employeeId: karyawan.id, name: karyawan.name, sampleCount: 0 });
});

/* Foto bukti absen. Dipakai HR/Owner untuk memeriksa kalau ada yang
   dicurigai menitipkan absen. */
router.get('/photos', requireAuth, (req, res) => {
  const { date, employeeId } = req.query;
  const syarat = [];
  const nilai = [];
  if (date) { syarat.push('p.date = ?'); nilai.push(date); }
  if (employeeId) { syarat.push('p.employee_id = ?'); nilai.push(employeeId); }
  const where = syarat.length ? `WHERE ${syarat.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT p.id, p.employee_id, p.date, p.kind, p.distance, p.created_at, e.name
    FROM check_in_photos p
    JOIN employees e ON e.id = p.employee_id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT 200
  `).all(...nilai);

  res.json(rows.map(r => ({
    id: r.id,
    employeeId: r.employee_id,
    name: r.name,
    date: r.date,
    kind: r.kind,
    distance: r.distance,
    createdAt: r.created_at
  })));
});

router.get('/photos/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT photo, photo_mime FROM check_in_photos WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Foto tidak ditemukan.' });
  res.set('Content-Type', row.photo_mime);
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(Buffer.from(row.photo));
});

/* Dipanggil dari server.js sekali sehari, sekalian dengan backup. Dibuat
   sebagai fungsi biasa (bukan route) supaya tidak ada cara memicunya dari
   luar -- penghapusan massal tidak boleh punya pintu HTTP. */
function pangkasFotoLama() {
  const batas = new Date(Date.now() - SIMPAN_FOTO_HARI * 24 * 60 * 60 * 1000);
  const pad2 = n => String(n).padStart(2, '0');
  const tanggalBatas = `${batas.getFullYear()}-${pad2(batas.getMonth() + 1)}-${pad2(batas.getDate())}`;
  const hasil = db.prepare('DELETE FROM check_in_photos WHERE date < ?').run(tanggalBatas);
  if (hasil.changes) {
    console.log(`[foto absen] ${hasil.changes} foto sebelum ${tanggalBatas} dihapus.`);
  }
  return hasil.changes;
}

module.exports = router;
module.exports.pangkasFotoLama = pangkasFotoLama;
module.exports.SIMPAN_FOTO_HARI = SIMPAN_FOTO_HARI;
module.exports.MIN_SAMPEL = MIN_SAMPEL;
module.exports.MAX_SAMPEL = MAX_SAMPEL;
