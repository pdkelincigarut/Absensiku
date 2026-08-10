const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

let db, server, port;

const pad2 = n => String(n).padStart(2, '0');
const dateToStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/* Periode gaji 28 bulan lalu s/d 27 bulan berjalan — disalin dari payroll.js
   supaya test bisa menghitung ekspektasinya sendiri.

   offset -1 dipakai untuk kasus yang butuh periode UTUH di masa lampau:
   periode berjalan bisa saja baru berumur beberapa hari (mis. tanggal 31
   berarti periode baru jalan 28-30) sehingga belum tentu memuat hari Minggu. */
const PERIOD_START_DAY = 28;
const PERIOD_END_DAY = 27;

function periodByOffset(offset) {
  const now = new Date();
  const day = now.getDate();
  let startMonth = day >= PERIOD_START_DAY ? now.getMonth() : now.getMonth() - 1;
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

const currentPeriod = () => periodByOffset(0);

/* Hitung ulang secara independen (tidak memanggil scheduleResolver) supaya
   ini benar-benar jadi pembanding, bukan cerminan implementasi yang sama. */
function countExpectedAlpa(workDays, holidays) {
  const { start, end } = currentPeriod();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end && cursor < today) {
    const iso = dateToStr(cursor);
    if (workDays.includes(cursor.getDay()) && !holidays.includes(iso)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

test.before(async () => {
  db = useTempDb();
  const app = mountWithSession('/api/payroll', require('../routes/payroll'), { accountId: 1, role: 'owner', name: 'Owner Test' });
  server = await startServer(app);
  port = server.address().port;
});

test.after(() => { server.close(); });

function insertEmployee(name) {
  db.prepare('INSERT INTO employees (name, daily_wage, active, created_at, employee_code) VALUES (?,?,1,?,?)')
    .run(name, 100000, Date.now(), 'PS-' + name.replace(/\s+/g, ''));
  return db.prepare('SELECT id FROM employees WHERE name = ?').get(name).id;
}

async function payrollRow(employeeId, offset = 0) {
  const data = await (await fetch(`http://localhost:${port}/api/payroll?periodOffset=${offset}`)).json();
  return data.rows.find(r => r.employeeId === employeeId);
}

/* Menghitung hari dengan sifat tertentu dalam sebuah periode, hanya yang sudah
   lewat — cerminan batas `cursor < todayS` di payroll.js. */
function countDaysInPeriod(offset, predicate) {
  const { start, end } = periodByOffset(offset);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let n = 0;
  const cursor = new Date(start);
  while (cursor <= end && cursor < today) {
    if (predicate(cursor, dateToStr(cursor))) n++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return n;
}

/* Mencari hari pertama dalam periode yang memenuhi syarat, atau null. */
function findDayInPeriod(offset, predicate) {
  const { start, end } = periodByOffset(offset);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cursor = new Date(start);
  while (cursor <= end && cursor < today) {
    if (predicate(cursor)) return dateToStr(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

test('alpa dihitung dari hari kerja terjadwal, bukan hari kalender', async () => {
  const employeeId = insertEmployee('Tanpa Catatan');

  const row = await payrollRow(employeeId);
  const expected = countExpectedAlpa([1, 2, 3, 4, 5], []);

  assert.equal(row.alpa, expected);
  assert.ok(expected > 0, 'prasyarat: periode ini punya hari kerja lampau');
});

test('akhir pekan tidak pernah menambah alpa (periode lampau utuh)', async () => {
  const employeeId = insertEmployee('Cek Minggu');
  const row = await payrollRow(employeeId, -1);

  const semuaHari = countDaysInPeriod(-1, () => true);
  const akhirPekan = countDaysInPeriod(-1, d => d.getDay() === 0 || d.getDay() === 6);

  assert.ok(akhirPekan > 0, 'prasyarat: periode lampau memuat akhir pekan');
  assert.equal(row.alpa, semuaHari - akhirPekan);
  assert.ok(row.alpa < semuaHari, 'sebelum perbaikan, alpa sama dengan seluruh hari kalender');
});

const countSaturdays = () => countDaysInPeriod(0, d => d.getDay() === 6);

test('tanggal yang terdaftar libur tidak menambah alpa', async () => {
  const employeeId = insertEmployee('Cek Libur');
  const before = (await payrollRow(employeeId)).alpa;

  // pilih satu hari kerja lampau di dalam periode untuk dijadikan libur
  const { start } = currentPeriod();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(start);
  let target = null;
  while (cursor < today) {
    if (cursor.getDay() >= 1 && cursor.getDay() <= 5) { target = dateToStr(cursor); break; }
    cursor.setDate(cursor.getDate() + 1);
  }
  assert.ok(target, 'prasyarat: ada hari kerja lampau di periode ini');

  db.prepare('INSERT INTO holidays (date, name, created_at) VALUES (?,?,?)').run(target, 'Libur Uji', Date.now());

  const after = (await payrollRow(employeeId)).alpa;
  assert.equal(after, before - 1);

  db.prepare('DELETE FROM holidays WHERE date = ?').run(target);
});

test('karyawan dengan jadwal pengecualian punya jumlah hari kerja berbeda', async () => {
  const biasa = insertEmployee('Jadwal Biasa');
  const sabtuan = insertEmployee('Masuk Sabtu');

  db.prepare(`
    INSERT INTO work_schedules (employee_id, work_days, start_time, end_time, effective_from, created_at)
    VALUES (?, '1,2,3,4,5,6', '08:00', '17:00', '1970-01-01', ?)
  `).run(sabtuan, Date.now());

  const rowBiasa = await payrollRow(biasa);
  const rowSabtu = await payrollRow(sabtuan);

  assert.equal(rowSabtu.alpa - rowBiasa.alpa, countSaturdays());
});

test('hari yang ada catatan absensinya tetap dihitung walau bukan hari kerja terjadwal', async () => {
  const employeeId = insertEmployee('Lembur Minggu');

  const sunday = findDayInPeriod(-1, d => d.getDay() === 0);
  assert.ok(sunday, 'prasyarat: ada hari Minggu lampau di periode sebelumnya');

  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, '08:00', '', 'Test', ?)
  `).run(employeeId, sunday, Date.now());

  const row = await payrollRow(employeeId, -1);
  assert.equal(row.hadir, 1, 'kerja di hari Minggu harus tetap dihitung dan dibayar');
  assert.equal(row.totalWage, 100000);
});

test('menit telat memakai jam masuk jadwal ditambah toleransi aturan', async () => {
  const employeeId = insertEmployee('Telat Terjadwal');

  const { start } = currentPeriod();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(start);
  let workday = null;
  while (cursor < today) {
    if (cursor.getDay() >= 1 && cursor.getDay() <= 5) { workday = dateToStr(cursor); break; }
    cursor.setDate(cursor.getDate() + 1);
  }

  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, '09:15', '', 'Test', ?)
  `).run(employeeId, workday, Date.now());

  // jadwal baku masuk 08:00, toleransi 30 menit → batas 08:30 → telat 45 menit
  db.prepare(`
    INSERT INTO late_policies (employee_id, grace_minutes, threshold_minutes, deduction_type, deduction_flat_amount, effective_from, created_at)
    VALUES (?, 30, 30, 'flat', 20000, '1970-01-01', ?)
  `).run(employeeId, Date.now());

  const row = await payrollRow(employeeId);
  assert.equal(row.lateMinutesTotal, 45);
  assert.equal(row.deductionAmount, 20000);
});

test('absensi lama tetap memakai versi aturan yang berlaku saat itu', async () => {
  const employeeId = insertEmployee('Aturan Berversi');

  const { start } = currentPeriod();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(start);
  let workday = null;
  while (cursor < today) {
    if (cursor.getDay() >= 1 && cursor.getDay() <= 5) { workday = dateToStr(cursor); break; }
    cursor.setDate(cursor.getDate() + 1);
  }

  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, '09:15', '', 'Test', ?)
  `).run(employeeId, workday, Date.now());

  // versi lama: toleransi 30 menit (batas 08:30) → telat 45
  db.prepare(`
    INSERT INTO late_policies (employee_id, grace_minutes, threshold_minutes, deduction_type, deduction_flat_amount, effective_from, created_at)
    VALUES (?, 30, 30, 'flat', 20000, '1970-01-01', ?)
  `).run(employeeId, Date.now());

  const sebelum = await payrollRow(employeeId);
  assert.equal(sebelum.lateMinutesTotal, 45);

  // versi baru berlaku BESOK — tidak boleh mengubah perhitungan hari lampau
  const besok = new Date();
  besok.setDate(besok.getDate() + 1);
  db.prepare(`
    INSERT INTO late_policies (employee_id, grace_minutes, threshold_minutes, deduction_type, deduction_flat_amount, effective_from, created_at)
    VALUES (?, 0, 10, 'flat', 99000, ?, ?)
  `).run(employeeId, dateToStr(besok), Date.now());

  const sesudah = await payrollRow(employeeId);
  assert.equal(sesudah.lateMinutesTotal, 45, 'aturan baru tidak boleh mengubah hari lampau');
  assert.equal(sesudah.deductionAmount, 20000);
});

/* ---------------- Tanggal masuk ---------------- */

/* Karyawan yang bergabung di tengah periode tidak boleh dianggap bolos pada
   hari-hari sebelum dia bekerja di sini. */
test('hari sebelum tanggal masuk tidak dihitung alpa', async () => {
  const id = insertEmployee('Baru Bergabung');
  const tanpaTanggalMasuk = await payrollRow(id);

  // Bergabung kemarin: hampir seluruh periode berjalan ada di belakangnya.
  const kemarin = new Date();
  kemarin.setDate(kemarin.getDate() - 1);
  const pad2 = n => String(n).padStart(2, '0');
  const tanggalMasuk = `${kemarin.getFullYear()}-${pad2(kemarin.getMonth() + 1)}-${pad2(kemarin.getDate())}`;
  db.prepare('UPDATE employees SET join_date = ? WHERE id = ?').run(tanggalMasuk, id);

  const sesudah = await payrollRow(id);
  assert.ok(tanpaTanggalMasuk.alpa > sesudah.alpa,
    `alpa harus berkurang setelah tanggal masuk diisi (sebelum ${tanpaTanggalMasuk.alpa}, sesudah ${sesudah.alpa})`);
  assert.ok(sesudah.alpa <= 1, 'hanya hari sejak bergabung yang boleh terhitung');
  assert.ok(sesudah.scheduledDays < tanpaTanggalMasuk.scheduledDays,
    'hari kerja terjadwal juga tidak boleh menghitung masa sebelum bergabung');
});

test('karyawan tanpa tanggal masuk dihitung seperti sebelumnya', async () => {
  const id = insertEmployee('Tanpa Tanggal Masuk');
  const row = await payrollRow(id);
  const hariKerjaLampau = countDaysInPeriod(0, d => [1, 2, 3, 4, 5].includes(d.getDay()));
  assert.equal(row.alpa, hariKerjaLampau, 'seluruh periode tetap dihitung kalau tanggal masuk kosong');
});

/* Absensi yang terlanjur tercatat sebelum tanggal masuk tetap dibayar --
   catatan kehadiran adalah bukti, bukan tebakan. */
test('absensi sebelum tanggal masuk tetap dibayar kalau tercatat', async () => {
  const id = insertEmployee('Tercatat Lebih Awal');
  const { start } = periodByOffset(0);
  const tanggalAwal = dateToStr(start);

  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, '08:00', '', 'test', ?)
  `).run(id, tanggalAwal, Date.now());

  // Tanggal masuk SESUDAH tanggal absensi tadi.
  const setelah = addDays(start, 3);
  db.prepare('UPDATE employees SET join_date = ? WHERE id = ?').run(dateToStr(setelah), id);

  const row = await payrollRow(id);
  assert.equal(row.hadir, 1, 'hari yang sudah tercatat hadir tetap dihitung');
  assert.ok(row.totalWage > 0, 'dan tetap dibayar');
});

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
