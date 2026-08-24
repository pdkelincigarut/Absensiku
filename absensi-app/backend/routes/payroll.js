/* ============================================================
   routes/payroll.js — Laporan gaji (dipindah dari owner.js lama)
   Periode 28 bulan lalu s/d 27 bulan berjalan. Owner only.

   Dua rumus upah per hari hadir, dipisah oleh WAGE_ENGINE_V2_FROM:
   - Sebelum cutover: (min(jam,8)/8) x upah harian, dari hours_worked
     tetap yang dulu dipilih HR saat menandai hadir.
   - Dari cutover: dari jam kerja sungguhan (check_in_time..check_out_time)
     dipatok ke jendela jadwal -- lihat computeActualPay di
     scheduleResolver.js dan spec 2026-08-20-perhitungan-gaji-jam-aktual.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { computeDeduction } = require('../lateCalculator');
const { resolveSchedule, isWorkday, resolveLatePolicy, computeLateMinutes, computeActualPay, timeToMinutes } = require('../scheduleResolver');

const router = express.Router();

/* Tanggal mulai berlakunya rumus gaji dari jam kerja aktual (lihat spec
   2026-08-20-perhitungan-gaji-jam-aktual-design.md). Tanggal SEBELUM ini
   tetap pakai rumus lama (jam tetap, cap 8) apa adanya -- kalau tidak,
   periode yang sudah dibayar bisa bergeser, dan banyak data historis tidak
   punya check_out_time sama sekali sehingga akan mendadak bergaji 0.

   WAJIB disamakan dengan effective_from jadwal baku 07:30-16:30 yang
   diinput owner di tab Jadwal Kerja -- kalau beda, ada rentang hari yang
   rumusnya jalan di atas jadwal yang tidak sesuai. */
const WAGE_ENGINE_V2_FROM = '2026-08-20';

function pad2(n) { return String(n).padStart(2, '0'); }

function dateToStr(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function todayStr() {
  return dateToStr(new Date());
}

function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dateToStr(dt);
}

/* Batas periode gaji. Hari pertama yang dihitung tanggal 28, hari terakhir
   tanggal 27 bulan berikutnya.

   Kedua angka WAJIB digeser bersama dan harus selalu berselisih satu hari.
   Kalau tidak, akan ada tanggal yang masuk dua periode sekaligus (dibayar
   dua kali) atau tidak masuk periode mana pun (tidak dibayar).

   Nilai yang sama diduplikasi di frontend `owner.js`, di `seedDemo.js`, dan
   di `test/payroll.schedule.test.js` -- frontend disajikan tanpa build step
   sehingga tidak ada modul yang bisa dipakai bersama. Mengubah di sini saja
   akan membuat label di layar tidak cocok dengan angkanya. */
const PERIOD_START_DAY = 28;
const PERIOD_END_DAY = 27;

function getPeriodByOffset(offset) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const day = now.getDate();
  let startMonth = day >= PERIOD_START_DAY ? month : month - 1;
  let startYear = year;
  if (startMonth < 0) { startMonth = 11; startYear--; }

  startMonth += offset;
  while (startMonth < 0) { startMonth += 12; startYear--; }
  while (startMonth > 11) { startMonth -= 12; startYear++; }

  const start = new Date(startYear, startMonth, PERIOD_START_DAY);
  let endMonth = startMonth + 1, endYear = startYear;
  if (endMonth > 11) { endMonth = 0; endYear++; }
  const end = new Date(endYear, endMonth, PERIOD_END_DAY);
  return { start, end, offset };
}

function bumpStatus(counts, status) {
  if (status === 'hadir') counts.hadir++;
  else if (status === 'izin') counts.izin++;
  else if (status === 'sakit') counts.sakit++;
  else counts.alpa++;
}

/* Aturan sudah dipetakan ke camelCase saat dimuat, jadi cukup diteruskan
   apa adanya minus field internal. */
