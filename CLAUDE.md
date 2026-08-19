# CLAUDE.md — Absensiku

Panduan konteks project ini untuk Claude Code. File ini dibaca otomatis setiap sesi baru dibuka di folder project.

## Tentang Project

Absensiku adalah aplikasi absensi karyawan untuk **CV KLC Group**, dengan akses multi-role (HR admin & owner). Karyawan **tidak** punya login dan tidak menyentuh aplikasi — HR yang menandai kehadiran mereka.

Karena itu kecurangan tidak dilawan lewat verifikasi identitas karyawan (tidak ada identitas yang perlu diverifikasi), melainkan lewat **akuntabilitas HR**: setiap perubahan data tercatat lengkap dengan pelaku dan alasannya, dan bisa ditelusuri owner. Keputusan ini diambil 2026-08-01; lihat spec akuntabilitas absensi.

- Repo: `github.com/pdkelincigarut/Absensiku`
- Bahasa utama: JavaScript
- Struktur folder utama:
  - `absensi-app/` — source code aplikasi
  - `docs/superpowers/specs/` — dokumentasi spesifikasi fitur
  - `docs/superpowers/plans/` — rencana implementasi, berpasangan dengan spec

## Status Fitur

Bagian ini memisahkan **yang sudah jalan di kode** dari **yang masih rencana**. Jangan asumsikan fitur di bagian "Belum Dikerjakan" sudah ada infrastrukturnya — belum.

### Sudah Jalan

| Fitur | Catatan |
|---|---|
| Login multi-role (HR / Owner) | Session cookie persisten, role dicek saat login |
| Data karyawan | Nama, kode, upah harian, tanggal lahir, foto, jabatan, divisi |
| Master jabatan & divisi | Lookup CRUD, satu router factory dipakai dua kali |
| Monitoring absen harian | Tab Monitoring, refresh berkala (polling `setInterval`) |
| Riwayat absensi | Filter per karyawan & per bulan |
| Check-in / check-out | Jam diambil dari jam server, client tidak boleh kirim jam |
| Jadwal kerja berversi | `work_schedules` + `effective_from`, ada jadwal baku perusahaan |
| Hari libur | Input manual + auto-generate 4 libur nasional (Imlek, Idul Fitri, Idul Adha, Kemerdekaan) dengan flag `is_estimate` |
| Aturan keterlambatan | Berversi, per karyawan, potongan flat / per-menit / persentase |
| Laporan gaji | Periode 28 bulan lalu s/d 27 bulan berjalan, sudah hitung potongan telat |
| Audit log | Tabel `audit_log`, tab "Log Perubahan" khusus Owner, snapshot sebelum/sesudah tiap perubahan |
| Koreksi wajib beralasan | `reason` wajib saat mengubah absensi yang sudah tercatat, opsional saat input pertama |
| Soft delete karyawan | `employees.deleted_at`; laporan gaji periode lampau tidak bergeser |
| Tanggal masuk & catatan | `employees.join_date` / `notes`; hari sebelum tanggal masuk tidak dihitung alpa di laporan gaji |
| Export CSV | Laporan gaji (`owner.js`) dan daftar karyawan (`employeeList.js`), dibuat di browser pakai Blob + BOM UTF-8 supaya rapi dibuka Excel |
| Backup harian | Otomatis dari server, satu salinan per hari, disimpan 30 terakhir. Dibuat dengan VACUUM INTO karena database mode WAL |
| Panel Check In (kios) | Absen mandiri tanpa login di PC umum, `routes/kiosk.js` + `frontend/js/kiosk.js`. Menutup celah "HR tidak masuk = semua terlambat" |
| Pengenalan wajah | Absen kios lewat kamera. Model face-api dibundel lokal di `frontend/vendor/face-api/`, pencocokan dikerjakan di server. Tiap absen menyimpan foto bukti |
| Data demo | `seedDemo.js` — riwayat sebulan lebih untuk presentasi, terpisah dari `seed.js` |

### Belum Dikerjakan (Roadmap)

1. **Export PDF** per periode dengan tata letak siap serah.
   CSV **sudah ada** untuk laporan gaji dan daftar karyawan, dan sudah bisa dibuka Excel. Yang belum: PDF, dan tata letak resmi (kop, tanda tangan, ringkasan per divisi). Perlu keputusan: dibuat di server (nambah dependency) atau lewat cetak browser.
