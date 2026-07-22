/* ============================================================
   app.js — Entry point & Login view (router sederhana)
   ============================================================ */

let selectedRole = 'karyawan';

function renderLogin(errorMsg) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 flex items-center justify-center px-4 py-10">
      <div class="w-full max-w-sm">
        <div class="text-center mb-6">
          <div class="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-200">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h1 class="text-2xl font-bold text-slate-800">AbsensiKu</h1>
          <p class="text-sm text-slate-500 mt-1">Aplikasi absensi &amp; penggajian karyawan</p>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div class="grid grid-cols-2 gap-2 mb-5 bg-slate-100 rounded-xl p-1">
            <button id="role-karyawan" class="role-btn py-2 rounded-lg text-sm font-medium transition"></button>
            <button id="role-owner" class="role-btn py-2 rounded-lg text-sm font-medium transition"></button>
          </div>

          <form id="form-login" class="space-y-3">
            <div>
              <label class="text-sm text-slate-500 block mb-1">Username</label>
              <input required name="username" autocomplete="username" class="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label class="text-sm text-slate-500 block mb-1">Password</label>
              <input required type="password" name="password" autocomplete="current-password" class="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <p id="login-error" class="text-sm text-rose-600 ${errorMsg ? '' : 'hidden'}">${errorMsg || ''}</p>
            <button type="submit" class="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition">Masuk</button>
          </form>
        </div>

        <div class="mt-4 text-center text-xs text-slate-400 space-y-0.5">
          <p>Demo Owner: <span class="font-mono">owner / owner123</span></p>
          <p>Demo Karyawan: <span class="font-mono">budi / budi123</span></p>
        </div>
      </div>
    </div>
  `;

  const paintRoleButtons = () => {
    const kBtn = document.getElementById('role-karyawan');
    const oBtn = document.getElementById('role-owner');
    kBtn.textContent = 'Karyawan';
    oBtn.textContent = 'Owner / Admin';
    kBtn.className = `role-btn py-2 rounded-lg text-sm font-medium transition ${selectedRole === 'karyawan' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`;
    oBtn.className = `role-btn py-2 rounded-lg text-sm font-medium transition ${selectedRole === 'owner' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`;
  };
  paintRoleButtons();

  document.getElementById('role-karyawan').addEventListener('click', () => { selectedRole = 'karyawan'; paintRoleButtons(); });
  document.getElementById('role-owner').addEventListener('click', () => { selectedRole = 'owner'; paintRoleButtons(); });

  document.getElementById('form-login').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const result = Auth.login(fd.get('username'), fd.get('password'), selectedRole);
    if (!result.ok) {
      renderLogin(result.message);
      return;
    }
    routeToDashboard(result.user);
  });
}

function routeToDashboard(user) {
  if (user.role === 'owner') renderOwnerDashboard(user);
  else renderEmployeeDashboard(user);
}

function init() {
  Storage.seed();
  const user = Auth.currentUser();
  if (user) routeToDashboard(user);
  else renderLogin();
}

document.addEventListener('DOMContentLoaded', init);
