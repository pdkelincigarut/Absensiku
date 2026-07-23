/* ============================================================
   server.js — Entry point backend AbsensiKu
   Menyajikan frontend statis DAN API di satu proses/port yang
   sama, supaya PC HR & PC Owner cukup buka satu alamat.
   ============================================================ */

const path = require('path');
const express = require('express');
const session = require('express-session');

require('./db'); // memastikan migrasi sudah jalan sebelum route dipakai

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
  // TODO: pindah ke store persisten (mis. connect-sqlite3) & secret dari env
  // saat benar-benar deploy ke server kantor. Untuk tahap dev-only, restart
  // server = semua sesi login hilang — ini yang diharapkan sekarang.
  secret: process.env.SESSION_SECRET || 'absensiku-dev-secret-ganti-saat-deploy',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 12 * 60 * 60 * 1000 } // 12 jam
}));

app.use('/api', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/payroll', require('./routes/payroll'));

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`AbsensiKu backend jalan di http://localhost:${PORT}`);
});
