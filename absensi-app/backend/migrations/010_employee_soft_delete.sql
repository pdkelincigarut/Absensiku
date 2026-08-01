-- Menghapus karyawan sebelumnya permanen, dan menyisakan baris absensi yatim
-- yang tetap ikut terhitung di laporan gaji. Sekarang barisnya tetap ada,
-- hanya disembunyikan dari daftar.
--
-- Berbeda dari kolom `active` yang sudah ada: active = 0 berarti karyawan
-- masih terdaftar tapi sedang tidak aktif, dan TETAP muncul di daftar.
-- deleted_at berarti hilang dari daftar. Dua hal berbeda, jangan digabung.
ALTER TABLE employees ADD COLUMN deleted_at INTEGER;
