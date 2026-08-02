/* ============================================================
   seedDemo.js — Data contoh untuk PRESENTASI (npm run seed:demo)

   Berbeda dari seed.js: berkas ini MENGOSONGKAN seluruh tabel
   lebih dulu, lalu mengisinya dengan sebulan lebih riwayat
   absensi supaya setiap fitur benar-benar terlihat saat
   didemokan. seed.js sengaja TIDAK diubah -- itu tetap data
   awal yang bersih untuk dipakai saat aplikasi dipasang di
   server kantor.

   JANGAN dijalankan di server berisi data asli. Butuh flag
   --force justru supaya tidak pernah terjadi tanpa sengaja.

   Semua angka acak berasal dari benih tetap, jadi menjalankan
   ulang menghasilkan data yang persis sama -- angka di layar
   tidak berubah di tengah presentasi.
   ============================================================ */

const bcrypt = require('bcryptjs');
const db = require('./db');
const { nationalHolidays } = require('./holidayCalculator');

/* --topup tidak menghapus apa pun, jadi tidak perlu --force. Yang dijaga di
   sini khusus mode bangun ulang. */
if (!process.argv.includes('--force') && !process.argv.includes('--topup')) {
  console.error(`
seedDemo punya dua mode.

  --topup   Menambal hari kerja yang belum terisi sampai kemarin.
            Tidak menghapus apa pun. Pakai ini sebelum presentasi di
            hari lain, supaya karyawan tidak terlihat Alpa massal.

  --force   MENGHAPUS SEMUA ISI DATABASE lalu membangun ulang data contoh
            dari awal. Database yang akan dikosongkan:
              ${process.env.DB_FILE || 'data/absensiku.db'}

Contoh:
  npm run seed:demo -- --topup
  npm run seed:demo -- --force
`);
  process.exit(1);
}

/* ---------------- Acak berbenih ---------------- */

