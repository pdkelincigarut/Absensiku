/* ============================================================
   tableUtils.js — Helper pengurutan tabel, dipakai bersama
   tabel monitoring (checklist.js) dan daftar karyawan
   (employeeList.js). Dipisah supaya aturan pengurutan tidak
   ditulis dua kali lalu menyimpang seiring waktu.
   ============================================================ */

/* Nilai kosong selalu ditempatkan di akhir untuk KEDUA arah, supaya baris
   yang datanya belum lengkap tidak menumpuk di bagian atas tabel saat
   pengguna mengurutkan turun. */
function sortRows(rows, readValue, dir) {
  const factor = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const av = readValue(a), bv = readValue(b);
    const aEmpty = av === null || av === undefined || av === '';
    const bEmpty = bv === null || bv === undefined || bv === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    // numeric: true supaya "TDI-2" mendahului "TDI-10", bukan sebaliknya
    return String(av).localeCompare(String(bv), 'id', { numeric: true, sensitivity: 'base' }) * factor;
  });
}

function nextSortState(state, key) {
  if (state.key === key) return { key, dir: state.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: 'asc' };
}

function sortableHeaderHtml({ state, key, label, className, buttonClass }) {
  const active = state.key === key;
  const marker = active
    ? `<span class="text-indigo-600">${state.dir === 'asc' ? '▲' : '▼'}</span>`
    : `<span class="text-slate-300">⇅</span>`;
  return `<th class="px-4 py-2.5 font-medium ${className || ''}">
      <button type="button" data-sort="${key}" class="${buttonClass} flex items-center gap-1.5 hover:text-slate-700 transition">
        <span>${label}</span>${marker}
      </button>
    </th>`;
}
