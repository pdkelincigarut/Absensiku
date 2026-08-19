-- Pengenalan wajah untuk absen mandiri di kios.
--
-- Yang disimpan di face_descriptors BUKAN foto, melainkan 128 bilangan
-- hasil face_recognition_model. Angka itu tidak bisa dikembalikan menjadi
-- wajah, jadi kebocorannya jauh lebih ringan daripada bocornya album foto.
-- Satu karyawan punya beberapa baris (beberapa sudut pengambilan), dan saat
-- mencocokkan dipakai jarak terdekat di antara semuanya.
CREATE TABLE face_descriptors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  descriptor  TEXT    NOT NULL,   -- JSON array 128 float
  created_at  INTEGER NOT NULL,
  created_by  TEXT    NOT NULL
);

CREATE INDEX idx_face_descriptors_employee ON face_descriptors(employee_id);

-- Foto bukti tiap absen kios.
--
-- Ini yang sebenarnya menahan kecurangan, bukan ambang kemiripannya. Sistem
-- pengenal wajah mana pun bisa keliru, dan wajah di layar ponsel bisa lolos.
-- Yang membuat orang tidak berani menitipkan absen adalah tahu bahwa setiap
-- ceklis meninggalkan foto yang bisa dilihat Owner.
--
-- Disimpan terpisah dari tabel attendance supaya baris absensi tetap ringan:
-- laporan gaji membaca seluruh baris absensi sebulan, dan tidak ada gunanya
-- ikut menyeret puluhan ribu byte gambar setiap kali.
CREATE TABLE check_in_photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  date        TEXT    NOT NULL,   -- 'YYYY-MM-DD'
  kind        TEXT    NOT NULL CHECK (kind IN ('check_in', 'check_out')),
  photo       BLOB    NOT NULL,
  photo_mime  TEXT    NOT NULL,
  distance    REAL,               -- jarak kemiripan saat dicocokkan
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_check_in_photos_lookup ON check_in_photos(employee_id, date);
CREATE INDEX idx_check_in_photos_date   ON check_in_photos(date);
