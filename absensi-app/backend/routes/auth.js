/* ============================================================
   routes/auth.js — Login, logout, sesi berjalan
   ============================================================ */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function roleLabel(role) {
  return role === 'owner' ? 'Owner/Admin' : 'HR Admin';
}

router.post('/login', (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) {
    return res.status(400).json({ ok: false, message: 'Username, password, dan role wajib diisi.' });
  }

  const account = db.prepare('SELECT * FROM accounts WHERE LOWER(username) = ?').get(String(username).trim().toLowerCase());
  if (!account || !bcrypt.compareSync(password, account.password_hash)) {
    return res.status(401).json({ ok: false, message: 'Username atau password salah.' });
  }
  if (account.role !== role) {
    return res.status(401).json({
      ok: false,
      message: `Akun ini terdaftar sebagai ${roleLabel(account.role)}, bukan ${roleLabel(role)}.`
    });
  }

  req.session.accountId = account.id;
  req.session.role = account.role;
  req.session.name = account.name;

  res.json({ ok: true, account: { id: account.id, name: account.name, username: account.username, role: account.role } });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.session.accountId, name: req.session.name, role: req.session.role });
});

module.exports = router;
