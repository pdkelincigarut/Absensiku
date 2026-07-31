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

const dbFile = process.env.DB_FILE || path.join(dataDir, 'absensiku.db');
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL');
// foreign_keys sengaja TIDAK diaktifkan: menghapus karyawan harus tetap
// menyisakan riwayat absensinya (employee_id yatim), sama seperti perilaku
// versi localStorage sebelumnya. Soft delete formal menyusul di Fitur 1.

function runMigrations() {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);

  const migrationsDir = path.join(__dirname, 'migrations');
  // .js diterima selain .sql untuk migrasi yang perlu logika — mis. mengonversi
  // data lama sambil melaporkan baris mana yang terdampak, yang tidak bisa
  // dilakukan SQL murni. Keduanya diurutkan bersama berdasarkan nama berkas.
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
    .sort();
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map(r => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    if (file.endsWith('.sql')) {
      db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    } else {
      require(path.join(migrationsDir, file))(db);
    }
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
    console.log(`Migration diterapkan: ${file}`);
  }
}

runMigrations();

module.exports = db;