function toLatePolicyJson(policy) {
  if (!policy) return null;
  return {
    graceMinutes: policy.graceMinutes,
    thresholdMinutes: policy.thresholdMinutes,
    deductionType: policy.deductionType,
    deductionFlatAmount: policy.deductionFlatAmount,
    deductionPerMinuteAmount: policy.deductionPerMinuteAmount,
    deductionPercentage: policy.deductionPercentage,
    effectiveFrom: policy.effectiveFrom
  };
}

/* Berapa periode ke belakang yang masih masuk akal ditawarkan. Periode dari
   sebelum aplikasi ini mulai dipakai tidak punya satu pun catatan absensi,
   sehingga laporannya menampilkan seluruh karyawan Alpa sebulan penuh --
   angka yang bukan cuma tidak berguna, tapi menyesatkan. */
router.get('/periods', requireOwner, (req, res) => {
  const earliest = db.prepare('SELECT MIN(date) AS d FROM attendance').get().d;
  if (!earliest) return res.json({ earliest: null, oldestOffset: 0 });

  /* Yang dibandingkan AWAL periode, bukan akhirnya. Periode yang cuma
     tertutup sebagian tetap menampilkan Alpa untuk hari-hari sebelum
     pencatatan dimulai, jadi tidak layak ditawarkan sama sekali.
     Batas 120 supaya tetap berhenti kalau ada tanggal absensi yang aneh. */
  let oldestOffset = 0;
  while (oldestOffset > -120 && dateToStr(getPeriodByOffset(oldestOffset - 1).start) >= earliest) {
    oldestOffset--;
  }
  res.json({ earliest, oldestOffset });
});

