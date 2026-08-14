# Tab Daftar Karyawan (Pencarian, Pagination, Download, Foto)

Status: Disetujui (menunggu implementasi)
Tanggal: 2026-07-30

## 1. Latar Belakang

User mengirim contoh tampilan "Employee list" dan meminta tab Data Karyawan dibuat menyerupainya. Contoh itu punya: judul dan subjudul, kotak pencarian, tombol Download, header yang bisa diurutkan, foto karyawan dengan kode di bawah nama, serta pagination lengkap (rows per page, "Showing 1-7 of 7", navigasi halaman).

Tab Data Karyawan saat ini masih tabel sederhana tanpa pencarian, pagination, maupun foto ([owner.js](../../../absensi-app/frontend/js/owner.js) `renderKaryawanTab`).

**Keputusan yang sudah diambil bersama user** (contoh punya tujuh kolom, tiga di antaranya ditolak):
- **Branch: tidak dibuat** — konsisten dengan keputusan sebelumnya, usaha hanya satu lokasi.
- **Job level: tidak dibuat** — cukup satu Jabatan yang sudah ada, tidak dipecah jadi level dan posisi.
- **Shift: belum perlu** — ditunda ke putaran berikutnya, jadi jam batas masuk di Aturan Keterlambatan tetap diisi manual.
- **Foto karyawan: unggah foto sungguhan**, bukan inisial.

Kolom **Attendance month** dari contoh juga tidak dipakai, dan tombol ikon (1) di sebelah kotak pencarian tidak dibuat. Keduanya melekat pada gagasan "data satu bulan tertentu" — daftar karyawan di aplikasi ini adalah data induk yang tidak terikat bulan, jadi menambahkannya hanya akan jadi kontrol yang tidak melakukan apa-apa. Kalau nanti Anda ingin daftar karyawan bisa disaring per bulan, itu perluasan tersendiri.

**Catatan gaya visual:** tetap mengikuti gaya yang ada (Tailwind CDN, aksen indigo, netral slate). Perombakan gaya menyeluruh masih menunggu panduan gaya dari user.

## 2. Penyimpanan Foto

### 2.1 Disimpan di database, bukan sebagai berkas di disk

Foto disimpan sebagai BLOB di tabel `employees`. Alasannya: [DEPLOY-WINDOWS.md](../../../absensi-app/backend/DEPLOY-WINDOWS.md) menyatakan satu-satunya sumber data adalah berkas `data/absensiku.db`, dan menyarankan menyalin berkas itu sebagai backup. Kalau foto ditaruh sebagai berkas terpisah di disk, panduan backup itu jadi salah tanpa ada yang menyadarinya — backup akan berjalan "sukses" tapi kehilangan semua foto. Untuk skala usaha kecil (puluhan karyawan, foto masing-masing puluhan KB) BLOB di SQLite sama sekali tidak masalah.

### 2.2 Diunggah sebagai data URL, bukan multipart

Foto dikirim sebagai data URL base64 di dalam JSON permintaan simpan karyawan yang sudah ada — bukan lewat `multipart/form-data`. Alasannya: memproses multipart butuh dependency baru (`multer`), sementara proyek ini punya batasan tegas tanpa dependency tambahan (tidak ada toolchain native di mesin user).

Supaya ukurannya tetap kecil, **browser mengecilkan foto lebih dulu** memakai `<canvas>`: sisi terpanjang dipotong ke 320 piksel, diekspor sebagai JPEG kualitas 0,8. Hasilnya biasanya 15–40 KB. Ini juga membuat pengguna tidak perlu memikirkan ukuran berkas aslinya.

Batas `express.json()` dinaikkan dari bawaan 100 KB menjadi 2 MB untuk memberi ruang, tapi server **tetap memvalidasi sendiri** (§3.2) — pengecilan di browser adalah kemudahan, bukan pengaman.

## 3. Backend

### 3.1 Migrasi `005_employee_photo.sql`

```sql
ALTER TABLE employees ADD COLUMN photo BLOB;
ALTER TABLE employees ADD COLUMN photo_mime TEXT;
ALTER TABLE employees ADD COLUMN photo_updated_at INTEGER;
```

`photo_updated_at` dipakai sebagai penanda versi pada URL gambar (`?v=<angka>`) supaya foto yang baru diganti langsung tampil dan tidak tertutup cache browser.