2. **Reminder/notifikasi** untuk karyawan yang belum absen.
   Belum ada scheduler, dan kanalnya (email/WA/push) belum dipilih. Perlu diingat karyawan tidak punya akun di aplikasi ini.
3. **Versi & penghapusan `work_schedules` / `late_policies`.**
   Keduanya masih hard delete. Menghapus satu versi **mengubah gaji periode lampau** yang mungkin sudah dibayarkan. Isinya sekarang tersimpan di `audit_log` sehingga bisa dipulihkan manual, tapi tidak ada yang mencegah penghapusannya. Layak spec sendiri.
4. **Memulihkan data dari audit log lewat UI.**
   Snapshot `before_json` sudah lengkap, tapi belum ada tombol undo.

### Dibatalkan

**Anti-fraud check-in** (login karyawan, selfie, geolocation, device binding) — dibatalkan 2026-08-01. Digantikan akuntabilitas HR di tabel "Sudah Jalan".

Catatan 2026-08-18: keputusan "karyawan tidak absen sendiri" **dibalik sebagian**. Karyawan kini absen sendiri lewat Panel Check In di PC umum (lihat bagian kios), karena kalau HR tidak masuk semua orang otomatis tercatat terlambat. Yang **tetap dibatalkan** adalah login per karyawan, selfie, geolocation, dan device binding — kios sengaja tanpa autentikasi apa pun.

**Tampilan ponsel** — dibatalkan 2026-08-06 atas keputusan owner. Aplikasi ini **khusus desktop**: PC Windows (server) dan komputer client di jaringan kantor lewat browser, semuanya jauh di atas lebar yang dibutuhkan. Jangan habiskan waktu membuat tabel jadi kartu untuk layar sempit, menguji di lebar ponsel, atau mengganti `bg-fixed` demi Safari iOS.

## Aturan & Konvensi Wajib

- Perubahan yang menyentuh akses HR vs Owner harus jelas pemisahan permission-nya — pakai `requireAuth` / `requireOwner`, jangan cek role manual di dalam handler.
- **Jangan tambah endpoint DELETE untuk data absensi.** Riwayat absensi tidak boleh hilang.
- **Menghapus karyawan = soft delete.** Query apa pun yang mendaftar karyawan wajib menyaring `deleted_at IS NULL`. Pengecualian tunggal: laporan gaji, yang sengaja tetap memasukkan karyawan terhapus kalau punya absensi di periode itu.
- **Setiap route yang menulis data wajib memanggil `recordAudit`.** Log yang bolong berbohong lewat kekosongannya — pembaca menyimpulkan "tidak ada yang berubah" padahal cuma tidak dicatat.
- **`audit_log` hanya dibaca.** Jangan pernah buat endpoint ubah atau hapus untuknya.
- Alasan wajib **hanya** saat mengubah baris yang sudah ada. Mewajibkannya di input pertama akan menghasilkan alasan "." yang menyamarkan koreksi sungguhan.
- **Hari sebelum `employees.join_date` bukan alpa.** Karyawan yang bergabung di tengah periode tidak boleh terlihat bolos pada masa sebelum dia bekerja, dan gajinya tidak boleh terpotong karenanya. Absensi yang terlanjur tercatat sebelum tanggal itu **tetap dibayar** — catatan kehadiran adalah bukti, bukan tebakan. Karyawan tanpa `join_date` dihitung seperti sebelumnya (seluruh periode).
- Jam absen selalu dari server. Jangan pernah terima `checkInTime` / `checkOutTime` dari body request, dan **jangan stempel ulang `check_in_time` yang sudah terisi** — potongan keterlambatan dihitung dari kolom itu.
- **Desktop saja.** Boleh memakai tata letak yang butuh layar lebar. Lebar minimum tanpa geser mendatar: Laporan Gaji 1173px, Monitoring 1076px, sisanya di bawah 1000px. Tabel tetap dibungkus `overflow-x-auto` supaya layar yang lebih sempit masih bisa dipakai, tapi tampilan khusus ponsel bukan tujuan.

## Stack Teknologi

