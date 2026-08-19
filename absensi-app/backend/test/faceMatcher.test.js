/* ============================================================
   faceMatcher.test.js — Pencocokan wajah (modul murni)

   Diuji dengan angka buatan, tanpa kamera dan tanpa database.
   Yang diuji bukan "apakah pengenalannya bagus" -- itu urusan
   modelnya -- melainkan apakah keputusan menerima/menolaknya
   berperilaku seperti yang dijanjikan.
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PANJANG_DESCRIPTOR,
  jarakEuclidean,
  validasiDescriptor,
  cocokkanWajah
} = require('../faceMatcher');

/* Descriptor buatan: semua elemen bernilai sama, sehingga jarak antara dua
   descriptor bisa dihitung di kepala -- |a-b| * sqrt(128). Dipakai supaya
   angka ambang di test ini terbaca sebagai maksud, bukan angka ajaib. */
const AKAR_128 = Math.sqrt(PANJANG_DESCRIPTOR);
const buat = nilai => new Array(PANJANG_DESCRIPTOR).fill(nilai);
/* Descriptor berjarak tepat `jarak` dari buat(0). */
const berjarak = jarak => buat(jarak / AKAR_128);

test('jarakEuclidean menghitung sesuai rumus', () => {
  assert.equal(jarakEuclidean(buat(0), buat(0)), 0);
  assert.ok(Math.abs(jarakEuclidean(buat(0), berjarak(0.4)) - 0.4) < 1e-9);
});

test('jarakEuclidean menolak panjang yang berbeda', () => {
  assert.throws(() => jarakEuclidean([1, 2, 3], buat(0)), /Panjang descriptor tidak sama/);
});

test('validasiDescriptor menolak bentuk yang salah', () => {
  assert.match(validasiDescriptor('bukan array'), /harus berupa array/);
  assert.match(validasiDescriptor([1, 2, 3]), /128 angka/);
  assert.match(validasiDescriptor(buat('x')), /bukan angka/);
});

/* NaN adalah kasus paling berbahaya di sini: setiap perbandingan dengan NaN
   bernilai false, jadi descriptor ber-NaN tidak akan pernah "melebihi
   ambang" dan bisa lolos tanpa memicu error apa pun. */
test('validasiDescriptor menolak NaN dan Infinity', () => {
  const denganNaN = buat(0.1); denganNaN[7] = NaN;
  assert.match(validasiDescriptor(denganNaN), /bukan angka/);

  const denganInfinity = buat(0.1); denganInfinity[3] = Infinity;
  assert.match(validasiDescriptor(denganInfinity), /bukan angka/);
});

test('cocokkanWajah menerima wajah yang jelas paling dekat', () => {
  const hasil = cocokkanWajah(buat(0), [
    { employeeId: 1, name: 'Budi', descriptor: berjarak(0.3) },
    { employeeId: 2, name: 'Siti', descriptor: berjarak(0.9) }
  ]);
  assert.equal(hasil.cocok, true);
  assert.equal(hasil.employeeId, 1);
  assert.ok(hasil.jarak < 0.31);
});

test('cocokkanWajah menolak kalau semua terlalu jauh', () => {
  const hasil = cocokkanWajah(buat(0), [
    { employeeId: 1, name: 'Budi', descriptor: berjarak(0.7) },
    { employeeId: 2, name: 'Siti', descriptor: berjarak(0.9) }
  ]);
  assert.equal(hasil.cocok, false);
  assert.equal(hasil.alasan, 'tidak_dikenali');
});

/* Inti perlindungan terhadap salah orang: dua kandidat yang sama-sama lolos
   ambang tapi berdempetan berarti sistemnya sedang menebak. */
test('cocokkanWajah menolak saat dua orang sama-sama dekat', () => {
  const hasil = cocokkanWajah(buat(0), [
    { employeeId: 1, name: 'Budi', descriptor: berjarak(0.40) },
    { employeeId: 2, name: 'Siti', descriptor: berjarak(0.43) }
  ]);
  assert.equal(hasil.cocok, false);
  assert.equal(hasil.alasan, 'ragu');
});

test('cocokkanWajah tidak mengembalikan nama siapa pun saat gagal', () => {
  const hasil = cocokkanWajah(buat(0), [
    { employeeId: 1, name: 'Budi', descriptor: berjarak(0.40) },
    { employeeId: 2, name: 'Siti', descriptor: berjarak(0.43) }
  ]);
  assert.equal(hasil.cocok, false);
  assert.equal(JSON.stringify(hasil).includes('Budi'), false);
  assert.equal(JSON.stringify(hasil).includes('Siti'), false);
});

/* Karyawan dengan banyak sampel tidak boleh menang hanya karena sampelnya
   banyak. Yang dipakai jarak terdekat miliknya, bukan jumlah kemunculan. */
test('sampel berlebih tidak memenangkan karyawan yang lebih jauh', () => {
  const hasil = cocokkanWajah(buat(0), [
    { employeeId: 1, name: 'Budi', descriptor: berjarak(0.45) },
    { employeeId: 1, name: 'Budi', descriptor: berjarak(0.46) },
    { employeeId: 1, name: 'Budi', descriptor: berjarak(0.47) },
    { employeeId: 1, name: 'Budi', descriptor: berjarak(0.48) },
    { employeeId: 2, name: 'Siti', descriptor: berjarak(0.20) }
  ]);
  assert.equal(hasil.cocok, true);
  assert.equal(hasil.employeeId, 2);
});

test('satu baris descriptor rusak tidak menggagalkan pencocokan lainnya', () => {
  const hasil = cocokkanWajah(buat(0), [
    { employeeId: 1, name: 'Rusak', descriptor: [1, 2, 3] },
    { employeeId: 2, name: 'Siti', descriptor: berjarak(0.25) }
  ]);
  assert.equal(hasil.cocok, true);
  assert.equal(hasil.employeeId, 2);
});

test('descriptor kios yang tidak valid ditolak sebelum dibandingkan', () => {
  const hasil = cocokkanWajah([1, 2, 3], [
    { employeeId: 1, name: 'Budi', descriptor: berjarak(0.1) }
  ]);
  assert.equal(hasil.cocok, false);
  assert.equal(hasil.alasan, 'descriptor_tidak_valid');
});

test('belum ada pendaftaran ditolak dengan alasan yang jelas', () => {
  const hasil = cocokkanWajah(buat(0), []);
  assert.equal(hasil.cocok, false);
  assert.equal(hasil.alasan, 'belum_ada_pendaftaran');
});

test('ambang dan selisih bisa diperketat lewat opsi', () => {
  const terdaftar = [{ employeeId: 1, name: 'Budi', descriptor: berjarak(0.45) }];
  assert.equal(cocokkanWajah(buat(0), terdaftar).cocok, true);
  assert.equal(cocokkanWajah(buat(0), terdaftar, { ambang: 0.3 }).cocok, false);
});
