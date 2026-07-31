-- Penanda "tanggal ini hasil hitungan kalender, belum dikonfirmasi owner
-- terhadap SKB pemerintah". Hari libur yang diketik manual selalu 0 --
-- kalau owner mengetiknya sendiri, dia sudah tahu tanggalnya benar.
ALTER TABLE holidays ADD COLUMN is_estimate INTEGER NOT NULL DEFAULT 0;
