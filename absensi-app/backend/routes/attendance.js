/* ============================================================
   routes/attendance.js — Ceklis kehadiran & riwayat
   Jam masuk (check_in_time) SELALU diisi dari jam server saat
   status 'hadir' — field itu di body request diabaikan kalau ada.
   ============================================================ */

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { recordAudit, hasMeaningfulChange } = require('../auditLog');

const router = express.Router();

function findRow(employeeId, date) {
  return db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, date);
}

function pad2(n) { return String(n).padStart(2, '0'); }
function serverTimeStr() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function toJson(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    date: row.date,
    status: row.status,
    attendanceType: row.attendance_type,
    hoursWorked: row.hours_worked,
    checkInTime: row.check_in_time,
    // null berarti BELUM DICATAT — jangan diperlakukan sebagai pulang tepat waktu
    checkOutTime: row.check_out_time,
    note: row.note,
    markedBy: row.marked_by,
    updatedAt: row.updated_at
  };
}

router.get('/', requireAuth, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Parameter date wajib diisi.' });

  const rows = db.prepare(`
    SELECT a.*, e.name AS employee_name
    FROM attendance a JOIN employees e ON e.id = a.employee_id
    WHERE a.date = ?
  `).all(date);
  res.json(rows.map(toJson));
});

router.get('/history', requireAuth, (req, res) => {
  const { employeeId, month } = req.query;
  if (!month) return res.status(400).json({ error: 'Parameter month wajib diisi.' });

  let sql = `
    SELECT a.*, e.name AS employee_name
    FROM attendance a JOIN employees e ON e.id = a.employee_id
    WHERE a.date LIKE ?
  `;
  const params = [`${month}%`];
  if (employeeId && employeeId !== 'all') {
    sql += ' AND a.employee_id = ?';
    params.push(employeeId);
  }
  sql += ' ORDER BY a.date DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(toJson));
});

