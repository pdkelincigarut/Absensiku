/* ============================================================
   test/helpers.js — Utilitas bersama untuk test backend
   ============================================================ */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function useTempDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'absensiku-test-'));
  process.env.DB_FILE = path.join(tmpDir, 'test.db');
  delete require.cache[require.resolve('../db')];
  return require('../db');
}

module.exports = { useTempDb };