**Backend** (`absensi-app/backend/`)
- Node.js **>=22.5** (wajib — pakai modul bawaan `node:sqlite`, tidak ada native build)
- Express 4 + `express-session`
- `bcryptjs` untuk hash password
- Test runner: `node --test` bawaan Node (tanpa Jest/Mocha)
- Dependency runtime cuma 3: `express`, `express-session`, `bcryptjs`

**Frontend** (`absensi-app/frontend/`)
- Vanilla JS, **tanpa build step / bundler / framework**
- Tailwind runtime **disajikan dari dalam aplikasi** (`frontend/vendor/tailwind.js`, versi 3.4.16), bukan dari CDN — aplikasi berjalan di jaringan kantor yang belum tentu punya internet. Konfigurasinya tetap inline di `index.html`, tidak ada build step. Font Poppins & IBM Plex Mono juga lokal di `frontend/vendor/fonts/`. **Halaman tidak melakukan satu pun permintaan keluar.**
- Semua file `js/*.js` dimuat sebagai `<script>` biasa dan berbagi scope global — urutan `<script>` di `index.html` itu penting (`storage.js` duluan, `app.js` terakhir)
- Disajikan sebagai file statis oleh server Express yang sama (`express.static`), jadi satu proses & satu port untuk API + UI

**Database**
- **SQLite** lewat `node:sqlite` (`DatabaseSync`), mode WAL
- File DB: `absensi-app/backend/data/absensiku.db` (di-`.gitignore`, tidak pernah masuk repo)
- Override path pakai env `DB_FILE` (dipakai test untuk DB sementara)
- `PRAGMA foreign_keys` **sengaja tidak diaktifkan** — hapus karyawan harus menyisakan riwayat absensinya (lihat komentar di `db.js`)

## Autentikasi & Otorisasi

- **Session cookie** (`express-session`), bukan JWT
- Session store custom persisten di SQLite: `sqliteSessionStore.js` — sesi login **tetap hidup setelah server restart**
- Umur cookie: 12 jam
- `SESSION_SECRET` dari env; kalau kosong server cetak peringatan dan pakai default dev (jangan dipakai produksi)
- Login butuh **username + password + role**; kalau role tidak cocok dengan akun, login ditolak (bukan sekadar diabaikan)
- Guard di `middleware/auth.js`:
  - `requireAuth` — harus sudah login
  - `requireOwner` — harus login **dan** `role === 'owner'` (kalau bukan: 403)
- Dua role: `hr` dan `owner` (constraint CHECK di tabel `accounts`)

### Panel Check In tanpa login (kios)

`/api/kiosk` adalah **satu-satunya** kelompok route yang terbuka tanpa sesi.
Alasannya: kalau HR tidak masuk, tidak ada yang menceklis, dan semua karyawan
otomatis tercatat terlambat. Kios menghapus ketergantungan itu.

Karena terbuka untuk siapa pun yang bisa menjangkau server, kemampuannya
dipangkas — batas ini **jangan dilonggarkan** tanpa alasan kuat:

- hanya bisa mencatat **hadir** dan **jam pulang**
- **tidak** bisa menandai izin / sakit / alpa
- **tidak** bisa menandai banyak orang sekaligus
- **tidak** bisa mengubah atau menimpa catatan yang sudah ada (HTTP 409)
- **tidak** pernah mengembalikan data upah — jangan pakai ulang `toJson` dari
  `routes/employees.js` di sini, fungsi itu membawa `dailyWage`
- semua aksinya tetap masuk `audit_log` atas nama akun semu
  `Absen Mandiri (kios)` (`accountId: 0`), jadi tetap bisa ditelusuri

### Pengenalan wajah

Ditambahkan 2026-08-18 karena panel ceklis nama saja masih bisa dititipkan
ke teman. Aturan yang tidak boleh dilanggar:

- **Pencocokan dikerjakan di server**, tidak pernah di browser. Mencocokkan
  di browser berarti mengirim seluruh basis data wajah karyawan ke PC umum.
  Browser hanya boleh mengirim satu descriptor hasil kameranya sendiri.
- **Descriptor tidak boleh keluar lewat respons mana pun.** `/api/face/enrollments`
  hanya mengembalikan jumlah sampel, dan `/api/kiosk/employees` hanya `hasFace`
  bernilai benar/salah.
