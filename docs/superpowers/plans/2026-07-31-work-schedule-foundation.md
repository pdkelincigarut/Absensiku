# Fondasi Jadwal Kerja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jadwal kerja, hari libur, jam pulang, dan aturan keterlambatan berversi — sehingga hari kerja terjadwal punya dasar data, dan Laporan Gaji berhenti menghitung Minggu sebagai alpa.

**Architecture:** Semua pemilihan aturan-berlaku-pada-tanggal terkumpul di satu modul murni `scheduleResolver.js` tanpa akses database, dipakai bersama oleh payroll dan (nanti) Insight Dashboard. Jadwal dan aturan telat sama-sama berversi lewat `effective_from`, dengan pola pemilihan identik. Migrasi menjaga angka gaji periode lampau tetap sama kecuali perbaikan bug alpa yang memang disengaja.

**Tech Stack:** Node.js + Express + `node:sqlite`, `node:test`; frontend vanilla JS + Tailwind CDN.

Spec: [docs/superpowers/specs/2026-07-31-work-schedule-foundation-design.md](../specs/2026-07-31-work-schedule-foundation-design.md)

## Global Constraints

- **Tanpa dependency baru.**
- **Tidak ada objek `Date` bermuatan zona waktu dalam perhitungan.** Semua banding memakai string `YYYY-MM-DD` dan `HH:MM`. `new Date()` hanya boleh dipakai untuk menstempel jam server saat mencatat absen.
- **Jam masuk & jam pulang selalu dari jam server**, nilai dari client diabaikan.
- Aturan yang dipakai selalu yang berlaku **pada tanggal absensi**, bukan yang berlaku sekarang.
- Hari yang bukan hari kerja terjadwal **dilewati sepenuhnya** — bukan dihitung hadir, bukan alpa.
- `check_out_time` yang `NULL` berarti "belum dicatat", tidak boleh diperlakukan sebagai nol atau tepat waktu.
- Ikuti gaya visual yang ada: aksen `indigo-600`, netral `slate-*`, kartu `bg-white border border-slate-200 rounded-xl`.
- Semua teks antarmuka berbahasa Indonesia; setiap nilai data yang masuk HTML lewat `escapeHtml`.
- 41 test lama harus tetap lolos di setiap tahap.

---

## Task 1: Migration runner mendukung berkas `.js`

**Files:**
- Modify: `absensi-app/backend/db.js`

**Interfaces:**
- Produces: migrasi boleh berupa `.js` yang mengekspor `function (db)` selain `.sql`.

Alasan: migrasi 006 perlu mencetak peringatan berisi nama karyawan yang batas telatnya berubah karena konversi. SQL murni tidak bisa melakukannya.

- [ ] **Step 1: Ubah `runMigrations()`**

Baca `.sql` dan `.js`, urutkan bersama berdasarkan nama berkas:
```js
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
  .sort();

for (const file of files) {
  if (applied.has(file)) continue;
  if (file.endsWith('.sql')) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  } else {
    require(path.join(migrationsDir, file))(db);
  }
  db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
  console.log(`Migration diterapkan: ${file}`);
}
```

- [ ] **Step 2: Jalankan test lama**

Run (dari `absensi-app/backend`): `npm test`
Expected: 41 pass, 0 fail.

---

## Task 2: Migrasi `006_work_schedule_foundation.js`

**Files:**
- Create: `absensi-app/backend/migrations/006_work_schedule_foundation.js`

**Interfaces:**
- Produces: tabel `work_schedules`, `holidays`; kolom `attendance.check_out_time`; `late_policies` berversi dengan `grace_minutes`.

- [ ] **Step 1: Tulis migrasi**

Isi berkas: `module.exports = function (db) { ... }` yang menjalankan berurutan:

1. `CREATE TABLE work_schedules` + index `(employee_id, effective_from)`.
2. `CREATE TABLE holidays`.
3. `ALTER TABLE attendance ADD COLUMN check_out_time TEXT`.
4. Sisipkan jadwal baku perusahaan: `employee_id = NULL`, `work_days = '1,2,3,4,5'`, `start_time = '08:00'`, `end_time = '17:00'`, `effective_from = '1970-01-01'`.
5. Buat `late_policies_new`, salin dari `late_policies` lama dengan konversi:
   ```js
   const COMPANY_START_MINUTES = 8 * 60; // sesuai jadwal baku di langkah 4
   const old = db.prepare('SELECT * FROM late_policies').all();
   const terdampak = [];
   for (const row of old) {
     const [h, m] = row.check_in_limit.split(':').map(Number);
     const raw = (h * 60 + m) - COMPANY_START_MINUTES;
     if (raw < 0) {
       const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(row.employee_id);
       terdampak.push(`${emp ? emp.name : 'id ' + row.employee_id} (batas lama ${row.check_in_limit})`);
     }
     // effective_from 1970-01-01 supaya perhitungan periode lampau tidak berubah
     insert.run(row.employee_id, Math.max(0, raw), row.threshold_minutes, ...);
   }
   ```
