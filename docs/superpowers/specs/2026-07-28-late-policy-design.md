# Aturan Keterlambatan & Potongan Gaji Otomatis

Status: Disetujui (menunggu implementasi)
Tanggal: 2026-07-28

## 1. Latar Belakang

Saat ini `attendance.check_in_time` sudah dicatat otomatis dari jam server setiap kali status diceklis "hadir" ([routes/attendance.js](../../../absensi-app/backend/routes/attendance.js)), tapi jam masuk itu tidak dipakai untuk apa pun — sekadar informasi. Owner ingin bisa menetapkan batas jam masuk per karyawan, lalu keterlambatan yang terakumulasi selama sebulan otomatis memotong gaji di Laporan Gaji ([routes/payroll.js](../../../absensi-app/backend/routes/payroll.js)), tanpa perlu hitung manual.

Dokumen ini mencakup **tabel database dan logika perhitungannya saja** (backend). Perubahan UI untuk form pengaturan owner menyusul di spec/putaran terpisah.

## 2. Keputusan Desain

- **Per karyawan, bukan aturan global.** Owner menetapkan jam batas masuk, ambang toleransi, dan skema potongan untuk masing-masing karyawan (lewat UI nanti: centang beberapa karyawan sekaligus, isi satu form, berlaku ke semua yang dicentang — tapi di database tetap tersimpan sebagai baris per karyawan).
- **Karyawan tanpa aturan = fitur nonaktif untuknya.** Kalau owner belum pernah mengisi aturan untuk seorang karyawan, tidak ada keterlambatan yang dihitung dan tidak ada potongan — sama seperti perilaku sekarang.
- **Ambang batas dihitung dari total menit telat sebulan** (bukan jumlah hari telat). Contoh: ambang 60 menit — kalau total keterlambatan sepanjang periode gaji itu 45 menit, belum kena potongan; begitu tembus 61 menit, potongan berlaku.
- **Tiga skema potongan, dipilih per karyawan** (satu karyawan pakai satu skema, tapi karyawan lain boleh pakai skema berbeda):
  1. **`flat`** — nominal Rupiah tetap, langsung berlaku penuh begitu ambang terlampaui.
  2. **`per_minute`** — tarif Rupiah per menit, dikalikan **kelebihan menit di atas ambang** (bukan total menit telat).
  3. **`percentage`** — persentase dari total gaji kotor periode itu.
- **Aturan yang dipakai selalu aturan TERBARU, bukan snapshot historis.** Sama seperti `daily_wage` sekarang (yang juga selalu dibaca dari nilai employees.daily_wage saat itu juga) — kalau owner mengubah jam batas masuk atau skema potongan, perhitungan periode manapun (termasuk yang sudah lewat dan belum di-lihat ulang) langsung memakai aturan terbaru saat Laporan Gaji dibuka. Ini pilihan yang disengaja untuk konsistensi dan kesederhanaan, dikonfirmasi bersama user — bukan keterbatasan yang tidak disadari.
- **Gaji tidak pernah minus.** `finalWage = max(0, totalWage - deductionAmount)`.

## 3. Tabel Baru: `late_policies`

```sql
CREATE TABLE late_policies (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
  check_in_limit TEXT NOT NULL,              -- batas jam masuk, format 'HH:MM' (mis. '08:30')
  threshold_minutes INTEGER NOT NULL,        -- ambang total menit telat/periode sebelum potongan berlaku
  deduction_type TEXT NOT NULL
    CHECK (deduction_type IN ('flat', 'per_minute', 'percentage')),
  deduction_flat_amount INTEGER,             -- Rupiah, wajib diisi jika deduction_type = 'flat'
  deduction_per_minute_amount INTEGER,       -- Rupiah/menit, wajib diisi jika deduction_type = 'per_minute'
  deduction_percentage REAL,                 -- 0-100, wajib diisi jika deduction_type = 'percentage'
  updated_at INTEGER NOT NULL
);
```

- Satu baris per karyawan (`employee_id` adalah primary key, bukan auto-increment terpisah) — upsert, bukan insert berulang.
- Kolom `deduction_*` yang tidak relevan dengan `deduction_type` yang dipilih dibiarkan `NULL`; validasi "field yang wajib harus diisi sesuai tipe" dilakukan di route handler, bukan di constraint SQL (mengikuti pola validasi yang sudah dipakai di `routes/employees.js`).
- Tidak ada `FOREIGN KEY ... ON DELETE CASCADE` eksplisit (konsisten dengan `attendance` yang juga tidak mengaktifkan `foreign_keys` — lihat catatan di [db.js](../../../absensi-app/backend/db.js)); kalau karyawan dihapus, baris `late_policies`-nya jadi yatim dan diabaikan begitu saja saat payroll dihitung (payroll selalu mulai dari daftar `employees` aktif, bukan dari `late_policies`).

