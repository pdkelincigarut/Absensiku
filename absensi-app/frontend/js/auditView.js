/* ============================================================
   auditView.js — Tab "Log Perubahan" (Owner only)
   Menampilkan jejak perubahan data beserta nilai sebelum dan
   sesudahnya. Hanya membaca; tidak ada tombol ubah maupun hapus.
   ============================================================ */

const AuditState = {
  entity: '',
  from: '',
  to: '',
  // id karyawan -> nama, supaya log bisa menyebut orangnya, bukan nomornya
  employeeNames: new Map()
};

const AUDIT_ENTITY_LABEL = {
  attendance: 'Absensi',
  employee: 'Karyawan',
  holiday: 'Hari Libur',
  work_schedule: 'Jadwal Kerja',
  late_policy: 'Aturan Keterlambatan',
  jobs: 'Jabatan',
  organizations: 'Divisi'
};

const AUDIT_ACTION = {
  create: { label: 'Tambah', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  update: { label: 'Ubah', style: 'bg-amber-50 text-amber-700 border-amber-200' },
  delete: { label: 'Hapus', style: 'bg-rose-50 text-rose-700 border-rose-200' },
  bulk_create: { label: 'Tandai Massal', style: 'bg-klc-50 text-klc-700 border-klc-200' },
  generate: { label: 'Isi Otomatis', style: 'bg-sky-50 text-sky-700 border-sky-200' },
  confirm: { label: 'Konfirmasi', style: 'bg-slate-100 text-slate-600 border-slate-200' },
  check_out: { label: 'Jam Pulang', style: 'bg-slate-100 text-slate-600 border-slate-200' }
};

/* Kolom yang tidak berguna dibaca manusia: id tidak pernah berubah, dan
   updated_at/created_at selalu berubah sehingga cuma jadi derau. */
const AUDIT_HIDDEN_FIELDS = ['id', 'updated_at', 'created_at', 'photo_updated_at', 'photo_mime'];

const AUDIT_FIELD_LABEL = {
  status: 'Status',
  attendance_type: 'Tipe kehadiran',
  hours_worked: 'Jam kerja',
  check_in_time: 'Jam masuk',
  check_out_time: 'Jam pulang',
  note: 'Catatan',
  marked_by: 'Ditandai oleh',
  name: 'Nama',
  daily_wage: 'Upah harian',
  employee_code: 'Kode karyawan',
  birth_date: 'Tanggal lahir',
  active: 'Aktif',
  deleted_at: 'Dihapus pada',
  date: 'Tanggal',
  is_estimate: 'Perkiraan',
  work_days: 'Hari kerja',
  start_time: 'Jam masuk',
  end_time: 'Jam pulang',
  effective_from: 'Berlaku sejak',
  grace_minutes: 'Toleransi (menit)',
  threshold_minutes: 'Ambang potongan (menit)',
  deduction_type: 'Jenis potongan',
  deduction_flat_amount: 'Potongan tetap',
  deduction_per_minute_amount: 'Potongan per menit',
  deduction_percentage: 'Potongan (persen)',
  employee_id: 'Karyawan',
  job_id: 'Jabatan',
  organization_id: 'Divisi',
  is_seeded: 'Bawaan sistem'
};

function auditFieldLabel(key) {
  return AUDIT_FIELD_LABEL[key] || key;
}

/* Nilai mentah dari database sering tidak terbaca manusia: id karyawan,
   0/1 untuk ya-tidak, dan tanggal berupa milidetik epoch. */
function auditValueDisplay(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'employee_id') {
    const nama = AuditState.employeeNames.get(Number(value));
    return nama || `#${value}`;
  }
  if (['active', 'is_estimate', 'is_seeded'].includes(key)) return value ? 'Ya' : 'Tidak';
  if (key === 'deleted_at') return formatWaktuLog(Number(value));
  if (['daily_wage', 'deduction_flat_amount', 'deduction_per_minute_amount'].includes(key)) {
    return 'Rp' + Number(value).toLocaleString('id-ID');
  }
  if (['date', 'birth_date', 'effective_from'].includes(key)) {
    // effective_from bawaan migrasi memakai 1970-01-01 sebagai penanda
    // "berlaku sejak awal", bukan tanggal sungguhan.
    return value === '1970-01-01' ? 'Sejak awal' : formatTanggalIndo(String(value));
  }
  if (key === 'deduction_type') {
    return { flat: 'Potongan tetap', per_minute: 'Per menit telat', percentage: 'Persentase gaji' }[value] || value;
  }
  if (key === 'status') {
    return { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpa: 'Alpa' }[value] || value;
  }
  if (key === 'attendance_type') {
    return { full: 'Sehari penuh', half: 'Setengah hari', custom: 'Jam tertentu' }[value] || value;
  }
  if (key === 'work_days') {
    const nama = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return String(value).split(',').map(n => nama[Number(n)]).join(', ');
  }
  return String(value);
}

