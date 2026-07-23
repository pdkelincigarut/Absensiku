/* ============================================================
   storage.js — Data layer (localStorage)
   Semua data disimpan di localStorage agar mudah diuji coba
   tanpa backend. Bukan untuk produksi (password disimpan polos).
   ============================================================ */

const DB_ACCOUNTS = 'att_accounts';
const DB_EMPLOYEES = 'att_employees';
const DB_ATTENDANCE = 'att_attendance';
const DB_SESSION = 'att_session';

const HARI_INDO = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jumat", 'Sabtu'];
const BULAN_INDO = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function pad2(n) { return String(n).padStart(2, '0'); }

function todayStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function nowTimeStr() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function formatTanggalIndo(dateStr) {
  const bulanSingkat = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const [y, m, d] = dateStr.split('-').map(Number);
  return d + ' ' + bulanSingkat[m - 1] + ' ' + y;
}

function formatHariTanggalIndo(d) {
  d = d || new Date();
  return HARI_INDO[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN_INDO[d.getMonth()] + ' ' + d.getFullYear();
}

function isBirthdayToday(birthDateStr) {
  if (!birthDateStr) return false;
  const [, m, d] = birthDateStr.split('-').map(Number);
  const now = new Date();
  return m === now.getMonth() + 1 && d === now.getDate();
}

const Storage = {
  getAccounts() {
    return JSON.parse(localStorage.getItem(DB_ACCOUNTS) || '[]');
  },
  saveAccounts(accounts) {
    localStorage.setItem(DB_ACCOUNTS, JSON.stringify(accounts));
  },
  getAccountById(id) {
    return this.getAccounts().find(a => a.id === id) || null;
  },

  getEmployees() {
    return JSON.parse(localStorage.getItem(DB_EMPLOYEES) || '[]');
  },
  saveEmployees(employees) {
    localStorage.setItem(DB_EMPLOYEES, JSON.stringify(employees));
  },
  getEmployeeById(id) {
    return this.getEmployees().find(e => e.id === id) || null;
  },
  upsertEmployee(employee) {
    const employees = this.getEmployees();
    const idx = employees.findIndex(e => e.id === employee.id);
    if (idx >= 0) employees[idx] = employee; else employees.push(employee);
    this.saveEmployees(employees);
  },
  deleteEmployee(id) {
    this.saveEmployees(this.getEmployees().filter(e => e.id !== id));
  },

  getAttendance() {
    return JSON.parse(localStorage.getItem(DB_ATTENDANCE) || '[]');
  },
  saveAttendance(records) {
    localStorage.setItem(DB_ATTENDANCE, JSON.stringify(records));
  },
  getRecordForDate(employeeId, dateStr) {
    return this.getAttendance().find(r => r.employeeId === employeeId && r.date === dateStr) || null;
  },
  upsertAttendance(record) {
    const records = this.getAttendance();
    const idx = records.findIndex(r => r.employeeId === record.employeeId && r.date === record.date);
    if (idx >= 0) records[idx] = { ...records[idx], ...record };
    else records.push(record);
    this.saveAttendance(records);
  },

  getSession() {
    return JSON.parse(localStorage.getItem(DB_SESSION) || 'null');
  },
  setSession(accountId) {
    localStorage.setItem(DB_SESSION, JSON.stringify(accountId));
  },
  clearSession() {
    localStorage.removeItem(DB_SESSION);
  },

  seed() {
    if (this.getAccounts().length === 0) {
      this.saveAccounts([
        { id: 'acc-hr', name: 'Rina (HR)', username: 'hradmin', password: 'hr123', role: 'hr', createdAt: Date.now() },
        { id: 'acc-owner', name: 'Admin Owner', username: 'owner', password: 'owner123', role: 'owner', createdAt: Date.now() },
      ]);
    }
    if (this.getEmployees().length === 0) {
      const todayMd = todayStr().slice(5); // 'MM-DD' hari ini, untuk demo ulang tahun
      this.saveEmployees([
        { id: 'emp-budi', name: 'Budi Santoso', dailyWage: 100000, birthDate: `1995-${todayMd}`, active: true, createdAt: Date.now() },
        { id: 'emp-siti', name: 'Siti Aminah', dailyWage: 100000, birthDate: '1998-03-12', active: true, createdAt: Date.now() },
        { id: 'emp-andi', name: 'Andi Wijaya', dailyWage: 120000, birthDate: '1992-11-05', active: true, createdAt: Date.now() },
      ]);
    }
  }
};
