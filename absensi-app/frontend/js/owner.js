/* ============================================================
   owner.js — Dashboard Owner/Admin
   Tabs: Monitoring | Data Karyawan | Riwayat | Laporan Gaji
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

function getPeriodByOffset(offset) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const day = now.getDate();
  let startMonth = day >= 27 ? month : month - 1;
  let startYear = year;
  if (startMonth < 0) { startMonth = 11; startYear--; }

  startMonth += offset;
  while (startMonth < 0) { startMonth += 12; startYear--; }
  while (startMonth > 11) { startMonth -= 12; startYear++; }

  const start = new Date(startYear, startMonth, 27);
  let endMonth = startMonth + 1, endYear = startYear;
  if (endMonth > 11) { endMonth = 0; endYear++; }
  const end = new Date(endYear, endMonth, 26);
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
    <div class="min-h-screen bg-slate-50">
      <header class="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div class="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p class="text-xs text-slate-400">Panel Owner/Admin</p>
            <h1 class="text-lg font-bold text-slate-800">${escapeHtml(account.name)}</h1>
          </div>
          <div class="flex items-center gap-4">
            <p id="header-clock" class="text-sm"></p>
            <button id="btn-logout" class="text-sm font-medium text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition">Keluar</button>
          </div>
        </div>
        <nav class="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto no-scrollbar pb-2">
          ${tabButton('monitoring', 'Monitoring Hari Ini')}
          ${tabButton('karyawan', 'Data Karyawan')}
          ${tabButton('riwayat', 'Riwayat Absensi')}
          ${tabButton('laporan', 'Laporan Gaji')}
        </nav>
      </header>
      <main class="max-w-5xl mx-auto px-4 py-6">
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
  return `<button data-tab="${id}" class="tab-btn whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">${label}</button>`;
}

async function renderOwnerTab() {
  clearInterval(OwnerState.monitorTimer);
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === OwnerState.tab;
    btn.className = `tab-btn whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`;
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
  else if (OwnerState.tab === 'karyawan') renderKaryawanTab(employees);
  else if (OwnerState.tab === 'riwayat') renderRiwayatTab(employees.filter(e => e.active));
  else if (OwnerState.tab === 'laporan') renderLaporanTab();
}

/* ---------------- Tab: Monitoring Hari Ini ---------------- */

