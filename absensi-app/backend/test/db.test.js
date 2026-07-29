const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { useTempDb } = require('./helpers');

test('db.js menulis ke path dari DB_FILE, bukan lokasi default', () => {
  useTempDb();
  const dbFile = process.env.DB_FILE;
  assert.equal(fs.existsSync(dbFile), true);
});

test('tabel late_policies ada dengan kolom yang sesuai setelah migrasi jalan', () => {
  const db = useTempDb();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'late_policies'`).all();
  assert.equal(tables.length, 1);

  const columns = db.prepare(`PRAGMA table_info(late_policies)`).all().map(c => c.name).sort();
  assert.deepEqual(columns, [
    'check_in_limit', 'deduction_flat_amount', 'deduction_per_minute_amount',
    'deduction_percentage', 'deduction_type', 'employee_id', 'threshold_minutes', 'updated_at'
  ].sort());
});
