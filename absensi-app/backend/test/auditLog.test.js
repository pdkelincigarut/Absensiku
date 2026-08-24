/* ============================================================
   auditLog.test.js — Alasan wajib saat koreksi, jejak perubahan,
   dan pembatasan pembacaan log ke Owner.
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { useTempDb, startServer } = require('./helpers');

let db, server, port, employeeId;

// Sesi bisa diganti per test supaya peran HR vs Owner bisa diuji tanpa
// menyalakan server kedua.
let currentSession = { accountId: 1, role: 'hr', name: 'Rina HR' };

test.before(async () => {
  db = useTempDb();

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = currentSession; next(); });
  app.use('/api/attendance', require('../routes/attendance'));
  app.use('/api/employees', require('../routes/employees'));
  app.use('/api/audit-log', require('../routes/auditLog'));
  app.use('/api/payroll', require('../routes/payroll'));
  server = await startServer(app);
  port = server.address().port;

  db.prepare('INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,1,?,?)')
    .run('Karyawan Audit', 100000, Date.now(), 'AU-1');
  employeeId = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('AU-1').id;
});

test.after(() => { server.close(); });

function put(date, body) {
  return fetch(`http://localhost:${port}/api/attendance/${employeeId}/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function auditRowsFor(entityId, entity = 'attendance') {
  return db.prepare('SELECT * FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id')
    .all(entity, String(entityId));
}

function attendanceId(date) {
  return db.prepare('SELECT id FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, date).id;
}

test('input pertama tanpa alasan diterima dan tercatat sebagai create', async () => {
  const res = await put('2026-09-01', { status: 'hadir', attendanceType: 'full' });
  assert.equal(res.status, 200);

  const rows = auditRowsFor(attendanceId('2026-09-01'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'create');
  assert.equal(rows[0].before_json, null);
  assert.equal(rows[0].account_name, 'Rina HR');
  assert.equal(JSON.parse(rows[0].after_json).status, 'hadir');
});

test('koreksi tanpa alasan ditolak 400', async () => {
  await put('2026-09-02', { status: 'hadir', attendanceType: 'full' });

  const res = await put('2026-09-02', { status: 'izin' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /alasan/i);

  // Penolakan harus terjadi SEBELUM apa pun ditulis.
  const row = db.prepare('SELECT status FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, '2026-09-02');
  assert.equal(row.status, 'hadir');
});

test('koreksi dengan alasan tercatat lengkap dengan nilai sebelum dan sesudah', async () => {
  await put('2026-09-03', { status: 'hadir', attendanceType: 'full' });
  const res = await put('2026-09-03', { status: 'izin', reason: 'surat izin menyusul' });
  assert.equal(res.status, 200);

  const rows = auditRowsFor(attendanceId('2026-09-03'));
  assert.equal(rows.length, 2);

  const koreksi = rows[1];
  assert.equal(koreksi.action, 'update');
  assert.equal(koreksi.reason, 'surat izin menyusul');
  assert.equal(JSON.parse(koreksi.before_json).status, 'hadir');
  assert.equal(JSON.parse(koreksi.after_json).status, 'izin');
});

test('menyimpan ulang tanpa perubahan tidak minta alasan dan tidak menulis log', async () => {
  await put('2026-09-04', { status: 'hadir', attendanceType: 'full' });
  const before = auditRowsFor(attendanceId('2026-09-04')).length;

  const res = await put('2026-09-04', { status: 'hadir', attendanceType: 'full' });
  assert.equal(res.status, 200);

  assert.equal(auditRowsFor(attendanceId('2026-09-04')).length, before);
});

/* Sebelumnya setiap penyimpanan menstempel ulang check_in_time dengan jam
   sekarang, sehingga mengoreksi catatan sore hari memindahkan jam masuk
   karyawan -- dan potongan keterlambatan dihitung dari kolom itu. */
