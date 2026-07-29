# Data Induk Karyawan (Employee ID, Jabatan, Divisi) & Tabel Monitoring Baru

Status: Disetujui (menunggu implementasi)
Tanggal: 2026-07-29

## 1. Latar Belakang

User mengirim contoh tampilan tabel absensi berisi kolom **No · ceklis · Employee ID · Full Name · Branch · Job · Organization** dengan header yang bisa diurutkan, dan meminta tabel Monitoring Hari Ini dibuat seperti itu.

Tabel `employees` saat ini hanya punya `name`, `daily_wage`, `birth_date`, dan `active` — tidak ada kode karyawan, jabatan, maupun divisi. Jadi tampilan yang diminta tidak bisa dibuat sebelum data induknya ada. Dokumen ini mencakup keduanya sekaligus (backend + tampilan) sesuai keputusan user untuk mengerjakannya dalam satu putaran.

**Keputusan yang sudah diambil bersama user:**
- Kolom **Branch/Cabang tidak dibuat** — usaha hanya satu lokasi.
- **Jabatan dan Divisi memakai daftar yang dikelola Owner** (tabel tersendiri + halaman pengelolaan), bukan ketik bebas, supaya konsisten dan pengurutannya rapi.
- **Employee ID diketik Owner, wajib, dan tidak boleh kembar.**
- Target tampilan: **Monitoring Hari Ini** (bukan Data Karyawan).

**Catatan gaya visual:** tetap mengikuti gaya yang ada sekarang (Tailwind CDN, aksen indigo, netral slate). User sedang menyiapkan panduan gaya visualnya sendiri; perombakan tampilan menyeluruh adalah putaran terpisah.

## 2. Skema Database — Migrasi `004_employee_master_data.sql`

```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

ALTER TABLE employees ADD COLUMN employee_code TEXT;
ALTER TABLE employees ADD COLUMN job_id INTEGER REFERENCES jobs(id);
ALTER TABLE employees ADD COLUMN organization_id INTEGER REFERENCES organizations(id);

UPDATE employees SET employee_code = 'EMP-' || substr('000' || id, -3) WHERE employee_code IS NULL;

CREATE UNIQUE INDEX idx_employees_code ON employees(employee_code);
```

**Kenapa ada `UPDATE` pengisian kode:** aturan "kode wajib & unik" tidak bisa langsung dipasang ke tabel yang sudah berisi karyawan tanpa kode — semua barisnya akan bernilai `NULL` dan melanggar aturan begitu index unik dibuat. Karyawan lama karena itu diberi kode sementara `EMP-001`, `EMP-002`, dan seterusnya (diturunkan dari `id`, jadi dijamin unik), yang bisa Owner ganti kapan saja lewat form karyawan.

**Kenapa `job_id`/`organization_id` boleh `NULL`:** kalau diwajibkan, seluruh karyawan lama langsung tidak valid dan Owner terpaksa membuat daftar jabatan lebih dulu sebelum bisa menyentuh data karyawan sama sekali. Yang kosong ditampilkan sebagai `—`. Validasi server tetap memastikan: kalau `jobId`/`organizationId` dikirim, id itu harus benar-benar ada.

`REFERENCES` ditulis untuk mendokumentasikan hubungan antar tabel, tapi tidak ditegakkan karena `PRAGMA foreign_keys` memang tidak diaktifkan di proyek ini (lihat catatan di [db.js](../../../absensi-app/backend/db.js)). Perlindungan hapus dijalankan di route (§3.2), bukan oleh constraint.

## 3. Backend

### 3.1 Endpoint baru: `/api/jobs` dan `/api/organizations`

Kedua tabel bentuknya identik (`id`, `name`, `created_at`) dan aturannya identik, jadi keduanya dilayani **satu factory bersama** di `routes/lookupRouter.js` — bukan dua file yang isinya sama persis:

```js
createLookupRouter({ table: 'jobs', employeeColumn: 'job_id', label: 'Jabatan' })
createLookupRouter({ table: 'organizations', employeeColumn: 'organization_id', label: 'Divisi' })
```

Nama tabel dan kolom di atas berasal dari konstanta di kode, **tidak pernah dari input pengguna**, jadi aman disisipkan ke string SQL. Nilai yang datang dari request tetap lewat parameter binding seperti biasa.