router.get('/', requireOwner, (req, res) => {
  const offset = Number(req.query.periodOffset || 0);
  const period = getPeriodByOffset(offset);
  const startS = dateToStr(period.start);
  const endS = dateToStr(period.end);
  const todayS = todayStr();

  /* Karyawan yang sudah dihapus TETAP ikut kalau punya absensi di periode ini.
     Menghilangkannya akan mengubah angka gaji periode yang mungkin sudah
     dibayarkan -- persis kesalahan yang sudah dihindari effective_from di
     tabel jadwal dan aturan keterlambatan. */
  const employees = db.prepare(`
    SELECT * FROM employees
    WHERE (deleted_at IS NULL AND active = 1)
       OR (deleted_at IS NOT NULL
           AND EXISTS (SELECT 1 FROM attendance a
                       WHERE a.employee_id = employees.id AND a.date >= ? AND a.date <= ?))
    ORDER BY name
  `).all(startS, endS);

  // Dimuat sekali untuk seluruh request, bukan per karyawan per hari
  const schedules = db.prepare('SELECT * FROM work_schedules').all().map(r => ({
    id: r.id,
    employeeId: r.employee_id,
    workDays: r.work_days,
    startTime: r.start_time,
    endTime: r.end_time,
    effectiveFrom: r.effective_from
  }));
  const holidaySet = new Set(
    db.prepare('SELECT date FROM holidays WHERE date >= ? AND date <= ?').all(startS, endS).map(r => r.date)
  );
  const policies = db.prepare('SELECT * FROM late_policies').all().map(r => ({
    id: r.id,
    employeeId: r.employee_id,
    graceMinutes: r.grace_minutes,
    thresholdMinutes: r.threshold_minutes,
    deductionType: r.deduction_type,
    deductionFlatAmount: r.deduction_flat_amount,
    deductionPerMinuteAmount: r.deduction_per_minute_amount,
    deductionPercentage: r.deduction_percentage,
    effectiveFrom: r.effective_from
  }));

  const rows = employees.map(emp => {
    const records = db.prepare(
      `SELECT date, status, hours_worked, check_in_time, check_out_time FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`
    ).all(emp.id, startS, endS);
    const byDate = new Map(records.map(r => [r.date, r]));

    const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, totalHoursPaid: 0, totalWage: 0, lateMinutesTotal: 0, overtimeMinutesTotal: 0, scheduledDays: 0 };
    let cursor = startS;
    while (cursor <= endS && cursor <= todayS) {
      const schedule = resolveSchedule(schedules, emp.id, cursor);

      /* Hari sebelum karyawan bergabung bukan tanggung jawabnya. Tanpa ini,
         karyawan yang masuk di pertengahan periode langsung terlihat bolos
         sepanjang bagian awal periode, dan gajinya ikut terpotong.

         Karyawan tanpa tanggal masuk (data lama sebelum kolomnya ada)
         diperlakukan seperti sebelumnya: seluruh periode dihitung. */
      const belumBergabung = emp.join_date && cursor < emp.join_date;

      const workday = isWorkday(schedule, cursor, holidaySet) && !belumBergabung;
      if (workday && cursor < todayS) counts.scheduledDays++;

      const rec = byDate.get(cursor);
      if (rec) {
        // Hari bercatatan SELALU dihitung, walaupun bukan hari kerja terjadwal —
        // kalau dilewati, kerja lembur di hari Minggu jadi tidak dibayar.
        bumpStatus(counts, rec.status);
        if (rec.status === 'hadir') {
          /* Rumus lama tidak disentuh untuk tanggal sebelum cutover, supaya
             periode yang sudah dibayar tidak bergeser (lihat komentar
             WAGE_ENGINE_V2_FROM di atas). Dari cutover, upah dipatok ke jam
             kerja sungguhan dalam jendela jadwal -- telat & pulang cepat
             memotong sampai ke menit, lembur dicatat terpisah tanpa dibayar. */
          if (cursor >= WAGE_ENGINE_V2_FROM) {
            const { paidMinutes, overtimeMinutes } = computeActualPay(rec.check_in_time, rec.check_out_time, schedule);
            counts.totalHoursPaid += paidMinutes / 60;
            counts.overtimeMinutesTotal += overtimeMinutes;
            const scheduledMinutes = schedule ? timeToMinutes(schedule.endTime) - timeToMinutes(schedule.startTime) : 0;
            if (scheduledMinutes > 0) {
              counts.totalWage += (paidMinutes / scheduledMinutes) * emp.daily_wage;
            }
          } else {
            const paidHours = Math.min(rec.hours_worked || 0, 8);
            counts.totalHoursPaid += paidHours;
            counts.totalWage += (paidHours / 8) * emp.daily_wage;
          }

          // Potongan late_policies tidak berubah di kedua era -- lapisan
          // tambahan di atas hasil rumus jam, bukan pengganti.
          const policy = resolveLatePolicy(policies, emp.id, cursor);
          if (policy && schedule) {
            counts.lateMinutesTotal += computeLateMinutes(rec.check_in_time, schedule.startTime, policy.graceMinutes);
          }
        }
      } else if (workday && cursor < todayS) {
        // Hanya hari kerja terjadwal lampau tanpa catatan yang dianggap Alpa.
        // Akhir pekan dan hari libur dilewati begitu saja.
        counts.alpa++;
      }
      cursor = addDaysStr(cursor, 1);
    }

    // Potongan memakai versi aturan yang berlaku pada hari terakhir periode
    const policyRow = resolveLatePolicy(policies, emp.id, endS < todayS ? endS : todayS);

    const latePolicy = toLatePolicyJson(policyRow);
    const deductionAmount = policyRow
      ? computeDeduction(policyRow, counts.lateMinutesTotal, counts.totalWage)
      : 0;
    const finalWage = Math.max(0, counts.totalWage - deductionAmount);

    return {
      employeeId: emp.id, name: emp.name, dailyWage: emp.daily_wage,
      ...counts, latePolicy, deductionAmount, finalWage
    };
  });

  const grandTotal = rows.reduce((sum, r) => sum + r.totalWage, 0);
  const grandFinalTotal = rows.reduce((sum, r) => sum + r.finalWage, 0);
  res.json({ period: { start: startS, end: endS, offset }, rows, grandTotal, grandFinalTotal });
});

module.exports = router;