6. `DROP TABLE late_policies`, `ALTER TABLE late_policies_new RENAME TO late_policies`, buat index `(employee_id, effective_from)`.
7. Kalau `terdampak.length > 0`, cetak peringatan:
   ```js
   console.warn(`PERHATIAN: batas keterlambatan ${terdampak.length} karyawan berubah karena jam masuknya lebih awal dari jadwal baku 08:00 — periksa di tab Aturan Keterlambatan: ${terdampak.join(', ')}`);
   ```

- [ ] **Step 2: Jalankan test lama**

Run: `npm test`
Expected: FAIL — test payroll dan late-policies lama memakai `check_in_limit` yang sudah tidak ada. Ini diharapkan; diperbaiki di Task 5 dan 7.

- [ ] **Step 3: Verifikasi migrasi di database bersih**

Run:
```bash
DB_FILE="/tmp/mig006.db" node -e "require('./db')"
```
Expected: keenam migrasi diterapkan tanpa error.

---

## Task 3: Modul murni `scheduleResolver.js`

**Files:**
- Create: `absensi-app/backend/scheduleResolver.js`
- Create: `absensi-app/backend/test/scheduleResolver.test.js`
- Modify: `absensi-app/backend/lateCalculator.js` (pindahkan `computeLateMinutes`)

**Interfaces:**
- Produces: `resolveSchedule`, `isWorkday`, `resolveLatePolicy`, `computeLateMinutes`, `countScheduledDays`, `dayOfWeek`.

- [ ] **Step 1: Tulis test lebih dulu**

Kasus yang harus diuji:
- `resolveSchedule` memilih `effective_from` terbesar yang `<= tanggal`.
- Jadwal khusus karyawan menang atas jadwal baku **walaupun baku lebih baru**.
- Karyawan tanpa jadwal khusus jatuh ke jadwal baku.
- Tanggal sebelum semua `effective_from` → `null`.
- `isWorkday` false untuk hari di luar `work_days`, false untuk tanggal di `holidaySet`, true selain itu.
- `computeLateMinutes('08:45', '08:00', 30)` → 15; `('08:20','08:00',30)` → 0; `checkIn` kosong → 0.
- `countScheduledDays` menghitung benar melewati batas bulan dan mengecualikan libur.
- `resolveLatePolicy` mengikuti pola pemilihan versi yang sama.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Tulis modul**

Catatan implementasi:
- `dayOfWeek(dateStr)` dihitung dari string tanpa `Date` bermuatan zona waktu: pakai algoritma Sakamoto, atau `new Date(y, m-1, d).getDay()` yang aman karena dibangun dari komponen lokal, bukan parsing string ISO. **Pakai konstruktor komponen, jangan `new Date('2026-07-31')`** — bentuk string ISO diparse sebagai UTC dan bisa menggeser hari.
- `work_days` disimpan sebagai string `'1,2,3,4,5'`, di-parse jadi `Set` angka.
- `computeLateMinutes(checkInTime, startTime, graceMinutes)` = `max(0, menit(checkIn) − (menit(start) + grace))`.

- [ ] **Step 4: Jalankan test**

Run: `npm test`
Expected: test `scheduleResolver` pass (test payroll & late-policies masih merah sampai Task 5 dan 7).

---

## Task 4: Endpoint jadwal kerja & hari libur

**Files:**
- Create: `absensi-app/backend/routes/workSchedules.js`
- Create: `absensi-app/backend/routes/holidays.js`
- Create: `absensi-app/backend/test/workSchedules.route.test.js`
- Create: `absensi-app/backend/test/holidays.route.test.js`
- Modify: `absensi-app/backend/server.js`

- [ ] **Step 1: Tulis test lebih dulu**

Jadwal: GET mengembalikan baku + pengecualian; PUT dengan `employeeIds: null` mengubah baku; PUT dengan daftar id membuat pengecualian untuk tiap id; `workDays` kosong ditolak 400; `startTime`/`endTime` bukan `HH:MM` ditolak 400; `endTime` lebih awal dari `startTime` ditolak 400; `effectiveFrom` bukan `YYYY-MM-DD` ditolak 400; DELETE menghapus satu versi; DELETE versi terakhir jadwal baku ditolak 400 (perusahaan harus selalu punya jadwal baku); akun HR ditolak 403.

