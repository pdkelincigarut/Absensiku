# Revisi AbsensiKu: HR Admin & Owner (tanpa login Karyawan)

Status: Disetujui (menunggu implementasi)
Tanggal: 2026-07-22

## 1. Latar Belakang

Versi awal AbsensiKu punya 2 role: Karyawan (self check-in) dan Owner (kelola data + laporan). Berdasarkan revisi:

- Karyawan **tidak lagi membuka aplikasi ini sendiri**. Kehadiran diceklis oleh **HR Admin** (role baru), dengan jam yang diambil otomatis dari sistem (tidak bisa diketik manual).
- Kehadiran kini punya granularitas jam kerja: **Full Day / Setengah Hari / Jam Tertentu (termasuk lembur)**, dan upah dihitung otomatis berdasarkan jam tersebut.
- Periode penggajian diubah jadi **27 bulan lalu s/d 26 bulan berjalan** (1 bulan/30 hari), laporan siap tiap **tanggal 27**.
- Rekomendasi arsitektur untuk sinkronisasi data real-time antar PC HR dan PC Owner dibahas terpisah di §8 sebagai saran, **di luar cakupan implementasi saat ini**.

## 2. Roles & Akses

| | HR Admin | Owner |
|---|---|---|
| Login terpisah | ✅ | ✅ |
| Ceklis kehadiran hari ini (+ tombol Centang Semua) | ✅ | ✅ |
| Riwayat absensi (tanpa data upah) | ✅ | ✅ |
| Lihat/atur Upah Harian & data karyawan | ❌ | ✅ |
| Laporan Gaji Bulanan | ❌ | ✅ |

- Halaman login hanya punya 2 pilihan: **HR Admin** dan **Owner**. Tab/role "Karyawan" dihapus total dari `app.js`.
- `employee.js` (dashboard karyawan self check-in) **dihapus**, digantikan alur ceklis oleh HR/Owner di dalam dashboard mereka masing-masing.

## 3. Struktur Data (localStorage)

Struktur lama direset karena berubah bentuk (bukan migrasi field-by-field):

```js
// att_accounts — akun yang bisa login
{ id, name, username, password, role: 'hr' | 'owner', createdAt }

// att_employees — data karyawan (BUKAN akun, tidak login)
{ id, name, dailyWage, active: true, createdAt }

// att_attendance — satu record per employee per tanggal
{
  id, employeeId, date,               // 'YYYY-MM-DD'
  status: 'hadir' | 'izin' | 'sakit' | 'alpa',
  attendanceType: 'full' | 'half' | 'custom' | null,  // hanya diisi kalau status === 'hadir'
  hoursWorked: number | null,          // hanya kalau status === 'hadir'; full=8, half=4, custom=input HR (boleh >8 untuk lembur)
  checkInTime: 'HH:MM' | null,         // diambil dari jam sistem saat diceklis, TIDAK bisa diedit manual
  note: string,
  markedBy: string,                    // nama akun (HR/Owner) yang menceklis, untuk jejak audit
  updatedAt: number
}
```

Seed data demo:
- Akun: `hradmin / hr123` (role hr), `owner / owner123` (role owner)
- Karyawan: Budi Santoso, Siti Aminah, Andi Wijaya (dailyWage sama seperti sebelumnya)

## 4. Alur Ceklis Kehadiran

Berlaku sama di dashboard HR Admin maupun Owner (komponen dibagi/reuse, bukan diduplikasi):

1. Daftar karyawan untuk tanggal terpilih (default hari ini), masing-masing menampilkan status saat ini.
2. Tombol **"Ceklis Hadir"** per karyawan membuka pilihan cepat:
   - **Full Day** → `hoursWorked = 8`
   - **Setengah Hari** → `hoursWorked = 4`
   - **Jam Tertentu** → input angka jam (boleh > 8 untuk lembur, tanpa batas atas keras, validasi > 0)
   - `checkInTime` otomatis diisi jam sistem saat submit, field ini **read-only** di UI (tidak ada input time yang bisa diketik, beda dari versi lama).
3. Status **Izin/Sakit/Alpa** tetap tersedia sebagai pilihan terpisah (tanpa jam/upah).
4. Tombol **"Centang Semua"** di atas daftar: menandai semua karyawan yang **belum** punya record di tanggal itu sebagai Hadir/Full Day dengan jam sistem saat itu — didahului dialog konfirmasi (menyebutkan jumlah karyawan yang akan tercentang) untuk mencegah salah klik. Karyawan yang sudah punya record (apapun statusnya) tidak tersentuh oleh aksi ini.
5. Semua perubahan mencatat `markedBy` dari akun yang sedang login.

