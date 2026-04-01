/* ============================================================
   PyFDA Web — Poles & Zeros Table UI
   ============================================================ */

const InputPZ = (() => {

  function init() {
    bus.on('filterDesigned', updateTable);
    bus.on('plotPZ', updateTable);
    bus.on('filterLoaded', updateTable);

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

  function updateTable() {
    const tbody = document.getElementById('tbody-pz');
    const gainInput = document.getElementById('inp-gain');
    const filter = AppState.filter;

    if (!tbody || !filter.b) return;

    let html = '';

    const zeros = filter.zeros || [];
    const poles = filter.poles || [];

    // Zeros
    for (let i = 0; i < zeros.length; i++) {
        html += `<tr>
          <td><span style="color:var(--md-sys-color-primary); font-weight:600;">○ Zero</span></td>
          <td contenteditable="true" data-type="zero" data-idx="${i}" data-part="real">${formatNum(zeros[i][0])}</td>
          <td contenteditable="true" data-type="zero" data-idx="${i}" data-part="imag">${formatNum(zeros[i][1])}</td>
        </tr>`;
    }

    // Poles
    for (let i = 0; i < poles.length; i++) {
        html += `<tr>
          <td><span style="color:var(--md-sys-color-error); font-weight:600;">× Pole</span></td>
          <td contenteditable="true" data-type="pole" data-idx="${i}" data-part="real">${formatNum(poles[i][0])}</td>
          <td contenteditable="true" data-type="pole" data-idx="${i}" data-part="imag">${formatNum(poles[i][1])}</td>
        </tr>`;
    }

    if (!html) {
      html = '<tr><td colspan="3" style="text-align:center; color:var(--md-sys-color-on-surface-variant); font-style:italic;">No data</td></tr>';
    }

    tbody.innerHTML = html;

    if (gainInput && filter.gain !== undefined && filter.gain !== null) {
      gainInput.value = typeof filter.gain === 'number' ? filter.gain.toPrecision(8) : filter.gain;
    }
  }

  function formatNum(val) {
    if (val === undefined || val === null) return '—';
    if (Math.abs(val) < 1e-15) return '0';
    if (Math.abs(val) >= 1e4 || (Math.abs(val) < 1e-4 && val !== 0)) return val.toExponential(4);
    return val.toPrecision(6).replace(/0+$/, '').replace(/\.$/, '');
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

  return { init };
})();
