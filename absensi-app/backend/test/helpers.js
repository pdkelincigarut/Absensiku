/* ============================================================
   test/helpers.js — Utilitas bersama untuk test backend
   ============================================================ */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

function useTempDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'absensiku-test-'));
  process.env.DB_FILE = path.join(tmpDir, 'test.db');
  delete require.cache[require.resolve('../db')];
  return require('../db');
}

function mountWithSession(mountPath, router, session) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = session; next(); });
  app.use(mountPath, router);
  return app;
}

function startServer(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

module.exports = { useTempDb, mountWithSession, startServer };
