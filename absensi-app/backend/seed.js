/* ============================================================
   seed.js — Data demo awal (npm run seed)
   Idempotent: dilewati kalau tabel accounts sudah berisi data.
   ============================================================ */

const bcrypt = require('bcryptjs');
const db = require('./db');

function todayMonthDay() {
  const d = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function seed() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM accounts').get();
  if (existing.n > 0) {
    console.log('Seed dilewati — tabel accounts sudah berisi data.');
    return;
  }

  const insertAccount = db.prepare(
    `INSERT INTO accounts (name, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  const now = Date.now();
  insertAccount.run('Rina (HR)', 'hradmin', bcrypt.hashSync('hr123', 10), 'hr', now);
  insertAccount.run('Admin Owner', 'owner', bcrypt.hashSync('owner123', 10), 'owner', now);

  const insertEmployee = db.prepare(
    `INSERT INTO employees (name, daily_wage, birth_date, active, created_at) VALUES (?, ?, ?, 1, ?)`
  );
  insertEmployee.run('Budi Santoso', 100000, `1995-${todayMonthDay()}`, now);
  insertEmployee.run('Siti Aminah', 100000, '1998-03-12', now);
  insertEmployee.run('Andi Wijaya', 120000, '1992-11-05', now);

  console.log('Seed selesai: 2 akun (hradmin/hr123, owner/owner123), 3 karyawan.');
}

seed();
