/* ============================================================
   routes/holidays.js — Hari libur, diisi Owner sendiri.
   Berlaku untuk semua karyawan. Tidak ada data awal libur
   nasional: tanggal SKB berubah tiap tahun, dan salah tanggal
   akan langsung merusak perhitungan gaji. Owner only.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toJson(row) {
  return { date: row.date, name: row.name };
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
  res.status(201).json({ date, name: cleanName });
});

router.delete('/:date', requireOwner, (req, res) => {
  const row = db.prepare('SELECT date FROM holidays WHERE date = ?').get(req.params.date);
  if (!row) return res.status(404).json({ error: 'Hari libur tidak ditemukan.' });

  db.prepare('DELETE FROM holidays WHERE date = ?').run(row.date);
  res.json({ ok: true });
});

module.exports = router;
