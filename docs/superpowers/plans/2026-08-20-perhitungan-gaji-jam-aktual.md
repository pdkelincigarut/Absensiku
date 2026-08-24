# Perhitungan Gaji dari Jam Kerja Aktual — Implementation Plan

**Goal:** Upah harian dihitung dari jam masuk/pulang sungguhan (dipatok ke jendela jadwal 07:30–16:30), bukan dari tipe kehadiran tetap. Telat dan pulang cepat memotong upah sampai ke menit; lembur dicatat terpisah tanpa dikonversi rupiah; potongan `late_policies` tetap jalan sebagai lapisan tambahan.

**Architecture:** Satu fungsi murni baru (`computeActualPay`) di `scheduleResolver.js` menghitung menit terbayar & menit lembur dari jam check-in/check-out dan jadwal yang resolve pada tanggal itu. `routes/payroll.js` memilih rumus lama atau baru per tanggal berdasarkan konstanta cutover `WAGE_ENGINE_V2_FROM`, supaya periode yang sudah dibayar tidak bergeser. `routes/attendance.js` menambah jalur checkout dengan koreksi (jam + alasan wajib) untuk kasus izin mendadak, dan berhenti menerima pilihan tipe kehadiran/jam manual dari client. Tidak ada migrasi skema — semua kolom yang dibutuhkan sudah ada.

**Tech Stack:** Node.js + Express + `node:sqlite`, `node:test`; frontend vanilla JS + Tailwind lokal.

Spec: [docs/superpowers/specs/2026-08-20-perhitungan-gaji-jam-aktual-design.md](../specs/2026-08-20-perhitungan-gaji-jam-aktual-design.md)

## Global Constraints

- **Tanpa dependency baru, tanpa migrasi skema.**
- Semua teks antarmuka berbahasa Indonesia; nilai dari data yang masuk ke HTML lewat `escapeHtml`.
- Rumus lama **tidak boleh berubah hasilnya** untuk tanggal < `WAGE_ENGINE_V2_FROM` — test regresi wajib membuktikan ini.
- `routes/kiosk.js` **tidak disentuh sama sekali** — checkout dengan koreksi hanya lewat panel HR/Owner yang punya sesi.
- Semua test lama harus tetap lolos di setiap tahap.
- Owner harus menambahkan jadwal baku baru (07:30–16:30, `effective_from` = tanggal cutover) lewat tab Jadwal Kerja sebelum atau saat rollout — dicatat sebagai langkah manual, bukan kode.

## Tahapan

### 1. Modul murni — `scheduleResolver.js`

- [ ] Tambah `computeActualPay(checkInTime, checkOutTime, schedule)` → `{ paidMinutes, overtimeMinutes }`, sesuai rumus spec bagian 4.1 & 5.
- [ ] Export dari `module.exports`.
- [ ] `scheduleResolver.test.js`: tepat waktu penuh, telat masuk, pulang cepat, telat + pulang cepat, lembur (paid dipatok ke `endTime`, overtime terisi), checkout kosong, check-in kosong, jadwal null.

### 2. Payroll — rumus bercabang di cutover

- [ ] Konstanta `WAGE_ENGINE_V2_FROM = '2026-08-20'` di `routes/payroll.js`, dengan komentar yang mengingatkan untuk disamakan dengan `effective_from` jadwal 07:30–16:30 yang diinput owner (lihat spec bagian 4).
- [ ] Di loop harian (`routes/payroll.js`, fungsi handler `GET /`): untuk `cursor >= WAGE_ENGINE_V2_FROM` dan status `hadir`, pakai `computeActualPay(rec.check_in_time, rec.check_out_time, schedule)` untuk `paidMinutes`/`overtimeMinutes`, lalu `totalWage += (paidMinutes / scheduledMinutes) * emp.daily_wage`. Untuk `cursor < WAGE_ENGINE_V2_FROM`, jalur lama (`Math.min(rec.hours_worked||0,8)/8 * daily_wage`) tidak diubah.
- [ ] Akumulasi `counts.overtimeMinutesTotal` (baru) di kedua jalur (0 untuk jalur lama).
- [ ] `counts.totalHoursPaid` tetap terisi (dari `paidMinutes/60` di jalur baru, dari `paidHours` di jalur lama) — dipakai kolom "Jam Kerja" yang sudah ada.
- [ ] `lateMinutesTotal` & `deductionAmount`: tidak diubah, tetap dihitung seperti sekarang di kedua jalur.
- [ ] Response tiap baris karyawan menyertakan `overtimeMinutesTotal`.

### 3. Payroll — test

- [ ] `payroll.actualHours.test.js` baru: skenario tepat waktu, telat, pulang cepat, telat+pulang cepat, lembur (upah dipatok, overtime tercatat), checkout kosong (upah 0), semuanya untuk tanggal >= cutover — cocok dengan tabel contoh di spec bagian 4.3.
- [ ] Kasus tanggal < cutover: karyawan dengan `hours_worked` lama menghasilkan angka identik dengan sebelum perubahan (regresi terhadap `payroll.schedule.test.js`/`payroll.late.test.js` yang sudah ada — pastikan keduanya tetap lolos tanpa modifikasi).
- [ ] Kasus gabungan: potongan `late_policies` tetap mengurangi `finalWage` di atas hasil rumus baru (perlu satu skenario yang menembus `thresholdMinutes`).

### 4. Attendance — checkout dengan koreksi

