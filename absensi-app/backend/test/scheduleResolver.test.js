const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dayOfWeek, resolveSchedule, isWorkday, resolveLatePolicy,
  computeLateMinutes, countScheduledDays
} = require('../scheduleResolver');

/* ---------------- dayOfWeek ---------------- */

test('dayOfWeek mengembalikan hari yang benar tanpa pergeseran zona waktu', () => {
  assert.equal(dayOfWeek('2026-07-31'), 5); // Jumat
  assert.equal(dayOfWeek('2026-08-01'), 6); // Sabtu
  assert.equal(dayOfWeek('2026-08-02'), 0); // Minggu
  assert.equal(dayOfWeek('2026-08-03'), 1); // Senin
  // 1 Januari harus tetap 1 Januari, bukan tergeser jadi 31 Desember
  assert.equal(dayOfWeek('2026-01-01'), 4); // Kamis
});

/* ---------------- resolveSchedule ---------------- */

const COMPANY_OLD = { id: 1, employeeId: null, workDays: '1,2,3,4,5', startTime: '08:00', endTime: '17:00', effectiveFrom: '1970-01-01' };
const COMPANY_NEW = { id: 2, employeeId: null, workDays: '1,2,3,4,5,6', startTime: '07:30', endTime: '16:00', effectiveFrom: '2026-06-01' };
const EMP_EXCEPTION = { id: 3, employeeId: 7, workDays: '1,2,3', startTime: '09:00', endTime: '15:00', effectiveFrom: '2026-01-01' };

test('memilih versi jadwal dengan effective_from terbesar yang tidak melewati tanggal', () => {
  const schedules = [COMPANY_OLD, COMPANY_NEW];
  assert.equal(resolveSchedule(schedules, 99, '2026-05-31').startTime, '08:00');
  assert.equal(resolveSchedule(schedules, 99, '2026-06-01').startTime, '07:30');
  assert.equal(resolveSchedule(schedules, 99, '2026-07-15').startTime, '07:30');
});

test('jadwal khusus karyawan menang atas jadwal baku walaupun bakunya lebih baru', () => {
  const schedules = [COMPANY_OLD, COMPANY_NEW, EMP_EXCEPTION];
  const resolved = resolveSchedule(schedules, 7, '2026-07-15');
  assert.equal(resolved.startTime, '09:00', 'pengecualian karyawan harus dipakai');
  assert.equal(resolved.workDays, '1,2,3');
});

test('karyawan tanpa pengecualian jatuh ke jadwal baku', () => {
  const schedules = [COMPANY_OLD, COMPANY_NEW, EMP_EXCEPTION];
  assert.equal(resolveSchedule(schedules, 8, '2026-07-15').startTime, '07:30');
});

test('tanggal sebelum semua effective_from mengembalikan null', () => {
  assert.equal(resolveSchedule([COMPANY_NEW], 99, '2026-05-31'), null);
});

/* ---------------- isWorkday ---------------- */

test('isWorkday false untuk hari di luar work_days', () => {
  const holidays = new Set();
  assert.equal(isWorkday(COMPANY_OLD, '2026-08-02', holidays), false); // Minggu
  assert.equal(isWorkday(COMPANY_OLD, '2026-08-01', holidays), false); // Sabtu
  assert.equal(isWorkday(COMPANY_OLD, '2026-08-03', holidays), true);  // Senin
});

test('isWorkday false untuk tanggal yang terdaftar libur', () => {
  const holidays = new Set(['2026-08-17']);
  assert.equal(dayOfWeek('2026-08-17'), 1, 'prasyarat: 17 Agustus 2026 memang Senin');
  assert.equal(isWorkday(COMPANY_OLD, '2026-08-17', holidays), false);
});

test('isWorkday false kalau jadwalnya null', () => {
  assert.equal(isWorkday(null, '2026-08-03', new Set()), false);
});

/* ---------------- computeLateMinutes ---------------- */

test('computeLateMinutes menghitung dari jam masuk terjadwal plus toleransi', () => {
  assert.equal(computeLateMinutes('08:45', '08:00', 30), 15);
  assert.equal(computeLateMinutes('08:30', '08:00', 30), 0, 'tepat di batas bukan telat');
  assert.equal(computeLateMinutes('08:20', '08:00', 30), 0);
  assert.equal(computeLateMinutes('07:55', '08:00', 30), 0, 'datang lebih awal tidak pernah negatif');
});

test('computeLateMinutes mengembalikan 0 kalau jam masuk belum tercatat', () => {
  assert.equal(computeLateMinutes(null, '08:00', 30), 0);
  assert.equal(computeLateMinutes('', '08:00', 30), 0);
});

test('computeLateMinutes memperlakukan toleransi kosong sebagai nol', () => {
  assert.equal(computeLateMinutes('08:10', '08:00', 0), 10);
});

/* ---------------- resolveLatePolicy ---------------- */

const POLICY_OLD = { id: 1, employeeId: 7, graceMinutes: 30, thresholdMinutes: 60, deductionType: 'flat', effectiveFrom: '1970-01-01' };
const POLICY_NEW = { id: 2, employeeId: 7, graceMinutes: 10, thresholdMinutes: 30, deductionType: 'flat', effectiveFrom: '2026-07-01' };

test('resolveLatePolicy memakai versi yang berlaku pada tanggal absensi', () => {
  const policies = [POLICY_OLD, POLICY_NEW];
  assert.equal(resolveLatePolicy(policies, 7, '2026-06-30').graceMinutes, 30);
  assert.equal(resolveLatePolicy(policies, 7, '2026-07-01').graceMinutes, 10);
});

test('resolveLatePolicy mengembalikan null untuk karyawan tanpa aturan', () => {
  assert.equal(resolveLatePolicy([POLICY_OLD], 8, '2026-07-15'), null);
});

/* ---------------- countScheduledDays ---------------- */

test('countScheduledDays menghitung hari kerja dan mengecualikan libur', () => {
  // 3-9 Agustus 2026: Senin-Minggu. Senin-Jumat = 5 hari kerja.
  assert.equal(countScheduledDays(COMPANY_OLD, new Set(), '2026-08-03', '2026-08-09'), 5);
  assert.equal(countScheduledDays(COMPANY_OLD, new Set(['2026-08-05']), '2026-08-03', '2026-08-09'), 4);
});

test('countScheduledDays benar saat melewati pergantian bulan', () => {
  // 27 Juli - 2 Agustus 2026: Senin-Minggu, 5 hari kerja
  assert.equal(countScheduledDays(COMPANY_OLD, new Set(), '2026-07-27', '2026-08-02'), 5);
});

test('countScheduledDays mengembalikan 0 kalau rentangnya terbalik', () => {
  assert.equal(countScheduledDays(COMPANY_OLD, new Set(), '2026-08-09', '2026-08-03'), 0);
});
