/* ============================================================
   storage.js — Data layer (fetch ke backend, bukan localStorage lagi)
   Fungsi format tanggal/jam di bawah tetap murni (tidak menyentuh
   data), tidak berubah dari versi sebelumnya.
   ============================================================ */

const HARI_INDO = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jumat", 'Sabtu'];
const BULAN_INDO = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

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

/* ---------------- HTTP helper (dipakai Storage & Auth) ---------------- */

async function apiRequest(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* respons tanpa body, biarkan null */ }
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || `Request gagal (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const Storage = {
  async getEmployees() {
    return apiRequest('GET', '/api/employees');
  },
  async getEmployeeById(id) {
    const employees = await this.getEmployees();
    return employees.find(e => String(e.id) === String(id)) || null;
  },
  async upsertEmployee(record) {
    if (record.id) return apiRequest('PUT', `/api/employees/${record.id}`, record);
    return apiRequest('POST', '/api/employees', record);
  },
  async deleteEmployee(id) {
    return apiRequest('DELETE', `/api/employees/${id}`);
  },

  async getAttendanceForDate(date) {
    return apiRequest('GET', `/api/attendance?date=${encodeURIComponent(date)}`);
  },
  async upsertAttendance(record) {
    // checkInTime sengaja TIDAK dikirim -- server yang mengisi dari jam server
    return apiRequest('PUT', `/api/attendance/${record.employeeId}/${record.date}`, {
      status: record.status,
      attendanceType: record.attendanceType,
      hoursWorked: record.hoursWorked,
      note: record.note,
      // Wajib saat mengubah absensi yang sudah tercatat, diabaikan saat baru
      reason: record.reason
    });
  },
  async bulkMarkAttendance(date, employeeIds) {
    return apiRequest('POST', '/api/attendance/bulk-mark', { date, employeeIds });
  },
  async getAttendanceHistory({ employeeId, month }) {
    const params = new URLSearchParams({ month });
    if (employeeId) params.set('employeeId', employeeId);
    return apiRequest('GET', `/api/attendance/history?${params.toString()}`);
  },

  async getPayroll(periodOffset) {
    return apiRequest('GET', `/api/payroll?periodOffset=${periodOffset}`);
  },
  async getPayrollPeriods() {
    return apiRequest('GET', '/api/payroll/periods');
  },

  async getLatePolicies() {
    return apiRequest('GET', '/api/late-policies');
  },
  async saveLatePolicies(payload) {
    return apiRequest('PUT', '/api/late-policies', payload);
  },
  async deleteLatePolicy(employeeId) {
    return apiRequest('DELETE', `/api/late-policies/${employeeId}`);
  },

  async getJobs() {
    return apiRequest('GET', '/api/jobs');
  },
  async saveJob(record) {
    if (record.id) return apiRequest('PUT', `/api/jobs/${record.id}`, { name: record.name });
    return apiRequest('POST', '/api/jobs', { name: record.name });
  },
  async deleteJob(id) {
    return apiRequest('DELETE', `/api/jobs/${id}`);
  },

  async getOrganizations() {
    return apiRequest('GET', '/api/organizations');
  },
  async saveOrganization(record) {
    if (record.id) return apiRequest('PUT', `/api/organizations/${record.id}`, { name: record.name });
    return apiRequest('POST', '/api/organizations', { name: record.name });
  },
  async deleteOrganization(id) {
    return apiRequest('DELETE', `/api/organizations/${id}`);
  },

  async getWorkSchedules() {
    return apiRequest('GET', '/api/work-schedules');
  },
  async saveWorkSchedule(payload) {
    return apiRequest('PUT', '/api/work-schedules', payload);
  },
  async deleteWorkSchedule(id) {
    return apiRequest('DELETE', `/api/work-schedules/${id}`);
  },

  async getHolidays(year) {
    const suffix = year ? `?year=${encodeURIComponent(year)}` : '';
    return apiRequest('GET', `/api/holidays${suffix}`);
  },
  async saveHoliday(record) {
    return apiRequest('POST', '/api/holidays', record);
  },
  async deleteHoliday(date) {
    return apiRequest('DELETE', `/api/holidays/${date}`);
  },
  async generateHolidays(year) {
    return apiRequest('POST', '/api/holidays/generate', { year });
  },
  async confirmHoliday(date) {
    return apiRequest('PATCH', `/api/holidays/${date}/confirm`);
  },

  async getAuditLog(filter) {
    const params = new URLSearchParams();
    for (const key of ['entity', 'entityId', 'from', 'to', 'limit']) {
      if (filter && filter[key]) params.set(key, filter[key]);
    }
    const query = params.toString();
    return apiRequest('GET', `/api/audit-log${query ? `?${query}` : ''}`);
  },

  async recordCheckOut(employeeId, date) {
    // jam diambil dari jam server, tidak ada yang dikirim dari sini
    return apiRequest('POST', `/api/attendance/${employeeId}/${date}/check-out`);
  }
};