function formatWaktuLog(ms) {
  const d = new Date(ms);
  return `${formatTanggalIndo(todayStr(d))} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* Satu klik bisa menghasilkan banyak baris log: menandai seluruh karyawan
   hadir, atau mengisi libur nasional setahun sekaligus. Menampilkannya satu
   per satu menenggelamkan koreksi sungguhan, jadi baris ber-action dan
   ber-createdAt sama digabung menjadi satu baris ringkas. */
const AUDIT_GROUPED_ACTIONS = ['bulk_create', 'generate'];

function bulkSummary(action, jumlah) {
  if (action === 'generate') return `${jumlah} hari libur diisi otomatis`;
  return `${jumlah} karyawan ditandai hadir sekaligus`;
}

function groupBulkEntries(entries) {
  const grouped = [];
  const bulkByKey = new Map();

  for (const entry of entries) {
    if (!AUDIT_GROUPED_ACTIONS.includes(entry.action)) {
      grouped.push({ kind: 'single', entry });
      continue;
    }
    const key = `${entry.action}|${entry.createdAt}|${entry.accountId}`;
    if (bulkByKey.has(key)) {
      bulkByKey.get(key).members.push(entry);
      continue;
    }
    const group = { kind: 'bulk', entry, members: [entry] };
    bulkByKey.set(key, group);
    grouped.push(group);
  }

  // Satu baris yang kebetulan sendirian tidak perlu diringkas -- lebih
  // berguna ditampilkan lengkap dengan isinya seperti baris biasa.
  return grouped.map(g => (g.kind === 'bulk' && g.members.length === 1) ? { kind: 'single', entry: g.entry } : g);
}

function renderDiff(before, after) {
  if (!before && !after) return '';

  // Hanya kolom yang benar-benar berubah yang ditampilkan; sisanya cuma
  // memanjangkan baris tanpa menambah informasi.
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter(k => !AUDIT_HIDDEN_FIELDS.includes(k))
    .filter(k => !before || !after || before[k] !== after[k]);

  if (keys.length === 0) return '';

  /* Penambahan dan penghapusan tidak punya sisi pembanding, jadi kolom
     "sebelum"-nya akan berisi strip di setiap baris. Satu kolom nilai saja
     lebih terbaca daripada satu kolom penuh tanda hubung. */
  const oneSided = !before || !after;
  const source = before || after;

  return `
    <div class="mt-2 border border-slate-200 rounded-lg overflow-hidden">
      <table class="w-full text-xs">
        <tbody>
          ${keys.map(key => `
            <tr class="border-b border-slate-100 last:border-0">
              <td class="px-3 py-1.5 text-slate-500 w-40 align-top">${escapeHtml(auditFieldLabel(key))}</td>
              ${oneSided ? `
                <td class="px-3 py-1.5 align-top ${before ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}">${escapeHtml(auditValueDisplay(key, source[key]))}</td>
              ` : `
                <td class="px-3 py-1.5 text-slate-400 line-through align-top">${escapeHtml(auditValueDisplay(key, before[key]))}</td>
                <td class="px-3 py-1.5 text-slate-700 font-medium align-top">${escapeHtml(auditValueDisplay(key, after[key]))}</td>
              `}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* "Absensi #111" tidak berarti apa-apa bagi owner. Nama orang dan tanggalnya
   diambil dari isi snapshot, yang memang sudah tersimpan utuh. */
function entrySubject(entry, entityLabel) {
  const data = entry.after || entry.before || {};

  if (entry.entity === 'attendance') {
    const nama = AuditState.employeeNames.get(Number(data.employee_id));
    const tanggal = data.date ? formatTanggalIndo(data.date) : '';
    if (nama && tanggal) return `Absensi ${nama} · ${tanggal}`;
    if (tanggal) return `Absensi ${tanggal}`;
  }
  if (entry.entity === 'employee' && data.name) return `Karyawan ${data.name}`;
  if (entry.entity === 'holiday') {
    const tanggal = data.date ? formatTanggalIndo(data.date) : entry.entityId;
    return data.name ? `${data.name} · ${tanggal}` : `Hari libur ${tanggal}`;
  }
  if ((entry.entity === 'late_policy' || entry.entity === 'work_schedule') && data.employee_id) {
    const nama = AuditState.employeeNames.get(Number(data.employee_id));
    if (nama) return `${entityLabel} · ${nama}`;
  }
  if (entry.entity === 'work_schedule' && !data.employee_id) return 'Jadwal baku perusahaan';
  if ((entry.entity === 'jobs' || entry.entity === 'organizations') && data.name) {
    return `${entityLabel} ${data.name}`;
  }
  return `${entityLabel} #${entry.entityId}`;
}

function renderAuditRow(group) {
  const entry = group.entry;
  const action = AUDIT_ACTION[entry.action] || { label: entry.action, style: 'bg-slate-100 text-slate-600 border-slate-200' };
  const entityLabel = AUDIT_ENTITY_LABEL[entry.entity] || entry.entity;

  const subject = group.kind === 'bulk'
    ? escapeHtml(bulkSummary(entry.action, group.members.length))
    : escapeHtml(entrySubject(entry, entityLabel));

  return `
    <div class="border border-slate-200 rounded-xl bg-white p-4">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs px-2 py-0.5 rounded-full border ${action.style}">${escapeHtml(action.label)}</span>
            <span class="text-sm font-medium text-slate-700">${subject}</span>
          </div>
          <p class="text-xs text-slate-400 mt-1">
            ${escapeHtml(entry.accountName)} &middot; ${escapeHtml(formatWaktuLog(entry.createdAt))}
          </p>
        </div>
      </div>

      ${entry.reason ? `
        <p class="mt-2 text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <span class="text-amber-700 font-medium">Alasan:</span> ${escapeHtml(entry.reason)}
        </p>
      ` : ''}

      ${group.kind === 'bulk' ? '' : renderDiff(entry.before, entry.after)}
    </div>
  `;
}

async function renderAuditTab() {
  const container = document.getElementById('owner-content');

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
      <div>
        <label class="text-sm text-slate-500 block mb-1">Jenis data</label>
        <select id="audit-entity" class="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Semua</option>
          ${Object.entries(AUDIT_ENTITY_LABEL).map(([value, label]) =>
            `<option value="${value}" ${AuditState.entity === value ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>
      <div>
        <label class="text-sm text-slate-500 block mb-1">Dari tanggal</label>
        <input type="date" id="audit-from" value="${AuditState.from}" class="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="text-sm text-slate-500 block mb-1">Sampai tanggal</label>
        <input type="date" id="audit-to" value="${AuditState.to}" class="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      <button id="audit-reset" class="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50">Reset</button>
    </div>

    <div id="audit-list" class="space-y-3">
      <p class="text-sm text-slate-400 text-center py-8">Memuat…</p>
    </div>
  `;

  const reload = () => loadAuditList();

  document.getElementById('audit-entity').addEventListener('change', (e) => {
    AuditState.entity = e.target.value;
    reload();
  });
  document.getElementById('audit-from').addEventListener('change', (e) => {
    AuditState.from = e.target.value;
    reload();
  });
  document.getElementById('audit-to').addEventListener('change', (e) => {
    AuditState.to = e.target.value;
    reload();
  });
  document.getElementById('audit-reset').addEventListener('click', () => {
    AuditState.entity = '';
    AuditState.from = '';
    AuditState.to = '';
    renderAuditTab();
  });

  loadAuditList();
}

async function loadAuditList() {
  const listEl = document.getElementById('audit-list');
  if (!listEl) return;

  /* Dimuat sekali, bukan per baris log: satu daftar karyawan cukup untuk
     menerjemahkan semua employee_id yang muncul. Karyawan yang sudah dihapus
     tidak ada di daftar ini, dan itu memang salah satu alasan nama ikut
     disalin ke dalam snapshot. */
  if (AuditState.employeeNames.size === 0) {
    try {
      const employees = await Storage.getEmployees();
      AuditState.employeeNames = new Map(employees.map(e => [e.id, e.name]));
    } catch (err) {
      // Gagal memuat nama bukan alasan menyembunyikan seluruh log --
      // entrySubject() jatuh kembali ke nomor id.
    }
  }

  let entries;
  try {
    entries = await Storage.getAuditLog({
      entity: AuditState.entity,
      from: AuditState.from,
      to: AuditState.to,
      limit: 200
    });
  } catch (err) {
    listEl.innerHTML = `<p class="text-sm text-rose-500 text-center py-8">Gagal memuat log: ${escapeHtml(err.message)}</p>`;
    return;
  }

  if (entries.length === 0) {
    listEl.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Belum ada perubahan yang tercatat untuk filter ini.</p>`;
    return;
  }

  listEl.innerHTML = groupBulkEntries(entries).map(renderAuditRow).join('');
}
