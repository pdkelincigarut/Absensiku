# Tab Daftar Karyawan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab Data Karyawan menjadi daftar karyawan bergaya contoh user: foto + kode di kolom nama, header bisa diurutkan, pencarian, pagination, dan tombol Download.

**Architecture:** Foto disimpan sebagai BLOB di `employees` dan dilayani endpoint tersendiri; diunggah sebagai data URL di dalam JSON simpan karyawan setelah dikecilkan di browser, sehingga tidak perlu dependency multipart. Logika pengurutan tabel dipindah ke `tableUtils.js` supaya dipakai bersama tabel monitoring dan tabel karyawan. Tab-nya sendiri pindah ke `employeeList.js`.

**Tech Stack:** Node.js + Express + `node:sqlite`, `node:test`; frontend vanilla JS + Tailwind CDN.

Spec: [docs/superpowers/specs/2026-07-30-employee-list-tab-design.md](../specs/2026-07-30-employee-list-tab-design.md)

## Global Constraints

- **Tanpa dependency baru.** Tidak boleh menambah `multer` atau pustaka gambar apa pun.
- **Ikuti gaya visual yang ada**: aksen `indigo-600`, netral `slate-*`, kartu `bg-white border border-slate-200 rounded-xl`.
- Semua teks antarmuka berbahasa Indonesia.
- Setiap nilai dari data karyawan yang masuk ke HTML harus lewat `escapeHtml`.
- BLOB foto **tidak pernah** ikut di respons daftar karyawan — hanya `hasPhoto` dan `photoVersion`.
- Field `photo` yang `undefined` berarti "jangan diubah"; `null` berarti "hapus". Jangan pernah menghapus foto hanya karena field-nya tidak dikirim.
- Semua test lama (32) harus tetap lolos di setiap tahap.

---

## Task 1: Migrasi foto + naikkan batas JSON

**Files:**
- Create: `absensi-app/backend/migrations/005_employee_photo.sql`
- Modify: `absensi-app/backend/server.js`

**Interfaces:**
- Produces: kolom `employees.photo`, `employees.photo_mime`, `employees.photo_updated_at`.

- [ ] **Step 1: Tulis migrasi**

```sql
ALTER TABLE employees ADD COLUMN photo BLOB;
ALTER TABLE employees ADD COLUMN photo_mime TEXT;
ALTER TABLE employees ADD COLUMN photo_updated_at INTEGER;
```

- [ ] **Step 2: Naikkan batas body JSON di `server.js`**

Ubah `app.use(express.json());` menjadi:
```js
// 2mb: foto karyawan dikirim sebagai data URL base64 di body JSON
// (server tetap memvalidasi ukuran hasil decode di routes/employees.js)
app.use(express.json({ limit: '2mb' }));
```

- [ ] **Step 3: Jalankan test lama**

Run (dari `absensi-app/backend`): `npm test`
Expected: 32 pass, 0 fail.

---

## Task 2: Foto di `routes/employees.js` + endpoint gambar

**Files:**
- Modify: `absensi-app/backend/routes/employees.js`
- Modify: `absensi-app/backend/test/employees.route.test.js`

**Interfaces:**
- Consumes: kolom foto (Task 1).
- Produces: `hasPhoto` & `photoVersion` di respons; `GET /api/employees/:id/photo`.

- [ ] **Step 1: Tulis test lebih dulu**

Tambah ke `test/employees.route.test.js`: unggah PNG 1×1 valid → `hasPhoto === true`; `GET /:id/photo` → 200 + `Content-Type: image/png`; mime `image/gif` ditolak 400; base64 rusak ditolak 400; data URL > 500 KB ditolak 400; `photo: null` menghapus (→ `hasPhoto === false`); PUT tanpa field `photo` **tidak** menghapus foto; `GET /:id/photo` untuk karyawan tanpa foto → 404.

PNG 1×1 untuk test:
```js
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npm test`
Expected: FAIL pada test foto yang baru.

- [ ] **Step 3: Tambah parsing & validasi foto**

Konstanta dan fungsi bantu di `routes/employees.js`:
```js
const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 500 * 1024;

/* Mengembalikan { buffer, mime } kalau valid, atau { error } kalau tidak. */
function parsePhotoDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl));
  if (!match) return { error: 'Format foto tidak dikenali.' };

  const mime = match[1].toLowerCase();
  if (!PHOTO_MIMES.includes(mime)) {
    return { error: 'Foto harus berformat JPG, PNG, atau WebP.' };
  }

  let buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch (err) {
    return { error: 'Data foto rusak.' };
  }
  if (buffer.length === 0) return { error: 'Data foto rusak.' };
  if (buffer.length > PHOTO_MAX_BYTES) {
    return { error: `Ukuran foto maksimal ${Math.round(PHOTO_MAX_BYTES / 1024)} KB.` };
  }
  return { buffer, mime };
}
```

