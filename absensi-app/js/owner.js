/* ============================================================
   owner.js — Dashboard Owner/Admin
   Tabs: Monitoring | Data Karyawan | Riwayat | Laporan Gaji
   ============================================================ */

const OwnerState = {
  tab: 'monitoring',
  monitorDate: todayStr(),
  historyEmployee: 'all',
  historyMonth: null, // 'YYYY-MM'
  periodOffset: 0,
  monitorTimer: null
};

function formatRupiah(n) {
  return 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
}

function dateToStr(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dateToStr(dt);
}

function getPeriodByOffset(offset) {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const day = now.getDate();
  let startMonth = day >= 26 ? month : month - 1;
  let startYear = year;
  if (startMonth < 0) { startMonth = 11; startYear--; }

  startMonth += offset;
  while (startMonth < 0) { startMonth += 12; startYear--; }
  while (startMonth > 11) { startMonth -= 12; startYear++; }

  const start = new Date(startYear, startMonth, 26);
  let endMonth = startMonth + 1, endYear = startYear;
  if (endMonth > 11) { endMonth = 0; endYear++; }
  const end = new Date(endYear, endMonth, 25);
  return { start, end, offset };
}

function periodLabel(period) {
  const label = `${formatTanggalIndo(dateToStr(period.start))} – ${formatTanggalIndo(dateToStr(period.end))}`;
  return period.offset === 0 ? label + ' (Periode Berjalan)' : label;
}

function bumpStatus(counts, status) {
  if (status === 'hadir') counts.hadir++;
  else if (status === 'izin') counts.izin++;
  else if (status === 'sakit') counts.sakit++;
  else counts.alpa++;
}

function computePayrollRow(userId, period) {
  const startS = dateToStr(period.start);
  const endS = dateToStr(period.end);
  const todayS = todayStr();
  const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };

  let cursor = startS;
  while (cursor <= endS && cursor <= todayS) {
    const rec = Storage.getRecordForDate(userId, cursor);
    if (rec) {
      bumpStatus(counts, rec.status);
    } else if (cursor < todayS) {
      counts.alpa++; // hari lampau tanpa data dianggap Alpa
    }
    cursor = addDaysStr(cursor, 1);
  }
  return counts;
}

/* ---------------- Shell & Tabs ---------------- */

function renderOwnerDashboard(user) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="min-h-screen bg-slate-50">
      <header class="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div class="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p class="text-xs text-slate-400">Panel Owner/Admin</p>
            <h1 class="text-lg font-bold text-slate-800">${escapeHtml(user.name)}</h1>
          </div>
          <button id="btn-logout" class="text-sm font-medium text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition">Keluar</button>
        </div>
        <nav class="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto no-scrollbar pb-2">
          ${tabButton('monitoring', 'Monitoring Hari Ini')}
          ${tabButton('karyawan', 'Data Karyawan')}
          ${tabButton('riwayat', 'Riwayat Absensi')}
          ${tabButton('laporan', 'Laporan Gaji')}
        </nav>
      </header>
      <main class="max-w-5xl mx-auto px-4 py-6">
        <div id="owner-content"></div>
      </main>
    </div>
    <div id="modal-root"></div>
  `;

  document.getElementById('btn-logout').addEventListener('click', () => {
    clearInterval(OwnerState.monitorTimer);
    Auth.logout();
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

function renderOwnerTab() {
  clearInterval(OwnerState.monitorTimer);
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === OwnerState.tab;
    btn.className = `tab-btn whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`;
  });

  if (OwnerState.tab === 'monitoring') renderMonitoringTab();
  else if (OwnerState.tab === 'karyawan') renderKaryawanTab();
  else if (OwnerState.tab === 'riwayat') renderRiwayatTab();
  else if (OwnerState.tab === 'laporan') renderLaporanTab();
}

/* ---------------- Modal helpers ---------------- */

function openModal(innerHtml) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="fixed inset-0 bg-slate-900/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" id="modal-overlay">
      <div class="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
        ${innerHtml}
      </div>
    </div>
  `;
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

/* ---------------- Tab: Monitoring Hari Ini ---------------- */

