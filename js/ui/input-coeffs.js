/* ============================================================
   PyFDA Web — Coefficient Table UI
   ============================================================ */

const InputCoeffs = (() => {

  function init() {
    bus.on('filterDesigned', updateTable);
    bus.on('filterLoaded', syncTables);

    // Copy b,a
    document.getElementById('btn-copy-ba')?.addEventListener('click', () => {
      if (!AppState.filter.b) { showToast('No filter designed', 'error'); return; }
      const text = `b = [${AppState.filter.b.join(', ')}]\na = [${AppState.filter.a.join(', ')}]`;
      navigator.clipboard.writeText(text).then(
        () => showToast('Coefficients copied to clipboard'),
        () => showToast('Copy failed', 'error')
      );
    });

    // Copy SOS
    document.getElementById('btn-copy-sos')?.addEventListener('click', () => {
      if (!AppState.filter.sos) { showToast('No SOS data available', 'error'); return; }
      const lines = AppState.filter.sos.map((row, i) =>
        `Section ${i}: [${row.join(', ')}]`
      );
      navigator.clipboard.writeText(lines.join('\n')).then(
        () => showToast('SOS copied to clipboard'),
        () => showToast('Copy failed', 'error')
      );
    });
  }

  function updateTable(filter) {
    const tbody = document.getElementById('tbody-coeffs');
    if (!tbody || !filter.b) return;

    const maxLen = Math.max(filter.b.length, filter.a ? filter.a.length : 0);
    let html = '';
    for (let i = 0; i < maxLen; i++) {
      const bVal = i < filter.b.length ? formatCoeff(filter.b[i]) : '—';
      const aVal = filter.a && i < filter.a.length ? formatCoeff(filter.a[i]) : '—';
      html += `<tr>
        <td>${i}</td>
        <td contenteditable="true" data-type="b" data-idx="${i}">${bVal}</td>
        <td contenteditable="true" data-type="a" data-idx="${i}">${aVal}</td>
      </tr>`;
    }
    tbody.innerHTML = html;

    // Bind editable cells
    tbody.querySelectorAll('td[contenteditable]').forEach(td => {
      td.addEventListener('blur', () => handleEdit(td));
      td.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
      });
    });
  }

  function handleEdit(td) {
    const type = td.dataset.type;
    const idx = parseInt(td.dataset.idx);
    const val = parseFloat(td.textContent);

    if (isNaN(val)) {
      td.textContent = formatCoeff(type === 'b' ? AppState.filter.b[idx] : AppState.filter.a[idx]);
      showToast('Invalid number', 'error');
      return;
    }

    if (type === 'b') AppState.filter.b[idx] = val;
    else AppState.filter.a[idx] = val;

    // Clear cached analysis and re-run
    AppState.analysis = {
      freqResponse: null, groupDelay: null, phaseDelay: null,
      impulseResponse: null, stepResponse: null, pzData: null, surface3d: null,
    };
    bus.emit('filterDesigned', AppState.filter);
    runAnalysis(AppState.ui.activeTab);
  }

  function formatCoeff(val) {
    if (val === undefined || val === null) return '—';
    if (Math.abs(val) < 1e-15) return '0';
    if (Math.abs(val) >= 1e4 || (Math.abs(val) < 1e-4 && val !== 0)) {
      return val.toExponential(8);
    }
    return val.toPrecision(10).replace(/0+$/, '').replace(/\.$/, '');
  }

  function syncTables(data) {
    if (data.b && data.a) {
      AppState.filter.b = data.b;
      AppState.filter.a = data.a;
      updateTable(AppState.filter);
    }
  }

  return { init };
})();
