# Pengisian Otomatis Hari Libur Nasional

Status: Menunggu persetujuan
Tanggal: 2026-07-31

## 1. Latar Belakang

Tab Hari Libur sudah ada tapi kosong, dan mengisinya manual tiap tahun membosankan sekaligus rawan terlewat — hari libur yang tidak terdaftar langsung membuat karyawan tercatat alpa dan gajinya terpotong.

User meminta pengisian otomatis, terbatas pada **empat hari libur**: Imlek, Idul Fitri, Idul Adha, dan Hari Kemerdekaan.

## 2. Ketepatan Tanggal — Yang Bisa dan Tidak Bisa Dijamin

Tanggal **tidak diambil dari ingatan**, melainkan dihitung lewat konversi kalender bawaan Node (`Intl` dengan kalender `chinese` dan `islamic-umalqura`). Ini sudah diuji sebelum spec ini ditulis.

| Hari libur | Cara hitung | Ketepatan |
|---|---|---|
| Hari Kemerdekaan | 17 Agustus | **Pasti** |
| Imlek | Kalender Cina, 1/1 | **Pasti** (ditentukan astronomis) |
| Idul Fitri | Umalqura, 1 Syawal | **Perkiraan** |
| Idul Adha | Umalqura, 10 Zulhijah | **Perkiraan** |

**Bukti bahwa perkiraan itu benar-benar bisa meleset:** untuk 2025, hitungan umalqura memberi 1 Syawal = 30 Maret, sedangkan penetapan resmi Indonesia adalah 31 Maret. Selisih satu hari. Idul Adha 2025 kebetulan tepat (6 Juni).

Penyebabnya struktural, bukan bug: tanggal resmi Indonesia diputuskan sidang isbat berdasarkan rukyat, sementara umalqura kalender hitungan. Tidak ada cara menghitungnya pasti di muka. Karena itu tanggal Islam **selalu** ditandai perkiraan dan wajib dikonfirmasi terhadap SKB.

## 3. Keputusan User

- Idul Fitri: **2 hari** (1–2 Syawal) **+ cuti bersama 2 hari sebelum dan 2 hari sesudah** — total 6 hari.
- Tanggal perkiraan **diberi penanda dan tombol konfirmasi**.
- Pengisian **manual per tahun** lewat tombol, bukan otomatis saat aplikasi jalan.

## 4. Skema — Migrasi `008_holiday_estimate_flag.sql`

```sql
ALTER TABLE holidays ADD COLUMN is_estimate INTEGER NOT NULL DEFAULT 0;
```

`1` berarti tanggal hasil hitungan yang belum dikonfirmasi owner. Hari libur yang diketik manual selalu `0` — kalau owner mengetiknya sendiri, dia sudah tahu tanggalnya.

Hari libur berstatus perkiraan **tetap dihitung sebagai libur** oleh payroll. Menahannya sampai dikonfirmasi justru berisiko lebih besar: karyawan yang libur Idul Fitri akan tercatat alpa selama owner belum sempat menekan tombol.

## 5. Modul `holidayCalculator.js`

Modul murni (hanya memakai `Intl`, tanpa database), supaya bisa dites langsung.

```js
scanCalendarYear(year, calendar, month, day) → ['YYYY-MM-DD', ...]
```
Menelusuri tiap hari dalam satu tahun Masehi dan mengumpulkan yang cocok dengan bulan/tanggal kalender lain. Mengembalikan **array**, bukan satu tanggal, karena tahun Hijriah lebih pendek ±11 hari sehingga satu hari raya bisa jatuh dua kali dalam satu tahun Masehi.

```js
nationalHolidays(year, workDays) → [{ date, name, isEstimate }, ...]
```
`workDays` adalah hari kerja dari jadwal baku perusahaan, dipakai untuk menempatkan cuti bersama.

Isi yang dihasilkan:
- `17 Agustus` → "Hari Kemerdekaan RI", `isEstimate: false`
- Imlek → "Tahun Baru Imlek", `isEstimate: false`
- 1 Syawal → "Idul Fitri", 2 Syawal → "Idul Fitri (hari kedua)", `isEstimate: true`
- 2 hari kerja **sebelum** 1 Syawal dan 2 hari kerja **sesudah** 2 Syawal → "Cuti Bersama Idul Fitri", `isEstimate: true`
- 10 Zulhijah → "Idul Adha", `isEstimate: true`

**Cuti bersama dihitung dalam hari kerja, bukan hari kalender.** Kalau dihitung kalender, "2 hari sebelum" bisa jatuh di hari Minggu yang memang sudah libur, sehingga cuti bersamanya hilang percuma. Hari kerja diambil dari jadwal baku perusahaan yang berlaku saat itu.

Tanggal yang melewati batas tahun (mis. cuti bersama jatuh di 2 Januari tahun berikutnya) **tetap dibuat**. Data yang benar lebih penting daripada rapi per tahun.

## 6. Endpoint

```
POST  /api/holidays/generate   { year }
      → hitung dan sisipkan. Tanggal yang SUDAH ada dilewati, tidak ditimpa —
        owner mungkin sudah mengoreksinya, dan menimpanya akan menghapus
        koreksi itu diam-diam.
      → balasan: { added: [...], skipped: [...] }

PATCH /api/holidays/:date/confirm
      → is_estimate = 0
```

Keduanya `requireOwner`, seperti endpoint hari libur yang sudah ada.

## 7. Frontend

Di kartu Hari Libur pada tab Jadwal & Libur:

- Tombol **"Isi Libur Nasional"** di samping pemilih tahun. Menekannya memunculkan konfirmasi yang menyebut tahun yang akan diisi, lalu menampilkan ringkasan berapa tanggal ditambahkan dan berapa dilewati.
- Tanggal perkiraan diberi badge kuning **"perkiraan"** dan tombol **"Konfirmasi"**.
- Keterangan tetap di bawah kartu: tanggal perkiraan dihitung dari kalender Hijriah dan bisa berbeda sehari dari penetapan pemerintah — mohon dicek terhadap SKB, lalu dikonfirmasi atau diperbaiki tanggalnya.

## 8. Di Luar Cakupan

- Hari libur nasional selain empat yang diminta (Nyepi, Waisak, Natal, Tahun Baru, Isra Mikraj, Maulid, Kenaikan Isa, Wafat Isa, Hari Buruh, Pancasila).
- Cuti bersama selain seputar Idul Fitri.
- Mengambil tanggal dari sumber daring (tidak ada internet yang dijamin di server kantor).
- Mengubah tanggal libur yang sudah ada lewat generator.

## 9. Verifikasi

`npm test` — 101 test lama tetap lolos, ditambah test `holidayCalculator` (Imlek 2025 = 29 Jan; 1 Syawal 2026 = 20 Mar; cuti bersama melompati hari non-kerja; hari raya yang jatuh dua kali dalam setahun) dan test endpoint (generate menyisipkan, generate kedua kali melewati semua, konfirmasi menghapus penanda perkiraan).

Uji browser: isi libur 2026, pastikan Idul Fitri berbadge perkiraan dan 17 Agustus tidak, konfirmasi satu tanggal lalu badge-nya hilang, dan pastikan alpa di Laporan Gaji berkurang sesuai jumlah hari libur yang jatuh pada hari kerja.