// LCG sederhana. Dipakai supaya variasi absensi terlihat wajar tanpa
// membuat hasilnya berubah setiap kali dijalankan.
let seedState = 20260801;
function rand() {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick(list) {
  return list[Math.floor(rand() * list.length)];
}
function randInt(min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

/* ---------------- Tanggal ---------------- */

function pad2(n) { return String(n).padStart(2, '0'); }

function dateToStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Konstruktor komponen, BUKAN new Date('YYYY-MM-DD') yang dianggap UTC
// dan bisa menggeser tanggal satu hari di WIB.
function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysStr(dateStr, n) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}

function dayOfWeek(dateStr) {
  return parseDateStr(dateStr).getDay();
}

function minutesToTime(total) {
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/* ---------------- Parameter demo ---------------- */

/* Jadwal ini menyalin yang sudah diatur owner lewat UI (Senin-Sabtu,
   07:30-16:30), bukan tebakan bawaan migrasi. */
const COMPANY_WORK_DAYS = '1,2,3,4,5,6';
const COMPANY_START = '07:30';
const COMPANY_END = '16:30';

const TODAY = dateToStr(new Date());

/* Riwayat dimulai dari awal periode gaji SEBELUMNYA, supaya di layar
   Laporan Gaji baik periode berjalan maupun periode lalu sama-sama
   terisi penuh -- periode lalu itu yang angkanya sudah final. */
function periodStartOf(monthOffset) {
  const now = new Date();
  const day = now.getDate();
  const base = new Date(now.getFullYear(), now.getMonth() + (day >= 27 ? 0 : -1) + monthOffset, 27);
  return dateToStr(base);
}

const HISTORY_START = periodStartOf(-1);
const HISTORY_END = addDaysStr(TODAY, -1); // hari ini sengaja dikosongkan supaya
// tab Monitoring dibuka dalam keadaan belum diabsen -- HR bisa memperagakan
// mencentang kehadiran secara langsung di depan klien.

const JOBS = ['Manager', 'Supervisor', 'Staff', 'Admin', 'Teknisi'];
const ORGS = ['Accounting', 'Information & Technology', 'Business Development', 'Produksi', 'Gudang'];

/* Sengaja 12 orang: cukup untuk memicu pagination dan membuat pencarian
   serta pengurutan tabel terasa berguna, masih enak dibaca satu layar. */
const EMPLOYEES = [
  { name: 'Budi Santoso',    job: 'Staff',      org: 'Accounting',                wage: 110000, birth: '1995-08-01' },
  { name: 'Siti Aminah',     job: 'Supervisor', org: 'Business Development',      wage: 150000, birth: '1998-03-12' },
  { name: 'Andi Wijaya',     job: 'Manager',    org: 'Information & Technology',  wage: 200000, birth: '1992-11-05' },
  { name: 'Dewi Lestari',    job: 'Staff',      org: 'Accounting',                wage: 110000, birth: '1997-06-20' },
  { name: 'Rudi Hartono',    job: 'Teknisi',    org: 'Produksi',                  wage: 130000, birth: '1990-01-28' },
  { name: 'Nur Hasanah',     job: 'Admin',      org: 'Gudang',                    wage: 100000, birth: '1999-09-14' },
  { name: 'Agus Setiawan',   job: 'Staff',      org: 'Produksi',                  wage: 115000, birth: '1994-04-02' },
  { name: 'Rina Marlina',    job: 'Supervisor', org: 'Gudang',                    wage: 145000, birth: '1993-12-30' },
  { name: 'Joko Prasetyo',   job: 'Teknisi',    org: 'Information & Technology',  wage: 135000, birth: '1996-07-17' },
  { name: 'Maya Sari',       job: 'Staff',      org: 'Business Development',      wage: 105000, birth: '2000-02-09' },
  { name: 'Hendra Gunawan',  job: 'Manager',    org: 'Produksi',                  wage: 210000, birth: '1988-10-23' },
  { name: 'Lina Kusuma',     job: 'Admin',      org: 'Accounting',                wage: 100000, birth: '1998-05-06' }
];

/* ---------------- Pengosongan ---------------- */

function wipe() {
  // Urutan tidak kritis karena foreign key memang dimatikan di db.js, tapi
  // tabel anak tetap didahulukan supaya maksudnya terbaca jelas.
  for (const table of ['audit_log', 'attendance', 'late_policies', 'work_schedules', 'holidays', 'employees', 'jobs', 'organizations', 'accounts', 'sessions']) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  // Nomor id ikut direset supaya kode karyawan dan id-nya sejalan rapi.
  db.prepare(`DELETE FROM sqlite_sequence`).run();
}

/* ---------------- Pengisian ---------------- */

function seedAccounts(now) {
  const insert = db.prepare(
    'INSERT INTO accounts (name, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run('Rina (HR)', 'hradmin', bcrypt.hashSync('hr123', 10), 'hr', now);
  insert.run('Admin Owner', 'owner', bcrypt.hashSync('owner123', 10), 'owner', now);

  return {
    hr: { accountId: 1, name: 'Rina (HR)' },
    owner: { accountId: 2, name: 'Admin Owner' }
  };
}

function seedLookup(table, names, now) {
  const insert = db.prepare(`INSERT INTO ${table} (name, created_at) VALUES (?, ?)`);
  const ids = {};
  for (const name of names) {
    const info = insert.run(name, now);
    ids[name] = Number(info.lastInsertRowid);
  }
  return ids;
}

function seedEmployees(jobIds, orgIds, now) {
  const insert = db.prepare(`
    INSERT INTO employees (name, daily_wage, birth_date, active, created_at, employee_code, job_id, organization_id)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?)
  `);
  return EMPLOYEES.map((e, i) => {
    const code = `TDI-${pad2(i + 1).padStart(3, '0')}`;
    const info = insert.run(e.name, e.wage, e.birth, now, code, jobIds[e.job], orgIds[e.org]);
    return { ...e, id: Number(info.lastInsertRowid), code };
  });
}

function seedSchedules(employees, now) {
  const insert = db.prepare(`
    INSERT INTO work_schedules (employee_id, work_days, start_time, end_time, effective_from, created_at, is_seeded)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);
  insert.run(null, COMPANY_WORK_DAYS, COMPANY_START, COMPANY_END, '1970-01-01', now);

  /* Dua pengecualian per karyawan, supaya fitur jadwal khusus tidak
     tampak kosong: satu masuk lebih pagi, satu tidak kerja Sabtu. */
  const exceptions = [
    { employee: 'Rudi Hartono', workDays: '1,2,3,4,5,6', start: '06:00', end: '15:00' },
    { employee: 'Andi Wijaya',  workDays: '1,2,3,4,5',   start: '08:00', end: '17:00' }
  ];
  const byName = new Map(employees.map(e => [e.name, e]));
  for (const ex of exceptions) {
    insert.run(byName.get(ex.employee).id, ex.workDays, ex.start, ex.end, '1970-01-01', now);
  }
  return { exceptions, byName };
}

function scheduleFor(emp, scheduleInfo) {
  const ex = scheduleInfo.exceptions.find(x => x.employee === emp.name);
  return ex
    ? { workDays: ex.workDays, start: ex.start }
    : { workDays: COMPANY_WORK_DAYS, start: COMPANY_START };
}

function seedLatePolicies(employees, now) {
  const insert = db.prepare(`
    INSERT INTO late_policies (
      employee_id, grace_minutes, threshold_minutes, deduction_type,
      deduction_flat_amount, deduction_per_minute_amount, deduction_percentage,
      effective_from, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  /* Ketiga jenis potongan dipakai sekaligus supaya owner melihat sendiri
     bahwa aturannya bisa berbeda-beda per karyawan, bukan satu rumus
     untuk semua orang. */
  for (const emp of employees) {
    const kind = emp.id % 3;
    if (kind === 0) {
      insert.run(emp.id, 15, 30, 'flat', 50000, null, null, '1970-01-01', now);
    } else if (kind === 1) {
      insert.run(emp.id, 10, 15, 'per_minute', null, 1000, null, '1970-01-01', now);
    } else {
      insert.run(emp.id, 15, 60, 'percentage', null, null, 2.5, '1970-01-01', now);
    }
  }

  /* Satu karyawan diberi versi kedua yang berlaku mulai periode berjalan.
     Ini memperagakan hal yang paling sulit dijelaskan lewat kata-kata:
     mengubah aturan hari ini TIDAK menggeser gaji periode yang sudah
     lewat, karena versi lama tetap dipakai untuk tanggal-tanggal lama. */
  const revised = employees[1];
  insert.run(revised.id, 5, 10, 'per_minute', null, 1500, null, periodStartOf(0), now);
  return revised;
}

function seedHolidays(now) {
  const insert = db.prepare(
    'INSERT INTO holidays (date, name, is_estimate, created_at) VALUES (?, ?, ?, ?)'
  );
  const year = new Date().getFullYear();
  const added = [];
  for (const h of nationalHolidays(year, COMPANY_WORK_DAYS)) {
    insert.run(h.date, h.name, h.isEstimate ? 1 : 0, now);
    added.push(h);
  }
  return added;
}

/* Menyusun satu hari absensi. Sebagian besar hadir tepat waktu; sisanya
   dibuat bervariasi supaya kolom potongan, izin, sakit, dan setengah hari
   sama-sama terisi di laporan. */
function buildRecord(emp, dateStr, startTime) {
  const roll = rand();

  if (roll < 0.045) return { status: 'izin', note: pick(['Acara keluarga', 'Urusan pribadi', 'Mengurus dokumen']) };
  if (roll < 0.08) return { status: 'sakit', note: pick(['Demam', 'Sakit gigi', 'Periksa ke klinik']) };
  if (roll < 0.10) return null; // tanpa catatan sama sekali -- muncul sebagai Alpa

  const startMin = timeToMinutes(startTime);
  let checkInMin;
  if (roll < 0.78) checkInMin = startMin - randInt(0, 12);      // datang lebih awal
  else if (roll < 0.92) checkInMin = startMin + randInt(1, 14); // telat tipis, masih dalam toleransi
  else checkInMin = startMin + randInt(20, 55);                 // telat jelas, kena potongan

  const half = roll > 0.955;
  return {
    status: 'hadir',
    attendanceType: half ? 'half' : 'full',
    hoursWorked: half ? 4 : 8,
    checkInTime: minutesToTime(checkInMin),
    checkOutTime: minutesToTime(timeToMinutes(half ? '12:00' : COMPANY_END) + randInt(0, 25)),
    note: ''
  };
}

function seedAttendance(employees, scheduleInfo, holidayDates, accounts, from, to) {
  const insert = db.prepare(`
    INSERT INTO attendance (employee_id, date, status, attendance_type, hours_worked, check_in_time, check_out_time, note, marked_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const emp of employees) {
    const sched = scheduleFor(emp, scheduleInfo);
    const workDays = sched.workDays.split(',').map(Number);

    let cursor = from;
    while (cursor <= to) {
      const isWorkday = workDays.includes(dayOfWeek(cursor)) && !holidayDates.has(cursor);
      if (isWorkday) {
        const rec = buildRecord(emp, cursor, sched.start);
        if (rec) {
          const markedAt = parseDateStr(cursor).getTime() + 9 * 60 * 60 * 1000;
          insert.run(
            emp.id, cursor, rec.status,
            rec.attendanceType || null, rec.hoursWorked || null,
            rec.checkInTime || null, rec.checkOutTime || null,
            rec.note || '', accounts.hr.name, markedAt
          );
          count++;
        }
      }
      cursor = addDaysStr(cursor, 1);
    }
  }
  return count;
}

/* Log perubahan diisi supaya tab Log Perubahan tidak dibuka dalam keadaan
   kosong. Isinya mencerminkan tindakan yang memang ada di data ini. */
function seedAuditLog(employees, holidays, revisedPolicyEmployee, accounts) {
  /* entity_id bertipe TEXT. Angka harus diubah ke string di sisi JS dulu --
     kalau angka mentah yang dibinding, node:sqlite mengikatnya sebagai REAL
     dan id 111 tersimpan menjadi "111.0". recordAudit() di auditLog.js sudah
     melakukan String() sendiri; di sini SQL-nya langsung, jadi harus manual. */
  const rawInsert = db.prepare(`
    INSERT INTO audit_log (account_id, account_name, action, entity, entity_id, before_json, after_json, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insert = (accountId, accountName, action, entity, entityId, before, after, reason, createdAt) =>
    rawInsert.run(accountId, accountName, action, entity, String(entityId), before, after, reason, createdAt);

  const dayMs = 24 * 60 * 60 * 1000;
  const base = parseDateStr(HISTORY_END).getTime();

  // Libur nasional diisi otomatis oleh owner -- satu peristiwa, banyak baris.
  const generateAt = base - 20 * dayMs;
  for (const h of holidays.slice(0, 9)) {
    insert(
      accounts.owner.accountId, accounts.owner.name, 'generate', 'holiday', h.date,
      null, JSON.stringify({ date: h.date, name: h.name, is_estimate: h.isEstimate ? 1 : 0 }),
      null, generateAt
    );
  }

  // Koreksi absensi beralasan -- inti dari fitur akuntabilitas.
  const target = db.prepare(
    `SELECT * FROM attendance WHERE employee_id = ? AND status = 'hadir' ORDER BY date DESC LIMIT 1`
  ).get(employees[3].id);
  if (target) {
    const before = { ...target, status: 'alpa', attendance_type: null, hours_worked: null, check_in_time: null };
    insert(
      accounts.hr.accountId, accounts.hr.name, 'update', 'attendance', target.id,
      JSON.stringify(before), JSON.stringify(target),
      'Mesin absen sempat mati pagi itu, kehadiran dikonfirmasi supervisor.',
      base - 2 * dayMs
    );
  }

  // Perubahan aturan keterlambatan, memperagakan pencatatan di luar absensi.
  const policy = db.prepare(
    'SELECT * FROM late_policies WHERE employee_id = ? ORDER BY id DESC LIMIT 1'
  ).get(revisedPolicyEmployee.id);
  if (policy) {
    insert(
      accounts.owner.accountId, accounts.owner.name, 'create', 'late_policy', policy.id,
      null, JSON.stringify(policy), null, base - 5 * dayMs
    );
  }

  // Tandai massal, satu waktu untuk seluruh rombongan supaya tampil
  // sebagai satu baris ringkas, bukan enam baris berserakan.
  const bulkDate = addDaysStr(HISTORY_END, -1);
  const bulkAt = parseDateStr(bulkDate).getTime() + 16 * 60 * 60 * 1000;
  const bulkRows = db.prepare(
    `SELECT * FROM attendance WHERE date = ? AND status = 'hadir' LIMIT 6`
  ).all(bulkDate);
  for (const row of bulkRows) {
    insert(
      accounts.hr.accountId, accounts.hr.name, 'bulk_create', 'attendance', row.id,
      null, JSON.stringify(row), null, bulkAt
    );
  }

  return db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
}

/* ---------------- Jalankan ---------------- */

/* Menyusun ulang keterangan jadwal dari isi database, supaya --topup tidak
   perlu menulis ulang tabel jadwal yang sudah ada. */
function readScheduleInfo(employees) {
  const rows = db.prepare('SELECT * FROM work_schedules WHERE employee_id IS NOT NULL').all();
  const byId = new Map(employees.map(e => [e.id, e]));
  return {
    exceptions: rows
      .filter(r => byId.has(r.employee_id))
      .map(r => ({ employee: byId.get(r.employee_id).name, workDays: r.work_days, start: r.start_time })),
    byName: new Map(employees.map(e => [e.name, e]))
  };
}

/* Data demo memakai tanggal sungguhan, jadi ia membusuk sehari sekali:
   hari kerja yang terlewat tanpa catatan langsung terhitung Alpa untuk
   semua orang. Mode ini menambal hari-hari yang belum terisi tanpa
   menyentuh apa pun yang sudah ada, supaya demo yang dipakai berhari-hari
   tidak perlu dibangun ulang dari nol. */
function topup() {
  const employees = db.prepare('SELECT id, name FROM employees WHERE deleted_at IS NULL ORDER BY id').all();
  if (employees.length === 0) {
    console.error('Belum ada data demo. Jalankan dulu: npm run seed:demo -- --force');
    process.exit(1);
  }

  const last = db.prepare('SELECT MAX(date) AS d FROM attendance').get().d;
  if (!last) {
    console.error('Belum ada riwayat absensi. Jalankan dulu: npm run seed:demo -- --force');
    process.exit(1);
  }

  const from = addDaysStr(last, 1);
  const to = addDaysStr(TODAY, -1); // hari ini tetap dibiarkan kosong
  if (from > to) {
    console.log(`\nData demo sudah mutakhir (terisi sampai ${last}). Tidak ada yang perlu ditambah.\n`);
    return;
  }

  const holidayDates = new Set(db.prepare('SELECT date FROM holidays').all().map(r => r.date));
  const accounts = { hr: { accountId: 1, name: db.prepare('SELECT name FROM accounts WHERE role = ?').get('hr').name } };
  const added = seedAttendance(employees, readScheduleInfo(employees), holidayDates, accounts, from, to);

  console.log(`\nData demo ditambal: ${added} baris absensi baru (${from} s/d ${to}).\n`);
}

function rebuild() {
  const now = Date.now();

  wipe();
  const accounts = seedAccounts(now);
  const jobIds = seedLookup('jobs', JOBS, now);
  const orgIds = seedLookup('organizations', ORGS, now);
  const employees = seedEmployees(jobIds, orgIds, now);
  const scheduleInfo = seedSchedules(employees, now);
  const revised = seedLatePolicies(employees, now);
  const holidays = seedHolidays(now);
  const holidayDates = new Set(holidays.map(h => h.date));
  const attendanceCount = seedAttendance(employees, scheduleInfo, holidayDates, accounts, HISTORY_START, HISTORY_END);
  const auditCount = seedAuditLog(employees, holidays, revised, accounts);

  console.log(`
Data demo siap.

  Karyawan          : ${employees.length}
  Jabatan / Divisi  : ${JOBS.length} / ${ORGS.length}
  Riwayat absensi   : ${attendanceCount} baris (${HISTORY_START} s/d ${HISTORY_END})
  Aturan telat      : ${employees.length + 1} versi (satu karyawan punya dua versi)
  Hari libur ${new Date().getFullYear()}   : ${holidays.length}
  Log perubahan     : ${auditCount} baris
  Jadwal perusahaan : Senin-Sabtu ${COMPANY_START}-${COMPANY_END}, 2 pengecualian per karyawan

  Login: hradmin / hr123   |   owner / owner123

  Hari ini (${TODAY}) sengaja dibiarkan kosong supaya tab Monitoring
  bisa diperagakan langsung dari keadaan belum diabsen.

  Sebelum presentasi di hari lain, jalankan: npm run seed:demo -- --topup
`);
}

if (process.argv.includes('--topup')) topup();
else rebuild();
