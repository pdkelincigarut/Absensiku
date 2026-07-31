-- Penanda "jadwal ini nilai tebakan migrasi, belum diperiksa owner".
-- Sebelumnya frontend menebaknya dari effective_from = '1970-01-01', tapi
-- tanggal itu juga dipakai owner yang sengaja mengoreksi jadwal sejak awal,
-- sehingga bannernya tetap muncul padahal sudah diperiksa.
ALTER TABLE work_schedules ADD COLUMN is_seeded INTEGER NOT NULL DEFAULT 0;

-- Tandai baris yang masih persis seperti yang disisipkan migrasi 006.
-- Pada database baru, migrasi ini jalan tepat setelah 006 dan belum ada
-- jadwal lain, jadi pencocokan ini tepat sasaran.
UPDATE work_schedules
SET is_seeded = 1
WHERE employee_id IS NULL
  AND effective_from = '1970-01-01'
  AND work_days = '1,2,3,4,5'
  AND start_time = '08:00'
  AND end_time = '17:00';
