const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { useTempDb } = require('./helpers');

test('db.js menulis ke path dari DB_FILE, bukan lokasi default', () => {
  useTempDb();
  const dbFile = process.env.DB_FILE;
  assert.equal(fs.existsSync(dbFile), true);
});
