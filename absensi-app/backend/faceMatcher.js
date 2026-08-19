/* ============================================================
   faceMatcher.js — Pencocokan wajah (modul murni, tanpa DB)

   Sengaja tidak menyentuh database supaya bisa diuji dengan
   angka buatan, seperti lateCalculator.js dan holidayCalculator.js.
   ============================================================ */

/* Panjang descriptor face_recognition_model. Dicek ketat: descriptor
   sepanjang lain berarti model yang dipakai kios berbeda dengan model saat
   pendaftaran, dan jaraknya jadi tidak bermakna sama sekali. */
const PANJANG_DESCRIPTOR = 128;

/* Ambang jarak euclidean.

   Untuk model ini, wajah orang yang sama biasanya berjarak 0,3–0,45 dan
   orang berbeda 0,6 ke atas. Anjuran umum pustakanya 0,6, tapi di sini
   sengaja diperketat ke 0,5: salah kenal berarti absensi orang lain yang
   tercatat, dan absensi menentukan gaji. Kalau ditolak, ruginya cuma
   karyawan mengulang atau minta HR mencatatkan — jauh lebih murah daripada
   salah bayar. */
const AMBANG_JARAK = 0.5;

/* Selisih minimum antara kandidat terbaik dan kandidat kedua.

   Ambang saja tidak cukup. Kalau dua orang sama-sama berjarak 0,47 dan
   0,48, keduanya lolos ambang padahal sistem sebenarnya sedang ragu, dan
   yang menang cuma beda 0,01 — itu kebetulan, bukan pengenalan. Kasus
   seperti ini (saudara kembar, kakak-adik yang mirip) lebih baik ditolak
   dan diulang daripada ditebak. */
const SELISIH_MINIMUM = 0.08;

function jarakEuclidean(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Panjang descriptor tidak sama: ${a.length} vs ${b.length}`);
  }
  let jumlah = 0;
  for (let i = 0; i < a.length; i++) {
    const selisih = a[i] - b[i];
    jumlah += selisih * selisih;
  }
  return Math.sqrt(jumlah);
}

/* Memvalidasi descriptor yang datang dari browser. Nilai dari kios tidak
   pernah dipercaya begitu saja: yang mengirim tidak punya sesi, dan bentuk
   yang salah bisa membuat perhitungan jarak menghasilkan NaN — yang lolos
   semua perbandingan "<" tanpa pernah memicu error. */
function validasiDescriptor(nilai) {
  if (!Array.isArray(nilai)) return 'Descriptor harus berupa array.';
  if (nilai.length !== PANJANG_DESCRIPTOR) {
    return `Descriptor harus berisi ${PANJANG_DESCRIPTOR} angka, bukan ${nilai.length}.`;
  }
  for (const n of nilai) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      return 'Descriptor mengandung nilai yang bukan angka.';
    }
  }
  return null;
}

/* Mencari karyawan yang paling cocok.

   terdaftar: [{ employeeId, name, descriptor: number[128] }, ...]
     Satu karyawan boleh muncul beberapa kali (beberapa sudut pengambilan);
     yang dipakai jarak terdekat miliknya.

   Kembaliannya selalu menjelaskan ALASAN kalau tidak cocok, supaya kios
   bisa memberi tahu apa yang harus dilakukan orangnya -- "wajah tidak
   dikenali" dan "sistem ragu antara dua orang" butuh tindakan berbeda.
*/
function cocokkanWajah(descriptor, terdaftar, opsi = {}) {
  const ambang = opsi.ambang ?? AMBANG_JARAK;
  const selisihMinimum = opsi.selisihMinimum ?? SELISIH_MINIMUM;

  const pesanSalah = validasiDescriptor(descriptor);
  if (pesanSalah) return { cocok: false, alasan: 'descriptor_tidak_valid', pesan: pesanSalah };

  if (terdaftar.length === 0) {
    return { cocok: false, alasan: 'belum_ada_pendaftaran', pesan: 'Belum ada karyawan yang wajahnya terdaftar.' };
  }

  /* Jarak terdekat per karyawan, bukan per baris. Karyawan dengan 5 sampel
     tidak boleh lebih diunggulkan daripada yang punya 3 hanya karena
     sampelnya lebih banyak. */
  const terdekat = new Map();
  for (const baris of terdaftar) {
    if (validasiDescriptor(baris.descriptor)) continue; // baris rusak dilewati, bukan menggagalkan semuanya
    const jarak = jarakEuclidean(descriptor, baris.descriptor);
    const sebelumnya = terdekat.get(baris.employeeId);
    if (!sebelumnya || jarak < sebelumnya.jarak) {
      terdekat.set(baris.employeeId, { employeeId: baris.employeeId, name: baris.name, jarak });
    }
  }

  if (terdekat.size === 0) {
    return { cocok: false, alasan: 'belum_ada_pendaftaran', pesan: 'Belum ada data wajah yang bisa dipakai.' };
  }

  const urut = [...terdekat.values()].sort((a, b) => a.jarak - b.jarak);
  const terbaik = urut[0];
  const kedua = urut[1] || null;

  if (terbaik.jarak > ambang) {
    return {
      cocok: false,
      alasan: 'tidak_dikenali',
      pesan: 'Wajah tidak dikenali. Coba lagi menghadap kamera, atau minta HR mencatatkan absen Anda.',
      jarak: terbaik.jarak
    };
  }

  if (kedua && (kedua.jarak - terbaik.jarak) < selisihMinimum) {
    return {
      cocok: false,
      alasan: 'ragu',
      pesan: 'Wajah Anda mirip dengan lebih dari satu karyawan. Minta HR mencatatkan absen Anda.',
      jarak: terbaik.jarak
    };
  }

  return { cocok: true, employeeId: terbaik.employeeId, name: terbaik.name, jarak: terbaik.jarak };
}

module.exports = {
  PANJANG_DESCRIPTOR,
  AMBANG_JARAK,
  SELISIH_MINIMUM,
  jarakEuclidean,
  validasiDescriptor,
  cocokkanWajah
};
