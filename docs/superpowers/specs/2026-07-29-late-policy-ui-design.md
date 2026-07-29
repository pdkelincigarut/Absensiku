# UI Aturan Keterlambatan & Kolom Potongan di Laporan Gaji

Status: Disetujui (menunggu implementasi)
Tanggal: 2026-07-29

## 1. Latar Belakang

Backend fitur keterlambatan sudah selesai ([spec](2026-07-28-late-policy-design.md), diimplementasikan 2026-07-29): tabel `late_policies`, endpoint `GET/PUT/DELETE /api/late-policies`, dan `GET /api/payroll` yang sudah mengembalikan `lateMinutesTotal`, `latePolicy`, `deductionAmount`, `finalWage`, serta `grandFinalTotal`.

Yang belum ada: cara Owner mengatur aturan itu dari dalam aplikasi (saat ini hanya bisa lewat panggilan API langsung), dan tampilan hasil potongannya di Laporan Gaji. Dokumen ini menutup kesenjangan tersebut.

**Catatan gaya visual:** UI di sini dibangun mengikuti gaya yang sudah dipakai sekarang (Tailwind CDN, aksen indigo, netral slate, kartu `rounded-xl` + `border-slate-200`). User sedang menyiapkan panduan gaya visualnya sendiri; perombakan tampilan menyeluruh (termasuk halaman ini) adalah putaran kerja terpisah setelah panduan itu tersedia. Jangan mendahului dengan gaya baru di sini.

## 2. Cakupan

Tiga bagian:
1. Tab baru **"Aturan Keterlambatan"** di Dashboard Owner.
2. Kolom baru di tabel **Laporan Gaji** + export CSV-nya.
3. Tiga fungsi data baru di `storage.js`.

Di luar cakupan: perombakan gaya visual halaman lain, tampilan keterlambatan di dashboard HR (HR memang tidak boleh melihat data upah/potongan — konsisten dengan pembatasan `dailyWage` yang sudah ada).

## 3. Struktur File

Kode tab baru ditaruh di file terpisah **`frontend/js/latePolicy.js`**, bukan ditambahkan ke `owner.js` yang sudah 427 baris dan menangani empat tab. File baru ini berisi seluruh tab "Aturan Keterlambatan" (render tabel, modal form, aksi simpan/hapus), mengikuti pola pemisahan yang sudah ada (`checklist.js` menampung komponen bersama, `hr.js`/`owner.js` menampung dashboard masing-masing).

Didaftarkan di `index.html` **sebelum** `owner.js`, karena `owner.js` akan memanggil `renderLatePolicyTab()` dari file ini:

```html
<script src="js/checklist.js"></script>
<script src="js/latePolicy.js"></script>
<script src="js/hr.js"></script>
<script src="js/owner.js"></script>
```

`latePolicy.js` memakai helper yang sudah ada tanpa mendefinisikan ulang: `escapeHtml`, `openModal`, `closeModal` (dari `checklist.js`), `formatRupiah` (dari `owner.js`), `Storage` (dari `storage.js`).

## 4. Tab "Aturan Keterlambatan"

### 4.1 Pendaftaran tab

Di `owner.js`, sisipkan tombol tab baru tepat setelah `'karyawan'`:
```js
${tabButton('keterlambatan', 'Aturan Keterlambatan')}
```
dan cabang di `renderOwnerTab()`:
```js
else if (OwnerState.tab === 'keterlambatan') renderLatePolicyTab();
```

Urutan tab jadi: Monitoring Hari Ini · Data Karyawan · Aturan Keterlambatan · Riwayat Absensi · Laporan Gaji.

### 4.2 Tabel daftar

Sumber data: `GET /api/late-policies` (mengembalikan **semua** karyawan beserta aturannya, `latePolicy: null` kalau belum diatur). Kolom:

| Kolom | Isi |
|---|---|
| (ceklis) | checkbox per baris; header punya "pilih semua" |
| Nama | nama karyawan |
| Jam Batas Masuk | mis. `08:30`, atau `Belum diatur` (teks abu-abu) kalau `latePolicy` null |
| Toleransi | mis. `30 menit`, atau `—` |
| Skema Potongan | teks ringkas sesuai tipe (lihat §4.4), atau `—` |
| Aksi | tombol "Hapus aturan" — hanya muncul kalau karyawan itu punya aturan |

Di atas tabel: teks jumlah karyawan terpilih dan tombol **"Atur Aturan (N terpilih)"**. Tombol `disabled` selama belum ada baris tercentang.

Di bawah tabel, satu baris penjelasan singkat: keterlambatan dihitung dari jam masuk yang tercatat otomatis saat HR menceklis "hadir"; total menit telat diakumulasi sepanjang periode gaji (27–26); potongan berlaku hanya jika total melewati toleransi.

### 4.3 Modal form

Dibuka oleh tombol "Atur Aturan". Judul menyebut jumlah karyawan terpilih, mis. "Atur Aturan untuk 3 Karyawan". Isi form:

- **Jam batas masuk** — `<input type="time" required>`, nilai awal `08:30`.
- **Toleransi keterlambatan** — `<input type="number" min="0" required>`, satuan menit, keterangan "per periode gaji".
- **Skema potongan** — tiga radio button:
  - `flat` — "Nominal tetap" → memunculkan input Rupiah (`min="0" step="1000"`)
  - `per_minute` — "Per menit kelebihan" → memunculkan input Rupiah per menit (`min="0" step="500"`)
  - `percentage` — "Persentase gaji" → memunculkan input persen (`min="0" max="100" step="0.5"`)

