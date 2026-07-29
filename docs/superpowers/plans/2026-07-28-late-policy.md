# Aturan Keterlambatan & Potongan Gaji Otomatis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan tabel `late_policies` per karyawan, endpoint API untuk owner mengatur jam batas masuk & skema potongan, dan logika perhitungan yang otomatis memotong `totalWage` di Laporan Gaji ketika total menit telat sebulan melewati ambang batas.

**Architecture:** Perhitungan telat/potongan diekstrak jadi modul murni (`lateCalculator.js`, tanpa dependency database) supaya gampang di-unit-test, lalu dipakai oleh `routes/payroll.js` yang sudah ada. Endpoint pengaturan (`routes/latePolicies.js`) hanya CRUD sederhana ke tabel baru, mengikuti pola yang sudah dipakai `routes/employees.js`.

**Tech Stack:** Node.js (>=22.5) + Express + `node:sqlite` (`DatabaseSync`, API yang sama dipakai di seluruh backend sekarang) + `node:test`/`node:assert/strict` (test runner bawaan Node, tanpa dependency baru).

## Global Constraints

- Node.js minimum versi 22.5.0 (lihat `package.json` `engines`) — `node:sqlite` dan `node:test` butuh versi ini.
- **Tidak ada dependency npm baru.** Testing pakai `node:test` bawaan Node, bukan Jest/Mocha/supertest.
- Query database pakai API `db.prepare(sql).run()/.get()/.all()` dari `node:sqlite`, sama seperti file route yang sudah ada — jangan pakai library ORM.
- Semua endpoint pengaturan keterlambatan wajib lewat middleware `requireOwner` dari `middleware/auth.js` (bukan `requireAuth`) — konsisten dengan proteksi data upah yang sudah ada di `routes/employees.js`.
- Pesan error yang dikirim ke client berbahasa Indonesia, gaya kalimat sama seperti route lain (mis. `"Karyawan tidak ditemukan."`).
- Nilai uang (Rupiah) disimpan sebagai `INTEGER`, kecuali `deduction_percentage` yang `REAL` (0-100) — konsisten dengan `employees.daily_wage`.
- Perhitungan keterlambatan **selalu memakai baris `late_policies` TERBARU** saat endpoint dipanggil, tidak ada snapshot historis — ini keputusan desain yang sudah dikonfirmasi di spec, bukan sesuatu yang perlu "diperbaiki" nanti.
- Migrasi baru harus berupa file `.sql` baru di `migrations/`, jangan mengubah file migrasi yang sudah ada (`001_init.sql`, `002_sessions.sql`) — migration runner di `db.js` mencatat migrasi yang sudah jalan per nama file dan tidak menjalankan ulang.

Spec lengkap: [docs/superpowers/specs/2026-07-28-late-policy-design.md](../specs/2026-07-28-late-policy-design.md)

---

## Task 1: Test infrastructure — `DB_FILE` override & `node:test` runner

Backend belum punya test sama sekali. Task ini menyiapkan cara mengetes kode yang menyentuh database tanpa mengotori file `data/absensiku.db` sungguhan: `db.js` dibuat bisa menerima path database lain lewat environment variable `DB_FILE`, dan setiap test bisa minta database sementara yang bersih lewat helper `useTempDb()`.

**Files:**
- Modify: `absensi-app/backend/db.js`
- Modify: `absensi-app/backend/package.json`
- Create: `absensi-app/backend/test/helpers.js`
- Create: `absensi-app/backend/test/db.test.js`

**Interfaces:**
- Produces: `useTempDb()` dari `test/helpers.js` — memanggil ini mengembalikan instance `db` (`DatabaseSync`) yang sudah dimigrasi bersih, menunjuk ke file sementara unik. Dipakai oleh semua test file berikutnya (Task 2, 4, 5).

- [ ] **Step 1: Tulis test yang gagal untuk `test/helpers.js` + `test/db.test.js`**

Buat `absensi-app/backend/test/helpers.js`:

```js
/* ============================================================
   test/helpers.js — Utilitas bersama untuk test backend
   ============================================================ */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function useTempDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'absensiku-test-'));
  process.env.DB_FILE = path.join(tmpDir, 'test.db');
  delete require.cache[require.resolve('../db')];
  return require('../db');
}

module.exports = { useTempDb };
```

