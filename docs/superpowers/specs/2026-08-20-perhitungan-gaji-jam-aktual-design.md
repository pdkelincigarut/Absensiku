# Perhitungan Gaji dari Jam Kerja Aktual — Jadwal 07:30–16:30

Status: Disetujui, sudah diimplementasikan
Tanggal: 2026-08-20
Plan: [docs/superpowers/plans/2026-08-20-perhitungan-gaji-jam-aktual.md](../plans/2026-08-20-perhitungan-gaji-jam-aktual.md)

## 1. Latar Belakang

Jadwal baku perusahaan sekarang 08:00–17:00 (`work_schedules`, `employee_id IS NULL`), dan gaji harian dihitung dari `hours_worked` — angka **tetap** yang dipilih HR saat menandai hadir (`full` = 8, `half` = 4, `custom` = input manual), bukan dari jam masuk/pulang sungguhan (`routes/payroll.js:167-176`, `routes/attendance.js:81-90`).

Akibatnya `check_out_time` yang sudah dicatat sejak jadwal kerja berversi ada (migrasi `006_work_schedule_foundation.js`) **tidak pernah dipakai untuk menghitung upah** — hanya tampil di panel sebagai informasi. Karyawan yang pulang jam berapa pun tetap dibayar penuh selama statusnya "Hadir Penuh".

Owner ingin dua hal sekaligus: jadwal resmi digeser ke 07:30–16:30 (wajib dipatuhi), dan upah benar-benar mencerminkan jam kerja sungguhan — telat masuk maupun pulang cepat memotong upah sampai ke hitungan menit, bukan potongan flat seperti `late_policies` yang sudah ada.

## 2. Keputusan User

Dikumpulkan lewat serangkaian klarifikasi sebelum spec ini ditulis:

- **Jadwal 07:30–16:30 wajib**, berlaku lewat mekanisme jadwal yang sudah ada (`work_schedules` + `effective_from`) — bukan aturan keras terpisah di luar sistem itu.
- **Telat masuk**: upah hanya dihitung dari jam masuk sungguhan, bukan dari 07:30. Hitungan menit diperhitungkan, bukan dibulatkan atau diberi cap.
- **Pulang cepat**: karyawan wajib checkout. Kalau checkout sebelum 16:30, upah hanya dihitung sampai jam checkout sungguhan. Menit tetap diperhitungkan penuh.
- **Lembur** (checkout lewat 16:30): dicatat sebagai menit/jam terpisah, **tidak dikonversi ke rupiah**. Owner menghitung uang lemburnya sendiri secara manual saat export ke Excel akhir bulan.
- **Lupa checkout**: upah hari itu **0**, sampai HR mengoreksinya keesokan hari (lewat panel checkout dengan koreksi — lihat bagian 6).
- **Potongan `late_policies`** (toleransi/ambang/flat-per menit-persen) **tetap jalan**, sebagai potongan tambahan **di atas** pengurangan jam — dua lapis pinalti untuk telat: upah berkurang proporsional dari jam yang hilang, ditambah potongan `late_policies` kalau lewat ambang batas.
- **"Setengah Hari" dibuang** dari form tandai hadir HR — kasus pulang cepat sekarang otomatis tertangani lewat jam checkout asli.
- **"Custom jam kerja" dibuang** juga — alasan owner: karyawan sekarang absen sendiri lewat kios dengan pengenalan wajah, jadi jam kerja tidak perlu lagi ditebak manual oleh HR.
- **Form tetap ada** (tidak dibuang semua), direvisi: kasus izin mendadak (karyawan pulang di tengah hari atas izin) ditangani lewat **checkout dengan koreksi** — HR mengisi jam pulang + keterangan wajib, bukan lewat pilihan tipe kehadiran.
- Karyawan yang **tidak masuk sama sekali** tetap diinput manual oleh HR dengan status izin/sakit/alpa seperti sekarang — tidak berubah.

## 3. Jadwal Baru — Tanpa Kode

Owner menambahkan baris baru di tab **Jadwal Kerja** (fitur yang sudah ada): `work_days` sama seperti sekarang, `start_time` = `07:30`, `end_time` = `16:30`, `effective_from` = tanggal mulai berlaku. Tidak perlu migrasi atau perubahan kode — ini murni data, dan `scheduleResolver.js` sudah menangani versi berdasarkan tanggal.

## 4. Rumus Gaji Baru — Berlaku dari Tanggal Cutover

Perubahan rumus **tidak boleh menggeser gaji periode yang sudah dibayarkan**, sama seperti alasan `effective_from` ada di `work_schedules` dan `late_policies` (lihat aturan wajib di CLAUDE.md). Data historis banyak yang tidak punya `check_out_time` sama sekali — kalau rumus baru langsung diterapkan ke seluruh riwayat, hari-hari itu akan mendadak bergaji 0.

