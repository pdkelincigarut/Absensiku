/* ============================================================
   schedules.js — Tab "Jadwal & Libur" (Owner)
   Jadwal kerja berversi (baku perusahaan + pengecualian per
   karyawan) dan daftar hari libur. Keduanya menentukan hari
   mana yang dihitung sebagai hari kerja di Laporan Gaji.
   ============================================================ */

const DAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const SchedulesState = { holidayYear: String(new Date().getFullYear()) };

function formatWorkDays(workDays) {
  return String(workDays)
    .split(',')
    .filter(s => s !== '')
    .map(n => DAY_LABELS[Number(n)])
    .join(', ');
}

function scheduleSummary(s) {
  return `${formatWorkDays(s.workDays)} &middot; ${escapeHtml(s.startTime)}&ndash;${escapeHtml(s.endTime)}`;
}

async function renderSchedulesTab() {
  const container = document.getElementById('owner-content');
  container.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Memuat...</p>`;

  let schedules, holidays, employees;
  try {
    [schedules, holidays, employees] = await Promise.all([
      Storage.getWorkSchedules(),
      Storage.getHolidays(SchedulesState.holidayYear),
      Storage.getEmployees()
    ]);
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-rose-500 text-center py-8">Gagal memuat data: ${escapeHtml(err.message)}</p>`;
    return;
  }

  // Penanda dari server. Jangan menebaknya dari effective_from: owner yang
  // sengaja mengoreksi jadwal sejak awal juga memakai tanggal yang sama.
  const belumDiperiksa = schedules.company.some(s => s.isSeeded);

  container.innerHTML = `
    ${belumDiperiksa ? `
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <p class="text-sm text-amber-800 font-medium">Jadwal kerja ini masih nilai awal otomatis, bukan dari Anda.</p>
        <p class="text-xs text-amber-700 mt-1">Laporan Gaji sudah memakainya untuk menentukan hari kerja dan alpa. Mohon periksa dan sesuaikan dengan jam kerja sebenarnya, lalu simpan sebagai versi baru.</p>
      </div>` : ''}

    <div class="grid gap-4 lg:grid-cols-2">
      <div id="schedule-card"></div>
      <div id="holiday-card"></div>
    </div>
  `;

  renderScheduleCard(schedules, employees);
  renderHolidayCard(holidays);
}

