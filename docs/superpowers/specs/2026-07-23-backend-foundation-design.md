# Fondasi Backend AbsensiKu (Node.js + Express + SQLite)

Status: Disetujui (menunggu implementasi)
Tanggal: 2026-07-23

## 1. Latar Belakang

Roadmap 6 fitur berikutnya (soft delete + audit trail, pengaturan jam kerja, koreksi absen manual, dashboard real-time, export Excel/PDF, reminder & notifikasi — lihat `prompt-claude-code-absensiku.md` dari user) mengasumsikan ada server yang melakukan validasi dan database yang menyimpan data secara tepercaya. AbsensiKu saat ini murni client-side (vanilla JS + `localStorage`), sehingga tidak bisa memenuhi jaminan itu — siapa pun bisa mengubah "audit log" lewat DevTools browser.

Dokumen ini adalah desain **fondasi backend** yang harus berdiri lebih dulu sebelum 6 fitur tersebut dikerjakan satu per satu (masing-masing dapat spec & plan sendiri). Cakupannya murni memindahkan kapabilitas yang sudah ada sekarang (akun HR/Owner, data karyawan, ceklis kehadiran, laporan gaji) dari `localStorage` ke server + database sungguhan — **tanpa menambah fitur baru**.

## 2. Keputusan Arsitektur

- **Self-hosted Node.js + Express + SQLite** (bukan BaaS seperti Firebase/Supabase) — kontrol penuh atas data, cocok untuk kebutuhan audit trail yang akan dibangun di Fitur 1, dan skalanya pas untuk CV/usaha kecil-menengah.
- **Hosting:** untuk sekarang dijalankan lokal (development/testing). Lokasi produksi (server kantor via LAN) menyusul belakangan — arsitektur didesain supaya gampang dipindah ke PC/server kantor kapan saja tanpa perubahan kode.
- **Migrasi data:** tidak ada. Backend baru mulai dari seed bersih (akun demo `hradmin`/`owner` + 3 karyawan contoh, sama seperti sekarang) karena data yang ada di localStorage saat ini murni data uji coba.
- **Auth:** session cookie `httpOnly` (bukan JWT) — paling sederhana untuk kebutuhan LAN dengan 2 jenis akun tetap.
- **Real-time:** polling tiap 15 detik dari frontend (pola yang sudah ada sekarang dipertahankan), bukan WebSocket — sesuai instruksi eksplisit di prompt user ("jangan pakai WebSocket kecuali sudah ada infrastrukturnya"). Karena data kini benar-benar di server bersama, ini otomatis membuat PC HR dan PC Owner melihat data yang sama secara real.

## 3. Struktur Proyek

```
absensi-app/
├── frontend/               ← index.html, js/*.js — dipindah apa adanya dari struktur sekarang
└── backend/
    ├── server.js            ← Express app: serve frontend statis + mount API di /api
    ├── db.js                ← koneksi SQLite (better-sqlite3) + inisialisasi skema
    ├── seed.js              ← seed data demo
    ├── routes/
    │   ├── auth.js
    │   ├── employees.js
    │   ├── attendance.js
    │   └── payroll.js
    ├── data/absensiku.db     ← file database, di-gitignore (state runtime, bukan source)
    └── package.json
```

Satu proses Node.js menyajikan frontend statis dan API di port yang sama — PC HR & PC Owner cukup buka satu alamat (`http://<host>:3000`), tanpa perlu setup CORS atau dua server terpisah.

## 4. Skema Database (SQLite)

```sql
accounts (
  id, name, username UNIQUE, password_hash, role CHECK(hr|owner), created_at
)

employees (
  id, name, daily_wage, birth_date NULL, active, created_at
)

attendance (
  id, employee_id REFERENCES employees(id), date,
  status CHECK(hadir|izin|sakit|alpa),
  attendance_type CHECK(full|half|custom) NULL,
  hours_worked NULL,
  check_in_time NULL,
  note, marked_by,        -- nama akun yang menceklis; jejak sederhana, BUKAN audit trail formal (itu Fitur 1)
  updated_at,
  UNIQUE(employee_id, date)
)

sessions  -- dikelola otomatis oleh session store (mis. connect-sqlite3), bukan ditulis manual
```