- [ ] `POST /:employeeId/:date/check-out` (`routes/attendance.js`) baca `{ time, reason }` opsional dari body.
- [ ] Tanpa `time`: perilaku persis sekarang (jam server, tanpa validasi alasan).
- [ ] Dengan `time`: validasi format `HH:MM`, tolak kalau lebih awal dari `check_in_time` tersimpan (`400`), tolak kalau `reason` kosong (`400`, pesan konsisten dengan pola koreksi absensi yang sudah ada). Simpan `check_out_time = time`.
- [ ] `recordAudit` menyertakan `reason` saat jalur koreksi dipakai (before/after snapshot penuh seperti sekarang).
- [ ] `attendance.checkout.test.js` ditambah: koreksi dengan `{time, reason}` berhasil dan tercatat di audit; koreksi dengan `{time}` tanpa `reason` ditolak `400`; koreksi dengan `time` lebih awal dari `check_in_time` ditolak `400`; jalur tanpa body tetap seperti test lama (regresi, tidak diubah).

### 5. Attendance — sederhanakan tandai hadir

- [ ] `PUT /:employeeId/:date`: untuk status `hadir`, berhenti membaca `attendanceType`/`hoursWorked` dari `req.body` — selalu `finalType = 'full'`, `finalHours = 8`. Validasi jam kerja > 0 yang lama (untuk `custom`) dihapus karena jalurnya sudah tidak ada.
- [ ] Test route yang lama (`employees.route.test.js` dkk kalau ada yang kirim `attendanceType: 'half'`/`'custom'`) diperiksa — kalau ada yang menguji jalur itu secara eksplisit, disesuaikan supaya tidak menguji kode yang sudah dihapus.

### 6. Frontend — `checklist.js`

- [ ] `ATTENDANCE_TYPE_LABEL` dipangkas jadi cuma `full: 'Full Day'` (dipakai `formatKeterangan` untuk data lama & baru, keduanya konsisten sekarang).
- [ ] `renderAttendancePanel`: hapus blok radio "Tipe Kehadiran" dan `custom-hours-field`, hapus `toggleCustomHours` dan listenernya.
- [ ] `renderAttendancePanel`: submit handler berhenti mengirim `attendanceType`/`hoursWorked` (atau tetap kirim `full`/`8` tetap — pilih yang paling minim perubahan terhadap `Storage.upsertAttendance`).
- [ ] Panel checkout: tambah toggle "Koreksi jam pulang" → input `type="time"` + textarea keterangan wajib, tombol simpan terpisah dari tombol checkout normal. Tombol submit mati selama keterangan kosong (pola sama seperti `reasonInput`/`syncSubmitState` yang sudah ada untuk koreksi absensi).

### 7. Frontend — `storage.js`

- [ ] `recordCheckOut(employeeId, date, correction)` — parameter ketiga opsional `{ time, reason }`; kalau ada, ikut di body POST; kalau tidak ada, body kosong seperti sekarang (backward compatible, tidak mengubah pemanggil lama).

### 8. Frontend — `owner.js` (laporan gaji)

- [ ] Kolom tabel baru **"Lembur"** setelah kolom Menit Telat, format `X mnt` atau `&mdash;` kalau 0 — tanpa nominal rupiah di sampingnya.
- [ ] CSV export: tambah `r.overtimeMinutesTotal` di akhir array baris (baris ~586), header CSV ikut ditambah kalau ada baris header terpisah.

### 9. Dokumentasi

- [ ] `CLAUDE.md` — bagian "Sudah Jalan": update baris "Laporan gaji" untuk menyebut rumus jam aktual + cutover. Bagian "Aturan & Konvensi Wajib": tambah catatan soal `WAGE_ENGINE_V2_FROM` sebagai pola versi kalkulasi (mirip `PERIOD_START_DAY`), dan catatan pengecualian "checkout dengan koreksi" terhadap aturan "jam absen selalu dari server" (lihat spec bagian 6).
- [ ] Tandai spec ini "Disetujui, sudah diimplementasikan" setelah selesai.

## Urutan Kerja

1–3 (payroll & modul murni) bisa dites lengkap tanpa menyentuh frontend sama sekali — kerjakan dan verifikasi dengan `npm test` dulu sebelum lanjut ke 4–8, supaya kalau ada kesalahan rumus, ketahuan sebelum UI ikut berubah.

4–5 (attendance) berikutnya, karena 6–7 (frontend) bergantung pada bentuk response endpoint-endpoint itu.

8 (owner.js) terakhir sebelum dokumentasi, karena butuh field `overtimeMinutesTotal` dari tahap 2 sudah ada di response.

## Verifikasi Akhir

- [ ] `npm test` — semua lolos, termasuk yang baru.
- [ ] Uji browser sesuai bagian 10 spec: tandai hadir (form tanpa pilihan tipe), catat pulang cepat, cek Laporan Gaji (upah proporsional + kolom Lembur), coba "Koreksi jam pulang" (alasan wajib).
- [ ] Bandingkan satu periode gaji **lampau** (tanggal < cutover) sebelum dan sesudah perubahan — angkanya harus identik.

## Di Luar Cakupan

Lihat bagian 9 spec. Yang paling perlu diingat: nominal lembur tetap dihitung manual owner, `late_policies` tidak diubah sama sekali, dan jadwal 07:30–16:30 dimasukkan owner sendiri lewat tab Jadwal Kerja — bukan bagian dari kode yang diimplementasikan plan ini.