Buat `absensi-app/backend/test/db.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { useTempDb } = require('./helpers');

test('db.js menulis ke path dari DB_FILE, bukan lokasi default', () => {
  useTempDb();
  const dbFile = process.env.DB_FILE;
  assert.equal(fs.existsSync(dbFile), true);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run (dari folder `absensi-app/backend`):
```bash
node --test test/db.test.js
```
Expected: FAIL — `assert.equal(fs.existsSync(dbFile), true)` gagal karena `db.js` saat ini selalu menulis ke `data/absensiku.db` default, mengabaikan `process.env.DB_FILE`, jadi file di path sementara itu tidak pernah dibuat.

- [ ] **Step 3: Implementasikan `DB_FILE` override di `db.js`**

Di `absensi-app/backend/db.js`, ganti baris:
```js
const db = new DatabaseSync(path.join(dataDir, 'absensiku.db'));
```
menjadi:
```js
const dbFile = process.env.DB_FILE || path.join(dataDir, 'absensiku.db');
const db = new DatabaseSync(dbFile);
```

- [ ] **Step 4: Jalankan test lagi, pastikan lolos**

Run:
```bash
node --test test/db.test.js
```
Expected: PASS (1 test lolos).

- [ ] **Step 5: Tambahkan script `test` di `package.json`**

Di `absensi-app/backend/package.json`, ubah blok `scripts` dari:
```json
  "scripts": {
    "start": "node server.js",
    "seed": "node seed.js"
  },
```
menjadi:
```json
  "scripts": {
    "start": "node server.js",
    "seed": "node seed.js",
    "test": "node --test test/"
  },