- **Saat pencocokan gagal, nama kandidat terdekat tidak diberitahukan.** Kalau
  diberitahu, kios berubah jadi alat menebak wajah siapa yang paling mendekati.
- **Karyawan yang wajahnya sudah terdaftar tidak boleh absen lewat tombol
  manual** (HTTP 403 di `routes/kiosk.js`). Kalau tombol itu tetap bisa dipakai,
  kameranya tidak menghalangi apa pun. Tombol manual hanya tersisa untuk
  karyawan yang belum didaftarkan, supaya penerapannya bisa bertahap.
- **Berkas bobot model berakhiran `.weights`, bukan `.bin`.** Pemblokir iklan
  dan antivirus rutin menghadang permintaan `.bin`; saat dihadang, face-api
  gagal dengan pesan "tensor should have 432 values but has 0" yang sama sekali
  tidak menyinggung soal pemblokiran. Nama itu ikut diubah di dalam
  `*-weights_manifest.json`. Jangan dikembalikan ke `.bin`.
- **Kamera hanya hidup di konteks aman**: HTTPS atau `localhost`. Lewat
  `http://<IP-LAN>` objek `navigator.mediaDevices` bahkan tidak ada. Artinya
  PC kios harus PC server itu sendiri, atau HTTPS harus disiapkan.
- **Ambang jarak 0,5 plus selisih minimum 0,08** antara kandidat terbaik dan
  kedua (`faceMatcher.js`). Dua kandidat yang berdempetan berarti sistemnya
  sedang menebak, dan menebak berarti salah catat absensi orang lain.
  Melonggarkan angka ini menukar keluhan "susah dikenali" dengan salah bayar.
- **Foto bukti adalah pengaman yang sebenarnya**, bukan ambangnya. Sistem
  pengenal wajah mana pun bisa dikelabui wajah di layar ponsel. Yang menahan
  orang menitipkan absen adalah tahu setiap ceklis meninggalkan foto.
  Disimpan 40 hari; tanggal terlama terhapus sendiri saat pemangkasan harian.
- **Data biometrik**: UU PDP No. 27/2022 menggolongkannya data pribadi
  spesifik. Persetujuan tertulis karyawan diurus di luar aplikasi.

## Struktur Folder

```
absensi-app/
  backend/
    server.js            # entry point: mount semua router + serve frontend statis
    db.js                # koneksi SQLite + migration runner (jalan saat di-require)
    seed.js              # data demo (npm run seed), idempotent
    middleware/auth.js   # requireAuth, requireOwner
    migrations/          # 001..008, .sql & .js, dijalankan urut nama file
    routes/              # satu file per resource (bukan pola controller/model)
    test/                # *.test.js, node:test
    data/                # absensiku.db (gitignored)
    DEPLOY-WINDOWS.md    # panduan deploy: server di PC Windows, client cukup browser
  frontend/
    index.html           # satu-satunya halaman HTML
    js/
      app.js             # entry point + view login + router sederhana
      auth.js            # wrapper login/logout/me
      storage.js         # SATU-SATUNYA layer fetch ke API + helper format tanggal
      hr.js / owner.js   # dashboard per role (masing-masing punya tab sendiri)
      checklist.js, employeeList.js, latePolicy.js, lookups.js, schedules.js
      auditView.js       # tab Log Perubahan (Owner only)
      tableUtils.js      # helper render tabel
docs/superpowers/
  specs/                 # dokumen spesifikasi per fitur (bahasa Indonesia)
  plans/                 # dokumen rencana implementasi, berpasangan dengan spec
```

### Modul kalkulasi murni (tanpa DB)

- `faceMatcher.js` — jarak euclidean, ambang, dan aturan "ragu" untuk pencocokan wajah

Logika perhitungan dipisah ke modul murni supaya gampang di-test tanpa DB. Jangan taruh query SQL di sini:
- `scheduleResolver.js` — resolusi jadwal kerja berlaku pada tanggal tertentu, helper tanggal (`addDaysStr`, `dayOfWeek`)
- `lateCalculator.js` — hitung potongan (`computeDeduction`). **Catatan:** `computeLateMinutes` di sini versi lama 2-parameter yang mengabaikan toleransi; yang dipakai payroll adalah versi 3-parameter di `scheduleResolver.js`. Jangan tertukar.
- `holidayCalculator.js` — hitung tanggal libur nasional (Imlek/Idul Fitri/Idul Adha/Kemerdekaan) via `Intl.DateTimeFormat`