function renderScheduleCard(schedules, employees) {
  const card = document.getElementById('schedule-card');
  const current = schedules.company[0]; // sudah urut effective_from menurun

  card.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 class="font-semibold text-slate-700">Jadwal Kerja</h2>
        <button id="btn-add-schedule" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">+ Atur Jadwal</button>
      </div>

      <div class="px-4 py-3 border-b border-slate-100">
        <p class="text-xs text-slate-400 mb-1">Jadwal baku perusahaan (berlaku untuk semua karyawan tanpa pengecualian)</p>
        <p class="text-sm text-slate-700">${current ? scheduleSummary(current) : '<span class="text-rose-500">Belum diatur</span>'}</p>
        ${current ? `<p class="text-xs text-slate-400 mt-0.5">Berlaku sejak ${escapeHtml(current.effectiveFrom)}</p>` : ''}
      </div>

      <div class="px-4 py-3">
        <p class="text-xs text-slate-400 mb-2">Pengecualian per karyawan</p>
        ${schedules.exceptions.length === 0
          ? `<p class="text-sm text-slate-400">Belum ada. Semua karyawan memakai jadwal baku.</p>`
          : `<ul class="divide-y divide-slate-100">
              ${schedules.exceptions.map(s => `
                <li class="flex items-start justify-between gap-3 py-2">
                  <div class="min-w-0">
                    <p class="text-sm text-slate-700">${escapeHtml(s.employeeName || '—')}</p>
                    <p class="text-xs text-slate-500">${scheduleSummary(s)}</p>
                    <p class="text-xs text-slate-400">Berlaku sejak ${escapeHtml(s.effectiveFrom)}</p>
                  </div>
                  <button data-id="${s.id}" class="btn-del-schedule text-rose-600 hover:underline text-sm font-medium shrink-0">Hapus</button>
                </li>
              `).join('')}
            </ul>`}
      </div>

      ${schedules.company.length > 1 ? `
        <div class="px-4 py-3 border-t border-slate-100">
          <p class="text-xs text-slate-400 mb-2">Riwayat jadwal baku</p>
          <ul class="divide-y divide-slate-100">
            ${schedules.company.slice(1).map(s => `
              <li class="flex items-center justify-between gap-3 py-2">
                <div class="min-w-0">
                  <p class="text-xs text-slate-500">${scheduleSummary(s)}</p>
                  <p class="text-xs text-slate-400">Berlaku sejak ${escapeHtml(s.effectiveFrom)}</p>
                </div>
                <button data-id="${s.id}" class="btn-del-schedule text-rose-600 hover:underline text-sm font-medium shrink-0">Hapus</button>
              </li>
            `).join('')}
          </ul>
        </div>` : ''}
    </div>
  `;

  document.getElementById('btn-add-schedule').addEventListener('click', () => openScheduleModal(employees, current));

  card.querySelectorAll('.btn-del-schedule').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Hapus versi jadwal ini? Perhitungan hari kerja akan kembali memakai versi lain yang berlaku.')) return;
      try {
        await Storage.deleteWorkSchedule(btn.dataset.id);
        renderSchedulesTab();
      } catch (err) {
        alert(`Gagal menghapus: ${err.message}`);
      }
    });
  });
}

function openScheduleModal(employees, current) {
  const checkedDays = new Set(
    String(current ? current.workDays : '1,2,3,4,5').split(',').filter(s => s !== '').map(Number)
  );

  openModal(`
    <div class="p-5">
      <h3 class="font-bold text-slate-800 mb-1">Atur Jadwal Kerja</h3>
      <p class="text-xs text-slate-400 mb-4">Disimpan sebagai versi baru. Perhitungan sebelum tanggal berlaku tidak ikut berubah.</p>
      <form id="form-schedule" class="space-y-3">
        <div>
          <label class="text-sm text-slate-500 block mb-2">Berlaku untuk</label>
          <div class="space-y-2">
            <label class="flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" name="scope" value="company" class="accent-indigo-600 sched-scope" checked /> Semua karyawan (jadwal baku)
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" name="scope" value="employees" class="accent-indigo-600 sched-scope" /> Karyawan tertentu saja
            </label>
          </div>
        </div>

        <div id="wrap-employees" class="hidden">
          <label class="text-sm text-slate-500 block mb-1">Pilih karyawan</label>
          <div class="border border-slate-300 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
            ${employees.map(e => `
              <label class="flex items-center gap-2 px-3 py-2 text-sm text-slate-600">
                <input type="checkbox" value="${e.id}" class="sched-emp accent-indigo-600" />
                ${escapeHtml(e.name)}
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <label class="text-sm text-slate-500 block mb-2">Hari kerja</label>
          <div class="flex flex-wrap gap-2">
            ${DAY_LABELS.map((label, i) => `
              <label class="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg px-2.5 py-1.5">
                <input type="checkbox" value="${i}" class="sched-day accent-indigo-600" ${checkedDays.has(i) ? 'checked' : ''} />
                ${label}
              </label>
            `).join('')}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm text-slate-500 block mb-1">Jam masuk</label>
            <input required type="time" name="startTime" value="${current ? escapeHtml(current.startTime) : '08:00'}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-sm text-slate-500 block mb-1">Jam pulang</label>
            <input required type="time" name="endTime" value="${current ? escapeHtml(current.endTime) : '17:00'}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label class="text-sm text-slate-500 block mb-1">Berlaku mulai</label>
          <input required type="date" name="effectiveFrom" value="${todayStr()}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>

        <p id="form-error" class="text-sm text-rose-600 hidden"></p>
        <div class="flex gap-2 pt-2">
          <button type="button" id="btn-cancel-schedule" class="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 font-medium text-sm">Batal</button>
          <button type="submit" class="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700">Simpan</button>
        </div>
      </form>
    </div>
  `);

  const wrapEmployees = document.getElementById('wrap-employees');
  document.querySelectorAll('.sched-scope').forEach(radio => {
    radio.addEventListener('change', () => {
      wrapEmployees.classList.toggle('hidden', document.querySelector('.sched-scope:checked').value !== 'employees');
    });
  });

  document.getElementById('btn-cancel-schedule').addEventListener('click', closeModal);

  document.getElementById('form-schedule').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = document.getElementById('form-error');

    const workDays = Array.from(document.querySelectorAll('.sched-day:checked')).map(c => c.value).join(',');
    if (!workDays) {
      errorEl.textContent = 'Pilih minimal satu hari kerja.';
      errorEl.classList.remove('hidden');
      return;
    }

    let employeeIds = null;
    if (document.querySelector('.sched-scope:checked').value === 'employees') {
      employeeIds = Array.from(document.querySelectorAll('.sched-emp:checked')).map(c => Number(c.value));
      if (employeeIds.length === 0) {
        errorEl.textContent = 'Pilih minimal satu karyawan.';
        errorEl.classList.remove('hidden');
        return;
      }
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await Storage.saveWorkSchedule({
        employeeIds,
        workDays,
        startTime: fd.get('startTime'),
        endTime: fd.get('endTime'),
        effectiveFrom: fd.get('effectiveFrom')
      });
      closeModal();
      renderSchedulesTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });
}

