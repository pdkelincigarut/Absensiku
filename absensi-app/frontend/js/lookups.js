/* ============================================================
   lookups.js — Tab "Jabatan & Divisi" (Owner)
   Dua daftar sederhana yang mengisi pilihan dropdown di form
   karyawan. Bentuk keduanya identik, jadi satu fungsi render
   dipakai untuk keduanya dengan konfigurasi pembeda.
   ============================================================ */

const LOOKUP_KINDS = {
  job: {
    title: 'Jabatan',
    load: () => Storage.getJobs(),
    save: record => Storage.saveJob(record),
    remove: id => Storage.deleteJob(id)
  },
  organization: {
    title: 'Divisi',
    load: () => Storage.getOrganizations(),
    save: record => Storage.saveOrganization(record),
    remove: id => Storage.deleteOrganization(id)
  }
};

async function renderLookupsTab() {
  const container = document.getElementById('owner-content');
  container.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Memuat...</p>`;

  let jobs, organizations;
  try {
    [jobs, organizations] = await Promise.all([LOOKUP_KINDS.job.load(), LOOKUP_KINDS.organization.load()]);
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-rose-500 text-center py-8">Gagal memuat data: ${escapeHtml(err.message)}</p>`;
    return;
  }

  container.innerHTML = `
    <div class="grid gap-4 md:grid-cols-2">
      <div id="lookup-card-job"></div>
      <div id="lookup-card-organization"></div>
    </div>
    <p class="text-xs text-slate-400 mt-4">Daftar ini yang muncul sebagai pilihan Jabatan dan Divisi saat menambah atau mengubah data karyawan. Entri yang masih dipakai karyawan tidak bisa dihapus.</p>
  `;

  renderLookupCard('job', jobs);
  renderLookupCard('organization', organizations);
}

function renderLookupCard(kind, list) {
  const config = LOOKUP_KINDS[kind];
  const card = document.getElementById(`lookup-card-${kind}`);

  card.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 class="font-semibold text-slate-700">${config.title} <span class="text-slate-400 font-normal">(${list.length})</span></h2>
        <button data-kind="${kind}" class="lookup-add px-3 py-1.5 rounded-lg bg-klc-600 text-white text-sm font-medium hover:bg-klc-700">+ Tambah</button>
      </div>
      <ul class="divide-y divide-slate-100">
        ${list.length === 0
          ? `<li class="px-4 py-8 text-center text-sm text-slate-400">Belum ada ${config.title.toLowerCase()}.</li>`
          : list.map(row => `
            <li class="flex items-center justify-between px-4 py-2.5">
              <span class="text-sm text-slate-700">${escapeHtml(row.name)}</span>
              <span class="flex gap-3 shrink-0">
                <button data-kind="${kind}" data-id="${row.id}" data-name="${escapeHtml(row.name)}" class="lookup-edit text-slate-600 hover:text-klc-600 hover:underline text-sm font-medium">Ubah</button>
                <button data-kind="${kind}" data-id="${row.id}" data-name="${escapeHtml(row.name)}" class="lookup-delete text-rose-600 hover:underline text-sm font-medium">Hapus</button>
              </span>
            </li>
          `).join('')}
      </ul>
    </div>
  `;

  card.querySelector('.lookup-add').addEventListener('click', () => openLookupModal(kind, null));

  card.querySelectorAll('.lookup-edit').forEach(btn => {
    btn.addEventListener('click', () => openLookupModal(kind, { id: btn.dataset.id, name: btn.dataset.name }));
  });

  card.querySelectorAll('.lookup-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Hapus ${config.title.toLowerCase()} "${btn.dataset.name}"?`)) return;
      try {
        await config.remove(btn.dataset.id);
        renderLookupsTab();
      } catch (err) {
        alert(`Gagal menghapus: ${err.message}`);
      }
    });
  });
}

function openLookupModal(kind, existing) {
  const config = LOOKUP_KINDS[kind];
  const isEdit = !!existing;

  openModal(`
    <div class="p-5">
      <h3 class="font-bold text-slate-800 mb-4">${isEdit ? 'Ubah' : 'Tambah'} ${config.title}</h3>
      <form id="form-lookup" class="space-y-3">
        <div>
          <label class="text-sm text-slate-500 block mb-1">Nama ${config.title}</label>
          <input required name="name" value="${isEdit ? escapeHtml(existing.name) : ''}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <p id="form-error" class="text-sm text-rose-600 hidden"></p>
        <div class="flex gap-2 pt-2">
          <button type="button" id="btn-cancel-lookup" class="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-600 font-medium text-sm">Batal</button>
          <button type="submit" class="flex-1 py-2.5 rounded-lg bg-klc-600 text-white font-medium text-sm hover:bg-klc-700">Simpan</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('btn-cancel-lookup').addEventListener('click', closeModal);

  document.getElementById('form-lookup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const record = { name: new FormData(e.target).get('name').trim() };
    if (isEdit) record.id = existing.id;

    const errorEl = document.getElementById('form-error');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await config.save(record);
      closeModal();
      renderLookupsTab();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
    }
  });
}
