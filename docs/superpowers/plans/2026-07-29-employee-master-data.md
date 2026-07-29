# Data Induk Karyawan & Tabel Monitoring Baru — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karyawan punya Employee ID (wajib & unik), Jabatan, dan Divisi yang dipilih dari daftar kelolaan Owner; tabel Monitoring Hari Ini menampilkan kolom-kolom itu dengan header yang bisa diurutkan.

**Architecture:** Dua tabel lookup (`jobs`, `organizations`) berbentuk identik dilayani satu factory router bersama. Tabel `employees` bertambah tiga kolom. Di frontend, tab pengelolaan daftar hidup di file sendiri (`lookups.js`); tabel monitoring di `checklist.js` mendapat kolom baru plus status pengurutan tingkat modul supaya bertahan melewati auto-refresh 15 detik.

**Tech Stack:** Node.js + Express + `node:sqlite`, `node:test`; frontend vanilla JS + Tailwind CDN.

Spec: [docs/superpowers/specs/2026-07-29-employee-master-data-design.md](../specs/2026-07-29-employee-master-data-design.md)

## Global Constraints

- **Tanpa dependency baru.** Database lewat `node:sqlite`, test lewat `node:test`.
- **Ikuti gaya visual yang ada**: aksen `indigo-600`, netral `slate-*`, kartu `bg-white border border-slate-200 rounded-xl`.
- Semua teks antarmuka berbahasa Indonesia.
- Nama tabel/kolom yang disisipkan ke string SQL **hanya boleh dari konstanta kode**, tidak pernah dari input request. Nilai dari request selalu lewat parameter binding.
- Pakai helper yang ada: `escapeHtml`, `openModal`, `closeModal` (`checklist.js`), `apiRequest`/`Storage` (`storage.js`), `requireAuth`/`requireOwner` (`middleware/auth.js`).
- Setiap nilai dari data karyawan yang masuk ke HTML harus lewat `escapeHtml`.
- Semua test lama harus tetap lolos di setiap tahap.

---

## Task 1: Migrasi `004_employee_master_data.sql`

**Files:**
- Create: `absensi-app/backend/migrations/004_employee_master_data.sql`

**Interfaces:**
- Produces: tabel `jobs`, `organizations`; kolom `employees.employee_code`, `employees.job_id`, `employees.organization_id`; index unik `idx_employees_code`.

- [ ] **Step 1: Tulis migrasi**

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

- [ ] **Step 2: Jalankan test lama**

Run (dari `absensi-app/backend`): `npm test`
Expected: 15 pass, 0 fail — migrasi baru ikut jalan di setiap temp DB tanpa merusak apa pun.

- [ ] **Step 3: Commit**

```bash
git add absensi-app/backend/migrations/004_employee_master_data.sql
git commit -m "Add jobs, organizations tables and employee master-data columns"
```

---

## Task 2: Factory `lookupRouter.js` + pasang di `server.js`

**Files:**
- Create: `absensi-app/backend/routes/lookupRouter.js`
- Create: `absensi-app/backend/test/lookupRouter.test.js`
- Modify: `absensi-app/backend/server.js`

**Interfaces:**
- Consumes: tabel `jobs`/`organizations` (Task 1).
- Produces: `createLookupRouter({ table, employeeColumn, label })` → Express Router dengan GET/POST/PUT/DELETE, semuanya `requireOwner`.

- [ ] **Step 1: Tulis test lebih dulu**

