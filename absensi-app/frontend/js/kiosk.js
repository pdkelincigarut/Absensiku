/* ============================================================
   kiosk.js — Panel Check In (absen mandiri)

   Dibuka di PC umum yang didatangi semua karyawan tiap pagi.
   Tidak ada login, tidak ada data upah, dan tidak ada tombol
   yang bisa mengubah catatan orang lain.

   Jalur utamanya kamera. Daftar nama di bawah kamera hanya
   papan keadaan (siapa yang sudah absen) — tombol absennya
   cuma muncul untuk karyawan yang wajahnya BELUM didaftarkan,
   dan server tetap menolak kalau ternyata sudah terdaftar.

   Sengaja dibuat berukuran besar: dipakai sambil berdiri, sering
   oleh orang yang buru-buru, dan bergantian dengan cepat.
   ============================================================ */

const KioskState = {
  cari: '',
  data: null,
  timer: null,
  pesan: null,      // { jenis: 'ok' | 'gagal', teks }
  pesanTimer: null,
  hasilTimer: null,
  stream: null,
  loopDeteksi: null,
  wajahTerlihat: false,
  sedangKirim: false,
  statusKamera: 'mati'   // 'mati' | 'memuat' | 'hidup' | 'gagal'
};

/* Daftar dimuat ulang berkala supaya orang berikutnya melihat keadaan
   terbaru -- termasuk kalau HR menandai seseorang izin dari panelnya. */
const KIOSK_SELANG_MUAT = 20000;

/* Selang pengecekan "apakah ada wajah di depan kamera". Ini deteksi saja,
   tanpa menghitung descriptor, jadi jauh lebih ringan daripada pencocokan.
   Gunanya cuma memberi tahu orangnya kapan boleh menekan tombol. */
const KIOSK_SELANG_DETEKSI = 700;