function renderMonitoringTab() {
  const container = document.getElementById('owner-content');
  const employees = Storage.getUsers().filter(u => u.role === 'karyawan');

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <div class="flex items-center gap-2">
        <label class="text-sm text-slate-500">Tanggal</label>
        <input type="date" id="monitor-date" value="${OwnerState.monitorDate}" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
      </div>
      <button id="btn-today" class="text-sm font-medium text-indigo-600 hover:underline w-fit">Hari ini</button>
      <span class="text-xs text-slate-400 sm:ml-auto">Diperbarui otomatis setiap 15 detik</span>
    </div>
    <div id="monitor-list" class="space-y-2"></div>
  `;

  document.getElementById('monitor-date').addEventListener('change', (e) => {
    OwnerState.monitorDate = e.target.value;
    renderMonitorList(employees);
  });
  document.getElementById('btn-today').addEventListener('click', () => {
    OwnerState.monitorDate = todayStr();
    document.getElementById('monitor-date').value = OwnerState.monitorDate;
    renderMonitorList(employees);
  });

  renderMonitorList(employees);
  OwnerState.monitorTimer = setInterval(() => renderMonitorList(employees), 15000);
}

function renderMonitorList(employees) {
  const list = document.getElementById('monitor-list');
  if (!list) return;
  const date = OwnerState.monitorDate;

  if (employees.length === 0) {
    list.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Belum ada data karyawan. Tambahkan di tab "Data Karyawan".</p>`;
    return;
  }

  list.innerHTML = employees.map(emp => {
    const rec = Storage.getRecordForDate(emp.id, date);
    let statusHtml;
    if (!rec) {
      statusHtml = `<span class="text-xs font-medium px-2.5 py-1 rounded-full border bg-slate-100 text-slate-500 border-slate-200">Belum Absen</span>`;
    } else {
      statusHtml = `<span class="text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_BADGE_CLASS[rec.status]}">${STATUS_LABEL[rec.status]}${rec.checkInTime ? ' · ' + rec.checkInTime : ''}</span>`;
    }
    return `
      <div class="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div>
          <p class="text-sm font-medium text-slate-700">${escapeHtml(emp.name)}</p>
          <p class="text-xs text-slate-400">@${escapeHtml(emp.username)}</p>
        </div>
        <div class="flex items-center gap-2">
          ${statusHtml}
          <button data-emp="${emp.id}" class="btn-set-status text-xs font-medium text-indigo-600 hover:underline">Ubah</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.btn-set-status').forEach(btn => {
    btn.addEventListener('click', () => openStatusModal(btn.dataset.emp, date));
  });
}

function openStatusModal(userId, date) {
  const emp = Storage.getUserById(userId);
  const rec = Storage.getRecordForDate(userId, date);
  const current = rec ? rec.status : 'hadir';
  const currentTime = rec && rec.checkInTime ? rec.checkInTime : nowTimeStr();

  openModal(`
    <div class="p-5">
      <h3 class="font-bold text-slate-800 mb-1">Ubah Status Absensi</h3>
      <p class="text-sm text-slate-500 mb-4">${escapeHtml(emp.name)} &middot; ${formatTanggalIndo(date)}</p>
      <form id="form-status" class="space-y-4">
        <div class="grid grid-cols-2 gap-2">
          ${['hadir', 'izin', 'sakit', 'alpa'].map(s => `
            <label class="flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50">
              <input type="radio" name="status" value="${s}" ${current === s ? 'checked' : ''} class="accent-indigo-600" />
              <span class="text-sm">${STATUS_LABEL[s]}</span>
            </label>
          `).join('')}
        </div>
        <div id="time-field">
          <label class="text-sm text-slate-500 block mb-1">Jam Masuk</label>
          <input type="time" name="checkInTime" value="${currentTime}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Catatan (opsional)</label>
          <textarea name="note" rows="2" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Contoh: Izin acara keluarga">${rec && rec.note ? escapeHtml(rec.note) : ''}</textarea>
        </div>
        <div class="flex gap-2 pt-2">
          <button type="button" id="btn-cancel" class="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 font-medium text-sm">Batal</button>
          <button type="submit" class="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700">Simpan</button>
        </div>
      </form>
    </div>
  `);

  const toggleTimeField = () => {
    const status = document.querySelector('input[name="status"]:checked').value;
    document.getElementById('time-field').style.display = status === 'hadir' ? 'block' : 'none';
  };
  document.querySelectorAll('input[name="status"]').forEach(r => r.addEventListener('change', toggleTimeField));
  toggleTimeField();

  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('form-status').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const status = fd.get('status');
    Storage.upsertAttendance({
      id: (rec && rec.id) || uid('att'),
      userId,
      date,
      status,
      checkInTime: status === 'hadir' ? fd.get('checkInTime') : null,
      note: fd.get('note') || '',
      updatedAt: Date.now()
    });
    closeModal();
    renderOwnerTab();
  });
}

/* ---------------- Tab: Data Karyawan ---------------- */

function renderKaryawanTab() {
  const container = document.getElementById('owner-content');
  const employees = Storage.getUsers().filter(u => u.role === 'karyawan');

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
              <th class="px-4 py-2.5 font-medium">Username</th>
              <th class="px-4 py-2.5 font-medium">Upah Harian</th>
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
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">Belum ada karyawan.</td></tr>`;
  } else {
    tbody.innerHTML = employees.map(emp => `
      <tr>
        <td class="px-4 py-2.5 text-slate-700">${escapeHtml(emp.name)}</td>
        <td class="px-4 py-2.5 text-slate-500">@${escapeHtml(emp.username)}</td>
        <td class="px-4 py-2.5 text-slate-700">${formatRupiah(emp.dailyWage)}</td>
        <td class="px-4 py-2.5 text-right">
          <button data-id="${emp.id}" class="btn-edit-emp text-indigo-600 hover:underline text-sm font-medium">Edit</button>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('btn-add-emp').addEventListener('click', () => openEmployeeModal(null));
  tbody.querySelectorAll('.btn-edit-emp').forEach(btn => {
    btn.addEventListener('click', () => openEmployeeModal(btn.dataset.id));
  });
}

function openEmployeeModal(userId) {
  const isEdit = !!userId;
  const emp = isEdit ? Storage.getUserById(userId) : null;

  openModal(`
    <div class="p-5">
      <h3 class="font-bold text-slate-800 mb-4">${isEdit ? 'Edit Karyawan' : 'Tambah Karyawan'}</h3>
      <form id="form-emp" class="space-y-3">
        <div>
          <label class="text-sm text-slate-500 block mb-1">Nama Lengkap</label>
          <input required name="name" value="${emp ? escapeHtml(emp.name) : ''}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Username</label>
          <input required name="username" value="${emp ? escapeHtml(emp.username) : ''}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Password ${isEdit ? '(kosongkan jika tidak diubah)' : ''}</label>
          <input type="text" name="password" ${isEdit ? '' : 'required'} class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Upah Harian (Rp)</label>
          <input required type="number" min="0" step="1000" name="dailyWage" value="${emp ? emp.dailyWage : ''}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
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
    document.getElementById('btn-delete-emp').addEventListener('click', () => {
      if (confirm(`Hapus karyawan "${emp.name}"? Riwayat absensinya akan tetap tersimpan.`)) {
        const users = Storage.getUsers().filter(u => u.id !== userId);
        Storage.saveUsers(users);
        closeModal();
        renderOwnerTab();
      }
    });
  }

  document.getElementById('form-emp').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name').trim();
    const username = fd.get('username').trim();
    const password = fd.get('password');
    const dailyWage = Number(fd.get('dailyWage'));
    const errorEl = document.getElementById('form-error');

    const dup = Storage.getUsers().find(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== userId);
    if (dup) {
      errorEl.textContent = 'Username sudah digunakan, gunakan username lain.';
      errorEl.classList.remove('hidden');
      return;
    }

    const record = isEdit ? { ...emp } : { id: uid('u'), role: 'karyawan', createdAt: Date.now() };
    record.name = name;
    record.username = username;
    record.dailyWage = dailyWage;
    if (!isEdit || password) record.password = password;

    Storage.upsertUser(record);
    closeModal();
    renderOwnerTab();
  });
}

