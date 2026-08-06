/* ============================================================
   owner.js — Dashboard Owner/Admin
   Tabs: Monitoring | Data Karyawan | Keterlambatan | Jabatan & Divisi
         | Jadwal & Libur | Riwayat Absensi | Laporan Gaji | Log Perubahan
   Monitoring & Riwayat memakai komponen bersama dari checklist.js.
   Perhitungan gaji dilakukan di server (routes/payroll.js) — di
   sini hanya kalkulasi tanggal murni (getPeriodByOffset/periodLabel)
   yang dipakai untuk isi dropdown periode.
   ============================================================ */

const OwnerState = {
  tab: 'monitoring',
  monitorDate: todayStr(),
  historyFilter: { employeeId: 'all', month: null },
  periodOffset: 0,
  monitorTimer: null,
  account: null
};

function formatRupiah(n) {
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
}

function dateToStr(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/* Harus sama persis dengan PERIOD_START_DAY / PERIOD_END_DAY di
   backend/routes/payroll.js. Frontend disajikan tanpa build step, jadi tidak
   ada modul yang bisa dipakai bersama; kalau berbeda, pilihan periode di
   layar akan menunjuk rentang yang berbeda dari yang dihitung server. */
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

function periodLabel(period) {
  const label = `${formatTanggalIndo(dateToStr(period.start))} – ${formatTanggalIndo(dateToStr(period.end))}`;
  return period.offset === 0 ? label + ' (Periode Berjalan)' : label;
}

/* ---------------- Shell & Tabs ---------------- */

async function renderOwnerDashboard(account) {
  OwnerState.account = account;
  const app = document.getElementById('app');
  app.innerHTML = `
    <div id="owner-shell" data-bg="merek" class="min-h-screen bg-klc-red bg-cover bg-center bg-fixed"
         style="background-image:url('img/bg-dashboard.png')">
      <!-- Header dibuat sedikit tembus pandang supaya latar merek di
           belakangnya ikut terlihat, tapi tetap cukup pekat agar teks
           gelap di dalamnya terbaca di atas latar apa pun. -->
      <header class="bg-white/90 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
        <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p class="text-xs text-slate-400">Panel Owner/Admin</p>
            <h1 class="text-lg font-bold text-slate-800">${escapeHtml(account.name)}</h1>
          </div>
          <div class="flex items-center gap-4">
            <p id="header-clock" class="text-sm"></p>
            <button id="btn-logout" class="text-sm font-medium text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition">Keluar</button>
          </div>
        </div>
        <!-- flex-wrap, bukan overflow-x-auto: kedelapan tab tidak muat di lebar
             kartu, dan menggesernya ke samping menyembunyikan tab terakhir tanpa
             petunjuk apa pun -- di layar proyektor tab itu seolah tidak ada.
             Membungkus ke baris kedua membuat header sedikit lebih tinggi, tapi
             tidak pernah ada menu yang hilang. -->
        <nav class="max-w-6xl mx-auto px-4 flex flex-wrap gap-1 pb-2">
          ${tabButton('monitoring', 'Monitoring')}
          ${tabButton('karyawan', 'Data Karyawan')}
          ${tabButton('keterlambatan', 'Keterlambatan')}
          ${tabButton('lookup', 'Jabatan &amp; Divisi')}
          ${tabButton('jadwal', 'Jadwal &amp; Libur')}
          ${tabButton('riwayat', 'Riwayat Absensi')}
          ${tabButton('laporan', 'Laporan Gaji')}
          ${tabButton('log', 'Log Perubahan')}
        </nav>
      </header>
      <main class="max-w-6xl mx-auto px-4 py-6">
        <div id="birthday-banner"></div>
        <div id="owner-content"></div>
      </main>
    </div>
    <div id="modal-root"></div>
  `;

  startHeaderClock('header-clock');

  document.getElementById('btn-logout').addEventListener('click', async () => {
    stopHeaderClock();
    clearInterval(OwnerState.monitorTimer);
    await Auth.logout();
    renderLogin();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      OwnerState.tab = btn.dataset.tab;
      renderOwnerTab();
    });
  });

  renderOwnerTab();
}

function tabButton(id, label) {
  const active = OwnerState.tab === id;
  return `<button data-tab="${id}" class="tab-btn whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${active ? 'border-klc-600 text-klc-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">${label}</button>`;
}

