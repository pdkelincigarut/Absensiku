/* ============================================================
   app.js — Entry point & Login view (router sederhana)
   ============================================================ */

let selectedRole = 'hr';

function renderLogin(errorMsg) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="relative min-h-screen bg-klc-red overflow-hidden">

      <!-- Butiran sukro. Posisi, ukuran, dan JUMLAHNYA diukur langsung dari
           mockup acuan: hanya lima butir, semuanya menempel di tepi layar,
           bagian tengah dibiarkan bersih. Sebelumnya seluruh gambar sebaran
           diubin sehingga butirannya berlipat-lipat dan menutupi headline.

           Satuan lebar memakai vw supaya perbandingannya terhadap layar
           tetap sama seperti rancangan di kanvas 1920.

           Hiasan murni: aria-hidden supaya tidak dibacakan pembaca layar,
           pointer-events-none supaya tidak pernah menghalangi klik ke form. -->
      <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        ${[
          { src: 1, left: 7.4,  top: 5.7,  w: 2.76, rot: -12 },
          { src: 2, left: 87.9, top: 4.8,  w: 2.50, rot: 24 },
          { src: 3, left: 96.6, top: 11.9, w: 3.33, rot: -8 },
          { src: 2, left: 1.0,  top: 28.6, w: 2.29, rot: 40 },
          { src: 1, left: 3.6,  top: 56.8, w: 3.54, rot: 8 }
        ].map(p => `
          <img src="img/pilus-${p.src}.png" alt="" draggable="false"
               class="absolute select-none"
               style="left:${p.left}%; top:${p.top}%; width:${p.w}vw; transform:translate(-50%,-50%) rotate(${p.rot}deg)" />
        `).join('')}
      </div>

      <!-- Kerumunan orang menempel di dasar layar. Diulang mendatar supaya
           layar selebar apa pun tetap tertutup penuh dan ukuran figurnya
           tetap sama seperti di rancangan, bukan membesar ikut lebar layar.

           Tinggi gambar dipaskan ke tinggi bidang (auto 100%), BUKAN
           diperbesar melebihi bidangnya. Sempat dibuat 140% agar figurnya
           lebih besar, tapi itu memotong bagian atas gambar sehingga baris
           kepala teratas terpenggal garis lurus oleh merah. Pada mockup tepi
           atas kerumunan bergerigi -- kepalanya utuh -- karena gambarnya
           ditampilkan penuh. -->
      <div class="pointer-events-none absolute bottom-0 left-0 right-0 h-[31vh] min-h-[160px] max-h-[340px] bg-repeat-x"
           style="background-image:url('img/crowd.png'); background-size:auto 100%; background-position:bottom" aria-hidden="true"></div>

      <!-- Tanpa pembatas lebar: pada mockup isi halaman memakai lebar layar
           penuh (kartu berakhir di 94% lebar). Mengurungnya di max-w-7xl
           membuat seluruh elemen mengecil dan menjauh dari rancangan. -->
      <!-- Sisi kanan diberi ruang lebih lebar daripada kiri supaya tepi kanan
           kartu berhenti di ~94% lebar layar, sama seperti mockup. -->
      <div class="relative min-h-screen flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-[4vw] px-6 lg:pl-[4vw] lg:pr-[6vw] py-10">

        <!-- Panel merek -->
        <div class="w-full lg:flex-1 text-center lg:pb-24">
          <!-- Ukuran logo, headline, dan sub-teks diambil dari mockup:
               logo 154px, tinggi huruf headline 100px, dan sub-teks 25px pada
               kanvas 1920 -- karena itu semuanya dinyatakan dalam vw. -->
          <img src="img/klc-logo.png" alt="KLC Food Co." draggable="false"
               class="w-auto mx-auto mb-[3vh] select-none"
               style="height:clamp(2.5rem, 3.2vw, 4.5rem)" />
          <!-- Tanpa bayangan teks: pada mockup huruf putih duduk langsung di
               atas merah polos, dan sekarang tidak ada butiran yang lewat di
               belakangnya. Menambah bayangan justru membuatnya tidak sama.

               Turun sampai text-4xl di layar sempit: "Welcome, Kelsi" pada
               ukuran lebih besar akan melewati lebar layar ponsel. -->
          <!-- Jarak huruf dirapatkan ke -0.05em: pada ukuran yang tinggi
               hurufnya sudah sama dengan mockup, lebar barisnya masih ~10%
               lebih panjang. Merapatkan jarak menyamakan lebar tanpa
               mengecilkan hurufnya. -->
          <h1 class="font-display font-light text-white leading-none"
              style="font-size:clamp(2.25rem, 6.8vw, 8.5rem); letter-spacing:-0.05em">
            Welcome, Kelsi
          </h1>
          <p class="font-plex text-white/90 tracking-[0.15em]"
             style="font-size:clamp(0.7rem, 1.45vw, 1.75rem); margin-top:clamp(0.75rem, 2.2vh, 2rem)">
            have a great journey ahead
          </p>
        </div>

        <!-- Kartu login. Pada mockup lebarnya ~35% layar; dikunci minimum
             agar isinya tidak berdesakan dan maksimum agar tidak melebar
             berlebihan di layar sangat besar. -->
        <div class="w-full max-w-md shrink-0 lg:max-w-none"
             style="width:min(100%, 35vw); min-width:min(100%, 24rem); max-width:42rem">
          <div class="bg-white rounded-3xl shadow-2xl shadow-black/25 px-6 sm:px-10 pt-10 pb-7">

            <div class="text-center">
              <div class="w-14 h-14 rounded-2xl bg-klc-600 text-white flex items-center justify-center mx-auto mb-3">
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
                  <input required name="username" autocomplete="username" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-klc-600 focus:border-klc-600 transition" />
                </div>
                <div>
                  <label class="text-sm text-slate-500 block mb-1">Password</label>
                  <input required type="password" name="password" autocomplete="current-password" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-klc-600 focus:border-klc-600 transition" />
                </div>
                <p id="login-error" class="text-sm text-klc-600 ${errorMsg ? '' : 'hidden'}">${errorMsg || ''}</p>
                <button type="submit" class="w-full py-2.5 rounded-lg bg-klc-600 hover:bg-klc-700 text-white font-semibold text-sm transition">Masuk</button>
              </form>
            </div>

            <!-- Kredensial demo SENGAJA tidak lagi dicetak di sini. Halaman
                 ini terbuka untuk siapa pun yang bisa menjangkau server di
                 jaringan kantor, dan mencetak username beserta passwordnya
                 sama saja dengan tidak mengunci pintunya.

                 Untuk peragaan, kredensialnya dicetak oleh perintah seed di
                 Terminal, dan tercatat di panduan deploy. -->
            <p class="mt-5 text-center text-xs tracking-wide text-slate-500">
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
    hBtn.className = `role-btn py-2 rounded-lg text-sm font-medium transition ${selectedRole === 'hr' ? 'bg-white text-klc-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`;
    oBtn.className = `role-btn py-2 rounded-lg text-sm font-medium transition ${selectedRole === 'owner' ? 'bg-white text-klc-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`;
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
