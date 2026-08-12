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

// 2mb: foto karyawan dikirim sebagai data URL base64 di body JSON. Server
// tetap memvalidasi ukuran hasil decode sendiri di routes/employees.js —
// batas ini cuma memberi ruang, bukan pengaman.
app.use(express.json({ limit: '2mb' }));
app.use(session({
  store: new SqliteSessionStore(), // persisten -- sesi login tetap ada walau server di-restart
  secret: process.env.SESSION_SECRET || 'absensiku-dev-secret-ganti-saat-deploy',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 12 * 60 * 60 * 1000 } // 12 jam
}));

const createLookupRouter = require('./routes/lookupRouter');

app.use('/api', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/jobs', createLookupRouter({ table: 'jobs', employeeColumn: 'job_id', label: 'Jabatan' }));
app.use('/api/organizations', createLookupRouter({ table: 'organizations', employeeColumn: 'organization_id', label: 'Divisi' }));
app.use('/api/work-schedules', require('./routes/workSchedules'));
app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/late-policies', require('./routes/latePolicies'));
app.use('/api/audit-log', require('./routes/auditLog'));

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`AbsensiKu backend jalan di http://localhost:${PORT}`);

  /* Backup harian dijalankan dari dalam server supaya owner tidak perlu
     menyiapkan penjadwal terpisah di macOS. Server memang sudah dijaga
     hidup terus oleh pm2, jadi inilah tempat yang paling andal. */
  require('./backup').mulaiJadwalBackup();
});