### 3.2 Validasi unggahan di `routes/employees.js`

Field `photo` pada `POST`/`PUT` menerima tiga bentuk:
- **Tidak dikirim (`undefined`)** → foto yang ada dibiarkan apa adanya. Ini penting supaya menyimpan perubahan nama tidak diam-diam menghapus foto.
- **`null`** → foto dihapus.
- **String data URL** → foto diganti.

Validasi data URL:
- Harus cocok pola `data:<mime>;base64,<data>`.
- `mime` harus salah satu dari `image/jpeg`, `image/png`, `image/webp`. Tipe lain ditolak 400.
- Hasil decode maksimal **500 KB**; lebih dari itu ditolak 400 dengan pesan yang menyebut batasnya.
- Base64 yang rusak/tidak bisa didecode ditolak 400, bukan membuat server error.

### 3.3 Endpoint foto

```
GET /api/employees/:id/photo
```
Tersedia untuk HR dan Owner (`requireAuth`) — foto bukan data rahasia seperti upah, dan HR justru butuh untuk mengenali karyawan. Mengembalikan isi BLOB dengan `Content-Type` sesuai `photo_mime` dan `Cache-Control: private, max-age=31536000, immutable` (aman karena URL-nya ber-versi). Karyawan tanpa foto membalas **404**, bukan gambar kosong — supaya frontend bisa membedakan dengan jelas.

### 3.4 Bentuk respons

`toJson` **tidak pernah** mengembalikan BLOB-nya (akan membuat daftar karyawan berat). Yang ditambahkan hanya:
```js
hasPhoto: !!row.photo,
photoVersion: row.photo_updated_at
```
Frontend menyusun URL-nya sendiri: `/api/employees/${id}/photo?v=${photoVersion}`.

### 3.5 Test

`test/employees.route.test.js` ditambah: unggah data URL PNG kecil lalu `hasPhoto` jadi `true`; `GET .../photo` membalas 200 dengan `Content-Type` benar; mime tidak didukung ditolak 400; data URL rusak ditolak 400 (bukan 500); foto lebih dari 500 KB ditolak 400; `photo: null` menghapus foto; menyimpan karyawan **tanpa** menyertakan field `photo` tidak menghilangkan foto yang sudah ada; karyawan tanpa foto membalas 404.

## 4. Frontend

### 4.1 Helper tabel bersama — `frontend/js/tableUtils.js` (baru)

Pengurutan tabel monitoring sudah ada di `checklist.js`, dan tabel daftar karyawan butuh hal yang sama plus perbandingan angka dan tanggal. Menyalin logikanya dua kali akan membuat keduanya menyimpang seiring waktu, jadi bagian umumnya dipindah ke modul baru:

- `sortRows(rows, readValue, dir)` — mengurutkan dengan aturan: nilai kosong **selalu di akhir** untuk kedua arah; angka dibandingkan sebagai angka; teks memakai `localeCompare(…, 'id', { numeric: true, sensitivity: 'base' })` supaya `TDI-2` mendahului `TDI-10`.
- `sortableHeaderHtml({ state, key, label, className, buttonClass })` — merender `<th>` berisi tombol dengan penanda `▲`/`▼` untuk kolom aktif dan penanda samar untuk kolom lain.
- `nextSortState(state, key)` — kolom sama membalik arah, kolom berbeda mulai dari `asc`.

`checklist.js` diubah memakai helper ini (perilaku tabel monitoring tidak berubah sama sekali), dan `tableUtils.js` didaftarkan **sebelum** `checklist.js` di `index.html`.

### 4.2 File baru `frontend/js/employeeList.js`

Seluruh tab dipindah ke file sendiri; `owner.js` sudah menangani enam tab dan `renderKaryawanTab` akan tumbuh jauh lebih besar dengan pencarian, pagination, dan download. `owner.js` hanya memanggil `renderEmployeeListTab(employees)`.

Status tab disimpan di objek tingkat modul:
```js
const EmployeeListState = { search: '', sort: { key: 'name', dir: 'asc' }, page: 1, perPage: 10 };
```

**Susunan tampilan** (satu kartu, mengikuti contoh):
- Baris atas: judul "Daftar Karyawan" dan subjudul "Menampilkan N karyawan" di kiri; kotak pencarian, tombol "Download", dan tombol "+ Tambah Karyawan" di kanan. Menumpuk vertikal di layar sempit.
- Tabel dengan kolom:

