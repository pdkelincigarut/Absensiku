/* ============================================================
   server.js — Entry point backend AbsensiKu
   Menyajikan frontend statis DAN API di satu proses/port yang
   sama, supaya PC HR & PC Owner cukup buka satu alamat.
   ============================================================ */

const path = require('path');
const express = require('express');
const session = require('express-session');
const SqliteSessionStore = require('./sqliteSessionStore');

require('./db'); // memastikan migrasi sudah jalan sebelum route dipakai

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET) {
  console.warn('PERINGATAN: SESSION_SECRET belum di-set, pakai nilai default (tidak aman untuk produksi). Set environment variable SESSION_SECRET sebelum deploy ke server kantor.');
}

app.use(express.json());
app.use(session({
  store: new SqliteSessionStore(), // persisten -- sesi login tetap ada walau server di-restart
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
