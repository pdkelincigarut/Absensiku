/* ============================================================
   routes/employees.js — Data karyawan
   GET tersedia untuk HR & Owner (HR tidak dapat field dailyWage,
   otorisasi ini dijalankan di server, bukan cuma disembunyikan
   di UI). Kode karyawan, jabatan, dan divisi boleh dilihat HR —
   tidak rahasia, dan HR butuh untuk membedakan nama yang mirip.
   Tulis/hapus khusus Owner.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireAuth, requireOwner } = require('../middleware/auth');

const router = express.Router();

const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 500 * 1024;

/* Mengembalikan { buffer, mime } kalau valid, atau { error } kalau tidak.
   Browser sudah mengecilkan foto sebelum mengirim, tapi validasi di sini
   tetap wajib — pengecilan di browser itu kemudahan, bukan pengaman. */
function parsePhotoDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl));
  if (!match) return { error: 'Format foto tidak dikenali.' };

  const mime = match[1].toLowerCase();
  if (!PHOTO_MIMES.includes(mime)) {
    return { error: 'Foto harus berformat JPG, PNG, atau WebP.' };
  }

  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch (err) {
    return { error: 'Data foto rusak.' };
  }
  if (buffer.length === 0) return { error: 'Data foto rusak.' };
  if (buffer.length > PHOTO_MAX_BYTES) {
    return { error: `Ukuran foto maksimal ${Math.round(PHOTO_MAX_BYTES / 1024)} KB.` };
  }
  return { buffer, mime };
}

const SELECT_WITH_LOOKUPS = `
  SELECT e.*, j.name AS job_name, o.name AS organization_name
  FROM employees e
  LEFT JOIN jobs j ON j.id = e.job_id
  LEFT JOIN organizations o ON o.id = e.organization_id
`;

function toJson(row, includeWage) {
  const emp = {
    id: row.id,
    employeeCode: row.employee_code,
    name: row.name,
    birthDate: row.birth_date,
    job: row.job_id ? { id: row.job_id, name: row.job_name } : null,
    organization: row.organization_id ? { id: row.organization_id, name: row.organization_name } : null,
    active: !!row.active,
    createdAt: row.created_at,
    // BLOB foto sengaja TIDAK ikut — akan membuat respons daftar karyawan
    // berat. Frontend menyusun URL-nya: /api/employees/:id/photo?v=<versi>
    hasPhoto: !!row.photo,
    photoVersion: row.photo_updated_at
  };
  if (includeWage) emp.dailyWage = row.daily_wage;
  return emp;
}

function getById(id) {
  return db.prepare(`${SELECT_WITH_LOOKUPS} WHERE e.id = ?`).get(id);
}

/* Validasi bersama POST & PUT. `selfId` diisi saat PUT supaya karyawan
   yang sedang diubah tidak dianggap bentrok dengan kodenya sendiri.
   Mengembalikan string pesan error, atau null kalau semuanya sah. */
function validateEmployeeBody(body, selfId) {
  const { name, dailyWage, employeeCode, jobId, organizationId } = body;

  if (!name || !name.trim() || !Number.isFinite(Number(dailyWage))) {
    return 'Nama dan upah harian wajib diisi.';
  }

  const code = String(employeeCode == null ? '' : employeeCode).trim();
  if (!code) return 'Employee ID wajib diisi.';

  const clash = selfId
    ? db.prepare('SELECT id FROM employees WHERE LOWER(employee_code) = ? AND id <> ?').get(code.toLowerCase(), selfId)
    : db.prepare('SELECT id FROM employees WHERE LOWER(employee_code) = ?').get(code.toLowerCase());
  if (clash) return `Employee ID "${code}" sudah dipakai karyawan lain.`;

  if (jobId != null && jobId !== '' && !db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId)) {
    return 'Jabatan yang dipilih tidak ditemukan.';
  }
  if (organizationId != null && organizationId !== '' && !db.prepare('SELECT id FROM organizations WHERE id = ?').get(organizationId)) {
    return 'Divisi yang dipilih tidak ditemukan.';
  }

  return null;
}

