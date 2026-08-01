# CLAUDE.md — Absensiku

Panduan konteks project ini untuk Claude Code. File ini dibaca otomatis setiap sesi baru dibuka di folder project.

## Tentang Project

Absensiku adalah aplikasi absensi karyawan untuk **CV KLC Group**, dengan akses multi-role (HR admin & owner). Arah jangka panjang: **mencegah kecurangan absen** (titip absen / proxy attendance) lewat metode check-in yang sulit dimanipulasi.

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
| Laporan gaji | Periode 27 bulan lalu s/d 26 bulan berjalan, sudah hitung potongan telat |

### Belum Dikerjakan (Roadmap)

Urut dari yang paling kecil ketergantungannya:

1. **Export rekap Excel/PDF** per periode, format siap dipakai payroll.
   Belum ada sama sekali — tidak ada dependency export, tidak ada endpoint. Perlu keputusan: generate di server (nambah dependency) atau di browser.
2. **Koreksi absen manual wajib beralasan.**
   Sekarang `PUT /api/attendance/:employeeId/:date` menerima `note` tapi **opsional**, dan `marked_by` cuma diisi nama akun tanpa riwayat perubahan. Belum ada field `reason` wajib.
3. **Audit trail.**
   Belum ada tabel audit sama sekali. Yang ada cuma `marked_by` + `updated_at` di baris absensi — ketimpa setiap kali diedit, jadi tidak bisa menjawab "siapa mengubah apa, kapan".
4. **Soft delete.**
   Belum ada kolom `deleted_at` di mana pun. Kondisi sekarang: absensi memang tidak punya endpoint DELETE (aman), tapi `employees`, `holidays`, `jobs`, `organizations`, `work_schedules`, `late_policies` semua **hard delete**.
5. **Reminder/notifikasi** untuk karyawan yang belum absen.
   Belum ada — tidak ada scheduler, tidak ada kanal notifikasi (email/WA/push) yang dipilih.
6. **Anti-fraud check-in** — tujuan utama project, tapi paling jauh.
   Sekarang check-in cuma jam server: HR/Owner bisa menandai kehadiran siapa pun, tidak ada verifikasi lokasi / device / foto saat absen. Foto karyawan yang ada sekarang **master data, bukan bukti absen**. Butuh spec sendiri sebelum disentuh.

## Aturan & Konvensi Wajib

Berlaku sekarang:

- Perubahan yang menyentuh akses HR vs Owner harus jelas pemisahan permission-nya — pakai `requireAuth` / `requireOwner`, jangan cek role manual di dalam handler.
- **Jangan tambah endpoint DELETE untuk data absensi.** Riwayat absensi tidak boleh hilang. Kalau butuh "hapus", tunggu soft delete (roadmap no. 4).
- Jam absen selalu dari server. Jangan pernah terima `checkInTime` / `checkOutTime` dari body request.

Berlaku **nanti**, setelah item roadmap terkait dikerjakan — jangan ditulis seolah sudah aktif:

- Semua penghapusan jadi soft delete (`deleted_at`) — setelah roadmap no. 4.
- Setiap koreksi manual wajib `reason` + tercatat di audit log — setelah roadmap no. 2 & 3.

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
      tableUtils.js      # helper render tabel
docs/superpowers/
  specs/                 # dokumen spesifikasi per fitur (bahasa Indonesia)
  plans/                 # dokumen rencana implementasi, berpasangan dengan spec
```

### Modul kalkulasi murni (tanpa DB)

Logika perhitungan dipisah ke modul murni supaya gampang di-test tanpa DB. Jangan taruh query SQL di sini:
- `scheduleResolver.js` — resolusi jadwal kerja berlaku pada tanggal tertentu, helper tanggal (`addDaysStr`, `dayOfWeek`)
- `lateCalculator.js` — hitung menit telat & potongan
- `holidayCalculator.js` — hitung tanggal libur nasional (Imlek/Idul Fitri/Idul Adha/Kemerdekaan) via `Intl.DateTimeFormat`

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

## Konvensi Kode

- **Bahasa Indonesia** untuk komentar kode, pesan error yang dilihat user, nama tab UI, dan dokumen di `docs/`. Nama variabel/fungsi tetap Inggris.
- **Fitur baru = spec + plan dulu** di `docs/superpowers/`, format nama `YYYY-MM-DD-nama-fitur-design.md` (spec) dan `YYYY-MM-DD-nama-fitur.md` (plan).
- **Migrasi tidak pernah diedit setelah masuk repo** — bikin file bernomor baru. `.js` dipakai hanya kalau migrasi butuh logika (mis. konversi data lama sambil cetak peringatan); selain itu `.sql`.
- **Data berversi pakai `effective_from`** (`work_schedules`, `late_policies`), bukan overwrite. Perhitungan gaji periode lampau tidak boleh bergeser gara-gara perubahan aturan hari ini.
- **Jangan pernah** parsing string `'YYYY-MM-DD'` langsung ke `new Date(str)` — dianggap UTC dan bisa geser satu hari di WIB. Selalu pecah dulu lalu `new Date(y, m - 1, d)`.
- **Jam dari server, bukan dari client.** Frontend tidak pernah mengirim `checkInTime`/`checkOutTime`; server yang mengisi (lihat komentar di `storage.js`). Ini bagian dari anti-fraud.
- Semua akses API dari frontend lewat `Storage` di `storage.js` — jangan `fetch()` langsung dari file view.
- Periode payroll: **tanggal 27 bulan lalu s/d 26 bulan berjalan**, dipilih lewat query `?periodOffset=N` (0 = periode berjalan).

## Command yang Sering Dipakai

Semua command backend dijalankan dari `absensi-app/backend/`:

```bash
npm install          # sekali di awal
npm run seed         # isi data demo — akun hradmin/hr123 (HR) & owner/owner123 (Owner)
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