function renderHolidayCard(holidays) {
  const card = document.getElementById('holiday-card');
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1];

  card.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 class="font-semibold text-slate-700">Hari Libur</h2>
        <div class="flex items-center gap-2">
          <select id="holiday-year" class="border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white">
            ${years.map(y => `<option value="${y}" ${String(y) === SchedulesState.holidayYear ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
          <button id="btn-add-holiday" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">+ Tambah</button>
        </div>
      </div>
      <ul class="divide-y divide-slate-100">
        ${holidays.length === 0
          ? `<li class="px-4 py-8 text-center text-sm text-slate-400">Belum ada hari libur untuk ${escapeHtml(SchedulesState.holidayYear)}.</li>`
          : holidays.map(h => `
            <li class="flex items-center justify-between gap-3 px-4 py-2.5">
              <div class="min-w-0">
                <p class="text-sm text-slate-700">${escapeHtml(h.name)}</p>
                <p class="text-xs text-slate-400">${formatTanggalIndo(h.date)}</p>
              </div>
              <button data-date="${escapeHtml(h.date)}" data-name="${escapeHtml(h.name)}" class="btn-del-holiday text-rose-600 hover:underline text-sm font-medium shrink-0">Hapus</button>
            </li>
          `).join('')}
      </ul>
      <p class="px-4 py-3 border-t border-slate-100 text-xs text-slate-400">Tanggal di sini tidak dihitung sebagai hari kerja, jadi tidak menambah alpa siapa pun.</p>
    </div>
  `;

  document.getElementById('holiday-year').addEventListener('change', (e) => {
    SchedulesState.holidayYear = e.target.value;
    renderSchedulesTab();
  });

  document.getElementById('btn-add-holiday').addEventListener('click', openHolidayModal);

  card.querySelectorAll('.btn-del-holiday').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Hapus hari libur "${btn.dataset.name}"?`)) return;
      try {
        await Storage.deleteHoliday(btn.dataset.date);
        renderSchedulesTab();
      } catch (err) {
        alert(`Gagal menghapus: ${err.message}`);
      }
    });
  });
}

function openHolidayModal() {
  openModal(`
    <div class="p-5">
      <h3 class="font-bold text-slate-800 mb-4">Tambah Hari Libur</h3>
      <form id="form-holiday" class="space-y-3">
        <div>
          <label class="text-sm text-slate-500 block mb-1">Tanggal</label>
          <input required type="date" name="date" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Keterangan</label>
          <input required name="name" placeholder="Hari Kemerdekaan" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <p id="form-error" class="text-sm text-rose-600 hidden"></p>
        <div class="flex gap-2 pt-2">
          <button type="button" id="btn-cancel-holiday" class="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 font-medium text-sm">Batal</button>
          <button type="submit" class="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700">Simpan</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('btn-cancel-holiday').addEventListener('click', closeModal);

  document.getElementById('form-holiday').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errorEl = document.getElementById('form-error');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await Storage.saveHoliday({ date: fd.get('date'), name: fd.get('name').trim() });
      SchedulesState.holidayYear = fd.get('date').slice(0, 4);
      closeModal();
      renderSchedulesTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });
}
