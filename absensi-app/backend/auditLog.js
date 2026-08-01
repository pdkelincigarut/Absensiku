/* ============================================================
   auditLog.js — Penulis jejak perubahan data
   Menyentuh database, jadi BUKAN modul murni seperti
   lateCalculator.js / holidayCalculator.js.
   ============================================================ */

const db = require('./db');

/* Kolom yang tidak boleh ikut masuk snapshot.
   photo: BLOB foto karyawan bisa 500 KB — menyalinnya ke setiap baris log
   akan membengkakkan database berkali-kali lipat dari data aslinya. Yang
   perlu diketahui owner cuma "fotonya berubah", dan photo_updated_at sudah
   menjawab itu. */
const SKIPPED_COLUMNS = ['photo'];

function snapshot(row) {
  if (row == null) return null;
  const clean = {};
  for (const [key, value] of Object.entries(row)) {
    if (SKIPPED_COLUMNS.includes(key)) continue;
    // Buffer (BLOB) dan tipe non-JSON lain tidak pernah diharapkan di sini,
    // tapi kalau lolos, simpan penandanya saja daripada merusak JSON.
    clean[key] = Buffer.isBuffer(value) ? `<${value.length} byte>` : value;
  }
  return JSON.stringify(clean);
}

/* Kolom yang selalu berubah setiap penyimpanan, jadi tidak berguna untuk
   menentukan "apakah ada yang benar-benar berubah". */
const NOISE_COLUMNS = ['updated_at', 'marked_by', 'photo_updated_at'];

/* Membandingkan dua baris pada kolom bermakna saja. Dipakai route untuk
   memutuskan apakah penyimpanan ini koreksi (butuh alasan) atau simpan
   ulang tanpa perubahan (tidak perlu dicatat sama sekali). */
function hasMeaningfulChange(before, after) {
  if (!before || !after) return true;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (NOISE_COLUMNS.includes(key) || SKIPPED_COLUMNS.includes(key)) continue;
    if (before[key] !== after[key]) return true;
  }
  return false;
}

/* session diambil utuh, bukan cuma nama, supaya account_id ikut tercatat --
   dua akun bisa punya nama yang sama. */
function recordAudit(session, { action, entity, entityId, before, after, reason, createdAt }) {
  db.prepare(`
    INSERT INTO audit_log (account_id, account_name, action, entity, entity_id, before_json, after_json, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.accountId,
    session.name,
    action,
    entity,
    String(entityId),
    snapshot(before),
    snapshot(after),
    reason ? String(reason).trim() : null,
    // createdAt bisa dipaksa dari luar supaya satu tindakan massal menghasilkan
    // baris-baris yang benar-benar sedetik sama, bukan berselisih milidetik.
    createdAt || Date.now()
  );
}

module.exports = { recordAudit, hasMeaningfulChange };
