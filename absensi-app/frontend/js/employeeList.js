/* ============================================================
   employeeList.js — Tab "Daftar Karyawan" (Owner)
   Tabel data induk karyawan dengan foto, pencarian, pengurutan,
   pagination, dan unduh CSV. Pencarian & pagination dilakukan di
   browser atas data yang sudah dimuat — jumlah karyawan sebuah
   CV muat semua sekaligus, jadi tidak perlu pagination server.
   ============================================================ */

const EmployeeListState = {
  search: '',
  sort: { key: 'name', dir: 'asc' },
  page: 1,
  perPage: 10
};

const EMPLOYEE_SORT_KEYS = {
  name: emp => emp.name || '',
  job: emp => (emp.job ? emp.job.name : ''),
  organization: emp => (emp.organization ? emp.organization.name : ''),
  wage: emp => (typeof emp.dailyWage === 'number' ? emp.dailyWage : null),
  joinDate: emp => emp.joinDate || '',
  birthDate: emp => emp.birthDate || '',
  status: emp => (emp.active ? 'Aktif' : 'Nonaktif')
};

const PER_PAGE_OPTIONS = [10, 25, 50];

const AVATAR_PALETTE = [
  'bg-klc-100 text-klc-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700'
];

function employeeInitials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0] || '')
    .join('')
    .toUpperCase() || '?';
}

function employeeAvatarHtml(emp, sizeClass) {
  const size = sizeClass || 'w-9 h-9';
  if (emp.hasPhoto) {
    // ?v= memakai photoVersion supaya foto yang baru diganti tidak tertutup cache
    return `<img src="/api/employees/${emp.id}/photo?v=${emp.photoVersion || 0}" alt="" class="${size} rounded-full object-cover bg-slate-100 shrink-0" />`;
  }
  let hash = 0;
  for (const ch of String(emp.name || '')) hash = (hash + ch.charCodeAt(0)) % AVATAR_PALETTE.length;
  return `<div class="${size} rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${AVATAR_PALETTE[hash]}">${escapeHtml(employeeInitials(emp.name))}</div>`;
}

function filterEmployees(employees, search) {
  const term = search.trim().toLowerCase();
  if (!term) return employees;
  return employees.filter(emp => {
    const haystack = [
      emp.name,
      emp.employeeCode,
      emp.job ? emp.job.name : '',
      emp.organization ? emp.organization.name : ''
    ].join(' ').toLowerCase();
    return haystack.includes(term);
  });
}

