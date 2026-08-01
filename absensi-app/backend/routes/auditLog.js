/* ============================================================
   routes/auditLog.js — Pembacaan jejak perubahan. Owner only:
   HR tidak boleh membaca log tentang dirinya sendiri.

   Sengaja hanya ada GET. Tidak ada endpoint ubah maupun hapus —
   log yang bisa disunting bukan log.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LIMIT = 500;

function toJson(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    // Di-parse di sini, bukan dibiarkan string mentah, supaya frontend tidak
    // perlu tahu bahwa penyimpanannya kebetulan berbentuk JSON.
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
    reason: row.reason,
    createdAt: row.created_at
  };
}

/* from/to adalah tanggal lokal 'YYYY-MM-DD', sedangkan created_at tersimpan
   sebagai milidetik epoch. Konversi memakai konstruktor komponen, BUKAN
   new Date('YYYY-MM-DD') yang dianggap UTC dan menggeser batasnya satu hari
   di WIB. `to` dijadikan awal hari berikutnya supaya seluruh hari itu ikut. */
function startOfDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

router.get('/', requireOwner, (req, res) => {
  const { entity, entityId, from, to } = req.query;

  const conditions = [];
  const params = [];

  if (entity) {
    conditions.push('entity = ?');
    params.push(entity);
  }
  if (entityId) {
    conditions.push('entity_id = ?');
    params.push(String(entityId));
  }
  if (from) {
    if (!DATE_PATTERN.test(from)) return res.status(400).json({ error: 'Parameter from harus format YYYY-MM-DD.' });
    conditions.push('created_at >= ?');
    params.push(startOfDay(from));
  }
  if (to) {
    if (!DATE_PATTERN.test(to)) return res.status(400).json({ error: 'Parameter to harus format YYYY-MM-DD.' });
    conditions.push('created_at < ?');
    params.push(startOfDay(to) + 24 * 60 * 60 * 1000);
  }

  let limit = Number(req.query.limit || 100);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  limit = Math.min(limit, MAX_LIMIT);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT * FROM audit_log ${where} ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(...params, limit);

  res.json(rows.map(toJson));
});

module.exports = router;