Rute yang dihasilkan (semuanya `requireOwner`):

```
GET    /api/jobs            → [{ id, name }, ...] urut nama
POST   /api/jobs            { name }  → 201, tolak kalau nama kosong atau sudah ada
PUT    /api/jobs/:id        { name }  → tolak kalau nama bentrok dengan entri lain
DELETE /api/jobs/:id        → tolak (400) kalau masih dipakai karyawan
```

`/api/organizations` sama persis dengan label "Divisi" di pesan errornya.

### 3.2 Perlindungan hapus

`DELETE` menolak dengan status 400 dan pesan menyebut jumlah pemakainya, mis. `Jabatan ini masih dipakai 3 karyawan. Ubah jabatan karyawan tersebut dulu sebelum menghapus.` Ini dipilih daripada mengosongkan `job_id` karyawan secara diam-diam — menghapus data yang tidak diminta pengguna adalah kejutan yang tidak baik.

### 3.3 Perubahan `routes/employees.js`

`toJson` menambah tiga field:
```js
employeeCode: row.employee_code,
job: row.job_id ? { id: row.job_id, name: row.job_name } : null,
organization: row.organization_id ? { id: row.organization_id, name: row.organization_name } : null
```

`GET /api/employees` memakai `LEFT JOIN` ke `jobs` dan `organizations` supaya nama ikut terbawa dalam satu query.

Field `employeeCode`, `jobId`, `organizationId` diterima di `POST` dan `PUT` dengan aturan:
- `employeeCode` wajib, tidak boleh kosong, dan tidak boleh sama dengan kode karyawan lain (pada `PUT`, karyawan yang sedang diubah dikecualikan dari pengecekan).
- `jobId`/`organizationId` boleh `null`; kalau diisi, id-nya harus ada di tabel terkait.

Pembatasan yang sudah ada tetap: HR tidak menerima `dailyWage`; tulis/hapus tetap khusus Owner. Employee code, jabatan, dan divisi **boleh dilihat HR** — tidak ada alasan merahasiakannya, dan HR memang butuh untuk membedakan karyawan bernama mirip.

### 3.4 `seed.js`

Seed diperbarui supaya instalasi baru langsung punya contoh yang masuk akal: beberapa jabatan (mis. Manager, Supervisor, Staff), beberapa divisi (mis. Accounting, Information & Technology, Business Development), dan tiga karyawan contoh yang sudah punya kode serta terhubung ke jabatan/divisi. Sifat idempotennya dipertahankan (dilewati kalau `accounts` sudah berisi data).

### 3.5 Test

Mengikuti pola `node:test` + `test/helpers.js` yang sudah ada:
- `test/lookupRouter.test.js` — tambah/ubah/hapus, tolak nama kosong, tolak nama kembar, tolak hapus yang masih dipakai karyawan, tolak akses non-owner.
- `test/employees.route.test.js` — kode wajib, kode kembar ditolak, `PUT` dengan kode sendiri tetap boleh, `jobId` tidak dikenal ditolak, `GET` membawa nama jabatan/divisi.

## 4. Frontend

### 4.1 `storage.js`

Enam method baru mengikuti pola `apiRequest` yang ada: `getJobs`, `saveJob`, `deleteJob`, `getOrganizations`, `saveOrganization`, `deleteOrganization`. `saveJob(record)` memakai `POST` kalau `record.id` kosong dan `PUT` kalau ada, sama seperti `upsertEmployee`.

### 4.2 Tab baru "Jabatan & Divisi" (panel Owner)

File baru **`frontend/js/lookups.js`** berisi seluruh tab ini — `owner.js` sudah menangani lima tab, menambah lagi ke dalamnya akan memperburuk file yang sudah besar. Didaftarkan di `index.html` sebelum `owner.js`.

Isinya dua daftar berdampingan (grid dua kolom di layar lebar, bertumpuk di layar sempit): **Jabatan** di kiri, **Divisi** di kanan. Masing-masing punya tombol "+ Tambah", dan setiap baris punya tombol Ubah dan Hapus. Tambah/ubah lewat modal berisi satu isian nama. Karena keduanya identik, satu fungsi render dipakai untuk kedua daftar dengan parameter pembeda — bukan kode kembar dua kali.

