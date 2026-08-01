/* ============================================================
   auditView.js — Tab "Log Perubahan" (Owner only)
   Menampilkan jejak perubahan data beserta nilai sebelum dan
   sesudahnya. Hanya membaca; tidak ada tombol ubah maupun hapus.
   ============================================================ */

const AuditState = {
  entity: '',
  from: '',
  to: ''
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
  bulk_create: { label: 'Tandai Massal', style: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
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
  deduction_type: 'Jenis potongan'
};

function auditFieldLabel(key) {
  return AUDIT_FIELD_LABEL[key] || key;
}

function auditValueText(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function formatWaktuLog(ms) {
  const d = new Date(ms);
  return `${formatTanggalIndo(todayStr(d))} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* Peristiwa massal menghasilkan satu baris log per karyawan. Menampilkannya
   satu per satu menenggelamkan koreksi sungguhan, jadi yang ber-createdAt dan
   ber-action sama digabung menjadi satu baris ringkas. */
function groupBulkEntries(entries) {
  const grouped = [];
  const bulkByKey = new Map();

  for (const entry of entries) {
    if (entry.action !== 'bulk_create') {
      grouped.push({ kind: 'single', entry });
      continue;
    }
    const key = `${entry.createdAt}|${entry.accountId}`;
    if (bulkByKey.has(key)) {
      bulkByKey.get(key).members.push(entry);
      continue;
    }
    const group = { kind: 'bulk', entry, members: [entry] };
    bulkByKey.set(key, group);
    grouped.push(group);
  }
  return grouped;
}

function renderDiff(before, after) {
  if (!before && !after) return '';

  // Hanya kolom yang benar-benar berubah yang ditampilkan; sisanya cuma
  // memanjangkan baris tanpa menambah informasi.
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter(k => !AUDIT_HIDDEN_FIELDS.includes(k))
    .filter(k => !before || !after || before[k] !== after[k]);

  if (keys.length === 0) return '';

  return `
    <div class="mt-2 border border-slate-200 rounded-lg overflow-hidden">
      <table class="w-full text-xs">
        <tbody>
          ${keys.map(key => `
            <tr class="border-b border-slate-100 last:border-0">
              <td class="px-3 py-1.5 text-slate-500 w-40 align-top">${escapeHtml(auditFieldLabel(key))}</td>
              <td class="px-3 py-1.5 text-slate-400 line-through align-top">${escapeHtml(auditValueText(before && before[key]))}</td>
              <td class="px-3 py-1.5 text-slate-700 font-medium align-top">${escapeHtml(auditValueText(after && after[key]))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAuditRow(group) {
  const entry = group.entry;
  const action = AUDIT_ACTION[entry.action] || { label: entry.action, style: 'bg-slate-100 text-slate-600 border-slate-200' };
  const entityLabel = AUDIT_ENTITY_LABEL[entry.entity] || entry.entity;

  const subject = group.kind === 'bulk'
    ? `${group.members.length} karyawan ditandai hadir sekaligus`
    : `${entityLabel} #${escapeHtml(entry.entityId)}`;

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
