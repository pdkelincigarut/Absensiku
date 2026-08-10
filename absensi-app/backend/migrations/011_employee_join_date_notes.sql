-- Tanggal masuk kerja dan catatan bebas per karyawan.
--
-- Keduanya boleh kosong. Karyawan yang sudah terlanjur terdaftar sebelum
-- migrasi ini tidak punya tanggal masuk, dan menebaknya dari created_at
-- akan salah: created_at adalah kapan barisnya diketik ke aplikasi, bukan
-- kapan orangnya mulai bekerja. Owner yang mengisinya sendiri kalau perlu.
ALTER TABLE employees ADD COLUMN join_date TEXT;   -- 'YYYY-MM-DD'
ALTER TABLE employees ADD COLUMN notes TEXT;
