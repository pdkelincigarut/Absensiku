/* ============================================================
   scheduleResolver.js — Pemilihan aturan yang berlaku pada
   sebuah tanggal, dan penentuan hari kerja. Modul murni tanpa
   akses database supaya gampang dites dan dipakai bersama oleh
   payroll maupun Insight Dashboard nanti.

   ATURAN PENTING: seluruh perbandingan memakai string
   'YYYY-MM-DD' dan 'HH:MM' apa adanya. Tidak ada objek Date
   yang diparse dari string ISO — bentuk itu diperlakukan
   sebagai UTC oleh JavaScript dan bisa menggeser tanggal satu
   hari di zona waktu WIB.
   ============================================================ */

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/* 0=Minggu .. 6=Sabtu. Date dibangun dari komponen angka (bukan parsing
   string), sehingga dianggap waktu lokal dan tanggalnya tidak bergeser. */
function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const pad2 = v => String(v).padStart(2, '0');
  return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
}

/* Memilih baris berversi yang berlaku pada sebuah tanggal: effective_from
   terbesar yang tidak melewati tanggal itu. Dipakai jadwal maupun aturan telat. */
function pickEffective(rows, dateStr) {
  let chosen = null;
  for (const row of rows) {
    if (row.effectiveFrom > dateStr) continue;
    if (!chosen || row.effectiveFrom > chosen.effectiveFrom) chosen = row;
  }
  return chosen;
}

/* Pengecualian per karyawan SELALU menang atas jadwal baku, walaupun jadwal
   bakunya lebih baru — itulah arti "pengecualian". Untuk mengembalikan
   karyawan ke jadwal baku, baris pengecualiannya harus dihapus. */
function resolveSchedule(schedules, employeeId, dateStr) {
  const own = schedules.filter(s => s.employeeId === employeeId);
  const fromOwn = pickEffective(own, dateStr);
  if (fromOwn) return fromOwn;

  const company = schedules.filter(s => s.employeeId === null || s.employeeId === undefined);
  return pickEffective(company, dateStr);
}

function isWorkday(schedule, dateStr, holidaySet) {
  if (!schedule) return false;
  if (holidaySet && holidaySet.has(dateStr)) return false;
  const days = new Set(String(schedule.workDays).split(',').filter(Boolean).map(Number));
  return days.has(dayOfWeek(dateStr));
}

function resolveLatePolicy(policies, employeeId, dateStr) {
  return pickEffective(policies.filter(p => p.employeeId === employeeId), dateStr);
}

/* Telat dihitung dari jam masuk terjadwal + toleransi, bukan dari jam absolut,
   supaya menggeser jam masuk otomatis menggeser batas telatnya juga. */
function computeLateMinutes(checkInTime, startTime, graceMinutes) {
  if (!checkInTime || !startTime) return 0;
  const limit = timeToMinutes(startTime) + (graceMinutes || 0);
  return Math.max(0, timeToMinutes(checkInTime) - limit);
}

function countScheduledDays(schedule, holidaySet, startDate, endDate) {
  if (!schedule || startDate > endDate) return 0;
  let count = 0;
  let cursor = startDate;
  while (cursor <= endDate) {
    if (isWorkday(schedule, cursor, holidaySet)) count++;
    cursor = addDaysStr(cursor, 1);
  }
  return count;
}

module.exports = {
  timeToMinutes,
  dayOfWeek,
  addDaysStr,
  resolveSchedule,
  isWorkday,
  resolveLatePolicy,
  computeLateMinutes,
  countScheduledDays
};
