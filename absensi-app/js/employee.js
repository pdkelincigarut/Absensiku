/* ============================================================
   employee.js — Dashboard Karyawan
   Hanya: Check-In + riwayat absensi pribadi. Tidak ada data upah.
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

function renderEmployeeDashboard(user) {
  const today = todayStr();
  const record = Storage.getRecordForDate(user.id, today);

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="min-h-screen bg-slate-50 flex flex-col">
      <header class="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div class="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p class="text-xs text-slate-400">Selamat datang</p>
            <h1 class="text-lg font-bold text-slate-800">${escapeHtml(user.name)}</h1>
          </div>
          <button id="btn-logout" class="text-sm font-medium text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition">Keluar</button>
        </div>
      </header>

      <main class="flex-1 max-w-md mx-auto w-full px-4 py-6 space-y-6">
        <section id="checkin-card"></section>

        <section>
          <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Riwayat Absensi Saya</h2>
          <div id="history-list" class="space-y-2"></div>
        </section>
      </main>

      <footer class="text-center text-xs text-slate-400 py-4">AbsensiKu &middot; ${formatTanggalIndo(today)}</footer>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', () => {
    Auth.logout();
    renderLogin();
  });

  renderCheckinCard(user, record);
  renderEmployeeHistory(user);
}

function renderCheckinCard(user, record) {
  const container = document.getElementById('checkin-card');

  if (record && record.status === 'hadir') {
    container.innerHTML = `
      <div class="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-6 shadow-lg shadow-emerald-200 text-center">
        <div class="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
        <p class="font-semibold text-lg">Sudah Absen Hari Ini</p>
        <p class="text-emerald-50 text-sm mt-1">Check-in pukul ${record.checkInTime}</p>
      </div>
    `;
    return;
  }

  if (record && ['izin', 'sakit', 'alpa'].includes(record.status)) {
    container.innerHTML = `
      <div class="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm text-center">
        <span class="inline-block px-3 py-1 rounded-full text-sm font-medium border ${STATUS_BADGE_CLASS[record.status]}">${STATUS_LABEL[record.status]}</span>
        <p class="text-slate-500 text-sm mt-3">Status hari ini telah ditandai oleh Admin.${record.note ? ' Catatan: ' + escapeHtml(record.note) : ''}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm text-center">
      <p class="text-slate-500 text-sm mb-4">Anda belum absen hari ini</p>
      <button id="btn-checkin" class="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition text-white font-semibold text-base shadow-lg shadow-indigo-200">
        Check-In / Absen Masuk
      </button>
    </div>
  `;

  document.getElementById('btn-checkin').addEventListener('click', () => {
    Storage.upsertAttendance({
      id: uid('att'),
      userId: user.id,
      date: todayStr(),
      status: 'hadir',
      checkInTime: nowTimeStr(),
      note: '',
      updatedAt: Date.now()
    });
    const fresh = Storage.getRecordForDate(user.id, todayStr());
    renderCheckinCard(user, fresh);
    renderEmployeeHistory(user);
  });
}

function renderEmployeeHistory(user) {
  const container = document.getElementById('history-list');
  const all = Storage.getAttendance()
    .filter(r => r.userId === user.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  if (all.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Belum ada riwayat absensi.</p>`;
    return;
  }

  container.innerHTML = all.map(r => `
    <div class="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div>
        <p class="text-sm font-medium text-slate-700">${formatTanggalIndo(r.date)}</p>
        ${r.checkInTime ? `<p class="text-xs text-slate-400">Jam masuk ${r.checkInTime}</p>` : ''}
      </div>
      <span class="text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_BADGE_CLASS[r.status]}">${STATUS_LABEL[r.status]}</span>
    </div>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
