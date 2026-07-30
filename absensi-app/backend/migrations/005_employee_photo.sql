-- Foto disimpan di database, bukan sebagai berkas di disk, supaya panduan
-- backup di DEPLOY-MACOS.md ("salin data/absensiku.db") tetap benar — kalau
-- foto ditaruh terpisah, backup akan tampak sukses tapi kehilangan semuanya.
ALTER TABLE employees ADD COLUMN photo BLOB;
ALTER TABLE employees ADD COLUMN photo_mime TEXT;

-- Dipakai sebagai penanda versi pada URL gambar (?v=...) supaya foto yang
-- baru diganti langsung tampil dan tidak tertutup cache browser.
ALTER TABLE employees ADD COLUMN photo_updated_at INTEGER;
