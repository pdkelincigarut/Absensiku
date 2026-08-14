# Fondasi Jadwal Kerja: Jadwal, Hari Libur, Jam Pulang, dan Aturan Berversi

Status: Menunggu persetujuan
Tanggal: 2026-07-31

## 1. Latar Belakang

User meminta Insight Dashboard (analitik pola kehadiran). Penelusuran menunjukkan tiga dari empat metrik utamanya tidak bisa dihitung dengan data yang ada, karena penyebutnya — "jumlah hari kerja terjadwal" — tidak punya dasar sama sekali di database.

Penelusuran juga menemukan **bug yang sedang aktif**: [routes/payroll.js:100](../../../absensi-app/backend/routes/payroll.js:100) menghitung setiap hari kalender lampau tanpa catatan absensi sebagai alpa, tanpa memeriksa hari apa. Pada periode 27 Jun–26 Jul 2026 (30 hari kalender), 5 hari Minggu ikut terhitung alpa. Laporan Gaji yang dipakai sekarang karena itu salah menghitung alpa.

Dokumen ini adalah **fondasinya**, bukan dashboard-nya. Insight Dashboard dibangun di putaran berikutnya di atas data yang benar.

## 2. Keputusan yang Sudah Diambil User

- **Cakupan: seluruh fondasi dalam satu putaran** — jadwal kerja, hari libur, perbaikan bug alpa, pencatatan jam pulang, dan perombakan aturan keterlambatan jadi berversi. User diberi tahu bahwa ini pilihan terlama sebelum bisa diperiksa dan menyentuh perhitungan gaji di dua tempat; user tetap memilihnya.
- **Jadwal: satu jadwal baku perusahaan + pengecualian per karyawan.**
- **Batas telat: toleransi menit setelah jam masuk terjadwal**, bukan jam absolut lagi.
- **Hari libur: diisi Owner sendiri**, tanpa data awal libur nasional.
- **Metrik berbasis jumlah hari**, bukan jam kerja aktual.
- **Aturan berversi (`effective_from`)** — membalik keputusan 29 Juli yang memilih "selalu pakai aturan terkini". Perubahan ini disengaja dan disetujui user setelah diberi tahu konsekuensinya.

## 3. Skema Database — Migrasi `006_work_schedule_foundation.sql`

### 3.1 `work_schedules` (berversi, baku + pengecualian)

```sql
CREATE TABLE work_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),  -- NULL = jadwal baku perusahaan
  work_days TEXT NOT NULL,        -- daftar angka hari dipisah koma, 0=Minggu..6=Sabtu, mis. '1,2,3,4,5'
  start_time TEXT NOT NULL,       -- 'HH:MM' jam masuk terjadwal
  end_time TEXT NOT NULL,         -- 'HH:MM' jam pulang terjadwal
  effective_from TEXT NOT NULL,   -- 'YYYY-MM-DD', tanggal mulai berlaku
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_work_schedules_lookup ON work_schedules(employee_id, effective_from);
```

**Aturan pemilihan jadwal untuk sebuah (karyawan, tanggal):**
1. Cari baris dengan `employee_id` = karyawan itu dan `effective_from <= tanggal`, ambil `effective_from` terbesar.
2. Kalau tidak ada, pakai baris `employee_id IS NULL` (baku perusahaan) dengan aturan yang sama.

**Pengecualian per karyawan selalu menang atas jadwal baku, walaupun jadwal bakunya lebih baru.** Ini konsekuensi yang disengaja: kalau Owner memberi jadwal khusus ke seorang karyawan, lalu mengubah jadwal baku perusahaan, karyawan itu tetap memakai jadwal khususnya — karena itulah artinya "pengecualian". Untuk mengembalikannya ke jadwal baku, Owner harus menghapus baris pengecualiannya.

### 3.2 `holidays`