function normalizeLookupId(value) {
  return value == null || value === '' ? null : Number(value);
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT_WITH_LOOKUPS} ORDER BY e.name`).all();
  const includeWage = req.session.role === 'owner';
  res.json(rows.map(r => toJson(r, includeWage)));
});

router.post('/', requireOwner, (req, res) => {
  const body = req.body || {};
  const error = validateEmployeeBody(body, null);
  if (error) return res.status(400).json({ error });

  let photo = null, photoMime = null, photoUpdatedAt = null;
  if (typeof body.photo === 'string') {
    const parsed = parsePhotoDataUrl(body.photo);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    photo = parsed.buffer;
    photoMime = parsed.mime;
    photoUpdatedAt = Date.now();
  }

  const info = db.prepare(`
    INSERT INTO employees (name, daily_wage, birth_date, active, created_at, employee_code, job_id, organization_id, photo, photo_mime, photo_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.name.trim(),
    Number(body.dailyWage),
    body.birthDate || null,
    body.active === false ? 0 : 1,
    Date.now(),
    String(body.employeeCode).trim(),
    normalizeLookupId(body.jobId),
    normalizeLookupId(body.organizationId),
    photo,
    photoMime,
    photoUpdatedAt
  );

  res.status(201).json(toJson(getById(info.lastInsertRowid), true));
});

router.put('/:id', requireOwner, (req, res) => {
  const row = db.prepare('SELECT id FROM employees WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

  const body = req.body || {};
  const error = validateEmployeeBody(body, row.id);
  if (error) return res.status(400).json({ error });

  // Foto divalidasi SEBELUM apa pun ditulis, supaya foto yang tidak sah tidak
  // menyisakan perubahan nama/upah yang sudah tersimpan separuh jalan.
  let parsedPhoto = null;
  if (typeof body.photo === 'string') {
    parsedPhoto = parsePhotoDataUrl(body.photo);
    if (parsedPhoto.error) return res.status(400).json({ error: parsedPhoto.error });
  }

  db.prepare(`
    UPDATE employees
    SET name = ?, daily_wage = ?, birth_date = ?, active = ?, employee_code = ?, job_id = ?, organization_id = ?
    WHERE id = ?
  `).run(
    body.name.trim(),
    Number(body.dailyWage),
    body.birthDate || null,
    body.active === false ? 0 : 1,
    String(body.employeeCode).trim(),
    normalizeLookupId(body.jobId),
    normalizeLookupId(body.organizationId),
    row.id
  );

  // Kolom foto diperbarui terpisah supaya tiga kemungkinan bisa dibedakan:
  // field tidak dikirim = biarkan apa adanya, null = hapus, string = ganti.
  // Tanpa pemisahan ini, menyimpan perubahan nama akan diam-diam menghapus foto.
  if (parsedPhoto) {
    db.prepare('UPDATE employees SET photo = ?, photo_mime = ?, photo_updated_at = ? WHERE id = ?')
      .run(parsedPhoto.buffer, parsedPhoto.mime, Date.now(), row.id);
  } else if (body.photo === null) {
    db.prepare('UPDATE employees SET photo = NULL, photo_mime = NULL, photo_updated_at = NULL WHERE id = ?')
      .run(row.id);
  }

  res.json(toJson(getById(row.id), true));
});

/* Tersedia untuk HR juga (requireAuth, bukan requireOwner): foto bukan data
   rahasia seperti upah, dan HR justru butuh untuk mengenali karyawan. */
router.get('/:id/photo', requireAuth, (req, res) => {
  const row = db.prepare('SELECT photo, photo_mime FROM employees WHERE id = ?').get(req.params.id);
  if (!row || !row.photo) return res.status(404).json({ error: 'Karyawan ini belum punya foto.' });

  res.set('Content-Type', row.photo_mime || 'image/jpeg');
  // URL selalu membawa ?v=photo_updated_at, jadi cache panjang tetap aman —
  // foto yang diganti otomatis punya URL berbeda.
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(Buffer.from(row.photo));
});

router.delete('/:id', requireOwner, (req, res) => {
  const row = db.prepare('SELECT id FROM employees WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
