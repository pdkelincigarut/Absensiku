CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('hr', 'owner')),
  created_at INTEGER NOT NULL
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  daily_wage INTEGER NOT NULL,
  birth_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('hadir', 'izin', 'sakit', 'alpa')),
  attendance_type TEXT CHECK (attendance_type IN ('full', 'half', 'custom')),
  hours_worked REAL,
  check_in_time TEXT,
  note TEXT NOT NULL DEFAULT '',
  marked_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (employee_id, date)
);

CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_attendance_employee ON attendance(employee_id);