```sql
CREATE TABLE holidays (
  date TEXT PRIMARY KEY,          -- 'YYYY-MM-DD'
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

Diisi Owner sendiri. Tidak ada data awal libur nasional — user memilih ini, dan saya juga tidak akan menuliskan tanggal libur dari ingatan karena tanggal SKB berubah tiap tahun dan salah tanggal akan langsung merusak perhitungan gaji.

Hari libur berlaku untuk **semua karyawan**. Libur khusus per karyawan (mis. cuti bersama sebagian tim) tidak dicakup — itu masuk ranah cuti, bukan libur.

### 3.3 `attendance.check_out_time`

```sql
ALTER TABLE attendance ADD COLUMN check_out_time TEXT;  -- 'HH:MM'
```

Diisi dari **jam server**, sama seperti `check_in_time` — nilai dari client diabaikan. Baris lama bernilai `NULL`, dan itu dibedakan dengan jelas dari "pulang tepat waktu": laporan apa pun yang memakai jam pulang harus menampilkan "belum dicatat", bukan menganggapnya nol atau tepat waktu.

### 3.4 `late_policies` dirombak jadi berversi

Tabel lama dihapus dan dibuat ulang, karena kunci utamanya berubah (dulu `employee_id` sebagai primary key, sekarang boleh banyak baris per karyawan) dan `check_in_limit` berganti makna jadi `grace_minutes`:

```sql
CREATE TABLE late_policies_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  grace_minutes INTEGER NOT NULL,         -- toleransi menit SETELAH jam masuk terjadwal
  threshold_minutes INTEGER NOT NULL,     -- ambang akumulasi menit telat per periode gaji
  deduction_type TEXT NOT NULL
    CHECK (deduction_type IN ('flat', 'per_minute', 'percentage')),
  deduction_flat_amount INTEGER,
  deduction_per_minute_amount INTEGER,
  deduction_percentage REAL,
  effective_from TEXT NOT NULL,           -- 'YYYY-MM-DD'
  created_at INTEGER NOT NULL
);
```

Pemilihan aturan untuk sebuah (karyawan, tanggal) memakai pola yang sama: `effective_from` terbesar yang `<= tanggal`. Karyawan tanpa baris sama sekali = fitur mati untuknya, nol potongan (perilaku ini dipertahankan).

### 3.5 Migrasi data: jadwal awal dan konversi aturan lama

Migrasi harus menghasilkan **angka gaji periode lampau yang persis sama** seperti sebelum perubahan, kecuali untuk perbaikan bug alpa yang memang disengaja. Karena itu:

1. **Jadwal baku perusahaan** dibuat dengan `effective_from = '1970-01-01'`, `work_days = '1,2,3,4,5'`, `start_time = '08:00'`, `end_time = '17:00'`.

   **Nilai ini adalah tebakan, bukan data user.** Karena itu aplikasi menampilkan peringatan menonjol di tab Jadwal Kerja sampai Owner menyimpan jadwal itu sekali secara sadar (ditandai dengan adanya baris jadwal ber-`effective_from` selain `1970-01-01`, atau kolom penanda — lihat §4.1). Laporan Gaji akan langsung berubah begitu migrasi jalan, jadi Owner **harus** memeriksa jadwal ini sebelum memakai laporan berikutnya.

2. **Konversi `late_policies` lama:**
   ```
   grace_minutes = menit(check_in_limit) - menit('08:00')
   ```
   dengan `effective_from = '1970-01-01'` supaya semua periode lampau tetap memakai aturan yang sama seperti sekarang.

   **Kalau hasilnya negatif** (ada karyawan dengan `check_in_limit` lebih awal dari 08:00), nilainya dijepit ke 0 — dan ini **mengubah** batas telat efektif karyawan tersebut. Migrasi mencetak peringatan ke konsol menyebut nama karyawan yang terdampak, supaya Owner tahu harus memeriksanya. Tidak ada cara menghindari ini tanpa tahu jam masuk sebenarnya karyawan itu.

3. Tabel lama di-`DROP`, tabel baru di-`RENAME` menjadi `late_policies`.

## 4. Backend

### 4.1 Modul murni `scheduleResolver.js`

Inti fitur ini, tanpa akses database supaya gampang dites:

```js
resolveSchedule(schedules, employeeId, dateStr)
  → { workDays: [1,2,3,4,5], startTime: '08:00', endTime: '17:00' } | null