Hanya input nominal milik radio yang sedang dipilih yang ditampilkan; dua lainnya disembunyikan (`hidden`) **dan** di-`disabled` supaya tidak ikut tervalidasi `required` browser saat tersembunyi. Radio default: `flat`.

Tombol: "Batal" (tutup modal) dan "Simpan". Kalau server menolak, pesan errornya ditampilkan di dalam modal (pola `#form-error` yang sudah dipakai `openEmployeeModal`), form tidak tertutup.

**Nilai awal saat mengedit:** kalau **tepat satu** karyawan tercentang dan ia sudah punya aturan, form diisi dengan nilai aturannya. Kalau lebih dari satu karyawan tercentang, form dimulai dari nilai default — karena aturan mereka bisa berbeda-beda dan menebak salah satu akan menyesatkan.

Simpan → `PUT /api/late-policies` dengan `employeeIds` = semua yang dicentang → tutup modal → render ulang tab.

### 4.4 Format teks skema potongan

Satu fungsi bantu di `latePolicy.js` dipakai di kolom tabel:
- `flat` → `Rp50.000 (tetap)`
- `per_minute` → `Rp1.000/menit`
- `percentage` → `5% dari gaji`

### 4.5 Hapus aturan

Tombol "Hapus aturan" per baris → `confirm()` dengan nama karyawan → `DELETE /api/late-policies/:employeeId` → render ulang. Setelah dihapus, karyawan itu kembali tidak kena potongan sama sekali.

## 5. Perubahan Tabel Laporan Gaji

Di `renderLaporanTab()` dan `renderPayrollTable()` pada `owner.js`.

Kolom saat ini: Karyawan · Hadir · Izin · Sakit · Alpa · Total Jam (dibayar) · Upah Harian · Total Gaji.

Kolom baru disisipkan **setelah Total Gaji** (yang maknanya tetap: gaji kotor sebelum potongan):

| Kolom baru | Isi |
|---|---|
| Menit Telat | `lateMinutesTotal`, mis. `45 mnt`; tampil `—` kalau karyawan tidak punya aturan (`latePolicy === null`) |
| Potongan | `deductionAmount` diformat Rupiah, diberi warna merah (`text-rose-600`) kalau > 0; `—` kalau 0 |
| Gaji Bersih | `finalWage`, ditebalkan — ini angka yang benar-benar dibayarkan |

`colspan` pada baris "Memuat..."/"Gagal memuat"/"Belum ada karyawan" naik dari 8 ke 11.

Baris total (`tfoot`) menampilkan dua angka bertumpuk: **Total Gaji Kotor** (`grandTotal`) dan **Total Gaji Bersih** (`grandFinalTotal`), supaya selisih potongan seluruh karyawan terlihat.

Kalimat penjelasan di atas tabel ditambah satu kalimat: potongan keterlambatan dihitung otomatis dari aturan di tab Aturan Keterlambatan, dan gaji bersih tidak pernah kurang dari nol.

### 5.1 Export CSV

Header CSV bertambah tiga kolom dengan urutan sama seperti tabel: `Menit Telat`, `Potongan`, `Gaji Bersih` setelah `Total Gaji`. Nilai yang ditulis adalah angka mentah (bukan hasil `formatRupiah`), konsisten dengan kolom `Upah Harian`/`Total Gaji` yang sudah ada — supaya bisa dihitung ulang di Excel.

## 6. Perubahan `storage.js`

Tiga method baru di objek `Storage`, mengikuti pola `apiRequest` yang sudah ada:

```js
async getLatePolicies() {
  return apiRequest('GET', '/api/late-policies');
},
async saveLatePolicies(payload) {
  return apiRequest('PUT', '/api/late-policies', payload);
},
async deleteLatePolicy(employeeId) {
  return apiRequest('DELETE', `/api/late-policies/${employeeId}`);
}
```

`payload` berisi `{ employeeIds, checkInLimit, thresholdMinutes, deductionType, deductionFlatAmount?, deductionPerMinuteAmount?, deductionPercentage? }` — bentuk yang sama persis dengan yang divalidasi `routes/latePolicies.js`.

## 7. Penanganan Error & Keadaan Kosong

- Gagal memuat daftar (`GET`) → pesan merah di area tab, pola sama seperti `renderOwnerTab()` sekarang: `Gagal memuat data: <pesan>`.
- Gagal simpan/hapus → pesan error ditampilkan tanpa menutup modal (untuk simpan) atau lewat `alert()` (untuk hapus, mengikuti pola `openEmployeeModal` yang sudah ada).
- Belum ada karyawan sama sekali → satu baris "Belum ada karyawan." di dalam tabel, tombol "Atur Aturan" tetap `disabled`.

## 8. Verifikasi

Backend sudah punya 15 test otomatis yang menjamin logika perhitungan dan endpoint-nya. Frontend proyek ini tidak punya kerangka test (murni script di browser, tanpa build step), jadi verifikasi dilakukan lewat browser: login sebagai owner, buka tab Aturan Keterlambatan, centang beberapa karyawan, simpan aturan, cek nilainya muncul di tabel, lalu buka Laporan Gaji dan pastikan kolom Menit Telat/Potongan/Gaji Bersih terisi sesuai. Hapus aturan salah satu karyawan dan pastikan kolomnya kembali `—`.
