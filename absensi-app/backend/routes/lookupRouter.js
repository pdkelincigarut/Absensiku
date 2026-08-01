/* ============================================================
   routes/lookupRouter.js — Factory router untuk tabel daftar
   sederhana (jabatan & divisi). Bentuk kedua tabel identik
   (id, name, created_at) dan aturannya sama persis, jadi satu
   factory dipakai bersama supaya tidak ada kode kembar.

   CATATAN KEAMANAN: `table` dan `employeeColumn` disisipkan
   langsung ke string SQL. Keduanya HANYA boleh datang dari
   konstanta di server.js, tidak pernah dari input request.
   Semua nilai dari request tetap lewat parameter binding.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { recordAudit } = require('../auditLog');

function createLookupRouter({ table, employeeColumn, label }) {
  const router = express.Router();

  const findByName = db.prepare(`SELECT id FROM ${table} WHERE LOWER(name) = ?`);
  const findById = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);

  function cleanName(raw) {
    return String(raw == null ? '' : raw).trim();
  }

  router.get('/', requireOwner, (req, res) => {
    const rows = db.prepare(`SELECT id, name FROM ${table} ORDER BY name`).all();
    res.json(rows);
  });

  router.post('/', requireOwner, (req, res) => {
    const name = cleanName((req.body || {}).name);
    if (!name) return res.status(400).json({ error: `Nama ${label.toLowerCase()} wajib diisi.` });
    if (findByName.get(name.toLowerCase())) {
      return res.status(400).json({ error: `${label} "${name}" sudah ada.` });
    }

    const info = db.prepare(`INSERT INTO ${table} (name, created_at) VALUES (?, ?)`).run(name, Date.now());
    const created = findById.get(info.lastInsertRowid);
    recordAudit(req.session, {
      action: 'create', entity: table, entityId: created.id, before: null, after: created
    });
    res.status(201).json(created);
  });

  router.put('/:id', requireOwner, (req, res) => {
    const row = findById.get(req.params.id);
    if (!row) return res.status(404).json({ error: `${label} tidak ditemukan.` });

    const name = cleanName((req.body || {}).name);
    if (!name) return res.status(400).json({ error: `Nama ${label.toLowerCase()} wajib diisi.` });

    const clash = db.prepare(`SELECT id FROM ${table} WHERE LOWER(name) = ? AND id <> ?`).get(name.toLowerCase(), row.id);
    if (clash) return res.status(400).json({ error: `${label} "${name}" sudah ada.` });

    db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, row.id);
    const updated = findById.get(row.id);
    recordAudit(req.session, {
      action: 'update', entity: table, entityId: row.id, before: row, after: updated
    });
    res.json(updated);
  });

  router.delete('/:id', requireOwner, (req, res) => {
    const row = findById.get(req.params.id);
    if (!row) return res.status(404).json({ error: `${label} tidak ditemukan.` });

    // Sengaja menolak, bukan mengosongkan kolom karyawan diam-diam —
    // menghapus data yang tidak diminta pengguna adalah kejutan yang buruk.
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM employees WHERE ${employeeColumn} = ? AND deleted_at IS NULL`).get(row.id);
    if (n > 0) {
      return res.status(400).json({
        error: `${label} ini masih dipakai ${n} karyawan. Ubah data karyawan tersebut dulu sebelum menghapus.`
      });
    }

    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
    recordAudit(req.session, {
      action: 'delete', entity: table, entityId: row.id,
      before: row, after: null, reason: (req.body || {}).reason
    });
    res.json({ ok: true });
  });

  return router;
}

module.exports = createLookupRouter;