`toJson` menambah:
```js
hasPhoto: !!row.photo,
photoVersion: row.photo_updated_at
```

Di `POST`: kalau `body.photo` berupa string, parse dan simpan `photo`/`photo_mime`/`photo_updated_at`; kalau tidak, ketiganya `null`.

Di `PUT`: tiga cabang sesuai spec — `undefined` (kolom foto tidak disentuh sama sekali oleh `UPDATE`), `null` (ketiga kolom di-`NULL`), string (parse lalu simpan). Cara paling sederhana tanpa menduplikasi query: jalankan `UPDATE` field non-foto seperti sekarang, lalu `UPDATE` kolom foto secara terpisah **hanya kalau** `photo` disertakan.

Kembalikan 400 dengan pesan dari `parsePhotoDataUrl` kalau tidak valid.

- [ ] **Step 4: Tambah endpoint foto**

```js
router.get('/:id/photo', requireAuth, (req, res) => {
  const row = db.prepare('SELECT photo, photo_mime FROM employees WHERE id = ?').get(req.params.id);
  if (!row || !row.photo) return res.status(404).json({ error: 'Karyawan ini belum punya foto.' });

  res.set('Content-Type', row.photo_mime || 'image/jpeg');
  // URL selalu membawa ?v=photo_updated_at, jadi cache panjang tetap aman
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(Buffer.from(row.photo));
});
```

- [ ] **Step 5: Jalankan test**

Run: `npm test`
Expected: semua pass.

---

## Task 3: `tableUtils.js` + refactor pengurutan `checklist.js`

**Files:**
- Create: `absensi-app/frontend/js/tableUtils.js`
- Modify: `absensi-app/frontend/js/checklist.js`
- Modify: `absensi-app/frontend/index.html`

**Interfaces:**
- Produces: `sortRows(rows, readValue, dir)`, `sortableHeaderHtml({ state, key, label, className, buttonClass })`, `nextSortState(state, key)` — dipakai `checklist.js` dan `employeeList.js` (Task 4).

- [ ] **Step 1: Buat `tableUtils.js`**

```js
/* ============================================================
   tableUtils.js — Helper pengurutan tabel, dipakai bersama
   tabel monitoring (checklist.js) dan daftar karyawan
   (employeeList.js).
   ============================================================ */

/* Nilai kosong selalu di akhir untuk kedua arah, supaya baris yang
   datanya belum lengkap tidak menumpuk di bagian atas tabel. */
function sortRows(rows, readValue, dir) {
  const factor = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const av = readValue(a), bv = readValue(b);
    const aEmpty = av === null || av === undefined || av === '';
    const bEmpty = bv === null || bv === undefined || bv === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv), 'id', { numeric: true, sensitivity: 'base' }) * factor;
  });
}

function nextSortState(state, key) {
  if (state.key === key) return { key, dir: state.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: 'asc' };
}

function sortableHeaderHtml({ state, key, label, className, buttonClass }) {
  const active = state.key === key;
  const marker = active
    ? `<span class="text-indigo-600">${state.dir === 'asc' ? '▲' : '▼'}</span>`
    : `<span class="text-slate-300">⇅</span>`;
  return `<th class="px-4 py-2.5 font-medium ${className || ''}">
      <button type="button" data-sort="${key}" class="${buttonClass} flex items-center gap-1.5 hover:text-slate-700 transition">
        <span>${label}</span>${marker}
      </button>
    </th>`;
}
```

- [ ] **Step 2: Ubah `checklist.js` memakai helper**

Hapus fungsi `sortEmployeesForMonitor` dan `monitorSortableHeader`, ganti dengan pemanggilan helper. `MonitorSortState` tetap ada. Kunci `no` tetap perlakuan khusus (urutan asli / dibalik), kunci lain lewat `sortRows`:
```js
function sortEmployeesForMonitor(employees) {
  const { key, dir } = MonitorSortState;
  if (key === 'no') return dir === 'asc' ? employees.slice() : employees.slice().reverse();
  const readValue = MONITOR_SORT_KEYS[key];
  if (!readValue) return employees.slice();
  return sortRows(employees, readValue, dir);
}
```
Header memakai `sortableHeaderHtml({ state: MonitorSortState, key, label, className, buttonClass: 'monitor-sort' })`. Penangan klik memakai `nextSortState`.

- [ ] **Step 3: Daftarkan di `index.html`**

`<script src="js/tableUtils.js"></script>` **sebelum** `js/checklist.js`.

- [ ] **Step 4: Cek sintaks**

Run (dari `absensi-app`): `node --check frontend/js/tableUtils.js && node --check frontend/js/checklist.js`
Expected: tanpa output.

---

## Task 4: File baru `employeeList.js`

