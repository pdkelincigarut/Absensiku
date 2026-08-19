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

/* ---------------- Format uang ----------------

   Semua nominal rupiah di aplikasi ini lewat sini, baik yang ditampilkan
   maupun yang sedang diketik, supaya tidak ada satu tempat pun yang
   menampilkan angka gundul tanpa pemisah ribuan. */

/* 1500000 -> "1.500.000". Memakai locale id-ID, bukan menyisipkan titik
   sendiri tiap tiga angka: cara manual selalu salah untuk angka negatif dan
   pecahan, dan di sini nilainya dibulatkan lebih dulu supaya tidak pernah
   muncul koma di kolom upah. */
function formatRibuan(n) {
  const angka = Math.round(Number(n) || 0);
  return angka.toLocaleString('id-ID');
}

function formatRupiah(n) {
  return 'Rp' + formatRibuan(n);
}

/* "Rp1.500.000" / "1.500.000" / "1500000" -> 1500000.
   Membuang SEMUA yang bukan angka, jadi titik pemisah, "Rp", dan spasi
   sama-sama hilang. Kotak kosong menghasilkan null, bukan 0 -- keduanya
   berbeda arti: "belum diisi" tidak sama dengan "nol rupiah". */
function parseRupiah(teks) {
  const angkaSaja = String(teks == null ? '' : teks).replace(/\D/g, '');
  if (angkaSaja === '') return null;
  return Number(angkaSaja);
}

/* Menyulap sebuah <input type="text"> jadi kotak nominal rupiah yang
   memberi titik pemisah sambil diketik.

   Kenapa bukan <input type="number"> saja: kotak angka bawaan browser
   menolak nilai yang mengandung titik pemisah -- begitu diisi "1.500.000"
   nilainya dianggap tidak sah dan .value berubah jadi string kosong. Jadi
   pemisah ribuan dan type="number" memang tidak bisa berjalan bersamaan.

   Kursor dipulihkan berdasarkan JUMLAH ANGKA di sebelah kirinya, bukan
   posisi karakter: penambahan satu titik menggeser semua karakter di
   kanannya, sehingga mengembalikan kursor ke posisi karakter yang sama akan
   membuatnya melompat mundur satu huruf setiap kali melewati kelipatan
   ribuan. */
function pasangInputRupiah(input, onChange) {
  const tulisUlang = () => {
    const posisi = input.selectionStart;
    const angkaSebelumKursor = input.value.slice(0, posisi).replace(/\D/g, '').length;

    const nilai = parseRupiah(input.value);
    input.value = nilai === null ? '' : formatRibuan(nilai);

    /* Cari letak karakter tepat setelah angka ke-N pada teks yang baru. */
    let posisiBaru = input.value.length;
    let terhitung = 0;
    for (let i = 0; i < input.value.length; i++) {
      if (/\d/.test(input.value[i])) terhitung++;
      if (terhitung === angkaSebelumKursor) { posisiBaru = i + 1; break; }
    }
    if (angkaSebelumKursor === 0) posisiBaru = 0;
    input.setSelectionRange(posisiBaru, posisiBaru);
  };

  input.addEventListener('input', () => {
    tulisUlang();
    if (onChange) onChange(parseRupiah(input.value));
  });

  // Nilai awal dari server ikut dirapikan, bukan hanya yang diketik.
  if (input.value !== '') input.value = formatRibuan(parseRupiah(input.value));
}

/* ---------------- HTTP helper (dipakai Storage & Auth) ---------------- */

/* Dipanggil sekali saja walau banyak permintaan gagal berbarengan. Satu
   halaman bisa menembak lima endpoint sekaligus; tanpa penjaga ini halaman
   login digambar ulang lima kali dan pesannya berkedip. */
let sedangKembaliKeLogin = false;

function kembaliKeLoginKarenaSesiHabis() {
  if (sedangKembaliKeLogin) return;
  sedangKembaliKeLogin = true;

  /* Timer panel yang sedang berjalan harus dihentikan dulu. Kalau tidak,
     polling monitoring tetap menembak endpoint yang sudah pasti 401 dan
     memicu ini lagi dari belakang halaman login. */
  if (typeof stopHeaderClock === 'function') stopHeaderClock();
  if (typeof OwnerState !== 'undefined' && OwnerState.monitorTimer) clearInterval(OwnerState.monitorTimer);
  if (typeof HrState !== 'undefined' && HrState.monitorTimer) clearInterval(HrState.monitorTimer);
  if (typeof KioskState !== 'undefined' && KioskState.timer) hentikanKiosk();

  renderLogin('Sesi Anda sudah berakhir. Silakan masuk lagi.');
  sedangKembaliKeLogin = false;
}

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
    /* Sesi habis (cookie berumur 12 jam) ditangani di sini, satu tempat untuk
       semua panel. Sebelumnya tiap panel menampilkan "Gagal memuat data:
       Belum login." di tengah layar merah, tanpa tombol apa pun -- dan itu
       yang dilihat HR tiap pagi setelah aplikasi ditinggal semalam. Layar
       buntu, bukan pesan.

       Pengecualian /api/login: 401 di sana berarti password salah, dan
       melempar orang kembali ke halaman login yang sedang dia isi akan
       menghapus ketikannya sendiri. */
    if (res.status === 401 && !url.endsWith('/api/login')) {
      kembaliKeLoginKarenaSesiHabis();
    }
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

  /* Kios absen mandiri. Tidak ada sesi di balik ini -- server sengaja
     membuka route-nya tanpa login, dan membatasi sendiri apa yang boleh
     dilakukan dari sana. */
  async getKioskEmployees() {
    return apiRequest('GET', '/api/kiosk/employees');
  },
  async kioskCheckIn(employeeId) {
    return apiRequest('POST', `/api/kiosk/check-in/${employeeId}`);
  },
  async kioskCheckOut(employeeId) {
    return apiRequest('POST', `/api/kiosk/check-out/${employeeId}`);
  },
  /* Yang dikirim cuma satu descriptor hasil kamera. Server yang menentukan
     itu wajah siapa, dan server juga yang memutuskan ini absen masuk atau
     jam pulang -- halaman kios tidak pernah memegang data wajah siapa pun. */
  async kioskFaceCheckIn(descriptor, photo) {
    return apiRequest('POST', '/api/kiosk/face/check-in', { descriptor, photo });
  },

  async getFaceEnrollments() {
    return apiRequest('GET', '/api/face/enrollments');
  },
  async saveFaceEnrollment(employeeId, descriptors) {
    return apiRequest('POST', `/api/face/enroll/${employeeId}`, { descriptors });
  },
  async deleteFaceEnrollment(employeeId) {
    return apiRequest('DELETE', `/api/face/enroll/${employeeId}`);
  },
  async getFacePhotos(filter) {
    const params = new URLSearchParams();
    for (const key of ['date', 'employeeId']) {
      if (filter && filter[key]) params.set(key, filter[key]);
    }
    const query = params.toString();
    return apiRequest('GET', `/api/face/photos${query ? `?${query}` : ''}`);
  },

  async recordCheckOut(employeeId, date) {
    // jam diambil dari jam server, tidak ada yang dikirim dari sini
    return apiRequest('POST', `/api/attendance/${employeeId}/${date}/check-out`);
  }
};