`auditLog.js` di root backend **bukan** modul murni — dia menyentuh DB. Isinya `recordAudit()` dan `hasMeaningfulChange()`.

### Endpoint API

Semua di-mount di `server.js`, prefix `/api`:

| Prefix | File | Catatan |
|---|---|---|
| `/api/login`, `/logout`, `/me` | `routes/auth.js` | |
| `/api/employees` | `routes/employees.js` | foto dikirim data URL base64, limit body 2mb |
| `/api/jobs`, `/api/organizations` | `routes/lookupRouter.js` | satu factory dipakai dua kali |
| `/api/work-schedules` | `routes/workSchedules.js` | |
| `/api/holidays` | `routes/holidays.js` | |
| `/api/attendance` | `routes/attendance.js` | |
| `/api/payroll` | `routes/payroll.js` | |
| `/api/late-policies` | `routes/latePolicies.js` | |
| `/api/audit-log` | `routes/auditLog.js` | Owner only, hanya GET |
| `/api/kiosk` | `routes/kiosk.js` | **TANPA login.** Sengaja dipersempit: hanya catat hadir & jam pulang, satu orang per aksi, tidak menimpa catatan yang sudah ada, tidak pernah mengembalikan data upah |
| `/api/face` | `routes/face.js` | Butuh login. Pendaftaran wajah khusus Owner, foto bukti bisa dilihat HR. Descriptor tidak pernah ikut keluar |

## Konvensi Kode

- **Bahasa Indonesia** untuk komentar kode, pesan error yang dilihat user, nama tab UI, dan dokumen di `docs/`. Nama variabel/fungsi tetap Inggris.
- **Fitur baru = spec + plan dulu** di `docs/superpowers/`, format nama `YYYY-MM-DD-nama-fitur-design.md` (spec) dan `YYYY-MM-DD-nama-fitur.md` (plan).
- **Migrasi tidak pernah diedit setelah masuk repo** — bikin file bernomor baru. `.js` dipakai hanya kalau migrasi butuh logika (mis. konversi data lama sambil cetak peringatan); selain itu `.sql`.
- **Data berversi pakai `effective_from`** (`work_schedules`, `late_policies`), bukan overwrite. Perhitungan gaji periode lampau tidak boleh bergeser gara-gara perubahan aturan hari ini.
- **Jangan pernah** parsing string `'YYYY-MM-DD'` langsung ke `new Date(str)` — dianggap UTC dan bisa geser satu hari di WIB. Selalu pecah dulu lalu `new Date(y, m - 1, d)`.
- **Jam dari server, bukan dari client.** Frontend tidak pernah mengirim `checkInTime`/`checkOutTime`; server yang mengisi (lihat komentar di `storage.js`). Ini bagian dari anti-fraud.
- Semua akses API dari frontend lewat `Storage` di `storage.js` — jangan `fetch()` langsung dari file view.
- Periode payroll: **tanggal 28 bulan lalu s/d 27 bulan berjalan**, dipilih lewat query `?periodOffset=N` (0 = periode berjalan). Batasnya ada di konstanta `PERIOD_START_DAY`/`PERIOD_END_DAY`, **diduplikasi di 4 berkas** (`routes/payroll.js`, `frontend/js/owner.js`, `seedDemo.js`, `test/payroll.schedule.test.js`) karena frontend tanpa build step. Ubah keempatnya bersama, dan jaga selisihnya tetap satu hari.


### Aturan UI/UX yang berlaku di seluruh panel

Ditetapkan 2026-08-19 memakai skill `ui-ux-pro-max`. Empat aturan ini ditulis
sekali di tempat bersama, bukan per panel, supaya panel baru ikut terurus
tanpa perlu diingat.