**Files:**
- Create: `absensi-app/frontend/js/employeeList.js`
- Modify: `absensi-app/frontend/js/owner.js` (hapus `renderKaryawanTab`, panggil yang baru)
- Modify: `absensi-app/frontend/index.html`

**Interfaces:**
- Consumes: Task 3 helper; `hasPhoto`/`photoVersion` dari Task 2.
- Produces: `renderEmployeeListTab(employees)`.

- [ ] **Step 1: Buat `employeeList.js`**

Status modul:
```js
const EmployeeListState = { search: '', sort: { key: 'name', dir: 'asc' }, page: 1, perPage: 10 };
```

Kunci pengurutan: `name`, `job`, `organization`, `wage` (numerik, dari `dailyWage`), `birthDate`, `status` (dari `active`).

Alur render: filter berdasarkan `search` (cocokkan nama, kode, jabatan, divisi, huruf kecil) → urutkan lewat `sortRows` → jepit `page` ke rentang valid → potong sesuai `perPage` → render.

Sel nama memuat foto/inisial + nama + kode:
```js
function employeeAvatarHtml(emp) {
  if (emp.hasPhoto) {
    return `<img src="/api/employees/${emp.id}/photo?v=${emp.photoVersion || 0}" alt="" class="w-9 h-9 rounded-full object-cover bg-slate-100 shrink-0" />`;
  }
  const initials = emp.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const palette = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-sky-100 text-sky-700', 'bg-rose-100 text-rose-700'];
  let hash = 0;
  for (const ch of emp.name) hash = (hash + ch.charCodeAt(0)) % palette.length;
  return `<div class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${palette[hash]}">${escapeHtml(initials)}</div>`;
}
```

Mengubah kata kunci pencarian **selalu** mengembalikan `page` ke 1.

Download CSV memakai seluruh hasil filter (bukan hanya halaman aktif) dengan kolom Employee ID, Nama, Jabatan, Divisi, Upah Harian, Tanggal Lahir, Status — pola `Blob` + BOM seperti `exportPayrollCsv`.

- [ ] **Step 2: Ganti pemanggilan di `owner.js`**

Hapus seluruh fungsi `renderKaryawanTab`, ubah cabang router tab menjadi `renderEmployeeListTab(employees)`.

- [ ] **Step 3: Daftarkan di `index.html`**

`<script src="js/employeeList.js"></script>` sebelum `js/owner.js`.

- [ ] **Step 4: Cek sintaks**

Run: `node --check frontend/js/employeeList.js && node --check frontend/js/owner.js`
Expected: tanpa output.

---

## Task 5: Pemilih foto di form karyawan

**Files:**
- Modify: `absensi-app/frontend/js/owner.js`

- [ ] **Step 1: Tambah bagian foto di `openEmployeeModal`**

Di paling atas form: pratinjau bulat 64 px (foto yang ada, atau lingkaran inisial), tombol "Pilih Foto", dan tombol "Hapus Foto" yang hanya tampil kalau karyawan sudah punya foto. `<input type="file" accept="image/*" class="hidden">` dipicu oleh tombol.

- [ ] **Step 2: Kecilkan foto di browser**

```js
function resizePhotoToDataUrl(file, maxSide = 320) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Berkas tidak bisa dibaca.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Berkas ini bukan gambar yang bisa dibaca.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 3: Kirim sesuai aturan tiga cabang**

Variabel lokal `photoChange` bernilai `undefined` (tidak disentuh), `null` (dihapus), atau data URL. Saat submit:
```js
if (photoChange !== undefined) record.photo = photoChange;
```
Kegagalan pengecilan foto ditampilkan di `#form-error`, form tidak tertutup.

- [ ] **Step 4: Cek sintaks**

Run: `node --check frontend/js/owner.js`
Expected: tanpa output.

---

## Task 6: Verifikasi

- [ ] **Step 1: Test backend**

Run (dari `absensi-app/backend`): `npm test`
Expected: semua pass, 0 fail.

- [ ] **Step 2: Verifikasi di browser sebagai Owner**

Unggah foto ke satu karyawan, pastikan tampil bulat di daftar. Simpan ulang karyawan itu tanpa menyentuh foto — foto harus tetap ada. Hapus foto — kembali ke lingkaran inisial. Uji pencarian (menyempitkan hasil, kembali ke halaman 1). Uji tiap header pengurutan naik dan turun, termasuk Upah Harian sebagai angka. Ubah baris per halaman dan telusuri halaman. Unduh CSV dan periksa isinya sesuai hasil pencarian.

- [ ] **Step 3: Pastikan tabel Monitoring tidak berubah**

Buka Monitoring Hari Ini, klik beberapa header pengurutan, pastikan perilakunya sama seperti sebelum refactor dan nilai kosong tetap di bawah.

- [ ] **Step 4: Periksa console**

Console browser harus bersih dari error.
