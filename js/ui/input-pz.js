/* ============================================================
   PyFDA Web — Poles & Zeros Table UI
   ============================================================ */

const InputPZ = (() => {

  function init() {
    bus.on('filterDesigned', updateFromFilter);
    bus.on('plotPZ', updateTable);
    bus.on('filterLoaded', syncTables);

    // Copy P/Z
    document.getElementById('btn-copy-pz')?.addEventListener('click', () => {
      if (!AppState.filter.zeros) { showToast('No filter designed', 'error'); return; }
      let text = `Zeros:\n`;
      text += AppState.filter.zeros.map(z => `  ${formatComplex(z)}`).join('\n');
      text += `\n\nPoles:\n`;
      text += AppState.filter.poles.map(p => `  ${formatComplex(p)}`).join('\n');
      text += `\n\nGain: ${AppState.filter.gain}`;
      navigator.clipboard.writeText(text).then(
        () => showToast('Poles/Zeros copied to clipboard'),
        () => showToast('Copy failed', 'error')
      );
    });
  }

  async function updateFromFilter(filter) {
    // Request P/Z analysis if not cached
    if (!AppState.analysis.pzData && filter.b) {
      try {
        AppState.analysis.pzData = await PyodideBridge.pzData(filter.b, filter.a);
      } catch (e) {
        console.error('P/Z analysis failed:', e);
        return;
      }
    }
    if (AppState.analysis.pzData) {
      updateTable(AppState.analysis.pzData);
    }
  }

  function updateTable(pzData) {
    const tbody = document.getElementById('tbody-pz');
    const gainInput = document.getElementById('inp-gain');
    if (!tbody || !pzData) return;

    let html = '';

    // Zeros
    if (pzData.zeros_real) {
      for (let i = 0; i < pzData.zeros_real.length; i++) {
        html += `<tr>
          <td><span style="color:var(--md-sys-color-primary); font-weight:600;">○ Zero</span></td>
          <td contenteditable="true" data-type="zero" data-idx="${i}" data-part="real">${formatNum(pzData.zeros_real[i])}</td>
          <td contenteditable="true" data-type="zero" data-idx="${i}" data-part="imag">${formatNum(pzData.zeros_imag[i])}</td>
        </tr>`;
      }
    }

    // Poles
    if (pzData.poles_real) {
      for (let i = 0; i < pzData.poles_real.length; i++) {
        html += `<tr>
          <td><span style="color:var(--md-sys-color-error); font-weight:600;">× Pole</span></td>
          <td contenteditable="true" data-type="pole" data-idx="${i}" data-part="real">${formatNum(pzData.poles_real[i])}</td>
          <td contenteditable="true" data-type="pole" data-idx="${i}" data-part="imag">${formatNum(pzData.poles_imag[i])}</td>
        </tr>`;
      }
    }

    if (!html) {
      html = '<tr><td colspan="3" style="text-align:center; color:var(--md-sys-color-on-surface-variant); font-style:italic;">No data</td></tr>';
    }

    tbody.innerHTML = html;

    if (gainInput && pzData.gain !== undefined) {
      gainInput.value = typeof pzData.gain === 'number' ? pzData.gain.toPrecision(8) : pzData.gain;
    }

    // Store in AppState
    if (pzData.zeros_real) {
      AppState.filter.zeros = pzData.zeros_real.map((r, i) => [r, pzData.zeros_imag[i]]);
      AppState.filter.poles = pzData.poles_real.map((r, i) => [r, pzData.poles_imag[i]]);
      AppState.filter.gain = pzData.gain;
    }
  }

  function formatNum(val) {
    if (val === undefined || val === null) return '—';
    if (Math.abs(val) < 1e-14) return '0';
    return val.toPrecision(6);
  }

  function formatComplex(pair) {
    if (Array.isArray(pair)) {
      const [r, i] = pair;
      if (Math.abs(i) < 1e-14) return `${r.toPrecision(6)}`;
      const sign = i >= 0 ? '+' : '-';
      return `${r.toPrecision(6)} ${sign} ${Math.abs(i).toPrecision(6)}j`;
    }
    return String(pair);
  }

  function syncTables(data) {
    if (data.zeros && data.poles) {
      AppState.filter.zeros = data.zeros;
      AppState.filter.poles = data.poles;
      if (data.gain !== undefined) AppState.filter.gain = data.gain;
      updateFromFilter(AppState.filter);
    }
  }

  return { init };
})();