router.put('/:employeeId/:date', requireAuth, (req, res) => {
  const { employeeId, date } = req.params;
  const { status, attendanceType, hoursWorked, note, reason } = req.body || {};

  if (!['hadir', 'izin', 'sakit', 'alpa'].includes(status)) {
    return res.status(400).json({ error: 'Status tidak valid.' });
  }
  const employee = db.prepare('SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL').get(employeeId);
  if (!employee) return res.status(404).json({ error: 'Karyawan tidak ditemukan.' });

  const before = findRow(employeeId, date);

  let finalType = null, finalHours = null, checkInTime = null;
  if (status === 'hadir') {
    finalType = ['full', 'half', 'custom'].includes(attendanceType) ? attendanceType : 'full';
    if (finalType === 'full') finalHours = 8;
    else if (finalType === 'half') finalHours = 4;
    else {
      finalHours = Number(hoursWorked);
      if (!finalHours || finalHours <= 0) {
        return res.status(400).json({ error: 'Jumlah jam kerja harus lebih dari 0.' });
      }
    }
    // Jam masuk yang SUDAH tercatat dipertahankan. Sebelumnya baris ini selalu
    // menstempel ulang dengan jam sekarang, sehingga mengoreksi catatan pukul
    // 16:00 memindahkan jam masuk karyawan dari 08:00 ke 16:00 -- dan karena
    // potongan keterlambatan dihitung dari kolom ini, gajinya ikut terpotong.
    // Stempel baru hanya untuk hari yang baru menjadi hadir.
    checkInTime = (before && before.status === 'hadir' && before.check_in_time)
      ? before.check_in_time
      : serverTimeStr(); // jam server, BUKAN dari client
  }

  /* Alasan wajib untuk koreksi, tidak untuk input pertama. Input pertama itu
     pekerjaan harian normal -- mewajibkannya di situ hanya akan menghasilkan
     alasan "." yang menyamarkan koreksi sungguhan. */
  const after = before && {
    ...before,
    status,
    attendance_type: finalType,
    hours_worked: finalHours,
    check_in_time: checkInTime,
    note: note || ''
  };
  const isCorrection = !!before && hasMeaningfulChange(before, after);
  if (isCorrection && !String(reason || '').trim()) {
    return res.status(400).json({ error: 'Alasan koreksi wajib diisi saat mengubah absensi yang sudah tercatat.' });
  }

  db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (@employeeId, @date, @status, @attendanceType, @hoursWorked, @checkInTime, @note, @markedBy, @updatedAt)
    ON CONFLICT(employee_id, date) DO UPDATE SET
      status = excluded.status,
      attendance_type = excluded.attendance_type,
      hours_worked = excluded.hours_worked,
      check_in_time = excluded.check_in_time,
      -- Jam pulang dipertahankan selama statusnya tetap hadir (mengubah catatan
      -- tidak boleh menghapusnya), tapi dibuang kalau harinya jadi izin/sakit/alpa
      -- supaya tidak tertinggal jam pulang di hari yang orangnya tidak masuk.
      check_out_time = CASE WHEN excluded.status = 'hadir' THEN attendance.check_out_time ELSE NULL END,
      note = excluded.note,
      marked_by = excluded.marked_by,
      updated_at = excluded.updated_at
  `).run({
    employeeId,
    date,
    status,
    attendanceType: finalType,
    hoursWorked: finalHours,
    checkInTime,
    note: note || '',
    markedBy: req.session.name,
    updatedAt: Date.now()
  });

  const stored = findRow(employeeId, date);

  // Menyimpan ulang tanpa mengubah apa pun bukan peristiwa -- mencatatnya
  // hanya menenggelamkan koreksi sungguhan di antara baris kosong.
  if (!before || isCorrection) {
    recordAudit(req.session, {
      action: before ? 'update' : 'create',
      entity: 'attendance',
      entityId: stored.id,
      before,
      after: stored,
      reason
    });
  }

  const row = db.prepare(`
    SELECT a.*, e.name AS employee_name
    FROM attendance a JOIN employees e ON e.id = a.employee_id
    WHERE a.employee_id = ? AND a.date = ?
  `).get(employeeId, date);
  res.json(toJson(row));
});

/* Menandai banyak karyawan sekaligus sebagai hadir penuh. Tombol ini vektor
   kecurangan terbesar yang ada -- sehari kerja bisa dibuat dari satu klik --
   tapi sengaja dipertahankan: di perusahaan kecil, hari di mana semua orang
   hadir itu kasus normal, dan menghapusnya akan mendorong HR mencari jalan
   pintas lain yang lebih sulit diawasi. Yang ditambahkan di sini jejaknya.

   Dibuat sebagai endpoint tersendiri, bukan penanda di body PUT, supaya
   label 'bulk_create' di log berasal dari yang server tahu benar-benar
   terjadi, bukan dari klaim client. */
router.post('/bulk-mark', requireAuth, (req, res) => {
  const { date, employeeIds } = req.body || {};
  if (!date) return res.status(400).json({ error: 'Parameter date wajib diisi.' });
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    return res.status(400).json({ error: 'Daftar karyawan wajib diisi.' });
  }

  const checkInTime = serverTimeStr();
  // created_at yang sama untuk seluruh rombongan, supaya tampilan owner bisa
  // mengelompokkannya sebagai satu peristiwa, bukan 12 baris berserakan.
  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, note, marked_by, updated_at)
    VALUES (?, ?, 'hadir', 'full', 8, ?, '', ?, ?)
  `);

  const marked = [];
  for (const employeeId of employeeIds) {
    const employee = db.prepare('SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL').get(employeeId);
    if (!employee) continue;
    // Yang sudah punya catatan dilewati, tidak ditimpa -- sama seperti
    // perilaku tombolnya selama ini.
    if (findRow(employeeId, date)) continue;

    insert.run(employeeId, date, checkInTime, req.session.name, now);
    const stored = findRow(employeeId, date);
    recordAudit(req.session, {
      action: 'bulk_create',
      entity: 'attendance',
      entityId: stored.id,
      before: null,
      after: stored,
      createdAt: now
    });
    marked.push(employeeId);
  }

  res.json({ marked, skipped: employeeIds.length - marked.length });
});

/* Jam pulang diambil dari jam server, sama seperti jam masuk — nilai dari
   client tidak pernah dipercaya. Memanggil ulang menimpa dengan jam terbaru,
   yang berfungsi sebagai koreksi kalau HR menekannya kecepatan. */
router.post('/:employeeId/:date/check-out', requireAuth, (req, res) => {
  const { employeeId, date } = req.params;

  const row = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(employeeId, date);
  if (!row) return res.status(404).json({ error: 'Belum ada catatan absensi untuk hari ini.' });
  if (row.status !== 'hadir') {
    return res.status(400).json({ error: 'Jam pulang hanya bisa dicatat untuk hari berstatus hadir.' });
  }
  if (!row.check_in_time) {
    return res.status(400).json({ error: 'Jam masuk belum tercatat, jam pulang tidak bisa dicatat.' });
  }

  db.prepare('UPDATE attendance SET check_out_time = ?, marked_by = ?, updated_at = ? WHERE id = ?')
    .run(serverTimeStr(), req.session.name, Date.now(), row.id);

  recordAudit(req.session, {
    action: 'check_out',
    entity: 'attendance',
    entityId: row.id,
    before: row,
    after: findRow(row.employee_id, row.date)
  });

  const updated = db.prepare(`
    SELECT a.*, e.name AS employee_name
    FROM attendance a JOIN employees e ON e.id = a.employee_id
    WHERE a.id = ?
  `).get(row.id);
  res.json(toJson(updated));
});

module.exports = router;
