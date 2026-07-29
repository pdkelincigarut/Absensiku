/* ============================================================
   latePolicy.js — Tab "Aturan Keterlambatan" (Owner)
   Owner memilih beberapa karyawan lewat ceklis, lalu mengisi
   satu form yang berlaku untuk semua yang dipilih. Perhitungan
   potongannya sendiri dilakukan di server (routes/payroll.js).
   ============================================================ */

const LatePolicyState = {
  selected: new Set()
};

function deductionSummary(policy) {
  if (policy.deductionType === 'flat') return `${formatRupiah(policy.deductionFlatAmount)} (tetap)`;
  if (policy.deductionType === 'per_minute') return `${formatRupiah(policy.deductionPerMinuteAmount)}/menit`;
  return `${policy.deductionPercentage}% dari gaji`;
}

async function renderLatePolicyTab() {
  const container = document.getElementById('owner-content');
  container.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Memuat...</p>`;

  let list;
  try {
    list = await Storage.getLatePolicies();
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-rose-500 text-center py-8">Gagal memuat data: ${escapeHtml(err.message)}</p>`;
    return;
  }

  // buang pilihan atas karyawan yang sudah tidak ada lagi
  const validIds = new Set(list.map(r => r.employeeId));
  LatePolicyState.selected.forEach(id => { if (!validIds.has(id)) LatePolicyState.selected.delete(id); });

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <h2 class="font-semibold text-slate-700" id="lp-count">0 karyawan dipilih</h2>
      <button id="btn-set-policy" class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed sm:ml-auto" disabled>Atur Aturan</button>
    </div>
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th class="px-4 py-2.5 w-10"><input type="checkbox" id="lp-check-all" class="accent-indigo-600" /></th>
              <th class="px-4 py-2.5 font-medium">Nama</th>
              <th class="px-4 py-2.5 font-medium">Jam Batas Masuk</th>
              <th class="px-4 py-2.5 font-medium">Toleransi</th>
              <th class="px-4 py-2.5 font-medium">Skema Potongan</th>
              <th class="px-4 py-2.5 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody id="lp-tbody" class="divide-y divide-slate-100"></tbody>
        </table>
      </div>
    </div>
    <p class="text-xs text-slate-400 mt-4">Keterlambatan dihitung dari jam masuk yang tercatat otomatis saat HR menceklis "hadir". Total menit telat diakumulasi sepanjang periode gaji (27&ndash;26); potongan baru berlaku kalau totalnya melewati toleransi. Karyawan tanpa aturan tidak pernah terkena potongan.</p>
  `;

  const tbody = document.getElementById('lp-tbody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">Belum ada karyawan.</td></tr>`;
  } else {
    tbody.innerHTML = list.map(row => {
      const p = row.latePolicy;
      return `
        <tr>
          <td class="px-4 py-2.5"><input type="checkbox" data-id="${row.employeeId}" class="lp-check accent-indigo-600" ${LatePolicyState.selected.has(row.employeeId) ? 'checked' : ''} /></td>
          <td class="px-4 py-2.5 text-slate-700">${escapeHtml(row.name)}</td>
          <td class="px-4 py-2.5 ${p ? 'text-slate-700 font-mono' : 'text-slate-400'}">${p ? escapeHtml(p.checkInLimit) : 'Belum diatur'}</td>
          <td class="px-4 py-2.5 text-slate-600">${p ? p.thresholdMinutes + ' menit' : '&mdash;'}</td>
          <td class="px-4 py-2.5 text-slate-600">${p ? escapeHtml(deductionSummary(p)) : '&mdash;'}</td>
          <td class="px-4 py-2.5 text-right">
            ${p ? `<button data-id="${row.employeeId}" data-name="${escapeHtml(row.name)}" class="lp-delete text-rose-600 hover:underline text-sm font-medium">Hapus aturan</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  const refreshSelectionUi = () => {
    const n = LatePolicyState.selected.size;
    document.getElementById('lp-count').textContent = `${n} karyawan dipilih`;
    const btn = document.getElementById('btn-set-policy');
    btn.disabled = n === 0;
    btn.textContent = n === 0 ? 'Atur Aturan' : `Atur Aturan (${n} terpilih)`;
    const boxes = Array.from(document.querySelectorAll('.lp-check'));
    const all = document.getElementById('lp-check-all');
    all.checked = boxes.length > 0 && boxes.every(b => b.checked);
  };

  document.querySelectorAll('.lp-check').forEach(box => {
    box.addEventListener('change', () => {
      const id = Number(box.dataset.id);
      if (box.checked) LatePolicyState.selected.add(id);
      else LatePolicyState.selected.delete(id);
      refreshSelectionUi();
    });
  });

  document.getElementById('lp-check-all').addEventListener('change', (e) => {
    document.querySelectorAll('.lp-check').forEach(box => {
      box.checked = e.target.checked;
      const id = Number(box.dataset.id);
      if (e.target.checked) LatePolicyState.selected.add(id);
      else LatePolicyState.selected.delete(id);
    });
    refreshSelectionUi();
  });

  document.getElementById('btn-set-policy').addEventListener('click', () => openLatePolicyModal(list));

  tbody.querySelectorAll('.lp-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Hapus aturan keterlambatan untuk "${btn.dataset.name}"? Karyawan ini tidak akan terkena potongan lagi.`)) return;
      try {
        await Storage.deleteLatePolicy(btn.dataset.id);
        LatePolicyState.selected.delete(Number(btn.dataset.id));
        renderLatePolicyTab();
      } catch (err) {
        alert(`Gagal menghapus: ${err.message}`);
      }
    });
  });

  refreshSelectionUi();
}