Libur: POST menambah; tanggal kembar ditolak 400; nama kosong ditolak 400; GET menyaring per tahun; DELETE menghapus; akun HR ditolak 403.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test` → FAIL.

- [ ] **Step 3: Tulis kedua route + pasang di `server.js`**

```js
app.use('/api/work-schedules', require('./routes/workSchedules'));
app.use('/api/holidays', require('./routes/holidays'));
```

- [ ] **Step 4: Jalankan test**

Run: `npm test` → test jadwal & libur pass.

---

## Task 5: `late_policies` berversi

**Files:**
- Modify: `absensi-app/backend/routes/latePolicies.js`
- Modify: `absensi-app/backend/test/latePolicies.route.test.js`

- [ ] **Step 1: Perbarui test**

Ganti `checkInLimit` jadi `graceMinutes` + `effectiveFrom`. Tambah: PUT dua kali dengan `effectiveFrom` berbeda menghasilkan **dua baris**, bukan menimpa; GET mengembalikan riwayat versi per karyawan urut tanggal; `graceMinutes` negatif ditolak 400; DELETE menghapus satu versi berdasarkan `id`.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test` → FAIL.

- [ ] **Step 3: Ubah route**

`PUT` menyisipkan versi baru (`INSERT`, bukan upsert). `GET` mengembalikan `{ employeeId, name, versions: [...] }`. `DELETE /:id` menghapus satu versi.

- [ ] **Step 4: Jalankan test**

Run: `npm test` → pass.

---

## Task 6: Pencatatan jam pulang

**Files:**
- Modify: `absensi-app/backend/routes/attendance.js`
- Create: `absensi-app/backend/test/attendance.checkout.test.js`

- [ ] **Step 1: Tulis test lebih dulu**

`POST /api/attendance/:employeeId/:date/check-out` mengisi `check_out_time` dari jam server; menolak 400 kalau status bukan `hadir`; menolak 400 kalau `check_in_time` kosong; menolak 404 kalau belum ada record; memanggil dua kali menimpa dengan jam terbaru (koreksi); `check_out_time` ikut di respons `GET /api/attendance`.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test` → FAIL.

- [ ] **Step 3: Tambah endpoint & sertakan field di `toJson`**

Jam dari `serverTimeStr()` yang sudah ada.

- [ ] **Step 4: Jalankan test**

Run: `npm test` → pass.

---

## Task 7: Payroll memakai jadwal (perbaikan bug alpa)

**Files:**
- Modify: `absensi-app/backend/routes/payroll.js`
- Modify: `absensi-app/backend/test/payroll.late.test.js`
- Create: `absensi-app/backend/test/payroll.schedule.test.js`

- [ ] **Step 1: Tulis test lebih dulu**

`payroll.schedule.test.js`:
- Karyawan tanpa catatan absensi sama sekali dalam satu periode → jumlah `alpa` **sama dengan jumlah hari kerja terjadwal lampau**, bukan jumlah hari kalender. Hitung ekspektasinya secara eksplisit di test dari jadwal Senin–Jumat.
- Hari Minggu tidak pernah menambah `alpa`.
- Tanggal yang terdaftar di `holidays` tidak menambah `alpa`.
- Karyawan dengan jadwal pengecualian (mis. Senin–Sabtu) mendapat jumlah hari kerja berbeda dari yang memakai jadwal baku.
- Menit telat memakai `startTime` jadwal + `graceMinutes` aturan yang berlaku pada tanggal itu.
- **Aturan berversi:** absensi tanggal lama tetap memakai versi aturan lama walaupun ada versi baru yang berlaku belakangan.

`payroll.late.test.js` disesuaikan ke `graceMinutes`.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test` → FAIL.

- [ ] **Step 3: Ubah `payroll.js`**

Muat sekali di awal request: semua `work_schedules`, semua `holidays` dalam rentang periode (jadikan `Set`), semua `late_policies`. Lalu loop harian memakai `scheduleResolver`. Hari yang bukan hari kerja dilewati sepenuhnya.

- [ ] **Step 4: Jalankan test**

Run: `npm test`
Expected: **semua** test pass, termasuk 41 yang lama.

---

## Task 8: Data layer frontend

**Files:**
- Modify: `absensi-app/frontend/js/storage.js`

- [ ] **Step 1: Tambah method**

`getWorkSchedules`, `saveWorkSchedule`, `deleteWorkSchedule`, `getHolidays`, `saveHoliday`, `deleteHoliday`, `recordCheckOut(employeeId, date)`. Ikuti pola `apiRequest` yang ada.

- [ ] **Step 2: Cek sintaks**