async function renderKiosk() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div data-bg="merek" class="min-h-screen bg-klc-red bg-cover bg-bottom bg-fixed"
         style="background-image:url('img/bg-dashboard.png')">
      <header class="bg-white/90 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
        <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p class="text-xs text-slate-400">Absen Mandiri</p>
            <h1 class="font-display text-xl font-bold text-slate-800">Hadapkan wajah ke kamera</h1>
          </div>
          <div class="flex items-center gap-4">
            <p id="kiosk-clock" class="text-sm"></p>
            <button id="btn-kiosk-exit" class="text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">Keluar</button>
          </div>
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 py-6">
        <div class="bg-white rounded-2xl p-5 mb-6">
          <!-- Kolom kamera dibuat lebih lebar daripada sebelumnya. Kios ini
               dipakai sambil BERDIRI sekitar setengah meter dari layar, dan
               orang perlu melihat dirinya cukup besar untuk tahu apakah
               wajahnya sudah masuk bingkai. Pratinjau kecil membuat orang
               memajukan kepala terlalu dekat, dan wajah yang terlalu dekat
               justru terpotong. -->
          <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] items-start">
            <div class="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3]">
              <!-- Cermin: orang melihat dirinya seperti di cermin, bukan
                   terbalik. Pembalikan ini murni tampilan; gambar yang
                   dikirim ke server diambil dari video aslinya. -->
              <video id="kiosk-video" playsinline muted class="w-full h-full object-cover" style="transform:scaleX(-1)"></video>
              <div id="kiosk-kamera-tirai" class="absolute inset-0 grid place-items-center text-center text-white/80 text-sm px-4 bg-slate-900">
                Menyiapkan kamera...
              </div>
            </div>

            <div>
              <!-- role="status" supaya hasil absen diumumkan pembaca layar
                   tanpa merebut fokus. Kalau tidak, satu-satunya tanda bahwa
                   absen berhasil adalah warna hijau -- yang tidak berguna
                   bagi siapa pun yang tidak melihat layar. -->
              <div id="kiosk-hasil" class="mb-4" role="status" aria-live="polite"></div>

              <button id="btn-absen-wajah" disabled
                      class="w-full py-6 rounded-2xl bg-klc-600 hover:bg-klc-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xl transition">
                Absen Sekarang
              </button>

              <!-- Aba-aba "wajah terlihat / belum" DIPINDAH ke sini, menempel
                   di bawah tombol yang dikuncinya. Sebelumnya keterangan ini
                   duduk di bawah kamera, satu kolom jauh dari tombol abu-abu
                   yang dijelaskannya, sehingga orang melihat tombol mati tanpa
                   tahu alasannya. -->
              <p id="kiosk-hint" class="text-sm mt-3 text-center text-slate-400" aria-live="polite">&nbsp;</p>

              <p class="text-xs text-slate-400 mt-4 leading-relaxed">
                Tekan tombol saat wajah Anda sudah terlihat. Sistem menentukan sendiri
                apakah ini absen masuk atau jam pulang. Setiap absen menyimpan foto
                sebagai bukti.
              </p>
            </div>
          </div>
        </div>

        <div class="mb-3">
          <input id="kiosk-search" type="search" autocomplete="off" placeholder="Cari nama untuk melihat status..."
                 class="w-full rounded-xl border border-slate-300 px-4 py-3 text-base shadow-lg shadow-black/10" />
        </div>
        <div id="kiosk-pesan" role="status" aria-live="polite"></div>
        <div id="kiosk-list"></div>
      </main>
    </div>
    <div id="modal-root"></div>
  `;

  startHeaderClock('kiosk-clock');

  document.getElementById('btn-kiosk-exit').addEventListener('click', () => {
    hentikanKiosk();
    renderLogin();
  });

  const kotakCari = document.getElementById('kiosk-search');
  kotakCari.addEventListener('input', (e) => {
    KioskState.cari = e.target.value;
    gambarDaftarKiosk();
  });

  document.getElementById('btn-absen-wajah').addEventListener('click', absenLewatWajah);

  await muatKiosk();
  mulaiKamera();

  KioskState.timer = setInterval(() => {
    /* Jangan menyegarkan saat orang sedang mengetik pencarian -- daftarnya
       akan melompat di bawah jarinya. */
    if (document.activeElement !== kotakCari) muatKiosk();
  }, KIOSK_SELANG_MUAT);
}

function hentikanKiosk() {
  stopHeaderClock();
  if (KioskState.timer) clearInterval(KioskState.timer);
  if (KioskState.loopDeteksi) clearInterval(KioskState.loopDeteksi);
  clearTimeout(KioskState.pesanTimer);
  clearTimeout(KioskState.hasilTimer);
  FaceEngine.matikanKamera(KioskState.stream);
  KioskState.timer = null;
  KioskState.loopDeteksi = null;
  KioskState.stream = null;
  KioskState.cari = '';
  KioskState.pesan = null;
  KioskState.statusKamera = 'mati';
}

/* ---------------- Kamera ---------------- */

function tirai(teks) {
  const el = document.getElementById('kiosk-kamera-tirai');
  if (!el) return;
  if (teks === null) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = teks;
}

async function mulaiKamera() {
  KioskState.statusKamera = 'memuat';

  const halangan = FaceEngine.cekDukungan();
  if (halangan) {
    KioskState.statusKamera = 'gagal';
    tirai(halangan);
    hasilKios('gagal', 'Kamera tidak tersedia di alamat ini. Karyawan yang wajahnya belum terdaftar masih bisa absen lewat daftar nama di bawah.');
    return;
  }

  try {
    tirai('Memuat model pengenalan wajah (sekali saja)...');
    await FaceEngine.muatModel(pesan => tirai(pesan));
    tirai('Meminta izin kamera...');
    KioskState.stream = await FaceEngine.nyalakanKamera(document.getElementById('kiosk-video'));
    tirai(null);
    KioskState.statusKamera = 'hidup';
    mulaiLoopDeteksi();
  } catch (err) {
    KioskState.statusKamera = 'gagal';
    tirai(err.message || 'Kamera gagal dinyalakan.');
    hasilKios('gagal', err.message || 'Kamera gagal dinyalakan.');
  }
}

/* Deteksi ringan untuk memberi aba-aba, BUKAN untuk mengabsenkan.

   Absen tidak dijalankan otomatis begitu wajah terlihat, dan itu disengaja:
   endpoint yang sama juga mencatat jam pulang, sehingga orang yang kebetulan
   lewat di depan kamera bisa terstempel pulang padahal masih bekerja. Yang
   menekan tombol harus orangnya sendiri. */
function mulaiLoopDeteksi() {
  const video = document.getElementById('kiosk-video');
  const tombol = document.getElementById('btn-absen-wajah');
  const hint = document.getElementById('kiosk-hint');
  let sibuk = false;

  KioskState.loopDeteksi = setInterval(async () => {
    if (sibuk || KioskState.sedangKirim || !video || video.readyState < 2) return;
    sibuk = true;
    try {
      const wajah = await faceapi.detectAllFaces(video, FaceEngine.opsiDeteksi);
      KioskState.wajahTerlihat = wajah.length === 1;
      if (!tombol || !hint) return;
      tombol.disabled = !KioskState.wajahTerlihat;
      hint.textContent = wajah.length === 0
        ? 'Wajah belum terlihat'
        : wajah.length > 1
          ? 'Terlihat lebih dari satu wajah'
          : 'Wajah terlihat — silakan tekan tombol';
      hint.className = `text-sm mt-3 text-center ${KioskState.wajahTerlihat ? 'text-emerald-600 font-medium' : 'text-slate-400'}`;
    } catch (err) {
      /* Kesalahan sesaat pada satu bingkai tidak boleh mematikan loop-nya;
         bingkai berikutnya biasanya sudah normal lagi. */
    } finally {
      sibuk = false;
    }
  }, KIOSK_SELANG_DETEKSI);
}

async function absenLewatWajah() {
  if (KioskState.sedangKirim) return;
  const video = document.getElementById('kiosk-video');
  const tombol = document.getElementById('btn-absen-wajah');

  KioskState.sedangKirim = true;
  tombol.disabled = true;
  hasilKios('proses', 'Mengenali wajah...');

  try {
    const hasil = await FaceEngine.ambilDescriptor(video);
    if (hasil.error) {
      hasilKios('gagal', hasil.error);
      return;
    }
    const foto = FaceEngine.ambilFoto(video);
    const jawaban = await Storage.kioskFaceCheckIn(hasil.descriptor, foto);

    hasilKios('ok', jawaban.kind === 'check_out'
      ? `Jam pulang ${jawaban.name} tercatat pukul ${jawaban.checkOutTime}. Hati-hati di jalan!`
      : `${jawaban.name} tercatat hadir pukul ${jawaban.checkInTime}. Selamat bekerja!`);
    await muatKiosk();
  } catch (err) {
    hasilKios('gagal', err.message);
  } finally {
    KioskState.sedangKirim = false;
    tombol.disabled = !KioskState.wajahTerlihat;
  }
}

/* Kotak hasil di samping kamera. Terpisah dari pesan daftar di bawah supaya
   hasil absen tidak tergulung keluar layar saat daftarnya panjang. */
function hasilKios(jenis, teks) {
  const el = document.getElementById('kiosk-hasil');
  if (!el) return;
  const gaya = {
    ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    gagal: 'bg-rose-50 text-rose-700 border-rose-200',
    proses: 'bg-slate-50 text-slate-600 border-slate-200'
  }[jenis];
  /* Kegagalan diberi role="alert" (menyela), keberhasilan cukup "status"
     (menunggu jeda). Orang yang absennya DITOLAK perlu tahu sekarang juga,
     sebelum dia keburu pergi mengira sudah tercatat. */
  el.setAttribute('role', jenis === 'gagal' ? 'alert' : 'status');
  el.innerHTML = `<div class="rounded-xl border px-4 py-3 text-sm font-medium ${gaya}">${escapeHtml(teks)}</div>`;

  clearTimeout(KioskState.hasilTimer);
  if (jenis !== 'proses') {
    /* Hasil milik orang sebelumnya yang menetap di layar membingungkan orang
       berikutnya -- apalagi kalau isinya "berhasil". */
    KioskState.hasilTimer = setTimeout(() => { el.innerHTML = ''; }, 8000);
  }
}

/* ---------------- Daftar / papan keadaan ---------------- */

async function muatKiosk() {
  try {
    KioskState.data = await Storage.getKioskEmployees();
  } catch (err) {
    document.getElementById('kiosk-list').innerHTML =
      `<p class="text-center text-white py-10">Gagal memuat data: ${escapeHtml(err.message)}</p>`;
    return;
  }
  gambarDaftarKiosk();
}

function fotoKios(emp) {
  if (emp.hasPhoto) {
    return `<img src="/api/kiosk/photo/${emp.id}?v=${emp.photoVersion || 0}" alt=""
                 class="w-14 h-14 rounded-full object-cover shrink-0" />`;
  }
  const inisial = emp.name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  return `<div class="w-14 h-14 rounded-full bg-klc-100 text-klc-700 grid place-items-center font-semibold shrink-0">${escapeHtml(inisial)}</div>`;
}

function gambarDaftarKiosk() {
  const wadah = document.getElementById('kiosk-list');
  if (!wadah || !KioskState.data) return;

  const pesanEl = document.getElementById('kiosk-pesan');
  pesanEl.innerHTML = KioskState.pesan
    ? `<div class="mb-4 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
        KioskState.pesan.jenis === 'ok'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : 'bg-white text-rose-700 border border-rose-200'
      }">${escapeHtml(KioskState.pesan.teks)}</div>`
    : '';

  const kunci = KioskState.cari.trim().toLowerCase();
  const daftar = KioskState.data.employees.filter(e =>
    !kunci ||
    e.name.toLowerCase().includes(kunci) ||
    (e.employeeCode || '').toLowerCase().includes(kunci));

  if (daftar.length === 0) {
    wadah.innerHTML = `<p class="text-center text-white/90 py-10">Tidak ada nama yang cocok dengan "${escapeHtml(KioskState.cari)}".</p>`;
    return;
  }

  wadah.innerHTML = `
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      ${daftar.map(e => kartuKios(e)).join('')}
    </div>
  `;

  wadah.querySelectorAll('.btn-kiosk-in').forEach(b =>
    b.addEventListener('click', () => absenMasuk(b.dataset.id)));
  wadah.querySelectorAll('.btn-kiosk-out').forEach(b =>
    b.addEventListener('click', () => absenPulang(b.dataset.id)));
}

