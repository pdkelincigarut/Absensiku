/* ============================================================
   holidayCalculator.js — Tanggal empat hari libur (Imlek, Idul
   Fitri, Idul Adha, Hari Kemerdekaan) lewat konversi kalender
   bawaan Node (Intl, kalender chinese dan islamic-umalqura).
   Modul murni, tanpa akses database, supaya bisa dites langsung.

   Tanggal Hijriah SELALU perkiraan: penetapan resmi Indonesia
   diputuskan sidang isbat berdasarkan rukyat, sementara umalqura
   kalender hitungan. Bisa meleset satu hari dari SKB.
   ============================================================ */

const { addDaysStr, dayOfWeek } = require('./scheduleResolver');

function pad2(n) {
  return String(n).padStart(2, '0');
}

/* Menelusuri tiap hari Masehi dalam setahun dan mengumpulkan yang
   month/day-nya cocok di kalender lain. Array, bukan satu tanggal:
   tahun Hijriah ±11 hari lebih pendek, jadi satu hari raya bisa
   jatuh dua kali dalam satu tahun Masehi. */
function scanCalendarYear(year, calendar, month, day) {
  const formatter = new Intl.DateTimeFormat(`en-US-u-ca-${calendar}`, {
    month: 'numeric',
    day: 'numeric'
  });

  const results = [];
  let cursor = new Date(year, 0, 1);
  const endTime = new Date(year, 11, 31).getTime();

  while (cursor.getTime() <= endTime) {
    const parts = formatter.formatToParts(cursor);
    const m = Number(parts.find(p => p.type === 'month').value);
    const d = Number(parts.find(p => p.type === 'day').value);
    if (m === month && d === day) {
      results.push(`${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`);
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return results;
}

function previousWorkday(dateStr, workDaySet) {
  let cursor = dateStr;
  do {
    cursor = addDaysStr(cursor, -1);
  } while (!workDaySet.has(dayOfWeek(cursor)));
  return cursor;
}

function nextWorkday(dateStr, workDaySet) {
  let cursor = dateStr;
  do {
    cursor = addDaysStr(cursor, 1);
  } while (!workDaySet.has(dayOfWeek(cursor)));
  return cursor;
}

/* workDays: hari kerja dari jadwal baku perusahaan ("1,2,3,4,5" atau Set
   angka 0-6), dipakai menempatkan cuti bersama pada hari kerja, bukan
   hari kalender -- kalau tidak, "2 hari sebelum" bisa jatuh di Minggu
   yang memang sudah libur, dan cuti bersamanya hilang percuma. */
function nationalHolidays(year, workDays) {
  const workDaySet = new Set(
    (typeof workDays === 'string' ? workDays.split(',').filter(Boolean) : Array.from(workDays || []))
      .map(Number)
  );

  const results = [
    { date: `${year}-08-17`, name: 'Hari Kemerdekaan RI', isEstimate: false }
  ];

  for (const date of scanCalendarYear(year, 'chinese', 1, 1)) {
    results.push({ date, name: 'Tahun Baru Imlek', isEstimate: false });
  }

  for (const firstSyawal of scanCalendarYear(year, 'islamic-umalqura', 10, 1)) {
    const secondSyawal = addDaysStr(firstSyawal, 1);
    results.push({ date: firstSyawal, name: 'Idul Fitri', isEstimate: true });
    results.push({ date: secondSyawal, name: 'Idul Fitri (hari kedua)', isEstimate: true });

    let before = firstSyawal;
    for (let i = 0; i < 2; i++) {
      before = previousWorkday(before, workDaySet);
      results.push({ date: before, name: 'Cuti Bersama Idul Fitri', isEstimate: true });
    }

    let after = secondSyawal;
    for (let i = 0; i < 2; i++) {
      after = nextWorkday(after, workDaySet);
      results.push({ date: after, name: 'Cuti Bersama Idul Fitri', isEstimate: true });
    }
  }

  for (const date of scanCalendarYear(year, 'islamic-umalqura', 12, 10)) {
    results.push({ date, name: 'Idul Adha', isEstimate: true });
  }

  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}

module.exports = { scanCalendarYear, nationalHolidays };
