# Akuntabilitas Absensi — Implementation Plan

**Goal:** Setiap perubahan data bisa ditelusuri owner, koreksi absensi wajib beralasan, dan menghapus karyawan tidak lagi merusak laporan gaji.

**Architecture:** Satu tabel `audit_log` menyimpan snapshot baris utuh sebelum dan sesudah perubahan, ditulis lewat modul `auditLog.js` yang dipanggil setiap route penulis. Soft delete hanya diterapkan pada `employees` — tabel lain sudah aman lewat guard yang ada atau cukup dipulihkan dari `before_json`. Tombol tandai massal dipindah dari N permintaan `PUT` menjadi satu endpoint `POST /bulk-mark`, supaya server tahu sendiri bahwa itu satu tindakan massal.

**Tech Stack:** Node.js + Express + `node:sqlite`, `node:test`; frontend vanilla JS + Tailwind CDN.

Spec: [docs/superpowers/specs/2026-08-01-attendance-accountability-design.md](../specs/2026-08-01-attendance-accountability-design.md)

## Global Constraints

- **Tanpa dependency baru.**
- Semua teks antarmuka berbahasa Indonesia; nilai dari data yang masuk ke HTML lewat `escapeHtml`.
- BLOB foto **tidak pernah** ikut ke dalam snapshot log.
- `audit_log` hanya bisa dibaca. Tidak boleh ada endpoint ubah maupun hapus untuknya.
- Alasan wajib **hanya** saat mengubah baris yang sudah ada, tidak saat membuat baris baru.
- Semua test lama (113) harus tetap lolos di setiap tahap.

## Tahapan

### 1. Skema

- [x] `migrations/009_audit_log.sql` — tabel `audit_log` + index `(entity, entity_id)` dan `(created_at)`.
- [x] `migrations/010_employee_soft_delete.sql` — kolom `employees.deleted_at`.
- [x] Test `db.test.js` diperluas untuk kedua migrasi.

### 2. Modul penulis log

- [x] `auditLog.js` dengan `recordAudit(session, {...})` dan `hasMeaningfulChange(before, after)`.
- [x] `SKIPPED_COLUMNS` membuang BLOB `photo` dari snapshot.
- [x] `NOISE_COLUMNS` (`updated_at`, `marked_by`, `photo_updated_at`) diabaikan saat menentukan ada-tidaknya perubahan.
- [x] `createdAt` bisa dipaksa dari luar supaya satu tindakan massal menghasilkan baris ber-`created_at` identik.

### 3. Absensi

- [x] `PUT /:employeeId/:date` membaca baris lama dulu, menolak `400` kalau koreksi tanpa `reason`.
- [x] Simpan ulang tanpa perubahan: tidak minta alasan, tidak menulis log.
- [x] **Perbaikan bug:** `check_in_time` yang sudah tercatat dipertahankan, tidak distempel ulang tiap penyimpanan. Sebelumnya mengoreksi catatan pukul 16:00 memindahkan jam masuk dari 08:00 ke 16:00, dan potongan keterlambatan dihitung dari kolom itu.
- [x] `POST /bulk-mark` baru: satu baris log per karyawan, melewati yang sudah tercatat.
- [x] Check-out ikut tercatat.

### 4. Soft delete karyawan

- [x] `DELETE /api/employees/:id` mengisi `deleted_at`, tidak lagi menghapus baris.
- [x] Semua query yang mendaftar karyawan menyaring `deleted_at IS NULL` (`employees`, `attendance`, `latePolicies` ×2, `workSchedules`, `lookupRouter`).
- [x] Payroll **tetap** memasukkan karyawan terhapus yang punya absensi di periode itu.
- [x] Bentrok kode karyawan terhadap karyawan terhapus diberi pesan tersendiri, karena index uniknya masih memegang kode itu.

### 5. Log di route lain

- [x] `holidays` (create/generate/confirm/delete), `workSchedules` (create/delete), `latePolicies` (create/delete), `lookupRouter` (create/update/delete), `employees` (create/update/delete).

### 6. Endpoint baca

- [x] `routes/auditLog.js` — `GET /api/audit-log`, `requireOwner`, filter `entity`/`entityId`/`from`/`to`/`limit`, urut `created_at` menurun, limit default 100 dan plafon 500.
- [x] Konversi `from`/`to` memakai konstruktor komponen tanggal, bukan `new Date('YYYY-MM-DD')` yang dianggap UTC.
- [x] Di-mount di `server.js`.

### 7. Frontend

- [x] `storage.js`: `bulkMarkAttendance`, `getAuditLog`, `reason` di `upsertAttendance`.
- [x] `checklist.js`: field "Alasan koreksi" muncul hanya kalau baris sudah ada; tombol simpan mati selama kosong; dialog tandai massal menyebut pencatatan; tombol massal memakai endpoint baru.
- [x] `auditView.js` baru + tab "Log Perubahan" di `owner.js` + `<script>` di `index.html`.
- [x] Peristiwa `bulk_create` ber-`createdAt` sama digabung jadi satu baris.
- [x] Tab tidak ada di dashboard HR.

### 8. Verifikasi

- [x] `npm test` — 126 lolos (113 lama + 13 baru).
- [x] Uji browser: tandai massal 3 karyawan, koreksi satu absensi (tombol simpan mati sampai alasan diisi), lihat tab Log Perubahan sebagai Owner.

## Catatan Hasil

- Satu test lama perlu diubah, bukan karena regresi: `attendance.checkout.test.js` mengubah status hadir menjadi izin tanpa alasan, yang sekarang memang ditolak. Helper-nya diberi `reason`.
- Rencana awal "soft delete di semua tabel" dipersempit setelah tiap tabel diperiksa. `jobs`/`organizations` sudah menolak hapus kalau masih dipakai, `holidays` sepele dan bisa dibuat ulang, `attendance` tidak punya endpoint DELETE. Menyebar `deleted_at IS NULL` ke seluruh route demi tabel yang tidak membutuhkannya justru menambah risiko baris terhapus muncul lagi karena satu filter terlewat.
- Rencana awal "hapus tombol tandai massal" dibatalkan. Tombolnya dipertahankan dan dicatat, karena menghapusnya akan mendorong HR mencari jalan pintas yang lebih sulit diawasi.

## Di Luar Cakupan

Lihat bagian 10 spec. Yang paling perlu diingat: penghapusan/versi `work_schedules` dan `late_policies` masih hard delete dan bisa menggeser gaji periode lampau — layak spec sendiri.
