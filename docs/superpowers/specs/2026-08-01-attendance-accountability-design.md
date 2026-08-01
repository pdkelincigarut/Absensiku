# Akuntabilitas Absensi — Audit Log & Koreksi Beralasan

Status: Disetujui, sudah diimplementasikan
Tanggal: 2026-08-01
Plan: [docs/superpowers/plans/2026-08-01-attendance-accountability.md](../plans/2026-08-01-attendance-accountability.md)

## 1. Latar Belakang

CLAUDE.md menyebut "anti-fraud check-in" sebagai fokus utama project. Setelah kode dibaca, premis itu tidak cocok dengan aplikasinya.

**Tidak ada check-in karyawan sama sekali.** Tabel `accounts` hanya punya role `hr` dan `owner`; karyawan tidak punya login dan tidak pernah menyentuh aplikasi. Yang terjadi: HR mencentang daftar di tab Monitoring, lalu `marked_by` diisi nama akun HR.

Jadi "titip absen" dalam bentuk klasik — karyawan A mengabsenkan karyawan B — belum mungkin terjadi, karena karyawan tidak absen. Permukaan kecurangan yang benar-benar ada sekarang ada di HR:

- `checklist.js:250` — satu tombol menandai **semua** karyawan yang belum absen sebagai Hadir Full Day 8 jam. Sehari kerja bisa dibuat dari satu klik, tanpa jejak.
- `PUT /api/attendance/:employeeId/:date` menimpa baris lewat `ON CONFLICT DO UPDATE`. Nilai lama hilang. `marked_by` dan `updated_at` ikut tertimpa, jadi tidak bisa menjawab "sebelumnya isinya apa, siapa yang mengubah".
- `note` ada tapi opsional, dan tidak dibedakan antara input pertama dan koreksi.
- `DELETE /api/employees/:id` menghapus permanen tanpa guard apa pun, meninggalkan baris absensi yatim yang tetap ikut terhitung di laporan gaji.

## 2. Keputusan User

- Alur absen **tetap HR yang menandai**. Tidak ada login karyawan, tidak ada kiosk, tidak ada absen mandiri.
- Karena itu **tidak ada** selfie, geolocation, maupun device binding — semuanya cuma bermakna kalau karyawan absen sendiri.
- Server diakses dari iMac itu sendiri (`http://localhost:3000`), tidak perlu setup HTTPS.

## 3. Sasaran Digeser: dari Autentikasi ke Akuntabilitas

Kecurangan tidak dicegah lewat verifikasi identitas, karena tidak ada identitas yang perlu diverifikasi. Yang dikerjakan spec ini: **membuat setiap perubahan data bisa ditelusuri, dan membuat koreksi mahal secara sosial.**

Prinsipnya: HR tetap bisa melakukan apa saja seperti sekarang — tidak ada yang diblokir, tidak ada persetujuan berjenjang. Yang berubah, semuanya tercatat dan bisa dilihat owner. Untuk perusahaan sekecil ini, kontrol sosial lebih realistis daripada kontrol teknis, dan tidak bikin pekerjaan harian HR macet.

**Konsekuensi baik:** tabel `attendance` tidak perlu berubah bentuk sama sekali. Alasan saya sebelumnya untuk menulis spec ini lebih dulu — takut kolom lokasi/device/foto membongkar tabel yang sudah dipakai fitur lain — gugur. Tidak ada yang perlu ditunda lagi setelah ini.

## 4. Skema — Migrasi `009_audit_log.sql`

```sql
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  account_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
```

Keputusan skema yang perlu dijelaskan:

- **`account_name` disalin, bukan di-JOIN ke `accounts`.** Akun bisa dihapus atau berganti nama; log yang isinya "diubah oleh akun #3 yang sudah tidak ada" tidak ada gunanya. Ini konsisten dengan `marked_by` yang memang sudah menyimpan nama, bukan id.
- **Snapshot baris utuh (`before_json`/`after_json`), bukan diff per kolom.** Diff per kolom rapuh terhadap migrasi — kolom yang ditambah belakangan bikin log lama tidak bisa dibaca. Snapshot utuh juga berarti baris yang terhapus bisa dikembalikan manual dari log. Baris absensi kecil, ukurannya tidak jadi masalah.
- **`entity_id` bertipe TEXT**, karena `holidays` memakai `date` sebagai primary key sedangkan tabel lain memakai integer.
- **Tanpa foreign key**, konsisten dengan `PRAGMA foreign_keys` yang sengaja mati di `db.js`.
- **Tidak ada endpoint hapus atau ubah untuk `audit_log`.** Log yang bisa disunting bukan log.