**1. Fokus keyboard — `:focus-visible`, bukan `:focus`.**
Cincin fokus global didefinisikan di `index.html`. Jangan menambah
`focus:ring-*` per elemen: `:focus` juga menyala saat diklik tetikus,
sehingga tiap klik meninggalkan cincin yang tidak diminta. Cincinnya dua
warna (garis gelap + halo putih) karena aplikasi ini punya dua latar yang
sangat berbeda — kartu putih dan tekstur merah; satu warna saja hilang di
salah satunya.

**2. `prefers-reduced-motion` dihormati.**
Blok `@media` di `index.html` memangkas semua transisi jadi 1ms. Sengaja 1ms
dan bukan 0: sebagian browser melewatkan event `transitionend` pada durasi 0,
dan kode yang menunggunya akan menggantung.

**3. Galat form lewat `tampilkanGalatForm()` (`js/formUtils.js`).**
Jangan menempelkan pesan galat langsung ke elemen. Fungsi itu menandai kolom
yang salah (`aria-invalid`, garis merah, pesan menempel di bawahnya),
memindahkan fokus ke sana, dan menyediakan ringkasan ber-`role="alert"`
sebagai cadangan kalau kolomnya tidak ketahuan.

Pola pencocokan pesan → kolom harus diambil dari kalimat yang **benar-benar**
dikirim `backend/routes/*.js`. Menebaknya gagal diam-diam: pola
`/kode karyawan/` tidak pernah cocok karena server menulis "Employee ID".

**4. Keadaan kosong lewat `keadaanKosongHtml()` (`js/formUtils.js`).**
Judul + kalimat penjelas, dan tombol **hanya** kalau ada yang bisa dikerjakan
dari halaman yang sama. Tombolnya menekan tombol yang sudah ada
(`aksiSelector`), bukan menyalin logikanya — supaya alurnya cuma perlu diubah
di satu tempat. Panggil `pasangAksiKosong(wadah)` setelah HTML-nya ditempel.

**5. Ikon berupa SVG, bukan emoji.** Emoji digambar font sistem, jadi bentuk
dan warnanya berbeda di tiap komputer, tidak bisa mengikuti warna merek, dan
dibacakan pembaca layar di tengah kalimat nama orang. `IKON_KUE_ULTAH` di
`js/checklist.js` (jalur dari Heroicons, MIT) dipakai bersama oleh monitoring
dan daftar karyawan.

**6. Tindakan massal harus berupa tombol berlabel, bukan kotak-ceklis.**
Di kepala tabel monitoring dulu ada kotak-ceklis "Checklist All". Kotak-ceklis
di kepala tabel dibaca semua orang sebagai "pilih semua baris", padahal yang
terjadi penulisan absensi belasan orang sekaligus — dan absensi menentukan
gaji. Sekarang tombol `#btn-tandai-semua` berlabel "Tandai Semua Hadir".
Berlaku untuk tindakan massal apa pun yang ditambahkan nanti.

**7. Kios tidak menampilkan status pendaftaran wajah.** Lencana "wajah
terdaftar / belum didaftarkan" sudah dibuang dari kartu kios. Kios berdiri di
tempat umum, dan lencana itu mengumumkan kepada siapa saja yang lewat persis
siapa yang masih bisa diabsenkan lewat tombol manual — daftar sasaran, di
layar yang justru dipasang untuk menutup penitipan absen. Statusnya tetap ada
di tab Wajah milik Owner, yang butuh login.

**8. Wilayah yang berubah sendiri harus diumumkan.** Hasil absen kios
(`#kiosk-hasil`), aba-aba kamera (`#kiosk-hint`), dan pesan daftar
(`#kiosk-pesan`) memakai `aria-live="polite"`. Kegagalan dinaikkan jadi
`role="alert"` supaya menyela: orang yang absennya DITOLAK perlu tahu sekarang
juga, sebelum keburu pergi mengira sudah tercatat. Tabel monitoring memakai
`aria-busy` selama memuat.

**Sesi habis ditangani terpusat** di `apiRequest()` (`js/storage.js`): setiap
401 selain `/api/login` menghentikan timer panel dan kembali ke halaman login
dengan pesan. Sebelumnya tiap panel mencetak "Gagal memuat data: Belum login."
di tengah layar merah tanpa tombol apa pun — dan itu yang dilihat HR tiap pagi
setelah aplikasi ditinggal semalam.

