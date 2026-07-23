/* ============================================================
   sqliteSessionStore.js — Session store persisten di SQLite
   Menggantikan MemoryStore bawaan express-session supaya sesi
   login tidak hilang setiap server di-restart (mis. iMac reboot/
   tidur). Tanpa dependency tambahan — pakai koneksi node:sqlite
   yang sama dengan data lain, lewat db.js.
   ============================================================ */

const session = require('express-session');
const db = require('./db');

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam, samakan dengan cookie.maxAge di server.js

class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    this.getStmt = db.prepare('SELECT session, expires FROM sessions WHERE sid = ?');
    this.upsertStmt = db.prepare(`
      INSERT INTO sessions (sid, session, expires) VALUES (@sid, @session, @expires)
      ON CONFLICT(sid) DO UPDATE SET session = excluded.session, expires = excluded.expires
    `);
    this.destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
  }

  expiresFor(sessionData) {
    return sessionData.cookie && sessionData.cookie.expires
      ? new Date(sessionData.cookie.expires).getTime()
      : Date.now() + DEFAULT_TTL_MS;
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) {
        this.destroyStmt.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.session));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sessionData, cb) {
    try {
      this.upsertStmt.run({ sid, session: JSON.stringify(sessionData), expires: this.expiresFor(sessionData) });
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.destroyStmt.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sessionData, cb) {
    try {
      this.touchStmt.run(this.expiresFor(sessionData), sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = SqliteSessionStore;