`action` yang dipakai: `create`, `update`, `delete`, `bulk_create`, `generate`, `confirm`, `check_out`.

## 5. Kapan `reason` Wajib

Aturan: **wajib saat mengubah baris yang sudah ada, opsional saat membuat baris baru.**

Input pertama adalah pekerjaan harian normal — memaksa alasan di situ akan diisi "." atau "-" dalam seminggu, dan log jadi penuh sampah yang menyamarkan koreksi sungguhan. Koreksi terhadap data yang sudah tercatat itulah yang perlu dipertanggungjawabkan.

Detail di `PUT /api/attendance/:employeeId/:date`:

- Baris belum ada → `reason` opsional, audit `action: 'create'`.
- Baris sudah ada dan **ada nilai yang berubah** → `reason` wajib. Kosong dibalas `400`. Audit `action: 'update'` berisi before dan after.
- Baris sudah ada dan **tidak ada yang berubah** → tidak minta alasan, tidak menulis audit sama sekali. Menyimpan ulang tanpa perubahan bukan peristiwa.

Perbandingan before/after dilakukan terhadap kolom bermakna saja (`status`, `attendance_type`, `hours_worked`, `note`), bukan `updated_at` atau `marked_by` yang memang selalu berubah.

## 6. Tombol Tandai Massal — Dicatat, Bukan Dihapus

Tombol ini vektor kecurangan terbesar yang ada sekarang, tapi **tetap dipertahankan**.

Alasannya: di perusahaan kecil, hari di mana semua orang hadir itu kasus normal, bukan pengecualian. Menghapus tombolnya memaksa HR mencentang satu per satu setiap hari, dan HR akan mencari jalan pintas lain yang lebih sulit diawasi. Yang salah bukan tombolnya — yang salah adalah tidak ada jejaknya.

Yang berubah:

- Satu baris audit per karyawan, `action: 'bulk_create'`, semuanya ber-`created_at` sama sehingga bisa dikelompokkan sebagai satu peristiwa di tampilan owner.
- Teks konfirmasi menyebutkan bahwa tindakan ini tercatat atas nama akun yang sedang login.
- Karyawan yang **sudah** punya baris absensi tidak ikut tersentuh, sama seperti perilaku sekarang.

Owner yang melihat "12 karyawan ditandai hadir sekaligus pukul 16:40" tiap hari bisa menilai sendiri. Itu tujuannya.

## 7. Soft Delete — Hanya `employees`

Rencana awal saya adalah menerapkan soft delete di semua tabel dalam satu pass. Setelah tiap tabel diperiksa, itu berlebihan dan justru merugikan: `deleted_at IS NULL` harus ditambahkan ke setiap `SELECT` di seluruh route, dan sekali terlewat, baris terhapus muncul lagi diam-diam.

| Tabel | Keputusan | Alasan |
|---|---|---|
| `employees` | **Soft delete** | Satu-satunya yang benar-benar butuh. Menghapus karyawan meninggalkan baris absensinya yatim tapi tetap terhitung di payroll. Belum ada guard sama sekali. |
| `jobs`, `organizations` | Tetap hard delete | `lookupRouter.js:62` sudah menolak hapus kalau masih dipakai karyawan. Yang bisa dihapus cuma yang tidak dipakai siapa-siapa. |
| `holidays` | Tetap hard delete | Barisnya sepele dan bisa dibuat ulang. `before_json` di audit log sudah cukup untuk memulihkan. |
| `work_schedules`, `late_policies` | Tetap hard delete | Berbahaya karena menghapus versi mengubah gaji periode lampau — tapi masalahnya penjadwalan/versi, bukan penghapusan. Layak spec sendiri, di luar cakupan ini. |
| `attendance` | Tidak ada DELETE | Memang tidak pernah ada endpointnya. Tetap begitu. |

Migrasi `010_employee_soft_delete.sql`:

