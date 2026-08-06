/* ============================================================
   checklist.js — Komponen bersama HR Admin & Owner
   Ceklis kehadiran, modal absensi, riwayat, banner ulang tahun,
   jam header berjalan. Tidak ada apa pun soal upah di sini.
   ============================================================ */

const STATUS_LABEL = {
  hadir: 'Hadir',
  izin: 'Izin',
  sakit: 'Sakit',
  alpa: 'Alpa'
};

const STATUS_BADGE_CLASS = {
  hadir: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  izin: 'bg-amber-100 text-amber-700 border-amber-200',
  sakit: 'bg-sky-100 text-sky-700 border-sky-200',
  alpa: 'bg-rose-100 text-rose-700 border-rose-200'
};

const ATTENDANCE_TYPE_LABEL = {
  full: 'Full Day',
  half: 'Setengah Hari',
  custom: 'Jam Tertentu'
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* ---------------- Modal helpers (dipakai juga oleh owner.js) ---------------- */

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
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

/* ---------------- Jam & tanggal berjalan di header ---------------- */

const ClockState = { timer: null };

function startHeaderClock(clockElId) {
  stopHeaderClock();
  const el = document.getElementById(clockElId);
  if (!el) return;
  const tick = () => {
    const now = new Date();
    const time = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
    el.innerHTML = `<span class="font-mono font-semibold text-slate-700">${time}</span> <span class="text-slate-300">&middot;</span> <span class="text-slate-500">${formatHariTanggalIndo(now)}</span>`;
  };
  tick();
  ClockState.timer = setInterval(tick, 1000);
}

function stopHeaderClock() {
  if (ClockState.timer) clearInterval(ClockState.timer);
  ClockState.timer = null;
}

/* ---------------- Banner ulang tahun ---------------- */

function renderBirthdayBanner(containerEl, employees) {
  if (!containerEl) return;
  const birthdayPeople = employees.filter(e => isBirthdayToday(e.birthDate));
  if (birthdayPeople.length === 0) {
    containerEl.innerHTML = '';
    return;
  }
  const names = birthdayPeople.map(e => escapeHtml(e.name)).join(', ');
  containerEl.innerHTML = `
    <div class="rounded-xl bg-gradient-to-r from-pink-500 to-amber-400 text-white px-4 py-3 mb-4 flex items-center gap-3 shadow-sm">
      <span class="text-2xl">🎉</span>
      <p class="text-sm font-medium">Hari ini ulang tahun: <span class="font-bold">${names}</span> — jangan lupa ucapkan selamat!</p>
    </div>
  `;
}

/* ---------------- Ceklis kehadiran (Monitoring) ---------------- */

function formatKeterangan(rec) {
  if (!rec) return '-';
  if (rec.status === 'hadir') {
    // Jam pulang yang belum dicatat ditulis apa adanya, bukan strip kosong —
    // strip gampang disalahartikan sebagai "pulang tepat waktu".
    const pulang = rec.checkOutTime ? escapeHtml(rec.checkOutTime) : '<span class="text-slate-400">pulang belum dicatat</span>';
    const detail = `${ATTENDANCE_TYPE_LABEL[rec.attendanceType]} · ${rec.checkInTime} → ${pulang}`;
    return rec.note ? `${detail} · ${escapeHtml(rec.note)}` : detail;
  }
  return rec.note ? `${STATUS_LABEL[rec.status]} – ${escapeHtml(rec.note)}` : STATUS_LABEL[rec.status];
}

/* ---------------- Pengurutan tabel monitoring ---------------- */

// Disimpan di tingkat modul, bukan di dalam fungsi render, supaya pilihan
// urutan tidak hilang saat tabel di-render ulang otomatis tiap 15 detik.
// Hanya satu dashboard aktif pada satu waktu, jadi satu status bersama
// untuk HR dan Owner sudah cukup.
const MonitorSortState = { key: 'no', dir: 'asc' };

const MONITOR_SORT_KEYS = {
  code: emp => emp.employeeCode || '',
  name: emp => emp.name || '',
  job: emp => (emp.job ? emp.job.name : ''),
  organization: emp => (emp.organization ? emp.organization.name : '')
};

function sortEmployeesForMonitor(employees) {
  const { key, dir } = MonitorSortState;
  // 'no' bukan nilai data, melainkan urutan asli dari server
  if (key === 'no') {
    const rows = employees.slice();
    return dir === 'asc' ? rows : rows.reverse();
  }

  const readValue = MONITOR_SORT_KEYS[key];
  if (!readValue) return employees.slice();
  return sortRows(employees, readValue, dir);
}

function monitorSortableHeader(key, label, extraClass) {
  return sortableHeaderHtml({
    state: MonitorSortState,
    key,
    label,
    className: extraClass,
    buttonClass: 'monitor-sort'
  });
}

async function renderMonitoringList(containerEl, employees, date, accountName) {
  if (!containerEl) return;

  if (employees.length === 0) {
    containerEl.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Belum ada data karyawan.</p>`;
    return;
  }

  containerEl.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Memuat...</p>`;

  let records;
  try {
    records = await Storage.getAttendanceForDate(date);
  } catch (err) {
    containerEl.innerHTML = `<p class="text-sm text-rose-500 text-center py-8">Gagal memuat data: ${escapeHtml(err.message)}</p>`;
    return;
  }
  const recordByEmployee = new Map(records.map(r => [String(r.employeeId), r]));
  const unmarked = employees.filter(emp => !recordByEmployee.has(String(emp.id)));
  const sortedEmployees = sortEmployeesForMonitor(employees);

  containerEl.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-left">
            <tr>
              ${monitorSortableHeader('no', 'No', 'w-16')}
              <th class="px-4 py-2.5 font-medium">
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" id="check-all-header" class="accent-klc-600" ${unmarked.length === 0 ? 'disabled' : ''} />
                  Checklist All
                </label>
              </th>
              ${monitorSortableHeader('code', 'Employee ID')}
              ${monitorSortableHeader('name', 'Nama Karyawan')}
              ${monitorSortableHeader('job', 'Job')}
              ${monitorSortableHeader('organization', 'Organization')}
              <th class="px-4 py-2.5 font-medium">Absen</th>
              <th class="px-4 py-2.5 font-medium">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${sortedEmployees.map((emp, index) => {
              const rec = recordByEmployee.get(String(emp.id)) || null;
              const birthdayBadge = isBirthdayToday(emp.birthDate) ? ' <span title="Ulang tahun hari ini">🎂</span>' : '';
              const statusBadge = rec
                ? `<span class="text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_BADGE_CLASS[rec.status]}">${STATUS_LABEL[rec.status]}</span>`
                : `<span class="text-xs font-medium px-2.5 py-1 rounded-full border bg-slate-100 text-slate-500 border-slate-200">Belum Absen</span>`;
              return `
                <tr class="border-t border-slate-100">
                  <td class="px-4 py-2.5 text-slate-400">${index + 1}</td>
                  <td class="px-4 py-2.5">
                    <input type="checkbox" data-emp="${emp.id}" class="row-checkbox accent-klc-600" ${rec ? 'checked' : ''} />
                  </td>
                  <td class="px-4 py-2.5 text-slate-500 font-mono text-xs">${escapeHtml(emp.employeeCode || '—')}</td>
                  <td class="px-4 py-2.5 text-slate-700">${escapeHtml(emp.name)}${birthdayBadge}</td>
                  <td class="px-4 py-2.5 text-slate-600">${emp.job ? escapeHtml(emp.job.name) : '—'}</td>
                  <td class="px-4 py-2.5 text-slate-600">${emp.organization ? escapeHtml(emp.organization.name) : '—'}</td>
                  <td class="px-4 py-2.5">${statusBadge}</td>
                  <td class="px-4 py-2.5 text-slate-500">${formatKeterangan(rec)}</td>
                </tr>
                <tr class="panel-row hidden" data-panel-for="${emp.id}">
                  <td colspan="8" class="px-4 pb-4 bg-slate-50">
                    <div class="panel-content" data-panel-content="${emp.id}"></div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  containerEl.querySelectorAll('.monitor-sort').forEach(btn => {
    btn.addEventListener('click', () => {
      Object.assign(MonitorSortState, nextSortState(MonitorSortState, btn.dataset.sort));
      renderMonitoringList(containerEl, employees, date, accountName);
    });
  });

  containerEl.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('click', () => {
      const empId = cb.dataset.emp;
      const emp = employees.find(e => String(e.id) === empId);
      const rec = recordByEmployee.get(empId) || null;
      const panelRow = containerEl.querySelector(`tr[data-panel-for="${empId}"]`);
      const wasHidden = panelRow.classList.contains('hidden');

      containerEl.querySelectorAll('.panel-row').forEach(r => r.classList.add('hidden'));
      cb.checked = !!rec; // checkbox mencerminkan status data, bukan toggle manual

      if (wasHidden) {
        panelRow.classList.remove('hidden');
        const panelContent = panelRow.querySelector('.panel-content');
        renderAttendancePanel(panelContent, emp, rec, date, accountName, () => renderMonitoringList(containerEl, employees, date, accountName));
      }
    });
  });

  const headerCheckbox = document.getElementById('check-all-header');
  if (headerCheckbox && unmarked.length > 0) {
    headerCheckbox.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm(
        `Tandai ${unmarked.length} karyawan yang belum absen sebagai Hadir (Full Day) dengan jam saat ini?\n\n` +
        `Tindakan ini tercatat di Log Perubahan atas nama ${accountName}.`
      )) return;
      headerCheckbox.disabled = true;
      try {
        // Satu permintaan untuk seluruh rombongan, bukan N permintaan terpisah:
        // server jadi tahu ini benar-benar satu tindakan massal dan bisa
        // mencatatnya sebagai satu peristiwa di log.
        await Storage.bulkMarkAttendance(date, unmarked.map(emp => emp.id));
      } catch (err) {
        alert(`Gagal menandai semua: ${err.message}`);
      }
      renderMonitoringList(containerEl, employees, date, accountName);
    });
  }
}

function renderAttendancePanel(containerEl, emp, rec, date, accountName, onSaved) {
  const currentStatus = rec ? rec.status : 'hadir';
  const currentType = (rec && rec.attendanceType) || 'full';
  const currentHours = rec && rec.hoursWorked != null ? rec.hoursWorked : '';

  containerEl.innerHTML = `
    <div class="border border-slate-200 rounded-xl bg-white p-4 mt-1">
      <p class="text-xs text-slate-400 mb-3">Ceklis kehadiran — ${escapeHtml(emp.name)} &middot; ${formatTanggalIndo(date)}</p>

      ${rec && rec.status === 'hadir' ? `
        <div class="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
          <div class="text-sm">
            <span class="text-slate-500">Jam masuk</span>
            <span class="font-mono text-slate-700 ml-1">${escapeHtml(rec.checkInTime || '—')}</span>
            <span class="text-slate-300 mx-1.5">&middot;</span>
            <span class="text-slate-500">Jam pulang</span>
            <span class="font-mono ${rec.checkOutTime ? 'text-slate-700' : 'text-slate-400'} ml-1">${rec.checkOutTime ? escapeHtml(rec.checkOutTime) : 'belum dicatat'}</span>
          </div>
          <button type="button" class="btn-check-out px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 ml-auto">
            ${rec.checkOutTime ? 'Perbarui Jam Pulang' : 'Catat Jam Pulang'}
          </button>
        </div>
      ` : ''}

      <form class="space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-lg">
          ${['hadir', 'izin', 'sakit', 'alpa'].map(s => `
            <label class="flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer has-[:checked]:border-klc-500 has-[:checked]:bg-klc-50">
              <input type="radio" name="status" value="${s}" ${currentStatus === s ? 'checked' : ''} class="accent-klc-600" />
              <span class="text-sm">${STATUS_LABEL[s]}</span>
            </label>
          `).join('')}
        </div>

        <div class="hadir-fields space-y-3">
          <div>
            <label class="text-sm text-slate-500 block mb-1">Tipe Kehadiran</label>
            <div class="grid grid-cols-3 gap-2 max-w-sm">
              ${['full', 'half', 'custom'].map(t => `
                <label class="flex items-center justify-center gap-1 border rounded-lg px-2 py-2 cursor-pointer text-xs has-[:checked]:border-klc-500 has-[:checked]:bg-klc-50">
                  <input type="radio" name="attendanceType" value="${t}" ${currentType === t ? 'checked' : ''} class="accent-klc-600" />
                  <span>${ATTENDANCE_TYPE_LABEL[t]}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div class="custom-hours-field ${currentType === 'custom' ? '' : 'hidden'} max-w-xs">
            <label class="text-sm text-slate-500 block mb-1">Jumlah Jam Kerja</label>
            <input type="number" name="customHours" min="0.5" step="0.5" value="${currentType === 'custom' ? currentHours : ''}" placeholder="Contoh: 3 — boleh lebih dari 8 untuk lembur" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div class="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500 max-w-sm">
            Jam masuk diambil dari jam server saat disimpan (perkiraan sekarang <span class="font-mono font-semibold text-slate-700">${nowTimeStr()}</span>) — tidak bisa diketik manual.
          </div>
        </div>

        <div class="max-w-sm">
          <label class="text-sm text-slate-500 block mb-1">Catatan (opsional)</label>
          <textarea name="note" rows="2" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Contoh: Izin acara keluarga">${rec && rec.note ? escapeHtml(rec.note) : ''}</textarea>
        </div>

        ${rec ? `
          <div class="max-w-sm">
            <label class="text-sm text-slate-500 block mb-1">Alasan koreksi <span class="text-rose-600">*</span></label>
            <input type="text" name="reason" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Contoh: salah centang, yang bersangkutan izin" />
            <p class="text-xs text-slate-400 mt-1">Hari ini sudah tercatat, jadi perubahannya masuk Log Perubahan atas nama ${escapeHtml(accountName)}.</p>
          </div>
        ` : ''}

        <p class="form-error text-sm text-rose-600 hidden"></p>
        <div class="flex gap-2 pt-1 max-w-sm">
          <button type="button" class="btn-close-panel flex-1 py-2 rounded-lg border border-slate-300 text-slate-600 font-medium text-sm">Tutup</button>
          <button type="submit" class="flex-1 py-2 rounded-lg bg-klc-600 text-white font-medium text-sm hover:bg-klc-700">Simpan</button>
        </div>
      </form>
    </div>
  `;

  const form = containerEl.querySelector('form');

  const checkOutBtn = containerEl.querySelector('.btn-check-out');
  if (checkOutBtn) {
    checkOutBtn.addEventListener('click', async () => {
      checkOutBtn.disabled = true;
      try {
        await Storage.recordCheckOut(emp.id, date);
        onSaved(); // render ulang supaya jam pulang yang baru langsung tampak
      } catch (err) {
        alert(`Gagal mencatat jam pulang: ${err.message}`);
        checkOutBtn.disabled = false;
      }
    });
  }

  const toggleHadirFields = () => {
    const status = form.querySelector('input[name="status"]:checked').value;
    form.querySelector('.hadir-fields').style.display = status === 'hadir' ? 'block' : 'none';
  };
  form.querySelectorAll('input[name="status"]').forEach(r => r.addEventListener('change', toggleHadirFields));
  toggleHadirFields();

  const toggleCustomHours = () => {
    const type = form.querySelector('input[name="attendanceType"]:checked')?.value;
    form.querySelector('.custom-hours-field').classList.toggle('hidden', type !== 'custom');
  };
  form.querySelectorAll('input[name="attendanceType"]').forEach(r => r.addEventListener('change', toggleCustomHours));
  toggleCustomHours();

  form.querySelector('.btn-close-panel').addEventListener('click', () => {
    containerEl.closest('.panel-row').classList.add('hidden');
  });

  /* Tombol simpan dimatikan selama alasan kosong, supaya penolakan tidak baru
     muncul setelah dikirim -- pengguna sudah terlanjur mengisi seluruh form.
     Server tetap memvalidasi ulang; ini kemudahan, bukan pengaman. */
  const reasonInput = form.querySelector('input[name="reason"]');
  if (reasonInput) {
    const submitBtn = form.querySelector('button[type="submit"]');
    const syncSubmitState = () => {
      const empty = !reasonInput.value.trim();
      submitBtn.disabled = empty;
      submitBtn.classList.toggle('opacity-50', empty);
      submitBtn.classList.toggle('cursor-not-allowed', empty);
    };
    reasonInput.addEventListener('input', syncSubmitState);
    syncSubmitState();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const status = fd.get('status');
    const errorEl = form.querySelector('.form-error');
    errorEl.classList.add('hidden');

    let attendanceType = null, hoursWorked = null;
    if (status === 'hadir') {
      attendanceType = fd.get('attendanceType') || 'full';
      if (attendanceType === 'full') hoursWorked = 8;
      else if (attendanceType === 'half') hoursWorked = 4;
      else {
        hoursWorked = Number(fd.get('customHours'));
        if (!hoursWorked || hoursWorked <= 0) {
          errorEl.textContent = 'Jumlah jam kerja harus lebih dari 0.';
          errorEl.classList.remove('hidden');
          return;
        }
      }
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await Storage.upsertAttendance({
        employeeId: emp.id,
        date,
        status,
        attendanceType,
        hoursWorked,
        note: fd.get('note') || '',
        reason: fd.get('reason') || ''
      });
      if (onSaved) onSaved();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });
}

/* ---------------- Riwayat Absensi ---------------- */

function renderHistoryTable(containerEl, employees, state) {
  if (!containerEl) return;
  if (!state.month) {
    const d = new Date();
    state.month = d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }
  if (!state.employeeId) state.employeeId = 'all';

  containerEl.innerHTML = `
    <div class="flex flex-col sm:flex-row gap-3 mb-4">
      <div>
        <label class="text-sm text-slate-500 block mb-1">Karyawan</label>
        <select id="filter-emp" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-56">
          <option value="all">Semua Karyawan</option>
          ${employees.map(e => `<option value="${e.id}" ${state.employeeId === String(e.id) ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="text-sm text-slate-500 block mb-1">Bulan</label>
        <input type="month" id="filter-month" value="${state.month}" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
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
              <th class="px-4 py-2.5 font-medium">Tipe</th>
              <th class="px-4 py-2.5 font-medium">Jam Kerja</th>
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
    state.employeeId = e.target.value;
    renderHistoryRows(state);
  });
  document.getElementById('filter-month').addEventListener('change', (e) => {
    state.month = e.target.value;
    renderHistoryRows(state);
  });

  renderHistoryRows(state);
}

async function renderHistoryRows(state) {
  const tbody = document.getElementById('hist-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Memuat...</td></tr>`;

  let records;
  try {
    records = await Storage.getAttendanceHistory({
      employeeId: state.employeeId === 'all' ? undefined : state.employeeId,
      month: state.month
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-rose-500">Gagal memuat data: ${escapeHtml(err.message)}</td></tr>`;
    return;
  }

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">Tidak ada data pada periode ini.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(r => `
    <tr>
      <td class="px-4 py-2.5 text-slate-700">${formatTanggalIndo(r.date)}</td>
      <td class="px-4 py-2.5 text-slate-700">${escapeHtml(r.employeeName || '-')}</td>
      <td class="px-4 py-2.5"><span class="text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_BADGE_CLASS[r.status]}">${STATUS_LABEL[r.status]}</span></td>
      <td class="px-4 py-2.5 text-slate-500">${r.attendanceType ? ATTENDANCE_TYPE_LABEL[r.attendanceType] : '-'}</td>
      <td class="px-4 py-2.5 text-slate-500">${r.hoursWorked != null ? r.hoursWorked + ' jam' : '-'}</td>
      <td class="px-4 py-2.5 text-slate-500">${r.checkInTime || '-'}</td>
      <td class="px-4 py-2.5 text-slate-500">${escapeHtml(r.note || '-')}</td>
    </tr>
  `).join('');
}