Gagal hapus (karena masih dipakai) ditampilkan lewat `alert()` berisi pesan dari server, mengikuti pola `openEmployeeModal` yang sudah ada.

### 4.3 Form karyawan (`owner.js`)

Tiga isian baru di modal tambah/ubah karyawan:
- **Employee ID** — teks, wajib, di urutan paling atas (sebelum Nama).
- **Jabatan** — `<select>` berisi daftar dari `/api/jobs`, dengan opsi kosong `— Belum diatur —`.
- **Divisi** — `<select>` serupa dari `/api/organizations`.

Daftar untuk kedua dropdown diambil saat modal dibuka. Kalau daftarnya masih kosong, dropdown tetap tampil dengan hanya opsi kosong plus keterangan kecil yang mengarahkan Owner ke tab Jabatan & Divisi.

Tabel Data Karyawan menambah satu kolom **Employee ID** di paling kiri. Ini di luar permintaan eksplisit user, tapi diperlukan: kode kini wajib dan unik, dan tanpa kolom ini Owner harus membuka satu per satu untuk memeriksa kode mana yang sudah terpakai.

### 4.4 Tabel Monitoring Hari Ini (`checklist.js`)

Kolom baru, urutan kiri ke kanan:

| Kolom | Isi | Bisa diurutkan |
|---|---|---|
| No | nomor urut tampilan, 1..n mengikuti urutan yang sedang tampil | ya (kembali ke urutan awal) |
| (ceklis) | perilaku lama dipertahankan | tidak |
| Employee ID | `employeeCode` | ya |
| Nama Karyawan | nama + 🎂 kalau ulang tahun | ya |
| Job | nama jabatan, atau `—` | ya |
| Organization | nama divisi, atau `—` | ya |
| Absen | badge status (Hadir/Izin/Sakit/Alpa/Belum Absen) | tidak |
| Keterangan | ringkasan jenis kehadiran, jam masuk, catatan | tidak |

**Pengurutan:** header yang bisa diurutkan diklik untuk berganti naik → turun → naik. Panah `▲`/`▼` menandai kolom aktif; kolom lain menampilkan penanda netral samar. Perbandingan teks memakai `localeCompare` dengan `numeric: true` supaya `TDI-2` berada sebelum `TDI-10`, dan nilai kosong (`—`) selalu diletakkan di akhir baik saat naik maupun turun — supaya baris yang belum lengkap datanya tidak menutupi bagian atas tabel.

Status pengurutan disimpan di objek tingkat modul di `checklist.js` supaya **tidak hilang saat tabel di-render ulang otomatis tiap 15 detik**. Hanya satu dashboard aktif pada satu waktu, jadi satu status bersama untuk HR dan Owner sudah cukup.

Kolom **Absen** dan **Keterangan** tetap dipertahankan meski tidak ada di contoh user — keduanya adalah inti halaman absensi; tanpanya halaman ini kehilangan fungsi utamanya.

Baris panel (baris tersembunyi berisi form pengisian absen di bawah tiap karyawan) tetap seperti sekarang; `colspan`-nya naik dari 4 ke 8 mengikuti jumlah kolom baru.

Tabel dibungkus `overflow-x-auto` yang sudah ada, jadi di layar sempit bisa digeser mendatar seperti pada contoh user.

Perubahan ini otomatis berlaku untuk **HR dan Owner** karena `renderMonitoringList` adalah komponen bersama.

## 5. Di Luar Cakupan

- Kolom Branch/Cabang (dibatalkan atas permintaan user).
- Perombakan gaya visual menyeluruh (menunggu panduan gaya dari user).
- Pengurutan pada tabel Riwayat Absensi, Data Karyawan, dan Laporan Gaji.
- Pencarian/filter berdasarkan jabatan atau divisi.
- Menampilkan jabatan/divisi di Laporan Gaji.

## 6. Verifikasi

Backend lewat `npm test` (test lama harus tetap lolos, ditambah test baru di §3.5). Frontend lewat browser: buat jabatan & divisi, pasangkan ke karyawan beserta kodenya, tolak kode kembar, lalu buka Monitoring Hari Ini dan pastikan seluruh kolom terisi serta pengurutan tiap kolom bekerja naik dan turun. Terakhir, pastikan penolakan hapus jabatan yang masih dipakai muncul dengan pesan yang benar.