Karena itu rumus baru hanya berlaku untuk **tanggal >= konstanta cutover** (`WAGE_ENGINE_V2_FROM` di `routes/payroll.js`, format `'YYYY-MM-DD'`). Tanggal sebelum itu tetap pakai rumus lama apa adanya. Owner/tim yang mengimplementasikan **wajib menyamakan** tanggal ini dengan tanggal mulai berlakunya jadwal 07:30–16:30 di langkah 3 — kalau berbeda, ada rentang hari yang aturannya tidak konsisten (rumus baru jalan di atas jadwal lama, atau sebaliknya).

Default yang dipakai plan ini: **2026-08-20** (tanggal spec ini ditulis/disetujui). Boleh digeser ke tanggal lain sebelum implementasi kalau owner mau menunda rollout, misalnya ke awal periode gaji berikutnya supaya tidak ada periode yang setengah rumus lama setengah rumus baru.

### 4.1 Untuk tanggal >= cutover, status `hadir`

Modul murni baru (lihat bagian 5) menghitung dari jadwal yang resolve pada tanggal itu:

```
effectiveStart   = max(check_in_time, schedule.startTime)   // datang awal tidak dapat bonus
effectiveEnd     = min(check_out_time, schedule.endTime)    // pulang telat tidak nambah upah otomatis
paidMinutes      = max(0, effectiveEnd - effectiveStart)
scheduledMinutes = schedule.endTime - schedule.startTime
overtimeMinutes  = max(0, check_out_time - schedule.endTime)

upahHari = (paidMinutes / scheduledMinutes) x daily_wage
```

Kalau `check_out_time` kosong (belum checkout): `paidMinutes = 0`, `overtimeMinutes = 0` — upah hari itu 0 sampai dikoreksi.

Potongan `late_policies` dihitung **persis seperti sekarang** (`computeLateMinutes` dari `scheduleResolver.js`, tidak berubah) dan dikurangkan dari total upah periode seperti biasa — lapisan kedua di atas hasil rumus ini.

### 4.2 Untuk tanggal < cutover

Rumus lama tidak disentuh: `paidHours = min(hours_worked, 8)`, `upahHari = (paidHours / 8) x daily_wage`.

### 4.3 Contoh

Jadwal 07:30–16:30 (540 menit). Upah harian Rp150.000.

| Kejadian | check_in | check_out | paidMinutes | upah hari |
|---|---|---|---|---|
| Tepat waktu penuh | 07:30 | 16:30 | 540 | Rp150.000 |
| Telat 20 menit | 07:50 | 16:30 | 520 | Rp144.444 |
| Pulang cepat 30 menit | 07:30 | 16:00 | 510 | Rp141.667 |
| Telat 10 menit + pulang cepat 15 menit | 07:40 | 16:15 | 515 | Rp143.056 |
| Lembur 40 menit (checkout 17:10) | 07:30 | 17:10 | 540 (dipatok) | Rp150.000 + catatan lembur 40 menit |
| Lupa checkout | 07:30 | — | 0 | Rp0 (sampai dikoreksi) |

Di atas potongan `late_policies` tetap jalan kalau menit telat lewat ambang toleransi — mengurangi lagi dari total periode, bukan dari `upahHari` per baris.

## 5. Modul Murni Baru

Ditambahkan ke `scheduleResolver.js` (sudah jadi tempat logika jadwal & jam murni, tanpa akses DB):

```js
function computeActualPay(checkInTime, checkOutTime, schedule) {
  if (!checkInTime || !checkOutTime || !schedule) {
    return { paidMinutes: 0, overtimeMinutes: 0 };
  }
  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);
  const checkIn = timeToMinutes(checkInTime);
  const checkOut = timeToMinutes(checkOutTime);

  const effectiveStart = Math.max(checkIn, start);
  const effectiveEnd = Math.min(checkOut, end);

  return {
    paidMinutes: Math.max(0, effectiveEnd - effectiveStart),
    overtimeMinutes: Math.max(0, checkOut - end)
  };
}
```

Dites langsung di `scheduleResolver.test.js`, tanpa DB — sama seperti `computeLateMinutes` yang sudah ada di file yang sama.

## 6. Checkout dengan Koreksi — Kasus Izin Mendadak

Sekarang `POST /api/attendance/:employeeId/:date/check-out` (`routes/attendance.js:186-210`) selalu memakai jam server, tanpa body, tanpa alasan — dipakai juga oleh HR untuk mengoreksi jam pulang (klik ulang menimpa dengan jam sekarang).

Ditambahkan jalur baru **khusus panel HR/Owner** (bukan kios — `routes/kiosk.js` tidak disentuh sama sekali) untuk kasus karyawan izin pulang lebih awal padahal HR baru sempat mencatatnya belakangan:

- Body opsional: `{ time: 'HH:MM', reason: '...' }`.
- **Tanpa `time`**: perilaku lama persis — jam server, tanpa alasan. Dipakai untuk checkout normal di tempat.
- **Dengan `time`**: dianggap koreksi. `reason` **wajib diisi**, kosong dibalas `400` — pola yang sama dengan koreksi absensi di `PUT /:employeeId/:date` (`hasMeaningfulChange`, alasan wajib hanya saat mengubah data). `time` divalidasi format `HH:MM` dan tidak boleh lebih awal dari `check_in_time` tersimpan.
- Audit log (`recordAudit`, action `check_out`) menyertakan `reason` seperti koreksi absensi lain — before/after snapshot tetap penuh.

