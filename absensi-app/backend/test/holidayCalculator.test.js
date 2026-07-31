const test = require('node:test');
const assert = require('node:assert/strict');
const { scanCalendarYear, nationalHolidays } = require('../holidayCalculator');

test('scanCalendarYear menemukan Imlek 2025 di 29 Januari', () => {
  assert.deepEqual(scanCalendarYear(2025, 'chinese', 1, 1), ['2025-01-29']);
});

test('scanCalendarYear menemukan 1 Syawal 2026 di 20 Maret', () => {
  assert.deepEqual(scanCalendarYear(2026, 'islamic-umalqura', 10, 1), ['2026-03-20']);
});

test('nationalHolidays menandai Hari Kemerdekaan dan Imlek pasti, sisanya perkiraan', () => {
  const holidays = nationalHolidays(2026, '1,2,3,4,5');

  const kemerdekaan = holidays.find(h => h.date === '2026-08-17');
  assert.equal(kemerdekaan.isEstimate, false);

  const imlek = holidays.find(h => h.name === 'Tahun Baru Imlek');
  assert.equal(imlek.isEstimate, false);

  const idulFitri = holidays.find(h => h.name === 'Idul Fitri');
  assert.equal(idulFitri.isEstimate, true);
});

test('cuti bersama Idul Fitri melompati hari non-kerja', () => {
  // 1 Syawal 2026 jatuh Jumat 20 Maret. 2 hari kerja sebelumnya harus
  // melompati akhir pekan: Kamis 19, Rabu 18 -- bukan Sabtu/Minggu.
  const holidays = nationalHolidays(2026, '1,2,3,4,5');
  const cuti = holidays.filter(h => h.name === 'Cuti Bersama Idul Fitri').map(h => h.date).sort();
  assert.deepEqual(cuti, ['2026-03-18', '2026-03-19', '2026-03-23', '2026-03-24']);
});

test('hari raya yang jatuh dua kali dalam setahun Masehi menghasilkan dua set tanggal', () => {
  // Tahun Hijriah ±11 hari lebih pendek dari Masehi, jadi tiap ~33 tahun
  // ada satu tahun Masehi yang memuat dua kali 1 Syawal.
  const dates = scanCalendarYear(2033, 'islamic-umalqura', 10, 1);
  assert.equal(dates.length, 2);
});

test('nationalHolidays memakai hari kerja yang diberikan untuk menempatkan cuti bersama', () => {
  // Kalau perusahaan kerja Senin-Sabtu (tanpa Minggu), cuti bersama boleh
  // menempati Sabtu.
  const holidays = nationalHolidays(2026, '1,2,3,4,5,6');
  const cutiSebelum = holidays
    .filter(h => h.name === 'Cuti Bersama Idul Fitri' && h.date < '2026-03-20')
    .map(h => h.date)
    .sort();
  assert.deepEqual(cutiSebelum, ['2026-03-18', '2026-03-19']);
});