**Yang DITOLAK dari saran skill**: palet navy `#1E3A5F`, font Outfit/Work Sans
dari Google Fonts CDN, pola halaman "Hero + Features + CTA", dan saran
mobile-first. Merek KLC berasal dari mockup client, aplikasi wajib nol
permintaan keluar, dan tampilan ponsel sudah dibatalkan owner. Yang diambil
dari skill: disiplin *Minimalism & Swiss Style* untuk enterprise dashboard,
plus checklist aksesibilitasnya.

### Nominal rupiah

Semua nominal uang lewat helper di `frontend/js/storage.js` — jangan
memformat sendiri di tempat lain:

- `formatRupiah(n)` → `"Rp1.500.000"` (untuk ditampilkan)
- `formatRibuan(n)` → `"1.500.000"` (tanpa "Rp")
- `parseRupiah(teks)` → angka, atau `null` kalau kosong
- `pasangInputRupiah(input, onChange)` → membuat kotak isian memberi titik
  pemisah sambil diketik

Kotak isian nominal memakai `type="text"` + `inputmode="numeric"`, **bukan**
`type="number"`. Kotak angka bawaan browser menganggap `"150.000"` nilai
tidak sah dan mengosongkan `.value`-nya, jadi pemisah ribuan dan
`type="number"` memang tidak bisa berjalan bersamaan. Akibatnya, nilai yang
dibaca dari `FormData` berupa teks berpemisah titik dan **wajib** diurai
dengan `parseRupiah`, bukan `Number`.

Konsekuensi di server: `Number(null)` dan `Number('')` sama-sama bernilai 0
dan lolos `Number.isFinite`, sehingga upah kosong bisa tersimpan diam-diam
sebagai Rp0. `routes/employees.js` memeriksa kosong lebih dulu, terpisah dari
pemeriksaan finite. Aturan yang sama berlaku kalau nanti ada kolom uang baru.

Yang **tidak** diformat: kolom angka di CSV export. Excel membaca
`"1.500.000"` sebagai teks, bukan angka, sehingga tidak bisa dijumlahkan.
CSV tetap berisi angka polos.

## Command yang Sering Dipakai

Semua command backend dijalankan dari `absensi-app/backend/`:

```bash
npm install          # sekali di awal
npm run seed         # data awal bersih untuk pemasangan asli (idempotent)

# Data contoh untuk presentasi -- MENGHAPUS seluruh isi database:
npm run seed:demo -- --force    # bangun ulang dari awal
npm run seed:demo -- --topup    # tambal hari kerja yang terlewat, tidak menghapus apa pun

npm start            # jalankan server -> http://localhost:3000 (API + frontend sekaligus)
npm test             # semua test: node --test "test/*.test.js"

node --test test/holidays.route.test.js   # jalankan satu file test saja

PORT=3100 npm start                       # port lain (mis. untuk tes manual)
DB_FILE=/tmp/coba.db npm start            # pakai DB sementara, DB asli tidak tersentuh
SESSION_SECRET=xxx npm start              # hilangkan peringatan session secret
```

Tidak ada `npm run dev` / hot reload — restart manual setelah ubah backend. Perubahan frontend cukup refresh browser (file statis, tanpa build).

Migrasi jalan **otomatis** saat `db.js` di-require (jadi saat `npm start`/`npm test`), idempotent lewat tabel `_migrations`. Tidak ada command migrate terpisah.

Deploy produksi: **server berjalan di PC Windows**, dihidupkan otomatis lewat Windows Task Scheduler (bukan pm2 — `pm2 startup` tidak didukung di Windows). Komputer client (iMac, PC lain) cukup membuka alamatnya di browser, tanpa instalasi. `SESSION_SECRET` dan `BACKUP_DIR` disimpan sebagai environment variable Windows, bukan di dalam berkas repo, supaya tidak tertimpa saat `git pull`. Langkah lengkap di `absensi-app/backend/DEPLOY-WINDOWS.md`.

**Jam PC server menentukan gaji.** Jam masuk/pulang distempel dari `new Date()` di server, dan potongan telat dihitung dari situ — zona waktu PC server wajib benar (WIB). Ini syarat deploy, bukan detail kosmetik.