`absensi-app/backend/test/lookupRouter.test.js` — mount factory untuk tabel `jobs`, uji: GET kosong di awal; POST membuat entri (201); POST nama kosong ditolak 400; POST nama kembar ditolak 400; PUT mengganti nama; PUT ke nama yang sudah dipakai entri lain ditolak 400; DELETE berhasil kalau tidak dipakai; DELETE ditolak 400 kalau ada karyawan memakainya; akses dengan sesi role `hr` ditolak 403.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test`
Expected: FAIL — modul `routes/lookupRouter` belum ada.

- [ ] **Step 3: Tulis `routes/lookupRouter.js`**

Poin penting implementasi:
- `table`, `employeeColumn`, `label` datang dari konstanta pemanggil, aman disisipkan ke SQL; semua nilai request lewat binding.
- Validasi nama: `String(name || '').trim()` harus tidak kosong.
- Cek kembar: `SELECT id FROM ${table} WHERE LOWER(name) = ?` — pada PUT tambahkan `AND id <> ?`.
- DELETE: hitung `SELECT COUNT(*) AS n FROM employees WHERE ${employeeColumn} = ?`; kalau `n > 0` balas 400 dengan `${label} ini masih dipakai ${n} karyawan. Ubah data karyawan tersebut dulu sebelum menghapus.`

- [ ] **Step 4: Pasang di `server.js`**

```js
const createLookupRouter = require('./routes/lookupRouter');
app.use('/api/jobs', createLookupRouter({ table: 'jobs', employeeColumn: 'job_id', label: 'Jabatan' }));
app.use('/api/organizations', createLookupRouter({ table: 'organizations', employeeColumn: 'organization_id', label: 'Divisi' }));
```

- [ ] **Step 5: Jalankan test**

Run: `npm test`
Expected: semua pass.

- [ ] **Step 6: Commit**

```bash
git add absensi-app/backend/routes/lookupRouter.js absensi-app/backend/test/lookupRouter.test.js absensi-app/backend/server.js
git commit -m "Add owner-managed jobs and organizations lookup endpoints"
```

---

## Task 3: Perluas `routes/employees.js`

**Files:**
- Modify: `absensi-app/backend/routes/employees.js`
- Create: `absensi-app/backend/test/employees.route.test.js`

**Interfaces:**
- Consumes: kolom baru (Task 1), tabel lookup (Task 2).
- Produces: `GET /api/employees` membawa `employeeCode`, `job: {id,name}|null`, `organization: {id,name}|null`; `POST`/`PUT` menerima `employeeCode` (wajib, unik), `jobId`, `organizationId` (boleh null).

- [ ] **Step 1: Tulis test lebih dulu**

Uji: POST tanpa `employeeCode` ditolak 400; POST dengan kode yang sudah dipakai ditolak 400; POST dengan `jobId` tidak dikenal ditolak 400; POST valid mengembalikan `employeeCode` dan `job.name`; PUT memakai kode karyawan itu sendiri tetap diterima; GET membawa nama jabatan dan divisi hasil join.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Ubah `routes/employees.js`**

- `toJson` menambah `employeeCode`, `job`, `organization` (null kalau id-nya kosong).
- `GET /` memakai:
  ```sql
  SELECT e.*, j.name AS job_name, o.name AS organization_name
  FROM employees e
  LEFT JOIN jobs j ON j.id = e.job_id
  LEFT JOIN organizations o ON o.id = e.organization_id
  ORDER BY e.name
  ```
- Fungsi validasi bersama untuk POST dan PUT: kode wajib tidak kosong; kode belum dipakai karyawan lain (`LOWER(employee_code) = ?`, pada PUT tambah `AND id <> ?`); `jobId`/`organizationId` kalau diisi harus ada di tabelnya.

- [ ] **Step 4: Jalankan test**

Run: `npm test`
Expected: semua pass.

- [ ] **Step 5: Commit**

```bash
git add absensi-app/backend/routes/employees.js absensi-app/backend/test/employees.route.test.js
git commit -m "Add employee code, job and organization to employee endpoints"
```

---

## Task 4: Perbarui `seed.js`

**Files:**
- Modify: `absensi-app/backend/seed.js`

- [ ] **Step 1: Isi jabatan, divisi, dan karyawan bertautan**

Tambah beberapa jabatan (Manager, Supervisor, Staff) dan divisi (Accounting, Information & Technology, Business Development), lalu tiga karyawan contoh dengan `employee_code` (`TDI-001`..`TDI-003`) yang terhubung ke id jabatan/divisi hasil insert. Sifat idempoten dipertahankan.

- [ ] **Step 2: Uji seed di database sementara**

Run (dari `absensi-app/backend`):
```bash
DB_FILE="$TMPDIR/seedcheck.db" node seed.js
```
Expected: pesan seed selesai, tanpa error.

- [ ] **Step 3: Commit**

```bash
git add absensi-app/backend/seed.js
git commit -m "Seed demo jobs, organizations and employee codes"
```

---

## Task 5: `storage.js` — enam method lookup

**Files:**
- Modify: `absensi-app/frontend/js/storage.js`

**Interfaces:**
- Produces: `Storage.getJobs/saveJob/deleteJob`, `Storage.getOrganizations/saveOrganization/deleteOrganization` — dipakai Task 6 dan 7.

- [ ] **Step 1: Tambahkan method**

```js
  async getJobs() {
    return apiRequest('GET', '/api/jobs');
  },
  async saveJob(record) {
    if (record.id) return apiRequest('PUT', `/api/jobs/${record.id}`, { name: record.name });
    return apiRequest('POST', '/api/jobs', { name: record.name });
  },
  async deleteJob(id) {
    return apiRequest('DELETE', `/api/jobs/${id}`);
  },

  async getOrganizations() {
    return apiRequest('GET', '/api/organizations');
  },
  async saveOrganization(record) {
    if (record.id) return apiRequest('PUT', `/api/organizations/${record.id}`, { name: record.name });
    return apiRequest('POST', '/api/organizations', { name: record.name });
  },
  async deleteOrganization(id) {
    return apiRequest('DELETE', `/api/organizations/${id}`);
  }