- `password_hash` menggantikan password polos yang dipakai sekarang — di-hash dengan `bcrypt`. Ini perbaikan keamanan nyata dibanding versi localStorage.
- Sengaja **tidak ada** kolom `deleted_at` atau tabel `audit_logs` di fondasi ini — itu masuk Fitur 1.
- Perhitungan gaji (yang sekarang ada di `computePayrollRow` pada `owner.js`) **pindah ke server**, sesuai aturan "semua validasi dan perhitungan dilakukan di server."

## 5. API

**Auth:**
- `POST /api/login` `{username, password, role}` → verifikasi via `bcrypt.compare`, set cookie sesi `httpOnly` bila cocok.
- `POST /api/logout` → hapus sesi.
- `GET /api/me` → info akun yang sedang login (dipakai saat refresh halaman, gantikan `Auth.currentAccount()` versi localStorage).

**Data** (1:1 menggantikan method `Storage` yang ada sekarang):
```
GET    /api/employees                 (Owner: dengan upah; HR: tanpa upah)
POST   /api/employees                 (Owner only)
PUT    /api/employees/:id             (Owner only)
DELETE /api/employees/:id             (Owner only — masih hard delete; soft delete = Fitur 1)

GET    /api/attendance?date=YYYY-MM-DD
PUT    /api/attendance/:employeeId/:date   (upsert ceklis; jam diambil dari waktu server, BUKAN dari body request)
GET    /api/attendance/history?employeeId=&month=

GET    /api/payroll?periodOffset=0
```

Endpoint khusus Owner (data karyawan, upah, laporan gaji) menolak request dari akun role `hr` **di server**, bukan cuma disembunyikan di UI seperti sekarang — menutup celah HR mengakses data upah lewat DevTools/panggilan API langsung.

## 6. Integrasi Frontend

UI yang sudah ada (`app.js`, `hr.js`, `owner.js`, `checklist.js`) tidak ditulis ulang dari nol, tapi:

- `storage.js` ditulis ulang total: tiap method jadi `async function` yang `fetch()` ke endpoint terkait.
- `auth.js` jadi async; `Auth.login()` dan `Auth.currentAccount()` memanggil API.
- Setiap pemanggil fungsi-fungsi itu di `hr.js`, `owner.js`, `checklist.js`, `app.js` ditambah `await`, fungsi pembungkusnya jadi `async function` — menyentuh hampir semua fungsi render, tapi HTML/CSS/tampilan tidak berubah.
- Loading state sederhana (teks "Memuat...") saat fetch berjalan.
- Error handling saat server tidak bisa dihubungi — pesan jelas, bukan layar kosong.

Ini murni migrasi cara baca/tulis data — tidak ada perubahan perilaku aplikasi dari sisi pengguna.

## 7. Di Luar Cakupan (ditunda ke spec fitur masing-masing)

- Soft delete + `audit_logs` (Fitur 1)
- Pengaturan jam kerja & versioning aturan (Fitur 2)
- Alur pengajuan/koreksi absen manual (Fitur 3)
- UI dashboard ringkasan klik-untuk-detail (Fitur 4 — real-time dasarnya sudah otomatis didapat dari fondasi ini)
- Export Excel/PDF (Fitur 5)
- Reminder/notifikasi & scheduler (Fitur 6)
- Deploy ke server kantor sungguhan (masih dev-only untuk sekarang)

## 8. Cara Menjalankan (setelah implementasi)

```bash
cd backend
npm install
npm run seed   # sekali saja, isi data demo
npm start      # jalan di http://localhost:3000
```
