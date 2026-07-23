/* ============================================================
   hr.js — Dashboard HR Admin
   Tabs: Monitoring Hari Ini | Riwayat Absensi
   Tidak ada data upah/gaji di mana pun di dashboard ini.
   ============================================================ */

const HrState = {
  tab: 'monitoring',
  monitorDate: todayStr(),
  historyFilter: { employeeId: 'all', month: null },
  monitorTimer: null
};

function renderHrDashboard(account) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="min-h-screen bg-slate-50">
      <header class="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div class="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p class="text-xs text-slate-400">Panel HR Admin</p>
            <h1 class="text-lg font-bold text-slate-800">${escapeHtml(account.name)}</h1>
          </div>
          <div class="flex items-center gap-4">
            <p id="header-clock" class="text-sm"></p>
            <button id="btn-logout" class="text-sm font-medium text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition">Keluar</button>
          </div>
        </div>
        <nav class="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto no-scrollbar pb-2">
          ${hrTabButton('monitoring', 'Monitoring Hari Ini')}
          ${hrTabButton('riwayat', 'Riwayat Absensi')}
        </nav>
      </header>
      <main class="max-w-5xl mx-auto px-4 py-6">
        <div id="birthday-banner"></div>
        <div id="hr-content"></div>
      </main>
    </div>
    <div id="modal-root"></div>
  `;

  startHeaderClock('header-clock');
  renderBirthdayBanner(document.getElementById('birthday-banner'), Storage.getEmployees());

  document.getElementById('btn-logout').addEventListener('click', () => {
    stopHeaderClock();
    clearInterval(HrState.monitorTimer);
    Auth.logout();
    renderLogin();
  });

  document.querySelectorAll('.hr-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      HrState.tab = btn.dataset.tab;
      renderHrTab(account);
    });
  });

  renderHrTab(account);
}

function hrTabButton(id, label) {
  const active = HrState.tab === id;
  return `<button data-tab="${id}" class="hr-tab-btn whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">${label}</button>`;
}

function renderHrTab(account) {
  clearInterval(HrState.monitorTimer);
  document.querySelectorAll('.hr-tab-btn').forEach(btn => {
    const active = btn.dataset.tab === HrState.tab;
    btn.className = `hr-tab-btn whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`;
  });

  const container = document.getElementById('hr-content');
  const employees = Storage.getEmployees();

  if (HrState.tab === 'monitoring') {
    container.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-500">Tanggal</label>
          <input type="date" id="monitor-date" value="${HrState.monitorDate}" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <button id="btn-today" class="text-sm font-medium text-indigo-600 hover:underline w-fit">Hari ini</button>
        <span class="text-xs text-slate-400 sm:ml-auto">Diperbarui otomatis setiap 15 detik</span>
      </div>
      <div id="monitor-list"></div>
    `;

    const rerender = () => renderMonitoringList(document.getElementById('monitor-list'), employees, HrState.monitorDate, account.name);

    document.getElementById('monitor-date').addEventListener('change', (e) => {
      HrState.monitorDate = e.target.value;
      rerender();
    });
    document.getElementById('btn-today').addEventListener('click', () => {
      HrState.monitorDate = todayStr();
      document.getElementById('monitor-date').value = HrState.monitorDate;
      rerender();
    });

    rerender();
    HrState.monitorTimer = setInterval(() => {
      const hasOpenPanel = document.querySelector('#monitor-list .panel-row:not(.hidden)');
      if (!hasOpenPanel) rerender();
    }, 15000);
  } else if (HrState.tab === 'riwayat') {
    container.innerHTML = `<div id="history-wrap"></div>`;
    renderHistoryTable(document.getElementById('history-wrap'), employees, HrState.historyFilter);
  }
}
