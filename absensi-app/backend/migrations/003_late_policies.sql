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
