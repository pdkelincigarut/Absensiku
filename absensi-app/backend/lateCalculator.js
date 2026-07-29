/* ============================================================
   lateCalculator.js — Perhitungan menit telat & potongan gaji
   Modul murni, tanpa akses database, supaya gampang dites.
   ============================================================ */

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function computeLateMinutes(checkInTime, checkInLimit) {
  if (!checkInTime || !checkInLimit) return 0;
  return Math.max(0, timeToMinutes(checkInTime) - timeToMinutes(checkInLimit));
}

function computeDeduction(policy, lateMinutesTotal, totalWage) {
  if (lateMinutesTotal <= policy.thresholdMinutes) return 0;
  if (policy.deductionType === 'flat') return policy.deductionFlatAmount;
  if (policy.deductionType === 'per_minute') {
    return policy.deductionPerMinuteAmount * (lateMinutesTotal - policy.thresholdMinutes);
  }
  if (policy.deductionType === 'percentage') {
    return totalWage * (policy.deductionPercentage / 100);
  }
  return 0;
}

module.exports = { timeToMinutes, computeLateMinutes, computeDeduction };