function kartuKios(e) {
  const sudahAbsen = !!e.status;

  /* Tombol manual HANYA untuk karyawan yang wajahnya belum didaftarkan.
     Kalau semua orang tetap bisa menekan tombol di sini, kameranya tidak
     menghalangi apa pun -- yang mau menitipkan absen tinggal memakai tombol.
     Server menegakkan aturan yang sama (403), jadi menyembunyikan tombolnya
     di sini murni soal tampilan, bukan pengaman. */
  let aksi = '';
  if (!e.hasFace) {
    if (!sudahAbsen) {
      aksi = `<button data-id="${e.id}" class="btn-kiosk-in w-full mt-3 py-3 rounded-xl bg-klc-600 hover:bg-klc-700 text-white font-semibold text-base transition">Check In</button>`;
    } else if (e.status === 'hadir' && !e.checkOutTime) {
      aksi = `<button data-id="${e.id}" class="btn-kiosk-out w-full mt-3 py-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-base transition">Catat Jam Pulang</button>`;
    }
  }

  let keterangan;
  if (!sudahAbsen) {
    keterangan = `<span class="text-xs text-slate-400">Belum absen</span>`;
  } else if (e.status === 'hadir') {
    const pulang = e.checkOutTime ? ` &middot; Pulang ${escapeHtml(e.checkOutTime)}` : '';
    keterangan = `<span class="text-xs font-medium text-emerald-700">Masuk ${escapeHtml(e.checkInTime || '-')}${pulang}</span>`;
  } else {
    keterangan = `<span class="text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_BADGE_CLASS[e.status]}">${STATUS_LABEL[e.status]}</span>`;
  }

  /* Lencana "wajah terdaftar / belum didaftarkan" DIBUANG dari kartu.

     Dua alasan. Pertama, ia terulang di dua belas kartu dan tidak memberi
     tahu karyawan apa pun yang bisa dia kerjakan -- itu keterangan
     administratif, dan tempatnya di tab Wajah milik Owner.

     Kedua, dan ini yang menentukan: kios berdiri di tempat umum, dan lencana
     itu mengumumkan kepada siapa saja yang lewat persis siapa yang masih bisa
     diabsenkan lewat tombol manual. Fitur wajah ini dipasang untuk menutup
     penitipan absen; jangan menempelkan daftar sasarannya di layar yang sama.

     Ada tidaknya tombol Check In sudah menjelaskan keadaannya tanpa
     mengumumkan apa-apa. */

  /* Kartu yang sudah absen ditandai garis tepi, BUKAN opacity: elemen tembus
     pandang di atas latar merah berubah jadi merah muda, bukan putih pudar. */
  return `
    <div class="bg-white rounded-2xl p-4 ${sudahAbsen ? 'ring-1 ring-emerald-200' : ''}">
      <div class="flex items-center gap-3">
        ${fotoKios(e)}
        <div class="min-w-0">
          <p class="font-semibold text-slate-800 truncate">${escapeHtml(e.name)}</p>
          <p class="text-xs text-slate-400 font-mono">${escapeHtml(e.employeeCode || '-')}</p>
          <div class="mt-1">${keterangan}</div>
        </div>
      </div>
      ${aksi}
    </div>
  `;
}

function pesanKios(jenis, teks) {
  KioskState.pesan = { jenis, teks };
  clearTimeout(KioskState.pesanTimer);
  KioskState.pesanTimer = setTimeout(() => {
    KioskState.pesan = null;
    gambarDaftarKiosk();
  }, 6000);
}

async function absenMasuk(id) {
  try {
    const hasil = await Storage.kioskCheckIn(id);
    pesanKios('ok', `${hasil.name} tercatat hadir pukul ${hasil.checkInTime}. Selamat bekerja!`);
  } catch (err) {
    pesanKios('gagal', err.message);
  }
  await muatKiosk();
}

async function absenPulang(id) {
  try {
    const hasil = await Storage.kioskCheckOut(id);
    pesanKios('ok', `Jam pulang ${hasil.name} tercatat pukul ${hasil.checkOutTime}. Hati-hati di jalan!`);
  } catch (err) {
    pesanKios('gagal', err.message);
  }
  await muatKiosk();
}