async function renderOwnerTab() {
  clearInterval(OwnerState.monitorTimer);
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === OwnerState.tab;
    btn.className = `tab-btn whitespace-nowrap px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${active ? 'border-klc-600 text-klc-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`;
  });

  let employees;
  try {
    employees = await Storage.getEmployees();
  } catch (err) {
    document.getElementById('owner-content').innerHTML = `<p class="text-sm text-rose-500 text-center py-8">Gagal memuat data: ${escapeHtml(err.message)}</p>`;
    return;
  }
  renderBirthdayBanner(document.getElementById('birthday-banner'), employees);

  if (OwnerState.tab === 'monitoring') renderMonitoringTab(employees.filter(e => e.active));
  else if (OwnerState.tab === 'karyawan') renderEmployeeListTab(employees);
  else if (OwnerState.tab === 'keterlambatan') renderLatePolicyTab();
  else if (OwnerState.tab === 'lookup') renderLookupsTab();
  else if (OwnerState.tab === 'jadwal') renderSchedulesTab();
  else if (OwnerState.tab === 'riwayat') renderRiwayatTab(employees.filter(e => e.active));
  else if (OwnerState.tab === 'laporan') renderLaporanTab();
  else if (OwnerState.tab === 'log') renderAuditTab();
}

/* ---------------- Tab: Monitoring Hari Ini ---------------- */