| Kolom | Isi | Bisa diurutkan |
|---|---|---|
| Nama Karyawan | foto bulat (atau lingkaran inisial kalau belum ada foto) + nama, dengan kode karyawan sebagai teks kecil di bawahnya | ya (nama) |
| Jabatan | nama jabatan atau `—` | ya |
| Divisi | nama divisi atau `—` | ya |
| Upah Harian | rupiah | ya (numerik) |
| Tanggal Lahir | tanggal Indonesia, `—` kalau kosong | ya |
| Status | badge Aktif/Nonaktif | ya |
| Aksi | tombol Edit | tidak |

- Baris bawah: pemilih "Baris per halaman" (10/25/50), teks "Menampilkan 1–10 dari N", dan navigasi halaman (tombol sebelumnya/berikutnya + pemilih halaman).

**Pencarian** berjalan di sisi browser atas data yang sudah dimuat, mencocokkan nama, kode karyawan, jabatan, dan divisi tanpa peduli besar-kecil huruf. Mengubah kata kunci mengembalikan tampilan ke halaman 1 — kalau tidak, hasil pencarian bisa tampak kosong hanya karena masih berada di halaman 5.

**Halaman kosong setelah data menyusut** (mis. karyawan dihapus atau kata kunci dipersempit) dijepit ke halaman terakhir yang valid, jadi tabel tidak pernah tampil kosong padahal ada hasil.

**Download** menghasilkan CSV berisi **hasil pencarian yang sedang tampak** (bukan hanya halaman aktif, bukan pula seluruh data yang terfilter habis) dengan kolom: Employee ID, Nama, Jabatan, Divisi, Upah Harian, Tanggal Lahir, Status. Memakai pola `Blob` + BOM yang sudah dipakai `exportPayrollCsv`.

Foto berukuran 36 px bulat. Kalau `hasPhoto` bernilai `false`, ditampilkan lingkaran berisi inisial dengan warna latar diturunkan dari nama, supaya baris tetap rata dan tidak ada gambar rusak.

### 4.3 Pemilih foto di form karyawan (`owner.js`)

Di modal tambah/ubah karyawan, di bagian paling atas: foto pratinjau bulat berdampingan dengan tombol "Pilih Foto" dan (kalau sudah ada foto) "Hapus Foto".

`<input type="file" accept="image/*">` disembunyikan dan dipicu tombol. Setelah berkas dipilih, foto **dikecilkan di browser** (sisi terpanjang 320 px, JPEG kualitas 0,8) lewat `<canvas>`, lalu hasil data URL-nya dipakai sebagai pratinjau sekaligus nilai yang dikirim.

Aturan pengiriman mengikuti §3.2: kalau pengguna tidak menyentuh foto, field `photo` **tidak disertakan** sama sekali; kalau menekan "Hapus Foto", dikirim `null`; kalau memilih berkas baru, dikirim data URL.

Berkas yang gagal dibaca sebagai gambar (mis. berkas rusak atau bukan gambar meski berekstensi gambar) memunculkan pesan di dalam modal, bukan menggantung tanpa keterangan.

## 5. Di Luar Cakupan

- Kolom Branch, Job level, Shift, dan Attendance month (ditolak/ditunda user).
- Tombol ikon (1) di contoh dan penyaringan per bulan.
- Pencarian/pagination di tabel Monitoring, Riwayat, dan Laporan Gaji.
- Memotong/menggeser foto (crop) — foto dikecilkan utuh, tidak dipotong.
- Perombakan gaya visual menyeluruh.

## 6. Verifikasi

Backend lewat `npm test` (32 test lama harus tetap lolos, ditambah test foto di §3.5). Frontend lewat browser: unggah foto ke satu karyawan dan pastikan tampil di daftar; simpan ulang karyawan itu tanpa menyentuh foto dan pastikan fotonya tidak hilang; hapus foto dan pastikan kembali ke lingkaran inisial; uji pencarian menyempitkan hasil dan mengembalikan ke halaman 1; uji tiap header pengurutan naik dan turun termasuk kolom upah (numerik); ubah baris per halaman dan telusuri halaman; unduh CSV dan pastikan isinya sesuai hasil pencarian. Terakhir, pastikan tabel Monitoring tidak berubah perilakunya setelah pengurutannya dipindah ke helper bersama.
