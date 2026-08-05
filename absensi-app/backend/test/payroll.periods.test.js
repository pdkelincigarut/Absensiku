/* ============================================================
   payroll.periods.test.js — GET /api/payroll/periods

   Menentukan berapa periode ke belakang yang layak ditawarkan.
   Periode dari sebelum pencatatan dimulai menampilkan seluruh
   karyawan Alpa sebulan penuh -- angka yang menyesatkan, bukan
   sekadar tidak berguna.
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { useTempDb, startServer } = require('./helpers');

let db, server, port, employeeId;
let currentSession = { accountId: 1, role: 'owner', name: 'Owner Test' };

const PERIOD_START_DAY = 28;
const PERIOD_END_DAY = 27;

function pad2(n) { return String(n).padStart(2, '0'); }
function dateToStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/* Disalin dari payroll.js supaya test menghitung ekspektasinya sendiri. */
function periodByOffset(offset) {
  const now = new Date();
  let startMonth = now.getDate() >= PERIOD_START_DAY ? now.getMonth() : now.getMonth() - 1;
  let startYear = now.getFullYear();
  if (startMonth < 0) { startMonth = 11; startYear--; }

  startMonth += offset;
  while (startMonth < 0) { startMonth += 12; startYear--; }
  while (startMonth > 11) { startMonth -= 12; startYear++; }

  const start = new Date(startYear, startMonth, PERIOD_START_DAY);
  let endMonth = startMonth + 1, endYear = startYear;
  if (endMonth > 11) { endMonth = 0; endYear++; }
  return { start, end: new Date(endYear, endMonth, PERIOD_END_DAY) };
}

test.before(async () => {
  db = useTempDb();

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = currentSession; next(); });
  app.use('/api/payroll', require('../routes/payroll'));
  server = await startServer(app);
  port = server.address().port;

  db.prepare('INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,1,?,?)')
    .run('Karyawan Periode', 100000, Date.now(), 'PP-1');
  employeeId = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('PP-1').id;
});

test.after(() => { server.close(); });

function fetchPeriods() {
  return fetch(`http://localhost:${port}/api/payroll/periods`).then(r => r.json());
}

function insertAttendance(dateStr) {
  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, '08:00', '', 'test', ?)
  `).run(employeeId, dateStr, Date.now());
}

test('tanpa satu pun absensi, hanya periode berjalan yang ditawarkan', async () => {
  const body = await fetchPeriods();
  assert.equal(body.earliest, null);
  assert.equal(body.oldestOffset, 0);
});

test('periode yang hanya tertutup sebagian tidak ditawarkan', async () => {
  // Satu hari SEBELUM awal periode berjalan: periode -1 jadi tertutup
  // sebagian saja, dan hari-hari sebelumnya akan tampil Alpa.
  const awalBerjalan = periodByOffset(0).start;
  const sehariSebelum = new Date(awalBerjalan);
  sehariSebelum.setDate(sehariSebelum.getDate() - 1);
  insertAttendance(dateToStr(sehariSebelum));

  const body = await fetchPeriods();
  assert.equal(body.earliest, dateToStr(sehariSebelum));
  assert.equal(body.oldestOffset, 0, 'periode -1 belum tertutup penuh, jadi belum layak ditawarkan');
});

test('periode ditawarkan begitu tertutup penuh dari hari pertamanya', async () => {
  insertAttendance(dateToStr(periodByOffset(-1).start));

  const body = await fetchPeriods();
  assert.equal(body.oldestOffset, -1);
});

test('periode lebih lama ikut ditawarkan sesuai catatan terlama', async () => {
  insertAttendance(dateToStr(periodByOffset(-3).start));

  const body = await fetchPeriods();
  assert.equal(body.oldestOffset, -3);
});

test('akun HR ditolak', async () => {
  const previous = currentSession;
  currentSession = { accountId: 2, role: 'hr', name: 'HR Test' };
  try {
    const res = await fetch(`http://localhost:${port}/api/payroll/periods`);
    assert.equal(res.status, 403);
  } finally {
    currentSession = previous;
  }
});