function renderMonitoringTab(employees) {
  const container = document.getElementById('owner-content');

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 on-brand-bg">
      <div class="flex items-center gap-2">
        <label class="text-sm text-slate-500">Tanggal</label>
        <input type="date" id="monitor-date" value="${OwnerState.monitorDate}" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
      </div>
      <button id="btn-today" class="text-sm font-medium text-klc-600 hover:underline w-fit">Hari ini</button>
      <span class="text-xs text-slate-400 sm:ml-auto">Diperbarui otomatis setiap 15 detik</span>
    </div>
    <div id="monitor-list"></div>
  `;

  const rerender = () => renderMonitoringList(document.getElementById('monitor-list'), employees, OwnerState.monitorDate, OwnerState.account.name);

  document.getElementById('monitor-date').addEventListener('change', (e) => {
    OwnerState.monitorDate = e.target.value;
    rerender();
  });
  document.getElementById('btn-today').addEventListener('click', () => {
    OwnerState.monitorDate = todayStr();
    document.getElementById('monitor-date').value = OwnerState.monitorDate;
    rerender();
  });

  rerender();
  OwnerState.monitorTimer = setInterval(() => {
    const hasOpenPanel = document.querySelector('#monitor-list .panel-row:not(.hidden)');
    if (!hasOpenPanel) rerender();
  }, 15000);
}

/* ---------------- Tab: Data Karyawan ----------------
   Tabelnya sendiri ada di employeeList.js (renderEmployeeListTab);
   di sini tinggal modal tambah/ubah karyawannya.
   ---------------------------------------------------- */

/* Mengecilkan foto di browser sebelum dikirim: sisi terpanjang 320px, JPEG
   kualitas 0,8 — hasilnya biasanya 15-40 KB, jadi pengguna tidak perlu
   memikirkan ukuran berkas aslinya. Server tetap memvalidasi sendiri. */
function resizePhotoToDataUrl(file, maxSide = 320) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Berkas tidak bisa dibaca.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Berkas ini bukan gambar yang bisa dibaca.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function openEmployeeModal(employeeId) {
  const isEdit = !!employeeId;
  let emp = null, jobs = [], organizations = [];
  try {
    [jobs, organizations] = await Promise.all([Storage.getJobs(), Storage.getOrganizations()]);
    if (isEdit) emp = await Storage.getEmployeeById(employeeId);
  } catch (err) {
    alert(`Gagal memuat data: ${err.message}`);
    return;
  }

  const lookupOptions = (list, selectedId) => [
    `<option value="">— Belum diatur —</option>`,
    ...list.map(row => `<option value="${row.id}" ${selectedId === row.id ? 'selected' : ''}>${escapeHtml(row.name)}</option>`)
  ].join('');

  const emptyHint = list => list.length === 0
    ? `<p class="text-xs text-amber-600 mt-1">Daftarnya masih kosong — isi dulu di tab Jabatan &amp; Divisi.</p>`
    : '';

  openModal(`
    <div class="p-5">
      <h3 class="font-bold text-slate-800 mb-4">${isEdit ? 'Edit Karyawan' : 'Tambah Karyawan'}</h3>
      <form id="form-emp" class="space-y-3">
        <div class="flex items-center gap-4">
          <div id="photo-preview">${employeeAvatarHtml(emp || { name: '', hasPhoto: false }, 'w-16 h-16')}</div>
          <div class="flex flex-col gap-1.5">
            <input type="file" id="photo-file" accept="image/*" class="hidden" />
            <button type="button" id="btn-pick-photo" class="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 w-fit">Pilih Foto</button>
            <button type="button" id="btn-remove-photo" class="text-rose-600 hover:underline text-xs font-medium w-fit ${emp && emp.hasPhoto ? '' : 'hidden'}">Hapus Foto</button>
          </div>
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Employee ID</label>
          <input required name="employeeCode" value="${emp ? escapeHtml(emp.employeeCode || '') : ''}" placeholder="TDI-006" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Nama Lengkap</label>
          <input required name="name" value="${emp ? escapeHtml(emp.name) : ''}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Jabatan</label>
          <select name="jobId" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
            ${lookupOptions(jobs, emp && emp.job ? emp.job.id : null)}
          </select>
          ${emptyHint(jobs)}
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Divisi</label>
          <select name="organizationId" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
            ${lookupOptions(organizations, emp && emp.organization ? emp.organization.id : null)}
          </select>
          ${emptyHint(organizations)}
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Upah Harian (Rp)</label>
          <input required type="number" min="0" step="1000" name="dailyWage" value="${emp ? emp.dailyWage : ''}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Tanggal Lahir (opsional)</label>
          <input type="date" name="birthDate" value="${emp && emp.birthDate ? emp.birthDate : ''}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="active" ${!isEdit || emp.active ? 'checked' : ''} class="accent-klc-600" />
          Karyawan aktif
        </label>
        <p id="form-error" class="text-sm text-rose-600 hidden"></p>
        <div class="flex gap-2 pt-2">
          <button type="button" id="btn-cancel" class="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 font-medium text-sm">Batal</button>
          <button type="submit" class="flex-1 py-2.5 rounded-lg bg-klc-600 text-white font-medium text-sm hover:bg-klc-700">Simpan</button>
        </div>
        ${isEdit ? `<button type="button" id="btn-delete-emp" class="w-full py-2.5 mt-1 rounded-lg text-rose-600 font-medium text-sm hover:bg-rose-50">Hapus Karyawan</button>` : ''}
      </form>
    </div>
  `);

  document.getElementById('btn-cancel').addEventListener('click', closeModal);

  /* undefined = pengguna tidak menyentuh foto (jangan diubah),
     null = minta dihapus, string = data URL foto baru. Pembedaan ini penting:
     tanpa itu, menyimpan perubahan nama akan diam-diam menghapus foto. */
  let photoChange;
  const photoPreview = document.getElementById('photo-preview');
  const fileInput = document.getElementById('photo-file');
  const removePhotoBtn = document.getElementById('btn-remove-photo');
  const formError = document.getElementById('form-error');

  document.getElementById('btn-pick-photo').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      photoChange = await resizePhotoToDataUrl(file);
      photoPreview.innerHTML = `<img src="${photoChange}" alt="" class="w-16 h-16 rounded-full object-cover bg-slate-100" />`;
      removePhotoBtn.classList.remove('hidden');
      formError.classList.add('hidden');
    } catch (err) {
      formError.textContent = err.message;
      formError.classList.remove('hidden');
    }
    fileInput.value = ''; // supaya memilih berkas yang sama lagi tetap memicu change
  });

  removePhotoBtn.addEventListener('click', () => {
    photoChange = null;
    photoPreview.innerHTML = employeeAvatarHtml({ name: document.querySelector('#form-emp [name="name"]').value, hasPhoto: false }, 'w-16 h-16');
    removePhotoBtn.classList.add('hidden');
  });

  if (isEdit) {
    document.getElementById('btn-delete-emp').addEventListener('click', async () => {
      if (!confirm(`Hapus karyawan "${emp.name}"? Riwayat absensinya akan tetap tersimpan.`)) return;
      try {
        await Storage.deleteEmployee(employeeId);
        closeModal();
        renderOwnerTab();
      } catch (err) {
        alert(`Gagal menghapus: ${err.message}`);
      }
    });
  }

  document.getElementById('form-emp').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const record = isEdit ? { id: emp.id } : {};
    record.employeeCode = fd.get('employeeCode').trim();
    record.name = fd.get('name').trim();
    record.dailyWage = Number(fd.get('dailyWage'));
    record.jobId = fd.get('jobId') ? Number(fd.get('jobId')) : null;
    record.organizationId = fd.get('organizationId') ? Number(fd.get('organizationId')) : null;
    if (photoChange !== undefined) record.photo = photoChange;
    record.birthDate = fd.get('birthDate') || null;
    record.active = fd.get('active') === 'on';

    const errorEl = document.getElementById('form-error');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await Storage.upsertEmployee(record);
      closeModal();
      renderOwnerTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });
}

/* ---------------- Tab: Riwayat Absensi ---------------- */

function renderRiwayatTab(employees) {
  const container = document.getElementById('owner-content');
  container.innerHTML = `<div id="history-wrap"></div>`;
  renderHistoryTable(document.getElementById('history-wrap'), employees, OwnerState.historyFilter);
}

/* ---------------- Tab: Laporan Gaji ---------------- */

async function renderLaporanTab() {
  const container = document.getElementById('owner-content');

  /* Hanya periode yang benar-benar punya catatan absensi yang ditawarkan.
     Menawarkan bulan dari sebelum aplikasi dipakai akan menampilkan seluruh
     karyawan Alpa sebulan penuh -- pembaca menyimpulkan orangnya bolos,
     padahal datanya memang belum pernah ada. */
  let oldestOffset = 0;
  try {
    ({ oldestOffset } = await Storage.getPayrollPeriods());
  } catch (err) {
    // Gagal mengambil batas bukan alasan menyembunyikan laporan; jatuh
    // kembali ke periode berjalan saja.
  }
  if (OwnerState.periodOffset < oldestOffset) OwnerState.periodOffset = 0;

  const periodOptions = [];
  for (let i = 0; i >= oldestOffset; i--) periodOptions.push(getPeriodByOffset(i));

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <div class="flex-1">
        <label class="text-sm text-slate-500 block mb-1">Periode Penggajian (${PERIOD_START_DAY} &ndash; ${PERIOD_END_DAY})</label>
        <select id="filter-period" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-96">
          ${periodOptions.map(p => `<option value="${p.offset}" ${OwnerState.periodOffset === p.offset ? 'selected' : ''}>${periodLabel(p)}</option>`).join('')}
        </select>
      </div>
      <button id="btn-export" class="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 h-fit">Download CSV</button>
    </div>
    <p class="text-xs text-slate-400 mb-4">Laporan lengkap tersedia mulai tanggal ${PERIOD_START_DAY} setiap bulan. Upah dihitung otomatis per jam kerja (1 hari penuh = 8 jam); jam lembur di atas 8 jam tercatat tapi tidak menambah upah otomatis. Hari tanpa keterangan pada periode berjalan dianggap Alpa. Potongan keterlambatan dihitung otomatis dari aturan di tab Aturan Keterlambatan; gaji bersih tidak pernah kurang dari nol.</p>
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm table-zebra">
          <thead class="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th class="px-4 py-2.5 font-medium">Karyawan</th>
              <th class="px-4 py-2.5 font-medium text-center">Hadir</th>
              <th class="px-4 py-2.5 font-medium text-center">Izin</th>
              <th class="px-4 py-2.5 font-medium text-center">Sakit</th>
              <th class="px-4 py-2.5 font-medium text-center">Alpa</th>
              <th class="px-4 py-2.5 font-medium text-center">Total Jam (dibayar)</th>
              <th class="px-4 py-2.5 font-medium text-right">Upah Harian</th>
              <th class="px-4 py-2.5 font-medium text-right">Total Gaji</th>
              <th class="px-4 py-2.5 font-medium text-center">Menit Telat</th>
              <th class="px-4 py-2.5 font-medium text-right">Potongan</th>
              <th class="px-4 py-2.5 font-medium text-right">Gaji Bersih</th>
            </tr>
          </thead>
          <tbody id="payroll-tbody" class="divide-y divide-slate-100"></tbody>
          <tfoot id="payroll-tfoot" class="bg-slate-50 font-semibold"></tfoot>
        </table>
      </div>
    </div>
  `;

  document.getElementById('filter-period').addEventListener('change', (e) => {
    OwnerState.periodOffset = Number(e.target.value);
    renderPayrollTable();
  });
  document.getElementById('btn-export').addEventListener('click', () => exportPayrollCsv());

  renderPayrollTable();
}