```

- [ ] **Step 2: Cek sintaks**

Run (dari `absensi-app`): `node --check frontend/js/storage.js`
Expected: tanpa output.

---

## Task 6: File baru `lookups.js` — tab "Jabatan & Divisi"

**Files:**
- Create: `absensi-app/frontend/js/lookups.js`
- Modify: `absensi-app/frontend/index.html`
- Modify: `absensi-app/frontend/js/owner.js` (daftarkan tab)

**Interfaces:**
- Consumes: Task 5.
- Produces: fungsi global `renderLookupsTab()` yang merender ke `#owner-content`.

- [ ] **Step 1: Buat `lookups.js`**

Satu definisi konfigurasi dipakai untuk kedua daftar supaya tidak ada kode kembar:
```js
const LOOKUP_KINDS = {
  job: { title: 'Jabatan', load: () => Storage.getJobs(), save: r => Storage.saveJob(r), remove: id => Storage.deleteJob(id) },
  organization: { title: 'Divisi', load: () => Storage.getOrganizations(), save: r => Storage.saveOrganization(r), remove: id => Storage.deleteOrganization(id) }
};
```
`renderLookupsTab()` memuat kedua daftar bersamaan (`Promise.all`), merender grid dua kolom (`grid gap-4 md:grid-cols-2`), tiap kartu berisi judul, tombol "+ Tambah", dan daftar baris dengan tombol Ubah/Hapus. Modal tambah/ubah berisi satu isian nama; error dari server tampil di dalam modal tanpa menutupnya. Hapus memakai `confirm()` lalu `alert()` kalau server menolak.

- [ ] **Step 2: Daftarkan di `index.html`**

Sisipkan `<script src="js/lookups.js"></script>` setelah `latePolicy.js`, sebelum `hr.js`.

- [ ] **Step 3: Daftarkan tab di `owner.js`**

Tambah `${tabButton('lookup', 'Jabatan & Divisi')}` setelah tab `keterlambatan`, dan cabang `else if (OwnerState.tab === 'lookup') renderLookupsTab();`.

- [ ] **Step 4: Cek sintaks**

Run: `node --check frontend/js/lookups.js && node --check frontend/js/owner.js`
Expected: tanpa output.

---

## Task 7: Form karyawan & kolom Employee ID di Data Karyawan

**Files:**
- Modify: `absensi-app/frontend/js/owner.js`

**Interfaces:**
- Consumes: Task 5 (daftar jabatan/divisi), field baru dari `GET /api/employees` (Task 3).

- [ ] **Step 1: Tambah kolom Employee ID di tabel Data Karyawan**

Header baru `<th>Employee ID</th>` di paling kiri, sel `${escapeHtml(emp.employeeCode || '—')}`, dan `colspan` baris kosong naik dari 5 ke 6.

- [ ] **Step 2: Tambah tiga isian di `openEmployeeModal`**

