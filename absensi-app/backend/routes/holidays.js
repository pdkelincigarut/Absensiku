/* ============================================================
   routes/holidays.js — Hari libur, diisi Owner sendiri.
   Berlaku untuk semua karyawan. Tidak ada data awal libur
   nasional: tanggal SKB berubah tiap tahun, dan salah tanggal
   akan langsung merusak perhitungan gaji. Owner only.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { nationalHolidays } = require('../holidayCalculator');
const { recordAudit } = require('../auditLog');

const router = express.Router();

function findRow(date) {
  return db.prepare('SELECT * FROM holidays WHERE date = ?').get(date);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toJson(row) {
  return { date: row.date, name: row.name, isEstimate: !!row.is_estimate };
}

/* Jadwal baku perusahaan yang berlaku sekarang, dipakai untuk menempatkan
   cuti bersama pada hari kerja. Jatuh ke Senin-Jumat kalau belum diatur. */
function currentCompanyWorkDays() {
  const row = db.prepare(`
    SELECT work_days FROM work_schedules
    WHERE employee_id IS NULL
    ORDER BY effective_from DESC, id DESC
    LIMIT 1
  `).get();
  return row ? row.work_days : '1,2,3,4,5';
}

router.get('/', requireOwner, (req, res) => {
  const { year } = req.query;
  if (year) {
    const rows = db.prepare('SELECT * FROM holidays WHERE date LIKE ? ORDER BY date').all(`${year}-%`);
    return res.json(rows.map(toJson));
  }
  res.json(db.prepare('SELECT * FROM holidays ORDER BY date').all().map(toJson));
});

router.post('/', requireOwner, (req, res) => {
  const { date, name } = req.body || {};

  if (!DATE_PATTERN.test(String(date || ''))) {
    return res.status(400).json({ error: 'Tanggal wajib diisi format YYYY-MM-DD.' });
  }
  const cleanName = String(name == null ? '' : name).trim();
  if (!cleanName) return res.status(400).json({ error: 'Keterangan hari libur wajib diisi.' });

  if (db.prepare('SELECT date FROM holidays WHERE date = ?').get(date)) {
    return res.status(400).json({ error: `Tanggal ${date} sudah terdaftar sebagai hari libur.` });
  }

  db.prepare('INSERT INTO holidays (date, name, created_at) VALUES (?, ?, ?)').run(date, cleanName, Date.now());
  recordAudit(req.session, {
    action: 'create', entity: 'holiday', entityId: date, before: null, after: findRow(date)
  });
  res.status(201).json({ date, name: cleanName });
});

router.post('/generate', requireOwner, (req, res) => {
  const year = Number(req.body && req.body.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    return res.status(400).json({ error: 'Tahun wajib diisi angka yang wajar.' });
  }

  const existing = new Set(
    db.prepare('SELECT date FROM holidays WHERE date LIKE ?').all(`${year}-%`).map(r => r.date)
  );

  const insert = db.prepare('INSERT INTO holidays (date, name, is_estimate, created_at) VALUES (?, ?, ?, ?)');
  const added = [];
  const skipped = [];
  const now = Date.now();

  // Tanggal yang sudah ada dilewati, tidak ditimpa -- owner mungkin sudah
  // mengoreksinya, dan menimpanya akan menghapus koreksi itu diam-diam.
  for (const holiday of nationalHolidays(year, currentCompanyWorkDays())) {
    if (existing.has(holiday.date)) {
      skipped.push(holiday);
      continue;
    }
    insert.run(holiday.date, holiday.name, holiday.isEstimate ? 1 : 0, now);
    recordAudit(req.session, {
      action: 'generate', entity: 'holiday', entityId: holiday.date,
      before: null, after: findRow(holiday.date), createdAt: now
    });
    existing.add(holiday.date);
    added.push(holiday);
  }

  res.json({ added, skipped });
});

router.patch('/:date/confirm', requireOwner, (req, res) => {
  const row = findRow(req.params.date);
  if (!row) return res.status(404).json({ error: 'Hari libur tidak ditemukan.' });

  db.prepare('UPDATE holidays SET is_estimate = 0 WHERE date = ?').run(row.date);
  recordAudit(req.session, {
    action: 'confirm', entity: 'holiday', entityId: row.date, before: row, after: findRow(row.date)
  });
  res.json({ ok: true });
});

router.delete('/:date', requireOwner, (req, res) => {
  const row = findRow(req.params.date);
  if (!row) return res.status(404).json({ error: 'Hari libur tidak ditemukan.' });

  db.prepare('DELETE FROM holidays WHERE date = ?').run(row.date);
  // Hard delete disengaja: barisnya sepele dan bisa dibuat ulang, dan
  // before_json di sini sudah cukup untuk memulihkannya kalau salah hapus.
  recordAudit(req.session, {
    action: 'delete', entity: 'holiday', entityId: row.date,
    before: row, after: null, reason: (req.body || {}).reason
  });
  res.json({ ok: true });
});

module.exports = router;