function renderMonitoringTab(employees) {
  const container = document.getElementById('owner-content');

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <div class="flex items-center gap-2">
        <label class="text-sm text-slate-500">Tanggal</label>
        <input type="date" id="monitor-date" value="${OwnerState.monitorDate}" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
      </div>
      <button id="btn-today" class="text-sm font-medium text-indigo-600 hover:underline w-fit">Hari ini</button>
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

/* ---------------- Tab: Data Karyawan ---------------- */

function renderKaryawanTab(employees) {
  const container = document.getElementById('owner-content');

  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-semibold text-slate-700">${employees.length} Karyawan</h2>
      <button id="btn-add-emp" class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">+ Tambah Karyawan</button>
    </div>
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th class="px-4 py-2.5 font-medium">Nama</th>
              <th class="px-4 py-2.5 font-medium">Upah Harian</th>
              <th class="px-4 py-2.5 font-medium">Tanggal Lahir</th>
              <th class="px-4 py-2.5 font-medium">Status</th>
              <th class="px-4 py-2.5 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody id="emp-tbody" class="divide-y divide-slate-100"></tbody>
        </table>
      </div>
    </div>
  `;

  const tbody = document.getElementById('emp-tbody');
  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">Belum ada karyawan.</td></tr>`;
  } else {
    tbody.innerHTML = employees.map(emp => {
      const birthday = isBirthdayToday(emp.birthDate);
      return `
        <tr class="${birthday ? 'bg-amber-50' : ''}">
          <td class="px-4 py-2.5 text-slate-700">${escapeHtml(emp.name)}${birthday ? ' 🎂' : ''}</td>
          <td class="px-4 py-2.5 text-slate-700">${formatRupiah(emp.dailyWage)}</td>
          <td class="px-4 py-2.5 text-slate-500">${emp.birthDate ? formatTanggalIndo(emp.birthDate) : '-'}</td>
          <td class="px-4 py-2.5">
            <span class="text-xs font-medium px-2.5 py-1 rounded-full border ${emp.active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}">${emp.active ? 'Aktif' : 'Nonaktif'}</span>
          </td>
          <td class="px-4 py-2.5 text-right">
            <button data-id="${emp.id}" class="btn-edit-emp text-indigo-600 hover:underline text-sm font-medium">Edit</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  document.getElementById('btn-add-emp').addEventListener('click', () => openEmployeeModal(null));
  tbody.querySelectorAll('.btn-edit-emp').forEach(btn => {
    btn.addEventListener('click', () => openEmployeeModal(btn.dataset.id));
  });
}

async function openEmployeeModal(employeeId) {
  const isEdit = !!employeeId;
  let emp = null;
  if (isEdit) {
    try {
      emp = await Storage.getEmployeeById(employeeId);
    } catch (err) {
      alert(`Gagal memuat data karyawan: ${err.message}`);
      return;
    }
  }

  openModal(`
    <div class="p-5">
      <h3 class="font-bold text-slate-800 mb-4">${isEdit ? 'Edit Karyawan' : 'Tambah Karyawan'}</h3>
      <form id="form-emp" class="space-y-3">
        <div>
          <label class="text-sm text-slate-500 block mb-1">Nama Lengkap</label>
          <input required name="name" value="${emp ? escapeHtml(emp.name) : ''}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
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
          <input type="checkbox" name="active" ${!isEdit || emp.active ? 'checked' : ''} class="accent-indigo-600" />
          Karyawan aktif
        </label>
        <p id="form-error" class="text-sm text-rose-600 hidden"></p>
        <div class="flex gap-2 pt-2">
          <button type="button" id="btn-cancel" class="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 font-medium text-sm">Batal</button>
          <button type="submit" class="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700">Simpan</button>
        </div>
        ${isEdit ? `<button type="button" id="btn-delete-emp" class="w-full py-2.5 mt-1 rounded-lg text-rose-600 font-medium text-sm hover:bg-rose-50">Hapus Karyawan</button>` : ''}
      </form>
    </div>
  `);

  document.getElementById('btn-cancel').addEventListener('click', closeModal);

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
    record.name = fd.get('name').trim();
    record.dailyWage = Number(fd.get('dailyWage'));
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

function renderLaporanTab() {
  const container = document.getElementById('owner-content');

  const periodOptions = [];
  for (let i = 0; i >= -11; i--) periodOptions.push(getPeriodByOffset(i));

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <div class="flex-1">
        <label class="text-sm text-slate-500 block mb-1">Periode Penggajian (27 &ndash; 26)</label>
        <select id="filter-period" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-96">
          ${periodOptions.map(p => `<option value="${p.offset}" ${OwnerState.periodOffset === p.offset ? 'selected' : ''}>${periodLabel(p)}</option>`).join('')}
        </select>
      </div>
      <button id="btn-export" class="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 h-fit">Download CSV</button>
    </div>
    <p class="text-xs text-slate-400 mb-4">Laporan lengkap tersedia mulai tanggal 27 setiap bulan. Upah dihitung otomatis per jam kerja (1 hari penuh = 8 jam); jam lembur di atas 8 jam tercatat tapi tidak menambah upah otomatis. Hari tanpa keterangan pada periode berjalan dianggap Alpa.</p>
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
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
  tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">Memuat...</td></tr>`;
  tfoot.innerHTML = '';

  let data;
  try {
    data = await Storage.getPayroll(OwnerState.periodOffset);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-rose-500">Gagal memuat data: ${escapeHtml(err.message)}</td></tr>`;
    return;
  }

  if (data.rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">Belum ada karyawan aktif.</td></tr>`;
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
      <td class="px-4 py-2.5 text-right text-slate-800 font-semibold">${formatRupiah(r.totalWage)}</td>
    </tr>
  `).join('');

  tfoot.innerHTML = `
    <tr>
      <td class="px-4 py-3" colspan="7">Total Gaji Seluruh Karyawan</td>
      <td class="px-4 py-3 text-right text-indigo-700">${formatRupiah(data.grandTotal)}</td>
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

  const rows = [['Nama', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Total Jam Dibayar', 'Upah Harian', 'Total Gaji']];
  data.rows.forEach(r => {
    rows.push([r.name, r.hadir, r.izin, r.sakit, r.alpa, r.totalHoursPaid, r.dailyWage, r.totalWage]);
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