## 5. Otomasi Upah

Rumus per hari:

```
Upah Hari Itu = (min(hoursWorked, 8) / 8) × Upah Harian
```

- Jam di atas 8 (lembur) **tetap tersimpan dan ditampilkan** di riwayat/monitoring untuk transparansi, tapi **tidak menambah upah otomatis** (dibatasi maksimal 8 jam saat dihitung ke gaji), sesuai keputusan bahwa lembur dihitung manual oleh Owner di luar sistem bila diperlukan.
- Izin/Sakit/Alpa → upah hari itu = Rp0.
- Total Gaji per periode = akumulasi upah harian di atas untuk seluruh hari dalam periode (menggantikan rumus lama `hari hadir × upah harian` yang tidak mendukung pecahan hari).

## 6. Periode Penggajian & Laporan

- Periode = **tanggal 27 bulan sebelumnya s/d tanggal 26 bulan berjalan** (30 hari, cutoff tunggal di tanggal 26).
- Laporan periode berjalan otomatis muncul lengkap begitu tanggal berganti ke **27** (sehari setelah cutoff).
- Dropdown periode (berjalan + 11 periode sebelumnya) tetap ada seperti versi sebelumnya, hanya logika tanggal mulai/akhir yang berubah.
- Tabel Laporan Gaji: kolom Hadir (hitung hari), Izin, Sakit, Alpa tetap ditampilkan sebagai ringkasan jumlah hari, ditambah kolom **Total Jam Kerja** dan **Total Gaji** (hasil akumulasi rumus §5, bukan lagi perkalian sederhana).

## 7. Perubahan UI Ringkas

- **Login**: 2 tombol role (HR Admin / Owner), hapus tombol Karyawan & hint akun demo karyawan.
- **Dashboard HR Admin** (baru): tab Monitoring (ceklis + Centang Semua) dan Riwayat — tanpa kolom upah di mana pun.
- **Dashboard Owner**: tetap 4 tab (Monitoring, Data Karyawan, Riwayat, Laporan Gaji); tab Monitoring & Riwayat kini pakai komponen ceklis yang sama dengan HR Admin, ditambah kolom Tipe Kehadiran/Jam Kerja.
- **Data Karyawan**: form employee tidak lagi punya field username/password (karena bukan akun login), hanya Nama + Upah Harian + status aktif.

## 8. Saran Arsitektur: Sinkronisasi Real-Time PC HR ↔ PC Owner (di luar cakupan implementasi ini)

localStorage bersifat per-browser/per-device, sehingga PC HR dan PC Owner tidak akan otomatis berbagi data. Tiga opsi:

1. **Firebase Realtime Database / Firestore (Rekomendasi)** — ganti layer `Storage` dengan SDK Firebase; dapat sinkronisasi real-time gratis (tier gratis cukup untuk skala UKM), tanpa perlu kelola server sendiri, dan perubahan minimal di kode (hanya `storage.js` yang diganti, UI tidak berubah). Trade-off: data disimpan di cloud pihak ketiga, perlu koneksi internet.
2. **Backend sendiri (Node.js + Express + SQLite/Postgres + Socket.io)** — data tetap di server milik sendiri (bisa di kantor/VPS), real-time via WebSocket. Trade-off: perlu maintain server & hosting sendiri, effort development lebih besar.
3. **Server lokal sederhana di jaringan kantor (LAN)** — satu PC (atau NAS/mini PC) menjalankan server ringan, kedua PC HR & Owner akses via IP lokal. Trade-off: hanya berfungsi saat kedua PC berada di jaringan yang sama, tidak bisa diakses dari luar kantor.

Rekomendasi: mulai dengan **opsi 1 (Firebase)** karena effort implementasi paling kecil dan sudah real-time out-of-the-box. Ini disarankan jadi spec & proyek terpisah setelah revisi ini selesai.

## 9. Di Luar Cakupan

- Implementasi backend/sinkronisasi real-time (§8) — fase terpisah.
- Perhitungan lembur dengan multiplier/rate khusus — tidak diminta, jam lembur murni pencatatan.
- Migrasi otomatis data lama ke struktur baru — data lama akan direset (aplikasi masih tahap pengembangan/demo).