isWorkday(schedule, dateStr, holidaySet)
  → boolean   // false kalau bukan hari kerja terjadwal ATAU tanggal libur

resolveLatePolicy(policies, employeeId, dateStr)
  → { graceMinutes, thresholdMinutes, deductionType, ... } | null

computeLateMinutes(checkInTime, startTime, graceMinutes)
  → number    // max(0, checkIn - (start + grace))

countScheduledDays(schedule, holidaySet, startDate, endDate)
  → number
```

`computeLateMinutes` menggantikan versi lama di `lateCalculator.js` yang membandingkan terhadap jam absolut. `computeDeduction` yang sudah ada tidak berubah.

**Zona waktu:** seluruh perhitungan memakai string tanggal `YYYY-MM-DD` dan jam `HH:MM` apa adanya, tanpa objek `Date` bermuatan zona waktu — jadi tidak ada pergeseran hari. Satu-satunya tempat zona waktu berpengaruh adalah saat server menstempel jam masuk/pulang dari `new Date()`, yang mengikuti jam mesin. Ini didokumentasikan di [DEPLOY-WINDOWS.md](../../../absensi-app/backend/DEPLOY-WINDOWS.md) sebagai syarat: **PC server wajib di-set zona waktu WIB.** Tidak ada konversi zona waktu di kode, karena aplikasi ini melayani satu kantor di satu zona waktu — menambahkan konversi hanya akan menambah cara untuk salah.

### 4.2 Endpoint baru

```
GET    /api/work-schedules                → jadwal baku + semua pengecualian per karyawan
PUT    /api/work-schedules                { employeeIds|null, workDays, startTime, endTime, effectiveFrom }
DELETE /api/work-schedules/:id            → hapus satu versi/pengecualian

GET    /api/holidays?year=2026            → daftar hari libur
POST   /api/holidays                      { date, name }
DELETE /api/holidays/:date
```

Semua `requireOwner`. `employeeIds: null` pada PUT berarti jadwal baku perusahaan.

`PUT /api/late-policies` yang sudah ada berubah: menerima `graceMinutes` (bukan `checkInLimit`) dan `effectiveFrom`, lalu **menyisipkan versi baru**, bukan menimpa baris lama.

### 4.3 Pencatatan jam pulang

`PUT /api/attendance/:employeeId/:date` menerima aksi `recordCheckOut`. Jam diambil dari jam server. Menolak kalau statusnya bukan `hadir` atau `check_in_time` masih kosong — tidak masuk akal mencatat jam pulang untuk hari yang belum ada jam masuknya.

### 4.4 Perubahan `routes/payroll.js`

Loop harian sekarang melewati hari yang bukan hari kerja terjadwal:

```
untuk tiap hari dalam periode:
  jadwal ← resolveSchedule(karyawan, hari)
  kalau bukan isWorkday(jadwal, hari, libur) → LEWATI, jangan hitung apa pun
  kalau ada record → hitung statusnya seperti sekarang
  kalau tidak ada record dan hari sudah lewat → alpa
  menit telat ← computeLateMinutes(check_in, jadwal.startTime, aturan(hari).graceMinutes)