```

- [ ] **Step 6: Jalankan lewat `npm test` untuk pastikan script-nya benar**

Run:
```bash
npm test
```
Expected: PASS (1 test lolos, sama seperti Step 4 tapi lewat `npm test`).

- [ ] **Step 7: Commit**

```bash
git add absensi-app/backend/db.js absensi-app/backend/package.json absensi-app/backend/test/helpers.js absensi-app/backend/test/db.test.js
git commit -m "Add DB_FILE override and node:test harness for backend tests"
```

---

## Task 2: Migrasi `late_policies`

**Files:**
- Create: `absensi-app/backend/migrations/003_late_policies.sql`
- Modify: `absensi-app/backend/test/db.test.js`

**Interfaces:**
- Consumes: `useTempDb()` dari `test/helpers.js` (Task 1).
- Produces: tabel SQLite `late_policies` (kolom: `employee_id` PK, `check_in_limit`, `threshold_minutes`, `deduction_type`, `deduction_flat_amount`, `deduction_per_minute_amount`, `deduction_percentage`, `updated_at`) — dipakai langsung lewat SQL oleh Task 4 (`routes/latePolicies.js`) dan Task 5 (`routes/payroll.js`).

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `absensi-app/backend/test/db.test.js`:

```js
test('tabel late_policies ada dengan kolom yang sesuai setelah migrasi jalan', () => {
  const db = useTempDb();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'late_policies'`).all();
  assert.equal(tables.length, 1);

  const columns = db.prepare(`PRAGMA table_info(late_policies)`).all().map(c => c.name).sort();
  assert.deepEqual(columns, [
    'check_in_limit', 'deduction_flat_amount', 'deduction_per_minute_amount',
    'deduction_percentage', 'deduction_type', 'employee_id', 'threshold_minutes', 'updated_at'
  ].sort());
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run:
```bash
node --test test/db.test.js
```
Expected: FAIL — `tables.length` bernilai `0` karena migrasi `late_policies` belum ada.

- [ ] **Step 3: Buat file migrasi**

Buat `absensi-app/backend/migrations/003_late_policies.sql`:

```sql
CREATE TABLE late_policies (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
  check_in_limit TEXT NOT NULL,
  threshold_minutes INTEGER NOT NULL,
  deduction_type TEXT NOT NULL
    CHECK (deduction_type IN ('flat', 'per_minute', 'percentage')),
  deduction_flat_amount INTEGER,
  deduction_per_minute_amount INTEGER,
  deduction_percentage REAL,
  updated_at INTEGER NOT NULL
);
```

- [ ] **Step 4: Jalankan test lagi, pastikan lolos**

Run:
```bash
node --test test/db.test.js
```
Expected: PASS (2 test lolos).

- [ ] **Step 5: Commit**

```bash
git add absensi-app/backend/migrations/003_late_policies.sql absensi-app/backend/test/db.test.js
git commit -m "Add late_policies table migration"
```

---

## Task 3: Modul perhitungan murni `lateCalculator.js`

Ini inti logika yang diminta ("siapkan logic perhitungannya") — sengaja dipisah dari route supaya bisa dites tanpa database sama sekali.

**Files:**
- Create: `absensi-app/backend/lateCalculator.js`
- Test: `absensi-app/backend/test/lateCalculator.test.js`

**Interfaces:**
- Produces:
  - `timeToMinutes(hhmm: string): number`
  - `computeLateMinutes(checkInTime: string|null, checkInLimit: string|null): number`
  - `computeDeduction(policy: { thresholdMinutes: number, deductionType: 'flat'|'per_minute'|'percentage', deductionFlatAmount?: number, deductionPerMinuteAmount?: number, deductionPercentage?: number }, lateMinutesTotal: number, totalWage: number): number`
  - Dipakai oleh `routes/payroll.js` di Task 5.

- [ ] **Step 1: Tulis test gagal untuk `timeToMinutes` & `computeLateMinutes`**

Buat `absensi-app/backend/test/lateCalculator.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { timeToMinutes, computeLateMinutes, computeDeduction } = require('../lateCalculator');

test('timeToMinutes mengubah "HH:MM" jadi total menit', () => {
  assert.equal(timeToMinutes('08:30'), 510);
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('23:59'), 1439);
});

test('computeLateMinutes = 0 kalau jam masuk sama atau lebih awal dari batas', () => {
  assert.equal(computeLateMinutes('08:30', '08:30'), 0);
  assert.equal(computeLateMinutes('08:15', '08:30'), 0);
});

test('computeLateMinutes = selisih menit kalau jam masuk lewat dari batas', () => {
  assert.equal(computeLateMinutes('08:45', '08:30'), 15);
  assert.equal(computeLateMinutes('09:05', '08:30'), 35);
});

test('computeLateMinutes = 0 kalau jam masuk atau batas kosong', () => {
  assert.equal(computeLateMinutes(null, '08:30'), 0);
  assert.equal(computeLateMinutes('08:45', null), 0);
  assert.equal(computeLateMinutes(undefined, undefined), 0);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run:
```bash
node --test test/lateCalculator.test.js
```
Expected: FAIL — `Cannot find module '../lateCalculator'` (file belum ada).

- [ ] **Step 3: Implementasikan `timeToMinutes` & `computeLateMinutes`**

Buat `absensi-app/backend/lateCalculator.js`:

```js
/* ============================================================
   lateCalculator.js — Perhitungan menit telat & potongan gaji
   Modul murni, tanpa akses database, supaya gampang dites.
   ============================================================ */

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function computeLateMinutes(checkInTime, checkInLimit) {
  if (!checkInTime || !checkInLimit) return 0;
  return Math.max(0, timeToMinutes(checkInTime) - timeToMinutes(checkInLimit));
}

module.exports = { timeToMinutes, computeLateMinutes };
```

- [ ] **Step 4: Jalankan test lagi, pastikan lolos**

Run:
```bash
node --test test/lateCalculator.test.js
```
Expected: PASS (4 test lolos).

- [ ] **Step 5: Tulis test gagal untuk `computeDeduction`**

Tambahkan di akhir `absensi-app/backend/test/lateCalculator.test.js`:

```js
test('computeDeduction = 0 kalau total menit telat masih dalam ambang batas', () => {
  const policy = { thresholdMinutes: 60, deductionType: 'flat', deductionFlatAmount: 50000 };
  assert.equal(computeDeduction(policy, 60, 500000), 0);
  assert.equal(computeDeduction(policy, 30, 500000), 0);
});

test('computeDeduction skema flat: langsung nominal tetap begitu ambang terlampaui', () => {
  const policy = { thresholdMinutes: 60, deductionType: 'flat', deductionFlatAmount: 50000 };
  assert.equal(computeDeduction(policy, 61, 500000), 50000);
  assert.equal(computeDeduction(policy, 200, 500000), 50000);
});

test('computeDeduction skema per_minute: tarif x kelebihan menit di atas ambang', () => {
  const policy = { thresholdMinutes: 60, deductionType: 'per_minute', deductionPerMinuteAmount: 1000 };
  assert.equal(computeDeduction(policy, 90, 500000), 30000); // (90 - 60) * 1000
});

test('computeDeduction skema percentage: persen x total gaji periode itu', () => {
  const policy = { thresholdMinutes: 60, deductionType: 'percentage', deductionPercentage: 5 };
  assert.equal(computeDeduction(policy, 100, 500000), 25000); // 5% * 500000
});
```

- [ ] **Step 6: Jalankan test, pastikan gagal**

Run:
```bash
node --test test/lateCalculator.test.js
```
Expected: FAIL — `computeDeduction is not a function` (belum di-export).

- [ ] **Step 7: Implementasikan `computeDeduction`**

Tambahkan di `absensi-app/backend/lateCalculator.js`, sebelum `module.exports`:

```js
function computeDeduction(policy, lateMinutesTotal, totalWage) {
  if (lateMinutesTotal <= policy.thresholdMinutes) return 0;
  if (policy.deductionType === 'flat') return policy.deductionFlatAmount;
  if (policy.deductionType === 'per_minute') {
    return policy.deductionPerMinuteAmount * (lateMinutesTotal - policy.thresholdMinutes);
  }
  if (policy.deductionType === 'percentage') {
    return totalWage * (policy.deductionPercentage / 100);
  }
  return 0;
}
```

Ubah baris terakhir jadi:
```js
module.exports = { timeToMinutes, computeLateMinutes, computeDeduction };
```

- [ ] **Step 8: Jalankan test lagi, pastikan lolos**

Run:
```bash
node --test test/lateCalculator.test.js
```
Expected: PASS (8 test lolos).

- [ ] **Step 9: Commit**

```bash
git add absensi-app/backend/lateCalculator.js absensi-app/backend/test/lateCalculator.test.js
git commit -m "Add pure late-minutes and deduction calculation module"
```

---

## Task 4: Endpoint `routes/latePolicies.js`

**Files:**
- Create: `absensi-app/backend/routes/latePolicies.js`
- Modify: `absensi-app/backend/server.js`
- Modify: `absensi-app/backend/test/helpers.js`
- Test: `absensi-app/backend/test/latePolicies.route.test.js`

**Interfaces:**
- Consumes: `useTempDb()` (Task 1); tabel `late_policies` (Task 2).
- Produces: `mountWithSession(mountPath, router, session)` dan `startServer(app)` di `test/helpers.js`, dipakai lagi oleh Task 5. Endpoint HTTP:
  - `GET /api/late-policies` → `[{ employeeId, name, latePolicy: {...}|null }]`
  - `PUT /api/late-policies` → upsert, body `{ employeeIds, checkInLimit, thresholdMinutes, deductionType, deductionFlatAmount?, deductionPerMinuteAmount?, deductionPercentage? }`
  - `DELETE /api/late-policies/:employeeId`

- [ ] **Step 1: Tambahkan `mountWithSession` & `startServer` ke `test/helpers.js`**

Di `absensi-app/backend/test/helpers.js`, tambahkan di atas `module.exports`:

```js
const express = require('express');

function mountWithSession(mountPath, router, session) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = session; next(); });
  app.use(mountPath, router);
  return app;
}

function startServer(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}
```

Ubah baris `module.exports` jadi:
```js
module.exports = { useTempDb, mountWithSession, startServer };
```

(Belum ada test langsung untuk helper ini — akan tervalidasi lewat test route di step berikutnya, yang gagal total kalau helper-nya salah.)

- [ ] **Step 2: Tulis test gagal untuk `routes/latePolicies.js`**

Buat `absensi-app/backend/test/latePolicies.route.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

let db, server, port;

test.before(async () => {
  db = useTempDb();
  const router = require('../routes/latePolicies');
  const app = mountWithSession('/api/late-policies', router, { accountId: 1, role: 'owner', name: 'Owner Test' });
  server = await startServer(app);
  port = server.address().port;
});

test.after(() => { server.close(); });

function insertEmployee(name) {
  db.prepare(`INSERT INTO employees (name, daily_wage, active, created_at) VALUES (?, ?, 1, ?)`)
    .run(name, 100000, Date.now());
  return db.prepare('SELECT id FROM employees WHERE name = ?').get(name).id;
}

test('PUT /api/late-policies upsert aturan, GET menampilkannya', async () => {
  const employeeId = insertEmployee('Budi Upsert Test');

  const putRes = await fetch(`http://localhost:${port}/api/late-policies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employeeIds: [employeeId], checkInLimit: '08:30', thresholdMinutes: 60,
      deductionType: 'flat', deductionFlatAmount: 50000
    })
  });
  assert.equal(putRes.status, 200);

  const getRes = await fetch(`http://localhost:${port}/api/late-policies`);
  const list = await getRes.json();
  const found = list.find(row => row.employeeId === employeeId);
  assert.equal(found.latePolicy.checkInLimit, '08:30');
  assert.equal(found.latePolicy.deductionFlatAmount, 50000);
});