## 4. API Baru (`routes/latePolicies.js`, owner only)

```
GET    /api/late-policies
       → daftar semua karyawan + aturannya (null kalau belum diatur):
         [{ employeeId, name, latePolicy: {...} | null }, ...]

PUT    /api/late-policies
       Body: { employeeIds: [1, 2, 3], checkInLimit, thresholdMinutes,
               deductionType, deductionFlatAmount?, deductionPerMinuteAmount?, deductionPercentage? }
       → upsert baris untuk setiap employeeId di daftar (mendukung "centang banyak karyawan,
         isi satu form" dari sisi UI nanti). Validasi field deduction_* sesuai deductionType.

DELETE /api/late-policies/:employeeId
       → hapus baris (matikan fitur untuk karyawan itu, balik ke "tidak ada potongan").
```

Semua endpoint memakai middleware `requireOwner` yang sudah ada di `middleware/auth.js`, sama seperti `routes/employees.js` untuk field upah.

## 5. Perubahan Logika di `routes/payroll.js`

Di dalam loop yang sudah ada (per karyawan, per hari dalam periode):

1. Ambil baris `late_policies` untuk karyawan ini sekali di awal (kalau tidak ada, lewati langkah 2-4 — `lateMinutesTotal = 0`, `deductionAmount = 0`).
2. Saat `rec.status === 'hadir'` dan ada `check_in_time`, hitung:
   ```
   checkInMinutes = jam×60 + menit  (parse dari "HH:MM")
   limitMinutes   = parse policy.check_in_limit
   lateMinutes    = max(0, checkInMinutes - limitMinutes)
   ```
   Tambahkan ke akumulator `lateMinutesTotal` periode itu.
3. Setelah loop hari selesai, bandingkan `lateMinutesTotal` dengan `policy.threshold_minutes`:
   - `lateMinutesTotal <= threshold_minutes` → `deductionAmount = 0`
   - selebihnya, sesuai `deduction_type`:
     - `flat` → `deductionAmount = deduction_flat_amount`
     - `per_minute` → `deductionAmount = deduction_per_minute_amount × (lateMinutesTotal - threshold_minutes)`
     - `percentage` → `deductionAmount = totalWage × (deduction_percentage / 100)`
4. `finalWage = max(0, totalWage - deductionAmount)`.

**Perubahan bentuk response** `GET /api/payroll`, tiap baris karyawan menambah field:

```js
{
  // field yang sudah ada tetap sama: employeeId, name, dailyWage, hadir, izin, sakit, alpa,
  // totalHoursPaid, totalWage (gaji kotor, makna tidak berubah)
  lateMinutesTotal: number,
  latePolicy: { checkInLimit, thresholdMinutes, deductionType } | null,
  deductionAmount: number,
  finalWage: number   // totalWage - deductionAmount, tidak pernah negatif
}
```

`grandTotal` di level response tetap dipertahankan (jumlah `totalWage`, gaji kotor semua karyawan) dan ditambah `grandFinalTotal` (jumlah `finalWage`, yang sudah dipotong) — supaya laporan tetap bisa menunjukkan "sebelum vs sesudah potongan" untuk transparansi ke owner.

## 6. Di Luar Cakupan (menyusul di putaran terpisah)

- UI form pengaturan owner (halaman centang karyawan + isi jam batas & skema potongan).
- Tampilan kolom "Menit Telat" / "Potongan" di tabel Laporan Gaji dan export CSV.
- Notifikasi ke karyawan/HR soal keterlambatan.
- Riwayat perubahan aturan (audit trail) — kalau dibutuhkan nanti, ini perluasan terpisah karena desain sekarang sengaja tidak menyimpan histori (lihat poin "aturan terbaru" di §2).

## 7. Migrasi

File baru: `migrations/003_late_policies.sql`, dijalankan otomatis oleh migration runner yang sudah ada di [db.js](../../../absensi-app/backend/db.js) (urut nomor, idempotent, tidak perlu langkah manual tambahan).
