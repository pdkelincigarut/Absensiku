/* ============================================================
   middleware/auth.js — Guard otorisasi untuk routes
   ============================================================ */

function requireAuth(req, res, next) {
  if (!req.session || !req.session.accountId) {
    return res.status(401).json({ error: 'Belum login.' });
  }
  next();
}

function requireOwner(req, res, next) {
  if (!req.session || !req.session.accountId) {
    return res.status(401).json({ error: 'Belum login.' });
  }
  if (req.session.role !== 'owner') {
    return res.status(403).json({ error: 'Hanya Owner yang boleh mengakses ini.' });
  }
  next();
}

module.exports = { requireAuth, requireOwner };