test('PUT /api/late-policies menolak deductionType yang tidak dikenal', async () => {
  const employeeId = insertEmployee('Siti Reject Test');
  const res = await fetch(`http://localhost:${port}/api/late-policies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeIds: [employeeId], checkInLimit: '08:30', thresholdMinutes: 60, deductionType: 'bogus' })
  });
  assert.equal(res.status, 400);
});

test('DELETE /api/late-policies/:employeeId menghapus aturan', async () => {
  const employeeId = insertEmployee('Andi Delete Test');
  await fetch(`http://localhost:${port}/api/late-policies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeIds: [employeeId], checkInLimit: '08:30', thresholdMinutes: 60, deductionType: 'flat', deductionFlatAmount: 10000 })
  });

  const delRes = await fetch(`http://localhost:${port}/api/late-policies/${employeeId}`, { method: 'DELETE' });
  assert.equal(delRes.status, 200);

  const getRes = await fetch(`http://localhost:${port}/api/late-policies`);
  const list = await getRes.json();
  const found = list.find(row => row.employeeId === employeeId);
  assert.equal(found.latePolicy, null);
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run:
```bash
node --test test/latePolicies.route.test.js
```
Expected: FAIL — `Cannot find module '../routes/latePolicies'` (file belum ada).

- [ ] **Step 4: Implementasikan `routes/latePolicies.js`**

Buat `absensi-app/backend/routes/latePolicies.js`:

```js
/* ============================================================
   routes/latePolicies.js — Aturan keterlambatan & potongan gaji
   per karyawan. Owner only. employee_id adalah primary key di
   late_policies, jadi PUT selalu upsert (satu aturan per karyawan).
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');

const router = express.Router();

const DEDUCTION_TYPES = ['flat', 'per_minute', 'percentage'];

function toLatePolicyJson(row) {
  if (!row) return null;
  return {
    checkInLimit: row.check_in_limit,
    thresholdMinutes: row.threshold_minutes,
    deductionType: row.deduction_type,
    deductionFlatAmount: row.deduction_flat_amount,
    deductionPerMinuteAmount: row.deduction_per_minute_amount,
    deductionPercentage: row.deduction_percentage
  };
}

router.get('/', requireOwner, (req, res) => {
  const employees = db.prepare('SELECT id, name FROM employees ORDER BY name').all();
  const policies = new Map(
    db.prepare('SELECT * FROM late_policies').all().map(row => [row.employee_id, row])
  );
  res.json(employees.map(emp => ({
    employeeId: emp.id,
    name: emp.name,
    latePolicy: toLatePolicyJson(policies.get(emp.id))
  })));
});

router.put('/', requireOwner, (req, res) => {
  const {
    employeeIds, checkInLimit, thresholdMinutes, deductionType,
    deductionFlatAmount, deductionPerMinuteAmount, deductionPercentage
  } = req.body || {};

  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    return res.status(400).json({ error: 'Pilih minimal satu karyawan.' });
  }
  if (!checkInLimit || !/^\d{2}:\d{2}$/.test(checkInLimit)) {
    return res.status(400).json({ error: 'Jam batas masuk wajib diisi format HH:MM.' });
  }
  if (!Number.isFinite(Number(thresholdMinutes)) || Number(thresholdMinutes) < 0) {
    return res.status(400).json({ error: 'Ambang menit telat wajib diisi angka 0 atau lebih.' });
  }
  if (!DEDUCTION_TYPES.includes(deductionType)) {
    return res.status(400).json({ error: 'Skema potongan tidak valid.' });
  }
  if (deductionType === 'flat' && !Number.isFinite(Number(deductionFlatAmount))) {
    return res.status(400).json({ error: 'Nominal potongan tetap wajib diisi.' });
  }
  if (deductionType === 'per_minute' && !Number.isFinite(Number(deductionPerMinuteAmount))) {
    return res.status(400).json({ error: 'Tarif potongan per menit wajib diisi.' });
  }
  if (deductionType === 'percentage' && !Number.isFinite(Number(deductionPercentage))) {
    return res.status(400).json({ error: 'Persentase potongan wajib diisi.' });
  }

  const existingIds = new Set(db.prepare('SELECT id FROM employees').all().map(r => r.id));
  for (const id of employeeIds) {
    if (!existingIds.has(Number(id))) {
      return res.status(404).json({ error: `Karyawan dengan id ${id} tidak ditemukan.` });
    }
  }

  const upsert = db.prepare(`
    INSERT INTO late_policies (
      employee_id, check_in_limit, threshold_minutes, deduction_type,
      deduction_flat_amount, deduction_per_minute_amount, deduction_percentage, updated_at
    ) VALUES (@employeeId, @checkInLimit, @thresholdMinutes, @deductionType,
      @deductionFlatAmount, @deductionPerMinuteAmount, @deductionPercentage, @updatedAt)
    ON CONFLICT(employee_id) DO UPDATE SET
      check_in_limit = excluded.check_in_limit,
      threshold_minutes = excluded.threshold_minutes,
      deduction_type = excluded.deduction_type,
      deduction_flat_amount = excluded.deduction_flat_amount,
      deduction_per_minute_amount = excluded.deduction_per_minute_amount,
      deduction_percentage = excluded.deduction_percentage,
      updated_at = excluded.updated_at
  `);

  const now = Date.now();
  for (const id of employeeIds) {
    upsert.run({
      employeeId: Number(id),
      checkInLimit,
      thresholdMinutes: Number(thresholdMinutes),
      deductionType,
      deductionFlatAmount: deductionType === 'flat' ? Number(deductionFlatAmount) : null,
      deductionPerMinuteAmount: deductionType === 'per_minute' ? Number(deductionPerMinuteAmount) : null,
      deductionPercentage: deductionType === 'percentage' ? Number(deductionPercentage) : null,
      updatedAt: now
    });
  }

  const placeholders = employeeIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM late_policies WHERE employee_id IN (${placeholders})`)
    .all(...employeeIds.map(Number));
  res.json(rows.map(row => ({ employeeId: row.employee_id, ...toLatePolicyJson(row) })));
});

