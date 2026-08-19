/* ============================================================
   formUtils.js — Penyampaian galat pada form

   Sebelumnya tiap form cuma menempelkan pesan server di satu
   baris merah di atas tombol Simpan. Pada form karyawan yang
   isinya sebelas kolom, pesan "Kode karyawan sudah dipakai"
   muncul jauh dari kotak kodenya, dan orang harus menebak
   sendiri kotak mana yang salah -- kadang sambil menggulir.

   Dua hal yang dikerjakan di sini:
     1. ringkasan galat yang bisa dijangkau papan ketik, dan
        fokusnya dipindah ke sana begitu penyimpanan gagal
     2. penandaan kolom yang bersangkutan: garis merah,
        aria-invalid, dan pesan yang menempel di bawah kotaknya

   Pesan dari server berupa satu kalimat, bukan daftar per
   kolom. Jadi kolomnya dikenali dengan mencocokkan kalimat itu
   ke pola yang didaftarkan pemanggil. Kalau tidak ada yang
   cocok, ringkasannya tetap tampil -- yang hilang cuma
   penandaan kolomnya, bukan pesannya.
   ============================================================ */

/* ---------------- Keadaan kosong ----------------

   Satu baris abu bertuliskan "Belum ada karyawan." memberi tahu bahwa
   tabelnya kosong, tapi tidak memberi tahu apa yang harus dilakukan --
   dan pada tabel yang memang seharusnya berisi, orang berhenti di situ.

   Bentuknya: judul singkat, satu kalimat penjelas, dan -- kalau memang ada
   yang bisa dikerjakan dari halaman yang sama -- satu tombol.

   Tombolnya sengaja tidak membawa logika sendiri melainkan menekan tombol
   yang sudah ada di halaman (lewat `aksiSelector`). Menyalin logika "tambah
   karyawan" ke sini berarti ada dua tempat yang harus ikut berubah setiap
   kali alurnya berubah, dan yang satu pasti terlupakan. */
function keadaanKosongHtml({ judul, pesan, aksiLabel, aksiSelector }) {
  const tombol = aksiLabel && aksiSelector
    ? `<button type="button" class="btn-kosong mt-3 px-4 py-2 rounded-lg bg-klc-600 hover:bg-klc-700 text-white text-sm font-medium transition"
               data-aksi="${escapeHtml(aksiSelector)}">${escapeHtml(aksiLabel)}</button>`
    : '';
  return `
    <div class="text-center py-10 px-4">
      <p class="text-sm font-medium text-slate-600">${escapeHtml(judul)}</p>
      <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">${escapeHtml(pesan)}</p>
      ${tombol}
    </div>
  `;
}

/* Dipanggil setelah HTML-nya ditempel. Dipisah dari pembuat HTML karena
   sebagian tabel menempelkannya lewat innerHTML tbody, dan pendengarnya
   baru bisa dipasang setelah elemennya ada di dokumen. */
function pasangAksiKosong(wadah) {
  (wadah || document).querySelectorAll('.btn-kosong').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(btn.dataset.aksi);
      if (target) target.click();
    });
  });
}

function elemenGalat(form) {
  return form.querySelector('.form-error, #form-error');
}

function bersihkanGalatForm(form) {
  const ringkasan = elemenGalat(form);
  if (ringkasan) {
    ringkasan.classList.add('hidden');
    ringkasan.textContent = '';
  }
  form.querySelectorAll('[aria-invalid="true"]').forEach(el => {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
    el.classList.remove('border-rose-500');
  });
  form.querySelectorAll('.galat-kolom').forEach(el => el.remove());
}

/* petaKolom: [[pola, namaKolom], ...] — pola dicocokkan ke pesan server.
   Contoh: [[/kode karyawan/i, 'employeeCode'], [/upah/i, 'dailyWage']] */
function tampilkanGalatForm(form, pesan, petaKolom = []) {
  bersihkanGalatForm(form);

  const ringkasan = elemenGalat(form);
  if (ringkasan) {
    ringkasan.textContent = pesan;
    ringkasan.classList.remove('hidden');
    /* role="alert" membuat pembaca layar mengumumkannya tanpa diminta;
       tabindex -1 supaya bisa difokuskan lewat kode tapi tidak ikut masuk
       urutan Tab saat tidak ada galat. */
    ringkasan.setAttribute('role', 'alert');
    ringkasan.setAttribute('tabindex', '-1');
  }

  let kolom = null;
  for (const [pola, nama] of petaKolom) {
    if (pola.test(pesan)) {
      kolom = form.querySelector(`[name="${nama}"]`);
      if (kolom) break;
    }
  }

  if (kolom) {
    const id = `galat-${kolom.name}`;
    kolom.setAttribute('aria-invalid', 'true');
    kolom.setAttribute('aria-describedby', id);
    kolom.classList.add('border-rose-500');

    const baris = document.createElement('p');
    baris.id = id;
    baris.className = 'galat-kolom text-xs text-rose-600 mt-1';
    baris.textContent = pesan;
    /* Disisipkan setelah pembungkus kalau kotaknya dibungkus (kotak nominal
       rupiah punya <div class="relative"> untuk awalan "Rp"), supaya pesannya
       tidak tersangkut di dalam pembungkus itu. */
    const induk = kolom.parentElement.classList.contains('relative')
      ? kolom.parentElement
      : kolom;
    induk.insertAdjacentElement('afterend', baris);

    /* Fokus ke kolomnya, bukan ke ringkasan: di sini galatnya cuma satu, dan
       memindahkan orang langsung ke tempat yang harus diperbaiki lebih cepat
       daripada menyuruhnya membaca ringkasan lalu mencari sendiri. */
    kolom.focus();
    kolom.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } else if (ringkasan) {
    // Kolomnya tidak ketahuan, jadi ringkasan yang jadi tujuan fokus.
    ringkasan.focus();
    ringkasan.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