Muat daftar bersamaan data karyawan:
```js
const [jobs, organizations] = await Promise.all([Storage.getJobs(), Storage.getOrganizations()]);
```
Isian **Employee ID** (`required`, teks) diletakkan sebelum Nama Lengkap. Dua `<select>` (Jabatan, Divisi) dengan opsi pertama `<option value="">— Belum diatur —</option>`; opsi terpilih ditandai dari `emp.job?.id` / `emp.organization?.id`. Kalau daftar kosong, tampilkan keterangan kecil di bawah select yang mengarahkan ke tab Jabatan & Divisi.

- [ ] **Step 3: Kirim field baru saat simpan**

```js
record.employeeCode = fd.get('employeeCode').trim();
record.jobId = fd.get('jobId') ? Number(fd.get('jobId')) : null;
record.organizationId = fd.get('organizationId') ? Number(fd.get('organizationId')) : null;
```

- [ ] **Step 4: Cek sintaks**

Run: `node --check frontend/js/owner.js`
Expected: tanpa output.

---

## Task 8: Tabel Monitoring baru + pengurutan (`checklist.js`)

**Files:**
- Modify: `absensi-app/frontend/js/checklist.js`

**Interfaces:**
- Consumes: `employeeCode`, `job`, `organization` dari `GET /api/employees`.

- [ ] **Step 1: Tambah status pengurutan tingkat modul**

```js
const MonitorSortState = { key: 'no', dir: 'asc' };
```
Ditaruh di tingkat modul (bukan di dalam fungsi render) supaya bertahan melewati render ulang otomatis tiap 15 detik.

- [ ] **Step 2: Tulis fungsi urut**

Kunci yang didukung: `no` (urutan asli), `code`, `name`, `job`, `organization`. Nilai kosong selalu di akhir untuk kedua arah. Perbandingan teks:
```js
a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' })
```
`numeric: true` membuat `TDI-2` mendahului `TDI-10`.

- [ ] **Step 3: Render header yang bisa diklik**

Tiap header sortable membawa `data-sort="<key>"`, kelas `cursor-pointer select-none`, dan penanda: `▲`/`▼` untuk kolom aktif, penanda samar (`text-slate-300`) untuk kolom lain. Klik → toggle arah kalau kolom sama, kalau kolom berbeda mulai dari `asc` → render ulang.

- [ ] **Step 4: Render delapan kolom**

Urutan: No · ceklis · Employee ID · Nama Karyawan · Job · Organization · Absen · Keterangan. Nomor urut mengikuti posisi tampil setelah diurutkan (1..n). Naikkan `colspan` baris panel dari 4 menjadi 8.

- [ ] **Step 5: Cek sintaks**

Run: `node --check frontend/js/checklist.js`
Expected: tanpa output.

---

## Task 9: Verifikasi menyeluruh

- [ ] **Step 1: Jalankan seluruh test backend**

Run (dari `absensi-app/backend`): `npm test`
Expected: semua pass, 0 fail.

- [ ] **Step 2: Verifikasi di browser sebagai Owner**

Login `owner`/`owner123`. Di tab Jabatan & Divisi: tambah satu jabatan dan satu divisi; coba tambah nama kembar (harus ditolak dengan pesan). Di Data Karyawan: buka satu karyawan, isi Employee ID dan pilih jabatan/divisi, simpan; coba simpan karyawan lain dengan kode yang sama (harus ditolak). Di Monitoring Hari Ini: pastikan delapan kolom terisi, lalu klik tiap header sortable dan pastikan urutan berubah naik dan turun, termasuk setelah menunggu satu siklus auto-refresh. Terakhir, coba hapus jabatan yang masih dipakai (harus ditolak dengan pesan jumlah pemakainya).

- [ ] **Step 3: Verifikasi sebagai HR**

Login `hradmin`/`hr123`, pastikan tabel Monitoring juga menampilkan kolom baru dan pengurutannya bekerja, serta tidak ada data upah yang bocor.

- [ ] **Step 4: Bersihkan data uji dan periksa console**

Hapus jabatan/divisi percobaan, pastikan console browser bersih dari error.