router.delete('/:employeeId', requireOwner, (req, res) => {
  const row = db.prepare('SELECT employee_id FROM late_policies WHERE employee_id = ?').get(req.params.employeeId);
  if (!row) return res.status(404).json({ error: 'Karyawan ini belum punya aturan keterlambatan.' });
  db.prepare('DELETE FROM late_policies WHERE employee_id = ?').run(req.params.employeeId);
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 5: Jalankan test lagi, pastikan lolos**

Run:
```bash
node --test test/latePolicies.route.test.js
```
Expected: PASS (3 test lolos).

- [ ] **Step 6: Pasang router di `server.js`**

Di `absensi-app/backend/server.js`, ubah blok:
```js
app.use('/api', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/payroll', require('./routes/payroll'));
```
menjadi:
```js
app.use('/api', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/late-policies', require('./routes/latePolicies'));
```

- [ ] **Step 7: Commit**

```bash
git add absensi-app/backend/routes/latePolicies.js absensi-app/backend/server.js absensi-app/backend/test/helpers.js absensi-app/backend/test/latePolicies.route.test.js
git commit -m "Add owner-only late-policy CRUD endpoints"
```

---

## Task 5: Terapkan potongan ke `routes/payroll.js`

**Files:**
- Modify: `absensi-app/backend/routes/payroll.js`
- Test: `absensi-app/backend/test/payroll.late.test.js`

**Interfaces:**
- Consumes: `computeLateMinutes`, `computeDeduction` dari `lateCalculator.js` (Task 3); tabel `late_policies` (Task 2); `useTempDb`, `mountWithSession`, `startServer` dari `test/helpers.js` (Task 1 & 4).
- Produces: tiap baris `GET /api/payroll` bertambah field `lateMinutesTotal`, `latePolicy`, `deductionAmount`, `finalWage`; response level atas bertambah `grandFinalTotal`.

- [ ] **Step 1: Tulis test gagal**

Buat `absensi-app/backend/test/payroll.late.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { useTempDb, mountWithSession, startServer } = require('./helpers');

function todayStr() {
  const d = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

let db, server, port;

test.before(async () => {
  db = useTempDb();
  const router = require('../routes/payroll');
  const app = mountWithSession('/api/payroll', router, { accountId: 1, role: 'owner', name: 'Owner Test' });
  server = await startServer(app);
  port = server.address().port;
});

test.after(() => { server.close(); });

function insertEmployee(name, dailyWage) {
  db.prepare(`INSERT INTO employees (name, daily_wage, active, created_at) VALUES (?, ?, 1, ?)`)
    .run(name, dailyWage, Date.now());
  return db.prepare('SELECT id FROM employees WHERE name = ?').get(name).id;
}

function insertHadirToday(employeeId, checkInTime) {
  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, ?, '', 'Test', ?)
  `).run(employeeId, todayStr(), checkInTime, Date.now());
}