/* ---------------- Tab: Riwayat Absensi ---------------- */

function renderRiwayatTab() {
  const container = document.getElementById('owner-content');
  const employees = Storage.getUsers().filter(u => u.role === 'karyawan');
  if (!OwnerState.historyMonth) {
    const d = new Date();
    OwnerState.historyMonth = d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row gap-3 mb-4">
      <div>
        <label class="text-sm text-slate-500 block mb-1">Karyawan</label>
        <select id="filter-emp" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-56">
          <option value="all">Semua Karyawan</option>
          ${employees.map(e => `<option value="${e.id}" ${OwnerState.historyEmployee === e.id ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="text-sm text-slate-500 block mb-1">Bulan</label>
        <input type="month" id="filter-month" value="${OwnerState.historyMonth}" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
      </div>
    </div>
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th class="px-4 py-2.5 font-medium">Tanggal</th>
              <th class="px-4 py-2.5 font-medium">Karyawan</th>
              <th class="px-4 py-2.5 font-medium">Status</th>
              <th class="px-4 py-2.5 font-medium">Jam Masuk</th>
              <th class="px-4 py-2.5 font-medium">Catatan</th>
            </tr>
          </thead>
          <tbody id="hist-tbody" class="divide-y divide-slate-100"></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('filter-emp').addEventListener('change', (e) => {
    OwnerState.historyEmployee = e.target.value;
    renderRiwayatTable(employees);
  });
  document.getElementById('filter-month').addEventListener('change', (e) => {
    OwnerState.historyMonth = e.target.value;
    renderRiwayatTable(employees);
  });

  renderRiwayatTable(employees);
}

function renderRiwayatTable(employees) {
  const tbody = document.getElementById('hist-tbody');
  const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]));
  const [y, m] = OwnerState.historyMonth.split('-');

  let records = Storage.getAttendance().filter(r => r.date.startsWith(`${y}-${m}`));
  if (OwnerState.historyEmployee !== 'all') {
    records = records.filter(r => r.userId === OwnerState.historyEmployee);
  }
  records.sort((a, b) => b.date.localeCompare(a.date));

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">Tidak ada data pada periode ini.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(r => `
    <tr>
      <td class="px-4 py-2.5 text-slate-700">${formatTanggalIndo(r.date)}</td>
      <td class="px-4 py-2.5 text-slate-700">${escapeHtml(empMap[r.userId] || '-')}</td>
      <td class="px-4 py-2.5"><span class="text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_BADGE_CLASS[r.status]}">${STATUS_LABEL[r.status]}</span></td>
      <td class="px-4 py-2.5 text-slate-500">${r.checkInTime || '-'}</td>
      <td class="px-4 py-2.5 text-slate-500">${escapeHtml(r.note || '-')}</td>
    </tr>
  `).join('');
}

/* ---------------- Tab: Laporan Gaji ---------------- */

function renderLaporanTab() {
  const container = document.getElementById('owner-content');
  const employees = Storage.getUsers().filter(u => u.role === 'karyawan');

  const periodOptions = [];
  for (let i = 0; i >= -11; i--) periodOptions.push(getPeriodByOffset(i));

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <div class="flex-1">
        <label class="text-sm text-slate-500 block mb-1">Periode Penggajian (26 &ndash; 25)</label>
        <select id="filter-period" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-96">
          ${periodOptions.map(p => `<option value="${p.offset}" ${OwnerState.periodOffset === p.offset ? 'selected' : ''}>${periodLabel(p)}</option>`).join('')}
        </select>
      </div>
      <button id="btn-export" class="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 h-fit">Download CSV</button>
    </div>
    <p class="text-xs text-slate-400 mb-4">Laporan dihitung otomatis dari data absensi. Hari tanpa keterangan pada periode berjalan dianggap Alpa.</p>
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
    renderPayrollTable(employees);
  });
  document.getElementById('btn-export').addEventListener('click', () => exportPayrollCsv(employees));

  renderPayrollTable(employees);
}

function renderPayrollTable(employees) {
  const period = getPeriodByOffset(OwnerState.periodOffset);
  const tbody = document.getElementById('payroll-tbody');
  const tfoot = document.getElementById('payroll-tfoot');

  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Belum ada karyawan.</td></tr>`;
    tfoot.innerHTML = '';
    return;
  }

  let grandTotal = 0;
  tbody.innerHTML = employees.map(emp => {
    const c = computePayrollRow(emp.id, period);
    const total = c.hadir * emp.dailyWage;
    grandTotal += total;
    return `
      <tr>
        <td class="px-4 py-2.5 text-slate-700">${escapeHtml(emp.name)}</td>
        <td class="px-4 py-2.5 text-center text-emerald-700 font-medium">${c.hadir}</td>
        <td class="px-4 py-2.5 text-center text-amber-700">${c.izin}</td>
        <td class="px-4 py-2.5 text-center text-sky-700">${c.sakit}</td>
        <td class="px-4 py-2.5 text-center text-rose-700">${c.alpa}</td>
        <td class="px-4 py-2.5 text-right text-slate-500">${formatRupiah(emp.dailyWage)}</td>
        <td class="px-4 py-2.5 text-right text-slate-800 font-semibold">${formatRupiah(total)}</td>
      </tr>
    `;
  }).join('');

  tfoot.innerHTML = `
    <tr>
      <td class="px-4 py-3" colspan="6">Total Gaji Seluruh Karyawan</td>
      <td class="px-4 py-3 text-right text-indigo-700">${formatRupiah(grandTotal)}</td>
    </tr>
  `;
}

function exportPayrollCsv(employees) {
  const period = getPeriodByOffset(OwnerState.periodOffset);
  const rows = [['Nama', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Upah Harian', 'Total Gaji']];
  employees.forEach(emp => {
    const c = computePayrollRow(emp.id, period);
    const total = c.hadir * emp.dailyWage;
    rows.push([emp.name, c.hadir, c.izin, c.sakit, c.alpa, emp.dailyWage, total]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `laporan-gaji_${dateToStr(period.start)}_${dateToStr(period.end)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