```

**Ini mengubah angka Laporan Gaji.** Jumlah alpa akan turun (Minggu dan libur tidak lagi terhitung), yang memang tujuannya. Total gaji tidak berubah karena gaji dihitung dari jam kerja tercatat, bukan dari jumlah hari.

## 5. Frontend

### 5.1 Tab baru "Jadwal & Libur" (panel Owner)

File baru `frontend/js/schedules.js`. Dua bagian dalam satu tab:

**Jadwal Kerja** — kartu jadwal baku perusahaan (hari kerja sebagai ceklis Senin–Minggu, jam masuk, jam pulang, berlaku mulai), dan daftar pengecualian per karyawan di bawahnya dengan tombol tambah. Menambah pengecualian memakai pola ceklis banyak karyawan yang sudah dipakai Aturan Keterlambatan.

Selama jadwal baku masih bernilai hasil migrasi, tampilkan banner kuning: jadwal ini nilai awal otomatis, mohon diperiksa, dan Laporan Gaji sudah memakainya.

**Hari Libur** — daftar tanggal + keterangan, dikelompokkan per tahun, dengan tambah dan hapus.

### 5.2 Form Aturan Keterlambatan

Isian "Jam batas masuk" diganti **"Toleransi keterlambatan (menit setelah jam masuk)"**, ditambah isian "Berlaku mulai" (tanggal). Tabel menampilkan riwayat versi per karyawan, bukan hanya satu baris.

### 5.3 Panel absensi

Tombol "Catat Jam Pulang" pada panel karyawan berstatus hadir yang belum punya `check_out_time`. Kolom Keterangan di tabel Monitoring menampilkan jam masuk dan jam pulang; yang belum tercatat ditulis "pulang belum dicatat".

## 6. Definisi Metrik untuk Putaran Berikutnya

Dicatat di sini supaya sudah pasti sebelum Insight Dashboard dibangun. **Ada satu ketidakkonsistenan dalam permintaan user yang perlu diputuskan:** ketiga rumus ditulis dengan penyebut "hari kerja terjadwal", tetapi user juga meminta cuti tidak menurunkan attendance rate. Kedua hal itu tidak bisa berlaku bersamaan. Resolusi yang dipakai:

```
scheduled_days = hari kerja terjadwal − hari libur
leave_days     = jumlah hari izin + sakit
present_days   = jumlah hari status hadir
expected_days  = scheduled_days − leave_days
absent_days    = expected_days − present_days

attendance_rate   = present_days / expected_days × 100
absenteeism_rate  = absent_days  / expected_days × 100
time_off_rate     = leave_days   / scheduled_days × 100
```

`attendance_rate + absenteeism_rate = 100%` tepat. `time_off_rate` memakai `scheduled_days` karena cuti adalah pembilangnya — memakai `expected_days` akan membagi cuti dengan angka yang cutinya sudah dikeluarkan.

Satu hari status hadir dihitung 1, apa pun `attendance_type`-nya (termasuk setengah hari), sesuai pilihan "berbasis jumlah hari".

## 7. Di Luar Cakupan

- Insight Dashboard itu sendiri (putaran berikutnya).
- Soft delete dan audit log koreksi — masih belum ada; prinsip user soal keduanya belum bisa dipenuhi dan perlu putaran tersendiri.
- Alur persetujuan cuti. `izin`/`sakit` tetap langsung dicatat HR tanpa status disetujui.
- Libur khusus per karyawan atau per divisi.
- Shift bergilir (satu karyawan berganti jadwal antar minggu).

## 8. Verifikasi

`npm test` — 41 test lama harus tetap lolos, ditambah test untuk `scheduleResolver` (pemilihan versi jadwal, pengecualian menang atas baku, hari libur, hitung hari kerja), endpoint jadwal & libur, pencatatan jam pulang, dan payroll yang tidak lagi menghitung Minggu sebagai alpa.

Uji manual di browser: set jadwal Senin–Jumat, tambahkan satu hari libur, lalu buka Laporan Gaji periode lampau dan pastikan jumlah alpa turun sesuai jumlah Minggu dan libur dalam periode itu — dibandingkan dengan hitungan manual.