test('GET /api/payroll memotong gaji saat total menit telat melebihi ambang batas', async () => {
  const employeeId = insertEmployee('Telat Test', 100000);
  insertHadirToday(employeeId, '09:15'); // 45 menit setelah 08:30
  db.prepare(`
    INSERT INTO late_policies (employee_id, check_in_limit, threshold_minutes, deduction_type, deduction_flat_amount, updated_at)
    VALUES (?, '08:30', 30, 'flat', 20000, ?)
  `).run(employeeId, Date.now());

  const res = await fetch(`http://localhost:${port}/api/payroll`);
  const data = await res.json();
  const row = data.rows.find(r => r.employeeId === employeeId);

  assert.equal(row.lateMinutesTotal, 45);
  assert.equal(row.deductionAmount, 20000);
  assert.equal(row.totalWage, 100000);
  assert.equal(row.finalWage, 80000);
});

test('GET /api/payroll tidak memotong gaji kalau karyawan belum punya aturan keterlambatan', async () => {
  const employeeId = insertEmployee('Tanpa Aturan', 100000);
  insertHadirToday(employeeId, '09:15');

  const res = await fetch(`http://localhost:${port}/api/payroll`);
  const data = await res.json();
  const row = data.rows.find(r => r.employeeId === employeeId);

  assert.equal(row.lateMinutesTotal, 0);
  assert.equal(row.deductionAmount, 0);
  assert.equal(row.finalWage, row.totalWage);
  assert.equal(row.latePolicy, null);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run:
```bash
node --test test/payroll.late.test.js
```
Expected: FAIL — `row.lateMinutesTotal` bernilai `undefined` (belum ada di response `payroll.js` sekarang).

- [ ] **Step 3: Ubah `routes/payroll.js`**

Tambahkan `require` di bagian atas file (setelah baris `const { requireOwner } = require('../middleware/auth');`):
```js
const { computeLateMinutes, computeDeduction } = require('../lateCalculator');
```

Tambahkan fungsi ini setelah `bumpStatus` (sebelum `router.get('/', ...)`):
```js
function toLatePolicyJson(row) {
  if (!row) return null;
  return {
    checkInLimit: row.check_in_limit,
    thresholdMinutes: row.threshold_minutes,
    deductionType: row.deduction_type,
    deductionFlatAmount: row.deduction_flat_amount,
    deductionPerMinuteAmount: row.deduction_per_minute_amount,
    deductionPercentage: row.deduction_percentage
  };
}
```

Ganti seluruh isi `router.get('/', requireOwner, (req, res) => { ... })` menjadi:
```js
router.get('/', requireOwner, (req, res) => {
  const offset = Number(req.query.periodOffset || 0);
  const period = getPeriodByOffset(offset);
  const startS = dateToStr(period.start);
  const endS = dateToStr(period.end);
  const todayS = todayStr();

  const employees = db.prepare('SELECT * FROM employees WHERE active = 1 ORDER BY name').all();

  const rows = employees.map(emp => {
    const records = db.prepare(
      `SELECT date, status, hours_worked, check_in_time FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`
    ).all(emp.id, startS, endS);
    const byDate = new Map(records.map(r => [r.date, r]));
    const policyRow = db.prepare('SELECT * FROM late_policies WHERE employee_id = ?').get(emp.id);

    const counts = { hadir: 0, izin: 0, sakit: 0, alpa: 0, totalHoursPaid: 0, totalWage: 0, lateMinutesTotal: 0 };
    let cursor = startS;
    while (cursor <= endS && cursor <= todayS) {
      const rec = byDate.get(cursor);
      if (rec) {
        bumpStatus(counts, rec.status);
        if (rec.status === 'hadir') {
          const paidHours = Math.min(rec.hours_worked || 0, 8);
          counts.totalHoursPaid += paidHours;
          counts.totalWage += (paidHours / 8) * emp.daily_wage;
          if (policyRow) {
            counts.lateMinutesTotal += computeLateMinutes(rec.check_in_time, policyRow.check_in_limit);
          }
        }
      } else if (cursor < todayS) {
        counts.alpa++;
      }
      cursor = addDaysStr(cursor, 1);
    }

    const latePolicy = toLatePolicyJson(policyRow);
    const deductionAmount = policyRow
      ? computeDeduction({
          thresholdMinutes: policyRow.threshold_minutes,
          deductionType: policyRow.deduction_type,
          deductionFlatAmount: policyRow.deduction_flat_amount,
          deductionPerMinuteAmount: policyRow.deduction_per_minute_amount,
          deductionPercentage: policyRow.deduction_percentage
        }, counts.lateMinutesTotal, counts.totalWage)
      : 0;
    const finalWage = Math.max(0, counts.totalWage - deductionAmount);

    return {
      employeeId: emp.id, name: emp.name, dailyWage: emp.daily_wage,
      ...counts, latePolicy, deductionAmount, finalWage
    };
  });

  const grandTotal = rows.reduce((sum, r) => sum + r.totalWage, 0);
  const grandFinalTotal = rows.reduce((sum, r) => sum + r.finalWage, 0);
  res.json({ period: { start: startS, end: endS, offset }, rows, grandTotal, grandFinalTotal });
});
```

- [ ] **Step 4: Jalankan test lagi, pastikan lolos**

Run:
```bash
node --test test/payroll.late.test.js
```
Expected: PASS (2 test lolos).

- [ ] **Step 5: Jalankan seluruh test suite backend, pastikan tidak ada yang rusak**

Run:
```bash
npm test
```
Expected: PASS — semua test dari Task 1–5 lolos (total 15 test: 2 di `db.test.js`, 8 di `lateCalculator.test.js`, 3 di `latePolicies.route.test.js`, 2 di `payroll.late.test.js`).

- [ ] **Step 6: Commit**

```bash
git add absensi-app/backend/routes/payroll.js absensi-app/backend/test/payroll.late.test.js
git commit -m "Apply late-arrival wage deduction to payroll calculation"
```

---

## Verifikasi Manual (opsional, setelah semua task selesai)

Semua test di atas jalan lewat database sementara — kalau ingin lihat fiturnya benar-benar jalan di database dev (`data/absensiku.db`):

```bash
cd absensi-app/backend
npm run seed    # kalau belum pernah dijalankan di database ini
npm start
```

Di terminal lain (ganti `<cookie>` dengan cookie sesi hasil login owner lewat browser/`curl -c`):
```bash
curl -X PUT http://localhost:3000/api/late-policies \
  -H "Content-Type: application/json" -b <cookie> \
  -d '{"employeeIds":[1],"checkInLimit":"08:30","thresholdMinutes":30,"deductionType":"flat","deductionFlatAmount":20000}'

curl http://localhost:3000/api/payroll -b <cookie>
```
Field `latePolicy`, `lateMinutesTotal`, `deductionAmount`, dan `finalWage` untuk karyawan id 1 harus muncul di response `/api/payroll`.
