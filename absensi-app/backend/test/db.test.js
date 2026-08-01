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
    'id', 'employee_id', 'grace_minutes', 'threshold_minutes', 'deduction_type',
    'deduction_flat_amount', 'deduction_per_minute_amount', 'deduction_percentage',
    'effective_from', 'created_at'
  ].sort());
});

test('migrasi 006 membuat jadwal baku perusahaan dan tabel hari libur', () => {
  const db = useTempDb();

  const company = db.prepare('SELECT * FROM work_schedules WHERE employee_id IS NULL').all();
  assert.equal(company.length, 1);
  assert.equal(company[0].effective_from, '1970-01-01');

  const holidayColumns = db.prepare(`PRAGMA table_info(holidays)`).all().map(c => c.name).sort();
  assert.deepEqual(holidayColumns, ['created_at', 'date', 'is_estimate', 'name']);

  const attendanceColumns = db.prepare(`PRAGMA table_info(attendance)`).all().map(c => c.name);
  assert.ok(attendanceColumns.includes('check_out_time'));
});

test('migrasi 009 & 010 membuat tabel audit_log dan kolom deleted_at', () => {
  const db = useTempDb();

  const auditColumns = db.prepare(`PRAGMA table_info(audit_log)`).all().map(c => c.name).sort();
  assert.deepEqual(auditColumns, [
    'account_id', 'account_name', 'action', 'after_json', 'before_json',
    'created_at', 'entity', 'entity_id', 'id', 'reason'
  ]);

  const employeeColumns = db.prepare(`PRAGMA table_info(employees)`).all().map(c => c.name);
  assert.ok(employeeColumns.includes('deleted_at'));
});