```sql
ALTER TABLE employees ADD COLUMN deleted_at INTEGER;
```

`DELETE /api/employees/:id` berubah jadi mengisi `deleted_at`. Semua query yang mendaftar karyawan menyaring `deleted_at IS NULL`.

**Laporan gaji periode lampau sengaja tetap memasukkan karyawan terhapus** kalau dia punya absensi di periode itu. Menghilangkannya akan mengubah angka gaji yang sudah dibayarkan — persis kesalahan yang sudah dihindari `effective_from` di tabel jadwal.

Perbedaan dari kolom `active` yang sudah ada: `active = 0` berarti karyawan masih terdaftar tapi sedang tidak aktif dan tetap muncul di daftar; `deleted_at` berarti hilang dari daftar. Dua hal berbeda, jangan digabung.

## 8. Modul & Endpoint

`auditLog.js` di root backend (menyentuh DB, jadi bukan modul murni seperti `lateCalculator.js`):

```js
recordAudit(session, { action, entity, entityId, before, after, reason })
```

Route yang menulis audit: `attendance` (create/update/bulk_create/check_out), `employees` (create/update/delete), `holidays` (create/delete/generate/confirm), `workSchedules`, `latePolicies`, `lookupRouter`. Setengah-setengah tidak dipakai — log yang bolong berbohong lewat kekosongannya.

```
GET /api/audit-log?entity=&entityId=&from=&to=&limit=
    → requireOwner. HR tidak bisa membaca log tentang dirinya sendiri.
    → urut created_at menurun, limit default 100.
```

## 9. Frontend

- **Tab baru "Log Perubahan"** di dashboard Owner (jadi tab kedelapan di `owner.js`). Daftar perubahan terbaru dengan filter jenis data dan rentang tanggal. Tiap baris: waktu, nama akun, tindakan, data yang disentuh, alasan, dan perbandingan nilai sebelum/sesudah yang dirender dari JSON. Peristiwa `bulk_create` yang ber-`created_at` sama dikelompokkan jadi satu baris ringkas.
- **Panel koreksi absensi** mendapat field **"Alasan koreksi"** yang muncul hanya kalau baris sudah punya data. Tombol simpan mati selama alasan kosong, supaya penolakan tidak baru terjadi setelah dikirim.
- **Dialog tandai massal** menyebutkan bahwa tindakan tercatat.
- Tab ini **tidak ada di dashboard HR**.

## 10. Di Luar Cakupan

- Login karyawan, absen mandiri, kiosk, selfie, geolocation, device binding — dibatalkan oleh keputusan di bagian 2, bukan ditunda.
- Persetujuan berjenjang (koreksi HR menunggu ACC owner).
- Notifikasi ke owner saat ada koreksi.
- Memulihkan data dari audit log lewat UI. Snapshot-nya ada, tapi tombol undo perlu spec sendiri.
- Retensi/pemangkasan `audit_log`. Volumenya kecil, urusan bertahun lagi.
- Versi/penghapusan `work_schedules` dan `late_policies` — lihat tabel di bagian 7.
- Mengubah CLAUDE.md. Menyusul setelah ini disetujui, karena roadmap no. 6 di sana gugur.

## 11. Verifikasi

`npm test` — 113 test lama harus tetap lolos, ditambah:

- Koreksi tanpa alasan ditolak `400`; koreksi dengan alasan lolos dan menulis satu baris audit berisi before dan after.
- Input pertama tanpa alasan lolos dan menulis audit `create`.
- Simpan ulang tanpa perubahan tidak menulis audit dan tidak minta alasan.
- Tandai massal menulis satu baris audit per karyawan yang belum tertandai.
- `DELETE /api/employees/:id` mengisi `deleted_at`, karyawan hilang dari `GET /api/employees`, tapi baris absensinya masih ada dan laporan gaji periode terkait angkanya tidak berubah.
- `GET /api/audit-log` menolak akun HR dengan `403`.

Uji browser: koreksi satu absensi, pastikan field alasan muncul dan tombol simpan mati sampai diisi; buka tab Log Perubahan dan pastikan perubahan itu tampil lengkap dengan nilai sebelum dan sesudah; hapus satu karyawan lalu pastikan laporan gaji periode berjalan tidak berubah angkanya.