Ini **satu-satunya** tempat aplikasi menerima jam dari client untuk kolom `check_in_time`/`check_out_time` — pengecualian yang disengaja terhadap aturan "jam absen selalu dari server", karena ini koreksi tercatat lengkap dengan alasan dan pelaku (`marked_by`, audit log), bukan input jam kejadian yang dipercaya mentah-mentah. Beda dengan kios yang tanpa sesi dan tanpa jejak siapa yang menekan tombol.

## 7. Form Tandai Hadir — Disederhanakan

`checklist.js` (`renderAttendancePanel`, baris ~291-456):

- Blok radio "Tipe Kehadiran" (`full`/`half`/`custom`) dan `custom-hours-field` **dihapus**. Menandai hadir hanya mencatat jam masuk dari server, seperti sekarang — tidak ada lagi pilihan jam.
- `attendance_type`/`hours_worked` tetap ditulis di server sebagai `'full'`/`8` tetap (bukan dihapus dari skema) — kolom historis ini masih dipakai rumus lama untuk tanggal sebelum cutover, dan tabel Riwayat Absensi masih menampilkannya apa adanya untuk data lama. Untuk data baru nilainya jadi sekadar sisa, tidak memengaruhi gaji.
- Panel checkout (`btn-check-out`, baris ~309-311) dapat tambahan: link/toggle **"Koreksi jam pulang"** yang membuka input jam (`type="time"`) + textarea keterangan wajib, memanggil jalur koreksi di bagian 6. Tombol "Catat Jam Pulang"/"Perbarui Jam Pulang" yang sudah ada tetap jalan seperti biasa untuk checkout normal di tempat (jam server, tanpa keterangan).

## 8. Laporan Gaji & Export

`routes/payroll.js`:

- Setiap baris karyawan dapat field baru `overtimeMinutesTotal` (akumulasi `overtimeMinutes` seluruh hari hadir di periode itu, hanya dari tanggal >= cutover).
- `finalWage`, `deductionAmount`, `latePolicy` dihitung **persis seperti sekarang** — hanya `totalWage` per hari yang sumbernya berubah (bagian 4).

`frontend/js/owner.js`:

- Tabel laporan gaji dapat kolom baru **"Lembur"** (format `X mnt`, `&mdash;` kalau 0) — murni informasi, tidak ada nominal rupiah di sampingnya.
- CSV export (baris ~586) dapat kolom `overtimeMinutesTotal` di akhir, supaya owner bisa hitung sendiri uang lemburnya di Excel.

## 9. Di Luar Cakupan

- Menghitung nominal lembur otomatis — sengaja diserahkan ke owner secara manual per bulan.
- Mengubah `late_policies` (toleransi/ambang/jenis potongan) — tetap seperti sekarang, cuma jadi lapisan kedua di atas rumus baru.
- Jadwal per-karyawan yang berbeda dari jadwal baku — mekanismenya sudah ada (`work_schedules.employee_id`), tidak ada yang berubah di spec ini.
- Migrasi skema database — tidak ada kolom baru yang dibutuhkan sama sekali.
- Notifikasi/reminder karyawan yang lupa checkout — HR mengecek manual lewat tab Monitoring seperti sekarang (kolom "pulang belum dicatat" sudah ada).

## 10. Verifikasi

`npm test` — seluruh test lama harus tetap lolos, ditambah:

- `computeActualPay`: tepat waktu penuh, telat masuk, pulang cepat, telat + pulang cepat, lembur (paidMinutes dipatok, overtimeMinutes terisi), checkout kosong (0/0), check-in kosong (0/0).
- Payroll tanggal >= cutover: upah proporsional per menit sesuai contoh bagian 4.3; potongan `late_policies` tetap mengurangi total di atasnya; hari tanpa checkout bergaji 0.
- Payroll tanggal < cutover: angka identik dengan sebelum perubahan (regresi).
- `POST /check-out` tanpa body: perilaku lama, tidak berubah (test lama `attendance.checkout.test.js` tetap lolos apa adanya).
- `POST /check-out` dengan `{ time }` tanpa `reason`: `400`.
- `POST /check-out` dengan `{ time, reason }`: berhasil, `check_out_time` sama dengan `time` yang dikirim, audit log berisi `reason`.
- `PUT /:employeeId/:date` dengan status `hadir`: tidak lagi menerima/mengharuskan `attendanceType`/`hoursWorked` dari client untuk memengaruhi hasil — server selalu menyimpan `full`/`8`.

Uji browser: tandai hadir seorang karyawan (form tidak lagi menampilkan pilihan tipe/jam), catat jam pulang lebih cepat dari 16:30, buka Laporan Gaji dan pastikan upah harinya berkurang proporsional dan kolom Lembur tampil benar untuk kasus checkout lewat 16:30. Coba juga "Koreksi jam pulang" dari panel checkout dan pastikan alasan wajib diisi sebelum tersimpan.