test('koreksi tidak menggeser jam masuk yang sudah tercatat', async () => {
  await put('2026-09-05', { status: 'hadir' });
  const id = attendanceId('2026-09-05');
  db.prepare('UPDATE attendance SET check_in_time = ? WHERE id = ?').run('07:58', id);

  await put('2026-09-05', { status: 'hadir', note: 'pulang cepat, izin', reason: 'catatan menyusul' });

  const row = db.prepare('SELECT check_in_time, hours_worked FROM attendance WHERE id = ?').get(id);
  assert.equal(row.check_in_time, '07:58', 'jam masuk asli harus dipertahankan');
  assert.equal(row.hours_worked, 8, 'jam kerja tetap 8 -- upah sekarang dari check-in/check-out sungguhan, bukan pilihan tipe kehadiran');
});

test('hari yang berubah dari izin menjadi hadir mendapat jam masuk baru', async () => {
  await put('2026-09-06', { status: 'izin' });
  await put('2026-09-06', { status: 'hadir', attendanceType: 'full', reason: 'ternyata masuk' });

  const row = db.prepare('SELECT check_in_time FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, '2026-09-06');
  assert.match(row.check_in_time, /^\d{2}:\d{2}$/);
});

test('tandai massal menulis satu baris log per karyawan dan melewati yang sudah tercatat', async () => {
  db.prepare('INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,1,?,?)')
    .run('Karyawan Massal', 100000, Date.now(), 'AU-2');
  const otherId = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('AU-2').id;

  await put('2026-09-10', { status: 'izin' }); // employeeId sudah punya catatan

  const res = await fetch(`http://localhost:${port}/api/attendance/bulk-mark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-09-10', employeeIds: [employeeId, otherId] })
  });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.deepEqual(body.marked, [otherId]);
  assert.equal(body.skipped, 1);

  // Yang sudah tercatat tidak boleh tertimpa jadi hadir.
  const existing = db.prepare('SELECT status FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, '2026-09-10');
  assert.equal(existing.status, 'izin');

  const bulkRows = db.prepare(`SELECT * FROM audit_log WHERE action = 'bulk_create'`).all();
  assert.equal(bulkRows.length, 1);
  assert.equal(JSON.parse(bulkRows[0].after_json).employee_id, otherId);
});

test('GET /api/audit-log menolak akun HR', async () => {
  const res = await fetch(`http://localhost:${port}/api/audit-log`);
  assert.equal(res.status, 403);
});

test('GET /api/audit-log melayani Owner dan menyaring per entity', async () => {
  const previous = currentSession;
  currentSession = { accountId: 2, role: 'owner', name: 'Pak Owner' };
  try {
    const res = await fetch(`http://localhost:${port}/api/audit-log?entity=attendance&limit=5`);
    assert.equal(res.status, 200);

    const rows = await res.json();
    assert.ok(rows.length > 0 && rows.length <= 5);
    assert.ok(rows.every(r => r.entity === 'attendance'));
    // Urut terbaru dulu.
    assert.ok(rows[0].createdAt >= rows[rows.length - 1].createdAt);
    // before/after sudah berbentuk objek, bukan string JSON mentah.
    assert.equal(typeof rows[0].after, 'object');
  } finally {
    currentSession = previous;
  }
});

test('menghapus karyawan menyembunyikannya dari daftar tapi menyisakan absensinya', async () => {
  const previous = currentSession;
  currentSession = { accountId: 2, role: 'owner', name: 'Pak Owner' };
  try {
    db.prepare('INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,1,?,?)')
      .run('Karyawan Hapus', 100000, Date.now(), 'AU-3');
    const doomedId = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('AU-3').id;

    await fetch(`http://localhost:${port}/api/attendance/${doomedId}/2026-09-20`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'hadir', attendanceType: 'full' })
    });

    const res = await fetch(`http://localhost:${port}/api/employees/${doomedId}`, { method: 'DELETE' });
    assert.equal(res.status, 200);

    const row = db.prepare('SELECT deleted_at FROM employees WHERE id = ?').get(doomedId);
    assert.ok(row.deleted_at > 0, 'baris karyawan harus tetap ada dengan deleted_at terisi');

    const attendance = db.prepare('SELECT COUNT(*) AS n FROM attendance WHERE employee_id = ?').get(doomedId);
    assert.equal(attendance.n, 1, 'absensinya tidak boleh ikut hilang');

    const list = await (await fetch(`http://localhost:${port}/api/employees`)).json();
    assert.equal(list.some(e => e.id === doomedId), false);

    const deleteLog = auditRowsFor(doomedId, 'employee').find(r => r.action === 'delete');
    assert.ok(deleteLog, 'penghapusan harus tercatat');
    assert.equal(JSON.parse(deleteLog.before_json).name, 'Karyawan Hapus');

    // Menyentuh karyawan terhapus dijawab 404, bukan diam-diam ditulis.
    const afterDelete = await fetch(`http://localhost:${port}/api/attendance/${doomedId}/2026-09-21`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'hadir', attendanceType: 'full' })
    });
    assert.equal(afterDelete.status, 404);
  } finally {
    currentSession = previous;
  }
});