async function renderPayrollTable() {
  const tbody = document.getElementById('payroll-tbody');
  const tfoot = document.getElementById('payroll-tfoot');
  tbody.innerHTML = `<tr><td colspan="11" class="px-4 py-8 text-center text-slate-400">Memuat...</td></tr>`;
  tfoot.innerHTML = '';

  let data;
  try {
    data = await Storage.getPayroll(OwnerState.periodOffset);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="11" class="px-4 py-8 text-center text-rose-500">Gagal memuat data: ${escapeHtml(err.message)}</td></tr>`;
    return;
  }

  if (data.rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="px-4 py-8 text-center text-slate-400">Belum ada karyawan aktif.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.rows.map(r => `
    <tr>
      <td class="px-4 py-2.5 text-slate-700">${escapeHtml(r.name)}</td>
      <td class="px-4 py-2.5 text-center text-emerald-700 font-medium">${r.hadir}</td>
      <td class="px-4 py-2.5 text-center text-amber-700">${r.izin}</td>
      <td class="px-4 py-2.5 text-center text-sky-700">${r.sakit}</td>
      <td class="px-4 py-2.5 text-center text-rose-700">${r.alpa}</td>
      <td class="px-4 py-2.5 text-center text-slate-600">${r.totalHoursPaid} jam</td>
      <td class="px-4 py-2.5 text-right text-slate-500">${formatRupiah(r.dailyWage)}</td>
      <td class="px-4 py-2.5 text-right text-slate-600">${formatRupiah(r.totalWage)}</td>
      <td class="px-4 py-2.5 text-center text-slate-600">${r.latePolicy ? r.lateMinutesTotal + ' mnt' : '&mdash;'}</td>
      <!-- whitespace-nowrap: tanda minus sempat terpisah dari angkanya ke
           baris berikutnya, sehingga potongan terbaca seperti dua nilai. -->
      <td class="px-4 py-2.5 text-right whitespace-nowrap ${r.deductionAmount > 0 ? 'text-rose-600' : 'text-slate-400'}">${r.deductionAmount > 0 ? '-' + formatRupiah(r.deductionAmount) : '&mdash;'}</td>
      <td class="px-4 py-2.5 text-right text-slate-800 font-semibold">${formatRupiah(r.finalWage)}</td>
    </tr>
  `).join('');

  tfoot.innerHTML = `
    <tr>
      <td class="px-4 py-3 font-normal text-slate-500" colspan="7">Total Gaji Kotor (sebelum potongan)</td>
      <td class="px-4 py-3 text-right text-slate-600">${formatRupiah(data.grandTotal)}</td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td class="px-4 py-3" colspan="10">Total Gaji Bersih Seluruh Karyawan</td>
      <td class="px-4 py-3 text-right text-klc-700">${formatRupiah(data.grandFinalTotal)}</td>
    </tr>
  `;
}

async function exportPayrollCsv() {
  let data;
  try {
    data = await Storage.getPayroll(OwnerState.periodOffset);
  } catch (err) {
    alert(`Gagal export: ${err.message}`);
    return;
  }

  const rows = [['Nama', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Total Jam Dibayar', 'Upah Harian', 'Total Gaji', 'Menit Telat', 'Potongan', 'Gaji Bersih']];
  data.rows.forEach(r => {
    rows.push([r.name, r.hadir, r.izin, r.sakit, r.alpa, r.totalHoursPaid, r.dailyWage, r.totalWage, r.lateMinutesTotal, r.deductionAmount, r.finalWage]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `laporan-gaji_${data.period.start}_${data.period.end}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