function renderEmployeeListTab(employees) {
  const container = document.getElementById('owner-content');

  const filtered = filterEmployees(employees, EmployeeListState.search);
  const readValue = EMPLOYEE_SORT_KEYS[EmployeeListState.sort.key] || EMPLOYEE_SORT_KEYS.name;
  const sorted = sortRows(filtered, readValue, EmployeeListState.sort.dir);

  const totalPages = Math.max(1, Math.ceil(sorted.length / EmployeeListState.perPage));
  // Dijepit supaya tabel tidak pernah tampil kosong hanya karena halaman aktif
  // sudah di luar rentang setelah data menyusut (karyawan dihapus / difilter).
  if (EmployeeListState.page > totalPages) EmployeeListState.page = totalPages;
  const start = (EmployeeListState.page - 1) * EmployeeListState.perPage;
  const pageRows = sorted.slice(start, start + EmployeeListState.perPage);

  const header = (key, label, className) => sortableHeaderHtml({
    state: EmployeeListState.sort,
    key,
    label,
    className,
    buttonClass: 'emp-sort'
  });

  container.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="px-4 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center gap-3">
        <div>
          <h2 class="font-semibold text-slate-800">Daftar Karyawan</h2>
          <p class="text-xs text-slate-400 mt-0.5">Menampilkan ${sorted.length} dari ${employees.length} karyawan</p>
        </div>
        <div class="flex flex-col sm:flex-row gap-2 lg:ml-auto">
          <input id="emp-search" type="search" value="${escapeHtml(EmployeeListState.search)}" placeholder="Cari nama, kode, jabatan..." class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full sm:w-64" />
          <button id="btn-emp-download" class="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 whitespace-nowrap">Download</button>
          <button id="btn-add-emp" class="px-4 py-2 rounded-lg bg-klc-600 text-white text-sm font-medium hover:bg-klc-700 whitespace-nowrap">+ Tambah Karyawan</button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm table-zebra">
          <thead class="bg-slate-50 text-slate-500 text-left">
            <tr>
              ${header('name', 'Nama Karyawan')}
              ${header('job', 'Jabatan')}
              ${header('organization', 'Divisi')}
              ${header('wage', 'Upah Harian')}
              ${header('joinDate', 'Tanggal Masuk')}
              ${header('birthDate', 'Tanggal Lahir')}
              ${header('status', 'Status')}
              <th class="px-4 py-2.5 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody id="emp-tbody" class="divide-y divide-slate-100"></tbody>
        </table>
      </div>

      <div class="px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
        <div class="flex items-center gap-2">
          <label for="emp-per-page" class="text-slate-500">Baris per halaman</label>
          <select id="emp-per-page" class="border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white">
            ${PER_PAGE_OPTIONS.map(n => `<option value="${n}" ${EmployeeListState.perPage === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
        <p class="text-slate-500">${sorted.length === 0 ? 'Tidak ada data' : `Menampilkan ${start + 1}–${start + pageRows.length} dari ${sorted.length}`}</p>
        <div class="flex items-center gap-2 sm:ml-auto">
          <button id="btn-emp-prev" class="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 disabled:text-slate-300 disabled:border-slate-200" ${EmployeeListState.page <= 1 ? 'disabled' : ''}>&lsaquo;</button>
          <span class="text-slate-500">Halaman ${EmployeeListState.page} dari ${totalPages}</span>
          <button id="btn-emp-next" class="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 disabled:text-slate-300 disabled:border-slate-200" ${EmployeeListState.page >= totalPages ? 'disabled' : ''}>&rsaquo;</button>
        </div>
      </div>
    </div>
  `;

  const tbody = document.getElementById('emp-tbody');
  if (pageRows.length === 0) {
    const mencari = EmployeeListState.search.trim();
    const isi = mencari
      ? keadaanKosongHtml({
          judul: 'Tidak ada yang cocok',
          pesan: `Tidak ada karyawan yang namanya, kodenya, atau jabatannya mengandung "${mencari}". Coba kata kunci yang lebih pendek.`
        })
      : keadaanKosongHtml({
          judul: 'Belum ada karyawan',
          pesan: 'Daftar ini terisi setelah karyawan pertama ditambahkan. Absensi dan laporan gaji ikut memakai daftar yang sama.',
          aksiLabel: '+ Tambah Karyawan',
          aksiSelector: '#btn-add-emp'
        });
    tbody.innerHTML = `<tr><td colspan="7">${isi}</td></tr>`;
    pasangAksiKosong(tbody);
  } else {
    tbody.innerHTML = pageRows.map(emp => {
      const birthday = isBirthdayToday(emp.birthDate);
      return `
        <tr class="${birthday ? 'bg-amber-50' : ''}">
          <td class="px-4 py-2.5">
            <div class="flex items-center gap-3">
              ${employeeAvatarHtml(emp)}
              <div class="min-w-0">
                <p class="text-slate-700 truncate">${escapeHtml(emp.name)}${birthday ? ' ' + IKON_KUE_ULTAH : ''}</p>
                <p class="text-xs text-slate-400 font-mono">${escapeHtml(emp.employeeCode || '—')}</p>
              </div>
            </div>
          </td>
          <td class="px-4 py-2.5 text-slate-600">${emp.job ? escapeHtml(emp.job.name) : '—'}</td>
          <td class="px-4 py-2.5 text-slate-600">${emp.organization ? escapeHtml(emp.organization.name) : '—'}</td>
          <td class="px-4 py-2.5 text-slate-700">${formatRupiah(emp.dailyWage)}</td>
          <td class="px-4 py-2.5 text-slate-500">${emp.joinDate ? formatTanggalIndo(emp.joinDate) : '—'}</td>
          <td class="px-4 py-2.5 text-slate-500">${emp.birthDate ? formatTanggalIndo(emp.birthDate) : '—'}</td>
          <td class="px-4 py-2.5">
            <span class="text-xs font-medium px-2.5 py-1 rounded-full border ${emp.active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}">${emp.active ? 'Aktif' : 'Nonaktif'}</span>
          </td>
          <td class="px-4 py-2.5 text-right">
            <button data-id="${emp.id}" class="btn-edit-emp text-slate-600 hover:text-klc-600 hover:underline text-sm font-medium">Edit</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  const rerender = () => renderEmployeeListTab(employees);

  container.querySelectorAll('.emp-sort').forEach(btn => {
    btn.addEventListener('click', () => {
      EmployeeListState.sort = nextSortState(EmployeeListState.sort, btn.dataset.sort);
      rerender();
    });
  });

  const searchInput = document.getElementById('emp-search');
  searchInput.addEventListener('input', (e) => {
    EmployeeListState.search = e.target.value;
    // Kembali ke halaman 1: tanpa ini hasil pencarian bisa tampak kosong
    // hanya karena tampilan masih berada di halaman yang sudah tidak ada.
    EmployeeListState.page = 1;
    rerender();
    const refocused = document.getElementById('emp-search');
    refocused.focus();
    refocused.setSelectionRange(refocused.value.length, refocused.value.length);
  });

  document.getElementById('emp-per-page').addEventListener('change', (e) => {
    EmployeeListState.perPage = Number(e.target.value);
    EmployeeListState.page = 1;
    rerender();
  });

  document.getElementById('btn-emp-prev').addEventListener('click', () => {
    if (EmployeeListState.page > 1) { EmployeeListState.page--; rerender(); }
  });
  document.getElementById('btn-emp-next').addEventListener('click', () => {
    if (EmployeeListState.page < totalPages) { EmployeeListState.page++; rerender(); }
  });

  // Mengunduh SELURUH hasil pencarian, bukan hanya halaman yang tampak —
  // pengguna yang mencari "Accounting" lalu menekan Download hampir pasti
  // memaksudkan semua yang cocok, bukan 10 baris pertama.
  document.getElementById('btn-emp-download').addEventListener('click', () => exportEmployeeCsv(sorted));

  document.getElementById('btn-add-emp').addEventListener('click', () => openEmployeeModal(null));
  tbody.querySelectorAll('.btn-edit-emp').forEach(btn => {
    btn.addEventListener('click', () => openEmployeeModal(btn.dataset.id));
  });
}

function exportEmployeeCsv(rows) {
  const csvRows = [['Employee ID', 'Nama', 'Jabatan', 'Divisi', 'Upah Harian', 'Tanggal Masuk', 'Tanggal Lahir', 'Status', 'Catatan']];
  rows.forEach(emp => {
    csvRows.push([
      emp.employeeCode || '',
      emp.name,
      emp.job ? emp.job.name : '',
      emp.organization ? emp.organization.name : '',
      emp.dailyWage,
      emp.joinDate || '',
      emp.birthDate || '',
      emp.active ? 'Aktif' : 'Nonaktif',
      // Catatan tidak ditampilkan di tabel (bisa panjang dan membuat baris
      // tinggi), tapi ikut di unduhan supaya tidak hilang begitu saja.
      emp.notes || ''
    ]);
  });

  const csv = csvRows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daftar-karyawan_${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