/* Menghilangkan karyawan terhapus dari laporan akan menggeser angka gaji
   periode yang mungkin sudah dibayarkan. Yang sudah lewat harus tetap sama. */
test('laporan gaji periode berjalan tidak berubah setelah karyawannya dihapus', async () => {
  const previous = currentSession;
  currentSession = { accountId: 2, role: 'owner', name: 'Pak Owner' };
  try {
    // Tanggal di dalam periode berjalan (28 bulan lalu s/d 27 bulan berjalan)
    // dan tidak di masa depan, supaya benar-benar ikut dihitung.
    const today = new Date();
    const inPeriod = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const pad2 = n => String(n).padStart(2, '0');
    const dateStr = `${inPeriod.getFullYear()}-${pad2(inPeriod.getMonth() + 1)}-${pad2(inPeriod.getDate())}`;

    db.prepare('INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,1,?,?)')
      .run('Karyawan Gaji', 150000, Date.now(), 'AU-5');
    const paidId = db.prepare('SELECT id FROM employees WHERE employee_code = ?').get('AU-5').id;

    db.prepare(`
      INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
      VALUES (?, ?, 'hadir', 'full', 8, '08:00', '', 'seed', ?)
    `).run(paidId, dateStr, Date.now());

    const beforeReport = await (await fetch(`http://localhost:${port}/api/payroll?periodOffset=0`)).json();
    const beforeRow = beforeReport.rows.find(r => r.employeeId === paidId);
    assert.ok(beforeRow, 'karyawan harus muncul sebelum dihapus');

    await fetch(`http://localhost:${port}/api/employees/${paidId}`, { method: 'DELETE' });

    const afterReport = await (await fetch(`http://localhost:${port}/api/payroll?periodOffset=0`)).json();
    const afterRow = afterReport.rows.find(r => r.employeeId === paidId);

    assert.ok(afterRow, 'karyawan terhapus harus tetap muncul selama punya absensi di periode ini');
    assert.equal(afterRow.finalWage, beforeRow.finalWage);
    assert.equal(afterReport.grandFinalTotal, beforeReport.grandFinalTotal);
  } finally {
    currentSession = previous;
  }
});

test('snapshot karyawan tidak menyalin BLOB foto ke dalam log', async () => {
  const previous = currentSession;
  currentSession = { accountId: 2, role: 'owner', name: 'Pak Owner' };
  try {
    const res = await fetch(`http://localhost:${port}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Karyawan Foto', dailyWage: 100000, employeeCode: 'AU-4' })
    });
    const created = await res.json();

    const log = auditRowsFor(created.id, 'employee')[0];
    const after = JSON.parse(log.after_json);
    assert.equal('photo' in after, false, 'BLOB foto tidak boleh ikut tersalin ke log');
    assert.equal(after.name, 'Karyawan Foto');
  } finally {
    currentSession = previous;
  }
});
