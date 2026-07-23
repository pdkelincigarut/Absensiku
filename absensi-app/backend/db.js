/* ============================================================
   db.js — Koneksi SQLite + migration runner
   Menjalankan file .sql di migrations/ urut nomor, mencatat yang
   sudah jalan di tabel _migrations supaya idempotent.
   ============================================================ */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite'); // bawaan Node.js >=22.5, tanpa native build

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'absensiku.db'));
db.exec('PRAGMA journal_mode = WAL');
// foreign_keys sengaja TIDAK diaktifkan: menghapus karyawan harus tetap
// menyisakan riwayat absensinya (employee_id yatim), sama seperti perilaku
// versi localStorage sebelumnya. Soft delete formal menyusul di Fitur 1.

function runMigrations() {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map(r => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
    console.log(`Migration diterapkan: ${file}`);
  }
}

runMigrations();

module.exports = db;
