/* ============================================================
   006_work_schedule_foundation — Jadwal kerja, hari libur, jam
   pulang, dan aturan keterlambatan berversi.

   Ditulis sebagai .js (bukan .sql) karena konversi late_policies
   lama perlu melaporkan karyawan mana yang batas telatnya
   berubah — SQL murni tidak bisa mencetak peringatan itu.
   ============================================================ */

// Harus sama dengan start_time jadwal baku yang disisipkan di bawah:
// konversi check_in_limit lama menjadi selisih menit terhadap jam ini.
const COMPANY_DEFAULT_START = '08:00';
const COMPANY_DEFAULT_END = '17:00';
const COMPANY_DEFAULT_WORK_DAYS = '1,2,3,4,5';

/* effective_from paling awal supaya seluruh periode lampau memakai aturan
   yang sama seperti sebelum migrasi — angka gaji periode lalu tidak boleh
   bergeser gara-gara migrasi ini (kecuali perbaikan bug alpa yang disengaja). */
const EPOCH = '1970-01-01';

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

module.exports = function (db) {
  const now = Date.now();

  db.exec(`
    CREATE TABLE work_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),  -- NULL = jadwal baku perusahaan
      work_days TEXT NOT NULL,        -- angka hari dipisah koma, 0=Minggu..6=Sabtu
      start_time TEXT NOT NULL,       -- 'HH:MM'
      end_time TEXT NOT NULL,         -- 'HH:MM'
      effective_from TEXT NOT NULL,   -- 'YYYY-MM-DD'
      created_at INTEGER NOT NULL
    );

    CREATE INDEX idx_work_schedules_lookup ON work_schedules(employee_id, effective_from);

    CREATE TABLE holidays (
      date TEXT PRIMARY KEY,          -- 'YYYY-MM-DD'
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    ALTER TABLE attendance ADD COLUMN check_out_time TEXT;
  `);

  // Jadwal baku perusahaan. Nilai ini TEBAKAN, bukan data dari owner —
  // frontend menampilkan banner sampai owner memeriksanya.
  db.prepare(`
    INSERT INTO work_schedules (employee_id, work_days, start_time, end_time, effective_from, created_at)
    VALUES (NULL, ?, ?, ?, ?, ?)
  `).run(COMPANY_DEFAULT_WORK_DAYS, COMPANY_DEFAULT_START, COMPANY_DEFAULT_END, EPOCH, now);

  db.exec(`
    CREATE TABLE late_policies_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      grace_minutes INTEGER NOT NULL,
      threshold_minutes INTEGER NOT NULL,
      deduction_type TEXT NOT NULL
        CHECK (deduction_type IN ('flat', 'per_minute', 'percentage')),
      deduction_flat_amount INTEGER,
      deduction_per_minute_amount INTEGER,
      deduction_percentage REAL,
      effective_from TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const insertPolicy = db.prepare(`
    INSERT INTO late_policies_new (
      employee_id, grace_minutes, threshold_minutes, deduction_type,
      deduction_flat_amount, deduction_per_minute_amount, deduction_percentage,
      effective_from, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const defaultStartMinutes = timeToMinutes(COMPANY_DEFAULT_START);
  const affected = [];

  for (const row of db.prepare('SELECT * FROM late_policies').all()) {
    const rawGrace = timeToMinutes(row.check_in_limit) - defaultStartMinutes;
    if (rawGrace < 0) {
      // Batas lama lebih awal dari jam masuk baku, jadi tidak bisa dinyatakan
      // sebagai toleransi setelah jam masuk. Dijepit ke 0 — ini MENGUBAH batas
      // efektif karyawan tersebut, jadi harus dilaporkan, bukan didiamkan.
      const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(row.employee_id);
      affected.push(`${emp ? emp.name : 'karyawan id ' + row.employee_id} (batas lama ${row.check_in_limit})`);
    }
    insertPolicy.run(
      row.employee_id,
      Math.max(0, rawGrace),
      row.threshold_minutes,
      row.deduction_type,
      row.deduction_flat_amount,
      row.deduction_per_minute_amount,
      row.deduction_percentage,
      EPOCH,
      row.updated_at || now
    );
  }

  db.exec(`
    DROP TABLE late_policies;
    ALTER TABLE late_policies_new RENAME TO late_policies;
    CREATE INDEX idx_late_policies_lookup ON late_policies(employee_id, effective_from);
  `);

  if (affected.length > 0) {
    console.warn(
      `PERHATIAN: batas keterlambatan ${affected.length} karyawan berubah karena jam masuknya lebih awal dari jadwal baku ${COMPANY_DEFAULT_START} — periksa di tab Aturan Keterlambatan: ${affected.join(', ')}`
    );
  }
};
