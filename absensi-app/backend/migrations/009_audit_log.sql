-- Jejak setiap perubahan data, supaya owner bisa menelusuri siapa mengubah
-- apa dan kenapa. Karyawan tidak absen sendiri di aplikasi ini -- semua data
-- kehadiran diketik HR -- jadi akuntabilitas HR yang menggantikan verifikasi
-- identitas karyawan.

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  -- Nama disalin, bukan di-JOIN ke accounts: akun bisa dihapus atau berganti
  -- nama, dan log yang berbunyi "diubah oleh akun #3 yang sudah tidak ada"
  -- tidak ada gunanya. Sama seperti attendance.marked_by yang sudah begitu.
  account_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  -- TEXT, bukan INTEGER: holidays memakai date sebagai primary key sedangkan
  -- tabel lain memakai id angka.
  entity_id TEXT NOT NULL,
  -- Snapshot baris utuh, bukan diff per kolom. Diff rapuh terhadap migrasi --
  -- kolom yang ditambah belakangan membuat log lama tidak terbaca. Snapshot
  -- juga berarti baris terhapus bisa dipulihkan manual dari isinya.
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