Run (dari `absensi-app`): `node --check frontend/js/storage.js`

---

## Task 9: Tab "Jadwal & Libur"

**Files:**
- Create: `absensi-app/frontend/js/schedules.js`
- Modify: `absensi-app/frontend/index.html`
- Modify: `absensi-app/frontend/js/owner.js`

- [ ] **Step 1: Buat `schedules.js`**

Dua kartu: **Jadwal Kerja** (jadwal baku dengan ceklis Senin–Minggu, jam masuk, jam pulang, berlaku mulai; daftar pengecualian per karyawan dengan tombol tambah memakai pola ceklis banyak karyawan) dan **Hari Libur** (daftar per tahun, tambah, hapus).

Banner kuning di atas kartu jadwal selama jadwal baku masih hasil migrasi (dikenali dari `effectiveFrom === '1970-01-01'` dan hanya ada satu versi): jelaskan nilainya otomatis, minta diperiksa, sebutkan Laporan Gaji sudah memakainya.

- [ ] **Step 2: Daftarkan tab & skrip**

`<script src="js/schedules.js"></script>` sebelum `owner.js`; `${tabButton('jadwal', 'Jadwal &amp; Libur')}` setelah tab `lookup`; cabang `else if (OwnerState.tab === 'jadwal') renderSchedulesTab();`.

- [ ] **Step 3: Cek sintaks**

Run: `node --check frontend/js/schedules.js && node --check frontend/js/owner.js`

---

## Task 10: Form Aturan Keterlambatan berversi

**Files:**
- Modify: `absensi-app/frontend/js/latePolicy.js`

- [ ] **Step 1: Ganti isian jam absolut jadi toleransi menit**

Isian "Jam batas masuk" → "Toleransi keterlambatan (menit setelah jam masuk)" (`type="number" min="0"`), ditambah "Berlaku mulai" (`type="date"`, default hari ini).

- [ ] **Step 2: Tabel menampilkan versi**

Kolom: Nama · Toleransi · Ambang · Skema Potongan · Berlaku Mulai · Aksi. Karyawan dengan beberapa versi tampil beberapa baris, urut tanggal menurun, dengan nama hanya di baris pertama.

- [ ] **Step 3: Cek sintaks**

Run: `node --check frontend/js/latePolicy.js`

---

## Task 11: Tombol jam pulang di panel absensi

**Files:**
- Modify: `absensi-app/frontend/js/checklist.js`

- [ ] **Step 1: Tambah tombol**

Pada panel karyawan berstatus `hadir`: tombol "Catat Jam Pulang" kalau `checkOutTime` kosong, atau teks jam pulang + tombol "Perbarui" kalau sudah ada.

- [ ] **Step 2: Kolom Keterangan menampilkan jam pulang**

`formatKeterangan` menampilkan `08:05 → 17:10`, atau `08:05 → pulang belum dicatat` kalau `checkOutTime` kosong. **Jangan** menampilkan strip kosong yang bisa disalahartikan sebagai pulang tepat waktu.

- [ ] **Step 3: Cek sintaks**

Run: `node --check frontend/js/checklist.js`

---

## Task 12: Verifikasi menyeluruh

- [ ] **Step 1: Seluruh test backend**

Run (dari `absensi-app/backend`): `npm test`
Expected: semua pass, 0 fail.

- [ ] **Step 2: Verifikasi perbaikan bug alpa terhadap hitungan manual**

Di browser sebagai Owner: buka Laporan Gaji periode lampau, catat jumlah alpa. Bandingkan dengan hitungan manual: jumlah hari Senin–Jumat dalam periode itu dikurangi hari yang ada catatan absensinya dan dikurangi hari libur terdaftar. Angkanya harus cocok persis.

- [ ] **Step 3: Uji jadwal, pengecualian, dan libur**

Set jadwal baku Senin–Jumat. Beri satu karyawan pengecualian Senin–Sabtu, pastikan jumlah hari kerjanya bertambah di Laporan Gaji. Tambah satu hari libur di tengah pekan, pastikan alpa semua karyawan berkurang satu.

- [ ] **Step 4: Uji aturan berversi**

Buat aturan telat versi kedua dengan `effectiveFrom` hari ini. Pastikan Laporan Gaji periode lampau **tidak berubah** angkanya — ini inti dari perubahan `effective_from`.

- [ ] **Step 5: Uji jam pulang**

Catat jam pulang satu karyawan, pastikan tampil di kolom Keterangan; pastikan karyawan lain yang belum dicatat menampilkan "pulang belum dicatat".

- [ ] **Step 6: Periksa console**

Console browser bersih dari error.
