/* ============================================================
   storage.js — Data layer (localStorage)
   Semua data disimpan di localStorage agar mudah diuji coba
   tanpa backend. Bukan untuk produksi (password disimpan polos).
   ============================================================ */

const DB_USERS = 'att_users';
const DB_ATTENDANCE = 'att_attendance';
const DB_SESSION = 'att_session';

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
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const [y, m, d] = dateStr.split('-').map(Number);
  return d + ' ' + bulan[m - 1] + ' ' + y;
}

const Storage = {
  getUsers() {
    return JSON.parse(localStorage.getItem(DB_USERS) || '[]');
  },
  saveUsers(users) {
    localStorage.setItem(DB_USERS, JSON.stringify(users));
  },
  getUserById(id) {
    return this.getUsers().find(u => u.id === id) || null;
  },
  upsertUser(user) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = user; else users.push(user);
    this.saveUsers(users);
  },

  getAttendance() {
    return JSON.parse(localStorage.getItem(DB_ATTENDANCE) || '[]');
  },
  saveAttendance(records) {
    localStorage.setItem(DB_ATTENDANCE, JSON.stringify(records));
  },
  getRecordForDate(userId, dateStr) {
    return this.getAttendance().find(r => r.userId === userId && r.date === dateStr) || null;
  },
  upsertAttendance(record) {
    const records = this.getAttendance();
    const idx = records.findIndex(r => r.userId === record.userId && r.date === record.date);
    if (idx >= 0) records[idx] = { ...records[idx], ...record };
    else records.push(record);
    this.saveAttendance(records);
  },

  getSession() {
    return JSON.parse(localStorage.getItem(DB_SESSION) || 'null');
  },
  setSession(userId) {
    localStorage.setItem(DB_SESSION, JSON.stringify(userId));
  },
  clearSession() {
    localStorage.removeItem(DB_SESSION);
  },

  seed() {
    if (this.getUsers().length === 0) {
      this.saveUsers([
        { id: 'u-owner', name: 'Admin Owner', username: 'owner', password: 'owner123', role: 'owner', createdAt: Date.now() },
        { id: 'u-budi', name: 'Budi Santoso', username: 'budi', password: 'budi123', role: 'karyawan', dailyWage: 100000, createdAt: Date.now() },
        { id: 'u-siti', name: 'Siti Aminah', username: 'siti', password: 'siti123', role: 'karyawan', dailyWage: 100000, createdAt: Date.now() },
        { id: 'u-andi', name: 'Andi Wijaya', username: 'andi', password: 'andi123', role: 'karyawan', dailyWage: 120000, createdAt: Date.now() },
      ]);
    }
  }
};
