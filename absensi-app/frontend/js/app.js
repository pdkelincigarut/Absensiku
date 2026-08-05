/* ============================================================
   app.js — Entry point & Login view (router sederhana)
   ============================================================ */

let selectedRole = 'hr';

function renderLogin(errorMsg) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="relative min-h-screen bg-klc-red overflow-hidden">

      <!-- Butiran sukro: hiasan, bukan informasi. aria-hidden supaya pembaca
           layar tidak membacakannya, dan pointer-events-none supaya tidak
           pernah menghalangi klik ke form di atasnya. -->
      <!-- Posisi digeser supaya gumpalan terpadat pada gambar tidak jatuh
           tepat di belakang headline; sisi-sisi layar yang justru diisi. -->
      <div class="pointer-events-none absolute inset-0 opacity-75"
           style="background-image:url('img/sukro.png'); background-size:58% auto; background-position:38% -34%; background-repeat:repeat"
           aria-hidden="true"></div>

      <!-- Kerumunan orang menempel di dasar layar. Diulang mendatar supaya
           layar selebar apa pun tetap tertutup penuh dan ukuran figurnya
           tetap sama seperti di rancangan, bukan membesar ikut lebar layar. -->
      <div class="pointer-events-none absolute bottom-0 left-0 right-0 h-[26vh] min-h-[150px] max-h-[300px] bg-repeat-x bg-bottom"
           style="background-image:url('img/crowd.png'); background-size:auto 100%" aria-hidden="true"></div>

      <div class="relative min-h-screen flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-16 px-6 py-10 max-w-7xl mx-auto">

        <!-- Panel merek -->
        <div class="w-full lg:flex-1 text-center lg:pb-24">
          <img src="img/klc-logo.png" alt="KLC Food Co." class="h-12 sm:h-14 w-auto mx-auto mb-6 select-none" draggable="false" />
          <!-- Bayangan halus: butiran di belakang berwarna krem terang dan
               bisa jatuh tepat di belakang huruf putih. Tanpa ini, sebagian
               huruf hilang kontras di layar tertentu. -->
          <!-- Turun sampai text-4xl di layar sempit: "Welcome, Kelsi" pada
               ukuran yang lebih besar akan melewati lebar layar ponsel. -->
          <h1 class="font-display font-light text-white leading-none tracking-tight text-4xl sm:text-6xl lg:text-7xl"
              style="text-shadow:0 2px 18px rgba(120,0,0,.45)">
            Welcome, Kelsi
          </h1>
          <p class="font-plex text-white/90 mt-5 text-xs sm:text-sm tracking-[0.15em]"
             style="text-shadow:0 1px 10px rgba(120,0,0,.5)">
            have a great journey ahead
          </p>
        </div>

        <!-- Kartu login -->
        <div class="w-full max-w-md lg:max-w-sm xl:max-w-md shrink-0">
          <div class="bg-white rounded-3xl shadow-2xl shadow-black/25 px-6 sm:px-8 pt-8 pb-6">

            <div class="text-center">
              <div class="w-14 h-14 rounded-2xl bg-klc-crimson text-white flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h2 class="font-display text-2xl font-bold text-slate-800">AbsensiKu</h2>
              <p class="text-sm text-slate-500 mt-1">Aplikasi absensi &amp; penggajian karyawan</p>
            </div>

            <div class="mt-6 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
              <div class="grid grid-cols-2 gap-1 mb-5 bg-slate-100 rounded-xl p-1">
                <button id="role-hr" class="role-btn py-2 rounded-lg text-sm font-medium transition"></button>
                <button id="role-owner" class="role-btn py-2 rounded-lg text-sm font-medium transition"></button>
              </div>

              <form id="form-login" class="space-y-3">
                <div>
                  <label class="text-sm text-slate-500 block mb-1">Username</label>
                  <input required name="username" autocomplete="username" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-klc-crimson focus:border-klc-crimson transition" />
                </div>
                <div>
                  <label class="text-sm text-slate-500 block mb-1">Password</label>
                  <input required type="password" name="password" autocomplete="current-password" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-klc-crimson focus:border-klc-crimson transition" />
                </div>
                <p id="login-error" class="text-sm text-klc-crimson ${errorMsg ? '' : 'hidden'}">${errorMsg || ''}</p>
                <button type="submit" class="w-full py-2.5 rounded-lg bg-klc-crimson hover:bg-klc-crimson-dark text-white font-semibold text-sm transition">Masuk</button>
              </form>
            </div>

            <div class="mt-5 text-center text-xs text-slate-400 space-y-0.5">
              <p>Demo HR Admin: <span class="font-plex">hradmin / hr123</span></p>
              <p>Demo Owner: <span class="font-plex">owner / owner123</span></p>
            </div>

            <p class="mt-4 text-center text-xs tracking-wide text-slate-500">
              <span class="font-display font-bold text-slate-700">KLC</span> CORP.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  const paintRoleButtons = () => {
    const hBtn = document.getElementById('role-hr');
    const oBtn = document.getElementById('role-owner');
    hBtn.textContent = 'HR Admin';
    oBtn.textContent = 'Owner / Admin';
    hBtn.className = `role-btn py-2 rounded-lg text-sm font-medium transition ${selectedRole === 'hr' ? 'bg-white text-klc-crimson shadow-sm' : 'text-slate-500 hover:text-slate-700'}`;
    oBtn.className = `role-btn py-2 rounded-lg text-sm font-medium transition ${selectedRole === 'owner' ? 'bg-white text-klc-crimson shadow-sm' : 'text-slate-500 hover:text-slate-700'}`;
  };
  paintRoleButtons();

  document.getElementById('role-hr').addEventListener('click', () => { selectedRole = 'hr'; paintRoleButtons(); });
  document.getElementById('role-owner').addEventListener('click', () => { selectedRole = 'owner'; paintRoleButtons(); });

  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const result = await Auth.login(fd.get('username'), fd.get('password'), selectedRole);
    if (!result.ok) {
      renderLogin(result.message);
      return;
    }
    routeToDashboard(result.account);
  });
}

function routeToDashboard(account) {
  if (account.role === 'owner') renderOwnerDashboard(account);
  else renderHrDashboard(account);
}

async function init() {
  const account = await Auth.currentAccount();
  if (account) routeToDashboard(account);
  else renderLogin();
}

document.addEventListener('DOMContentLoaded', init);
