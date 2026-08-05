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
| Export CSV | Laporan gaji (`owner.js`) dan daftar karyawan (`employeeList.js`), dibuat di browser pakai Blob + BOM UTF-8 supaya rapi dibuka Excel |
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

**Anti-fraud check-in** (login karyawan, kiosk, selfie, geolocation, device binding) — dibatalkan 2026-08-01, bukan ditunda. Karyawan tidak absen sendiri, jadi tidak ada alur yang bisa ditambal. Digantikan akuntabilitas HR di tabel "Sudah Jalan". Jangan hidupkan lagi tanpa keputusan baru soal apakah karyawan mulai absen sendiri.

## Aturan & Konvensi Wajib

- Perubahan yang menyentuh akses HR vs Owner harus jelas pemisahan permission-nya — pakai `requireAuth` / `requireOwner`, jangan cek role manual di dalam handler.
- **Jangan tambah endpoint DELETE untuk data absensi.** Riwayat absensi tidak boleh hilang.
- **Menghapus karyawan = soft delete.** Query apa pun yang mendaftar karyawan wajib menyaring `deleted_at IS NULL`. Pengecualian tunggal: laporan gaji, yang sengaja tetap memasukkan karyawan terhapus kalau punya absensi di periode itu.
- **Setiap route yang menulis data wajib memanggil `recordAudit`.** Log yang bolong berbohong lewat kekosongannya — pembaca menyimpulkan "tidak ada yang berubah" padahal cuma tidak dicatat.
- **`audit_log` hanya dibaca.** Jangan pernah buat endpoint ubah atau hapus untuknya.
- Alasan wajib **hanya** saat mengubah baris yang sudah ada. Mewajibkannya di input pertama akan menghasilkan alasan "." yang menyamarkan koreksi sungguhan.
- Jam absen selalu dari server. Jangan pernah terima `checkInTime` / `checkOutTime` dari body request, dan **jangan stempel ulang `check_in_time` yang sudah terisi** — potongan keterlambatan dihitung dari kolom itu.

## Stack Teknologi

**Backend** (`absensi-app/backend/`)
- Node.js **>=22.5** (wajib — pakai modul bawaan `node:sqlite`, tidak ada native build)
- Express 4 + `express-session`
- `bcryptjs` untuk hash password
- Test runner: `node --test` bawaan Node (tanpa Jest/Mocha)
- Dependency runtime cuma 3: `express`, `express-session`, `bcryptjs`

**Frontend** (`absensi-app/frontend/`)
- Vanilla JS, **tanpa build step / bundler / framework**
- Tailwind lewat CDN (`cdn.tailwindcss.com`) di `index.html`
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
    ecosystem.config.js  # config pm2 untuk deploy
    DEPLOY-MACOS.md      # panduan deploy ke iMac server kantor
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

## Konvensi Kode

- **Bahasa Indonesia** untuk komentar kode, pesan error yang dilihat user, nama tab UI, dan dokumen di `docs/`. Nama variabel/fungsi tetap Inggris.
- **Fitur baru = spec + plan dulu** di `docs/superpowers/`, format nama `YYYY-MM-DD-nama-fitur-design.md` (spec) dan `YYYY-MM-DD-nama-fitur.md` (plan).
- **Migrasi tidak pernah diedit setelah masuk repo** — bikin file bernomor baru. `.js` dipakai hanya kalau migrasi butuh logika (mis. konversi data lama sambil cetak peringatan); selain itu `.sql`.
- **Data berversi pakai `effective_from`** (`work_schedules`, `late_policies`), bukan overwrite. Perhitungan gaji periode lampau tidak boleh bergeser gara-gara perubahan aturan hari ini.
- **Jangan pernah** parsing string `'YYYY-MM-DD'` langsung ke `new Date(str)` — dianggap UTC dan bisa geser satu hari di WIB. Selalu pecah dulu lalu `new Date(y, m - 1, d)`.
- **Jam dari server, bukan dari client.** Frontend tidak pernah mengirim `checkInTime`/`checkOutTime`; server yang mengisi (lihat komentar di `storage.js`). Ini bagian dari anti-fraud.
- Semua akses API dari frontend lewat `Storage` di `storage.js` — jangan `fetch()` langsung dari file view.
- Periode payroll: **tanggal 28 bulan lalu s/d 27 bulan berjalan**, dipilih lewat query `?periodOffset=N` (0 = periode berjalan). Batasnya ada di konstanta `PERIOD_START_DAY`/`PERIOD_END_DAY`, **diduplikasi di 4 berkas** (`routes/payroll.js`, `frontend/js/owner.js`, `seedDemo.js`, `test/payroll.schedule.test.js`) karena frontend tanpa build step. Ubah keempatnya bersama, dan jaga selisihnya tetap satu hari.

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

Deploy produksi pakai pm2 (`ecosystem.config.js`), langkah lengkap ada di `absensi-app/backend/DEPLOY-MACOS.md`.
