/* ============================================================
   faceEnroll.js — Tab "Wajah" pada dashboard Owner

   Dua pekerjaan:
     1. mendaftarkan wajah karyawan (beberapa sudut pengambilan)
     2. melihat foto bukti absen kios

   Pendaftaran butuh kamera, jadi tab ini hanya berfungsi penuh
   di komputer yang bisa membuka kamera — HTTPS atau localhost.
   Kalau tidak bisa, daftar pendaftarannya tetap ditampilkan
   supaya Owner masih tahu siapa yang sudah dan belum terdaftar.
   ============================================================ */

const FaceEnrollState = {
  data: null,
  bukti: null,
  tanggalBukti: todayStr()
};

/* Jumlah pengambilan per karyawan. Lebih dari satu supaya wajah tetap
   dikenali saat kepala sedikit miring atau lampunya berubah; tidak
   terlalu banyak supaya pendaftaran 12 orang tidak makan sepagi. */
const JUMLAH_SAMPEL = 5;

async function renderFaceTab() {
  const wadah = document.getElementById('owner-content');
  wadah.innerHTML = `<p class="text-sm text-slate-500 text-center py-8">Memuat data pendaftaran wajah...</p>`;

  try {
    FaceEnrollState.data = await Storage.getFaceEnrollments();
  } catch (err) {
    wadah.innerHTML = `<p class="text-sm text-rose-500 text-center py-8">Gagal memuat data: ${escapeHtml(err.message)}</p>`;
    return;
  }

  const halangan = FaceEngine.cekDukungan();
  const belum = FaceEnrollState.data.filter(d => d.sampleCount === 0).length;

  wadah.innerHTML = `
    <div class="bg-white rounded-2xl p-5 mb-6">
      <h2 class="font-display text-lg font-bold text-slate-800">Pendaftaran Wajah</h2>
      <p class="text-xs text-slate-400 mt-1 mb-4 leading-relaxed">
        Karyawan yang wajahnya sudah terdaftar <strong>hanya bisa absen lewat kamera</strong> di panel Check In —
        tombol daftar nama tidak lagi berlaku untuk mereka. Yang belum terdaftar masih memakai tombol,
        supaya penerapannya bisa bertahap.
        Yang disimpan bukan foto, melainkan 128 angka ciri wajah yang tidak bisa dikembalikan menjadi gambar.
      </p>

      ${halangan ? `
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">
          ${escapeHtml(halangan)}
        </div>` : ''}

      ${belum ? `
        <div class="rounded-xl border border-klc-200 bg-klc-50 px-4 py-3 text-sm text-klc-700 mb-4">
          ${belum} karyawan belum terdaftar wajahnya.
        </div>` : ''}

      <div class="overflow-x-auto">
        <table class="w-full text-sm table-zebra">
          <thead>
            <tr class="text-left">
              <th class="px-4 py-2">Kode</th>
              <th class="px-4 py-2">Nama</th>
              <th class="px-4 py-2 text-center">Status</th>
              <th class="px-4 py-2">Didaftarkan</th>
              <th class="px-4 py-2 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody id="face-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="bg-white rounded-2xl p-5">
      <div class="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h2 class="font-display text-lg font-bold text-slate-800">Foto Bukti Absen</h2>
        <input type="date" id="face-bukti-tanggal" value="${FaceEnrollState.tanggalBukti}"
               class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
      </div>
      <p class="text-xs text-slate-400 mb-4">
        Setiap absen lewat kamera menyimpan satu foto. Inilah yang dipakai kalau ada absen yang dicurigai
        dititipkan. Foto disimpan 40 hari; yang lebih tua terhapus sendiri.
      </p>
      <div id="face-bukti"></div>
    </div>
  `;

  gambarTabelWajah();
  document.getElementById('face-bukti-tanggal').addEventListener('change', (e) => {
    FaceEnrollState.tanggalBukti = e.target.value;
    muatBukti();
  });
  muatBukti();
}

