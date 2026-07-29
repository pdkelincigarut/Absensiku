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

-- Karyawan lama belum punya kode; index unik di bawah akan menolak banyak NULL
-- kalau dibiarkan kosong, jadi diisi kode sementara yang diturunkan dari id
-- (dijamin unik). Owner bisa menggantinya lewat form karyawan.
UPDATE employees SET employee_code = 'EMP-' || substr('000' || id, -3) WHERE employee_code IS NULL;

CREATE UNIQUE INDEX idx_employees_code ON employees(employee_code);
