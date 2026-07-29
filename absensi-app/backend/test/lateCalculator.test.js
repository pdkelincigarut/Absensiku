const test = require('node:test');
const assert = require('node:assert/strict');
const { timeToMinutes, computeLateMinutes, computeDeduction } = require('../lateCalculator');

test('timeToMinutes mengubah "HH:MM" jadi total menit', () => {
  assert.equal(timeToMinutes('08:30'), 510);
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('23:59'), 1439);
});

test('computeLateMinutes = 0 kalau jam masuk sama atau lebih awal dari batas', () => {
  assert.equal(computeLateMinutes('08:30', '08:30'), 0);
  assert.equal(computeLateMinutes('08:15', '08:30'), 0);
});

test('computeLateMinutes = selisih menit kalau jam masuk lewat dari batas', () => {
  assert.equal(computeLateMinutes('08:45', '08:30'), 15);
  assert.equal(computeLateMinutes('09:05', '08:30'), 35);
});

test('computeLateMinutes = 0 kalau jam masuk atau batas kosong', () => {
  assert.equal(computeLateMinutes(null, '08:30'), 0);
  assert.equal(computeLateMinutes('08:45', null), 0);
  assert.equal(computeLateMinutes(undefined, undefined), 0);
});

test('computeDeduction = 0 kalau total menit telat masih dalam ambang batas', () => {
  const policy = { thresholdMinutes: 60, deductionType: 'flat', deductionFlatAmount: 50000 };
  assert.equal(computeDeduction(policy, 60, 500000), 0);
  assert.equal(computeDeduction(policy, 30, 500000), 0);
});

test('computeDeduction skema flat: langsung nominal tetap begitu ambang terlampaui', () => {
  const policy = { thresholdMinutes: 60, deductionType: 'flat', deductionFlatAmount: 50000 };
  assert.equal(computeDeduction(policy, 61, 500000), 50000);
  assert.equal(computeDeduction(policy, 200, 500000), 50000);
});

test('computeDeduction skema per_minute: tarif x kelebihan menit di atas ambang', () => {
  const policy = { thresholdMinutes: 60, deductionType: 'per_minute', deductionPerMinuteAmount: 1000 };
  assert.equal(computeDeduction(policy, 90, 500000), 30000);
});

test('computeDeduction skema percentage: persen x total gaji periode itu', () => {
  const policy = { thresholdMinutes: 60, deductionType: 'percentage', deductionPercentage: 5 };
  assert.equal(computeDeduction(policy, 100, 500000), 25000);
});