function gambarTabelWajah() {
  const tbody = document.getElementById('face-tbody');
  tbody.innerHTML = FaceEnrollState.data.map(d => {
    const terdaftar = d.sampleCount > 0;
    const kapan = d.enrolledAt
      ? `${formatTanggalIndo(todayStr(new Date(d.enrolledAt)))} &middot; ${escapeHtml(d.enrolledBy || '-')}`
      : '<span class="text-slate-400">—</span>';
    return `
      <tr>
        <td class="px-4 py-2.5 font-mono text-xs text-slate-500">${escapeHtml(d.employeeCode || '—')}</td>
        <td class="px-4 py-2.5 text-slate-700">${escapeHtml(d.name)}</td>
        <td class="px-4 py-2.5 text-center">
          ${terdaftar
            ? `<span class="text-xs font-medium px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">${d.sampleCount} pengambilan</span>`
            : `<span class="text-xs font-medium px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700">belum terdaftar</span>`}
        </td>
        <td class="px-4 py-2.5 text-slate-600 text-xs">${kapan}</td>
        <td class="px-4 py-2.5 text-center whitespace-nowrap">
          <button data-id="${d.employeeId}" data-nama="${escapeHtml(d.name)}"
                  class="btn-daftar-wajah text-xs font-medium text-klc-600 hover:text-klc-700 px-2 py-1 rounded hover:bg-klc-50 transition">
            ${terdaftar ? 'Daftar Ulang' : 'Daftarkan'}
          </button>
          ${terdaftar
            ? `<button data-id="${d.employeeId}" data-nama="${escapeHtml(d.name)}"
                       class="btn-hapus-wajah text-xs font-medium text-rose-600 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50 transition">Hapus</button>`
            : ''}
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-daftar-wajah').forEach(b =>
    b.addEventListener('click', () => bukaModalDaftarWajah(b.dataset.id, b.dataset.nama)));
  tbody.querySelectorAll('.btn-hapus-wajah').forEach(b =>
    b.addEventListener('click', () => hapusPendaftaranWajah(b.dataset.id, b.dataset.nama)));
}

async function hapusPendaftaranWajah(id, nama) {
  if (!confirm(`Hapus pendaftaran wajah ${nama}?\n\nSetelah dihapus, ${nama} kembali absen lewat daftar nama di kios sampai wajahnya didaftarkan lagi.`)) return;
  try {
    await Storage.deleteFaceEnrollment(id);
    await renderFaceTab();
  } catch (err) {
    alert(`Gagal menghapus: ${err.message}`);
  }
}

/* ---------------- Modal pendaftaran ---------------- */

async function bukaModalDaftarWajah(employeeId, nama) {
  const halangan = FaceEngine.cekDukungan();
  if (halangan) { alert(halangan); return; }

  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-lg p-5">
        <h3 class="font-display text-lg font-bold text-slate-800">Daftarkan Wajah — ${escapeHtml(nama)}</h3>
        <p class="text-xs text-slate-400 mt-1 mb-4">
          Ambil ${JUMLAH_SAMPEL} kali dengan posisi sedikit berbeda: menghadap lurus, agak menoleh ke kiri,
          agak ke kanan, sedikit menunduk, sedikit mendongak. Pastikan wajah terang dan tidak tertutup.
        </p>

        <div class="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3]">
          <video id="enroll-video" playsinline muted class="w-full h-full object-cover" style="transform:scaleX(-1)"></video>
          <div id="enroll-tirai" class="absolute inset-0 grid place-items-center text-center text-white/80 text-sm px-4 bg-slate-900">
            Menyiapkan kamera...
          </div>
        </div>

        <div id="enroll-titik" class="flex justify-center gap-2 mt-3"></div>
        <p id="enroll-pesan" class="text-sm text-center mt-3 min-h-[1.25rem]">&nbsp;</p>

        <div class="flex gap-2 mt-4">
          <button id="btn-enroll-ambil" disabled
                  class="flex-1 py-2.5 rounded-lg bg-klc-600 hover:bg-klc-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm transition">
            Ambil Gambar
          </button>
          <button id="btn-enroll-batal"
                  class="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">
            Batal
          </button>
        </div>
      </div>
    </div>
  `;

  const video = document.getElementById('enroll-video');
  const tirai = document.getElementById('enroll-tirai');
  const pesan = document.getElementById('enroll-pesan');
  const tombolAmbil = document.getElementById('btn-enroll-ambil');
  const terkumpul = [];
  let stream = null;

  const gambarTitik = () => {
    document.getElementById('enroll-titik').innerHTML = Array.from({ length: JUMLAH_SAMPEL }, (_, i) =>
      `<span class="w-3 h-3 rounded-full ${i < terkumpul.length ? 'bg-klc-600' : 'bg-slate-200'}"></span>`
    ).join('');
  };
  gambarTitik();

  const tutup = () => {
    FaceEngine.matikanKamera(stream);
    root.innerHTML = '';
  };
  document.getElementById('btn-enroll-batal').addEventListener('click', tutup);

  try {
    tirai.textContent = 'Memuat model pengenalan wajah...';
    await FaceEngine.muatModel(t => { tirai.textContent = t; });
    tirai.textContent = 'Meminta izin kamera...';
    stream = await FaceEngine.nyalakanKamera(video);
    tirai.classList.add('hidden');
    tombolAmbil.disabled = false;
    pesan.textContent = 'Menghadap lurus ke kamera, lalu tekan Ambil Gambar.';
    pesan.className = 'text-sm text-center mt-3 min-h-[1.25rem] text-slate-500';
  } catch (err) {
    tirai.textContent = err.message;
    return;
  }

  tombolAmbil.addEventListener('click', async () => {
    tombolAmbil.disabled = true;
    const hasil = await FaceEngine.ambilDescriptor(video);

    if (hasil.error) {
      pesan.textContent = hasil.error;
      pesan.className = 'text-sm text-center mt-3 min-h-[1.25rem] text-rose-600';
      tombolAmbil.disabled = false;
      return;
    }

    terkumpul.push(hasil.descriptor);
    gambarTitik();

    if (terkumpul.length < JUMLAH_SAMPEL) {
      const arahan = ['Sekarang agak menoleh ke kiri.', 'Sekarang agak menoleh ke kanan.',
                      'Sekarang sedikit menunduk.', 'Terakhir, sedikit mendongak.'];
      pesan.textContent = arahan[terkumpul.length - 1] || 'Ubah sedikit posisi kepala.';
      pesan.className = 'text-sm text-center mt-3 min-h-[1.25rem] text-slate-500';
      tombolAmbil.disabled = false;
      return;
    }

    pesan.textContent = 'Menyimpan...';
    try {
      await Storage.saveFaceEnrollment(employeeId, terkumpul);
      tutup();
      await renderFaceTab();
    } catch (err) {
      pesan.textContent = `Gagal menyimpan: ${err.message}`;
      pesan.className = 'text-sm text-center mt-3 min-h-[1.25rem] text-rose-600';
      tombolAmbil.disabled = false;
    }
  });
}

/* ---------------- Foto bukti ---------------- */

async function muatBukti() {
  const wadah = document.getElementById('face-bukti');
  if (!wadah) return;
  wadah.innerHTML = `<p class="text-sm text-slate-400 text-center py-6">Memuat...</p>`;

  let daftar;
  try {
    daftar = await Storage.getFacePhotos({ date: FaceEnrollState.tanggalBukti });
  } catch (err) {
    wadah.innerHTML = `<p class="text-sm text-rose-500 text-center py-6">Gagal memuat: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (daftar.length === 0) {
    wadah.innerHTML = keadaanKosongHtml({
      judul: 'Belum ada absen lewat kamera',
      pesan: 'Tidak ada yang absen memakai kamera pada tanggal ini. Foto bukti hanya tersimpan 40 hari terakhir.'
    });
    return;
  }

  wadah.innerHTML = `
    <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      ${daftar.map(b => `
        <figure class="border border-slate-200 rounded-xl overflow-hidden">
          <img src="/api/face/photos/${b.id}" alt="Foto absen ${escapeHtml(b.name)}" class="w-full aspect-[4/3] object-cover" />
          <figcaption class="px-2 py-2">
            <p class="text-xs font-medium text-slate-700 truncate">${escapeHtml(b.name)}</p>
            <p class="text-[11px] text-slate-400">
              ${b.kind === 'check_out' ? 'Pulang' : 'Masuk'} &middot; ${jamDariStempel(b.createdAt)}
            </p>
            <!-- Jarak kemiripan ditampilkan apa adanya. Angka kecil berarti
                 sangat yakin; mendekati 0,5 berarti nyaris ditolak dan layak
                 dilihat fotonya lebih teliti. -->
            <p class="text-[11px] font-mono ${b.distance > 0.4 ? 'text-amber-600' : 'text-slate-400'}">
              jarak ${b.distance != null ? b.distance.toFixed(3) : '—'}
            </p>
          </figcaption>
        </figure>
      `).join('')}
    </div>
  `;
}

function jamDariStempel(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