function openLatePolicyModal(list) {
  const ids = Array.from(LatePolicyState.selected);
  // kalau tepat satu karyawan dipilih dan sudah punya aturan, isi form dengan nilainya
  const only = ids.length === 1 ? list.find(r => r.employeeId === ids[0]) : null;
  const p = only && only.latePolicy ? only.latePolicy : null;
  const type = p ? p.deductionType : 'flat';

  openModal(`
    <div class="p-5">
      <h3 class="font-bold text-slate-800 mb-1">Atur Aturan untuk ${ids.length} Karyawan</h3>
      <p class="text-xs text-slate-400 mb-4">Aturan ini akan berlaku untuk semua karyawan yang dicentang.</p>
      <form id="form-lp" class="space-y-3">
        <div>
          <label class="text-sm text-slate-500 block mb-1">Jam batas masuk</label>
          <input required type="time" name="checkInLimit" value="${p ? escapeHtml(p.checkInLimit) : '08:30'}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-1">Toleransi keterlambatan (menit per periode gaji)</label>
          <input required type="number" min="0" name="thresholdMinutes" value="${p ? p.thresholdMinutes : 30}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm text-slate-500 block mb-2">Skema potongan</label>
          <div class="space-y-2">
            <label class="flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" name="deductionType" value="flat" class="accent-indigo-600 lp-type" ${type === 'flat' ? 'checked' : ''} /> Nominal tetap
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" name="deductionType" value="per_minute" class="accent-indigo-600 lp-type" ${type === 'per_minute' ? 'checked' : ''} /> Per menit kelebihan
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" name="deductionType" value="percentage" class="accent-indigo-600 lp-type" ${type === 'percentage' ? 'checked' : ''} /> Persentase gaji
            </label>
          </div>
        </div>
        <div id="wrap-flat" class="lp-amount">
          <label class="text-sm text-slate-500 block mb-1">Nominal potongan (Rp)</label>
          <input type="number" min="0" step="1000" name="deductionFlatAmount" value="${p && p.deductionFlatAmount != null ? p.deductionFlatAmount : 50000}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <p class="text-xs text-slate-400 mt-1">Dipotong sekali, berapa pun kelebihan menitnya.</p>
        </div>
        <div id="wrap-per_minute" class="lp-amount">
          <label class="text-sm text-slate-500 block mb-1">Potongan per menit kelebihan (Rp)</label>
          <input type="number" min="0" step="500" name="deductionPerMinuteAmount" value="${p && p.deductionPerMinuteAmount != null ? p.deductionPerMinuteAmount : 1000}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <p class="text-xs text-slate-400 mt-1">Dikalikan hanya ke menit di atas toleransi.</p>
        </div>
        <div id="wrap-percentage" class="lp-amount">
          <label class="text-sm text-slate-500 block mb-1">Potongan (% dari gaji periode itu)</label>
          <input type="number" min="0" max="100" step="0.5" name="deductionPercentage" value="${p && p.deductionPercentage != null ? p.deductionPercentage : 5}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <p id="form-error" class="text-sm text-rose-600 hidden"></p>
        <div class="flex gap-2 pt-2">
          <button type="button" id="btn-cancel-lp" class="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 font-medium text-sm">Batal</button>
          <button type="submit" class="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700">Simpan</button>
        </div>
      </form>
    </div>
  `);

  const syncAmountFields = () => {
    const chosen = document.querySelector('.lp-type:checked').value;
    ['flat', 'per_minute', 'percentage'].forEach(t => {
      const wrap = document.getElementById(`wrap-${t}`);
      const active = t === chosen;
      wrap.classList.toggle('hidden', !active);
      // di-disable supaya input tersembunyi tidak ikut divalidasi & tidak terkirim
      wrap.querySelector('input').disabled = !active;
    });
  };
  document.querySelectorAll('.lp-type').forEach(r => r.addEventListener('change', syncAmountFields));
  syncAmountFields();

  document.getElementById('btn-cancel-lp').addEventListener('click', closeModal);

  document.getElementById('form-lp').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      employeeIds: ids,
      checkInLimit: fd.get('checkInLimit'),
      thresholdMinutes: Number(fd.get('thresholdMinutes')),
      deductionType: fd.get('deductionType')
    };
    if (payload.deductionType === 'flat') payload.deductionFlatAmount = Number(fd.get('deductionFlatAmount'));
    else if (payload.deductionType === 'per_minute') payload.deductionPerMinuteAmount = Number(fd.get('deductionPerMinuteAmount'));
    else payload.deductionPercentage = Number(fd.get('deductionPercentage'));

    const errorEl = document.getElementById('form-error');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await Storage.saveLatePolicies(payload);
      closeModal();
      renderLatePolicyTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });
}
