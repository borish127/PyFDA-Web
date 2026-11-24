/* ============================================================
   PyFDA Web — Input Coefficients UI Logic
   Editable transfer function coefficients with Float/Dec/Bin/Hex/CSD
   formatting, row add/delete, epsilon zeroing, quantization, and P/Z sync
   ============================================================ */

const InputCoeffs = (() => {
  const MAX_AUTO_ROWS = 100;
  let fmt = 'float';
  let digits = 6;
  let showAll = false;
  let isComposing = false;

  function init() {
    document.getElementById('sel-coeff-fmt')?.addEventListener('change', (e) => {
      fmt = e.target.value;
      updateTable();
    });

    document.getElementById('inp-coeff-digits')?.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      digits = Number.isFinite(v) ? Math.max(2, Math.min(15, v)) : 6;
      updateTable();
    });

    document.getElementById('btn-coeff-add')?.addEventListener('click', addRow);
    document.getElementById('btn-coeff-zero')?.addEventListener('click', zeroSmallCoeffs);
    document.getElementById('btn-coeff-quant')?.addEventListener('click', quantizeCurrentCoeffs);
    document.getElementById('btn-coeff-expand')?.addEventListener('click', () => {
      showAll = !showAll;
      updateTable();
    });

    document.getElementById('btn-copy-ba')?.addEventListener('click', () => {
      const { b, a } = AppState.filter;
      if (!b) return showToast('Design a filter first', 'warning');
      const txt = `b = [${b.map(v => v.toPrecision(8)).join(', ')}]\na = [${a.map(v => v.toPrecision(8)).join(', ')}]`;
      navigator.clipboard.writeText(txt)
        .then(() => showToast('Coefficients b, a copied!', 'info'))
        .catch(() => showToast('Clipboard copy failed', 'error'));
    });

    document.getElementById('btn-copy-sos')?.addEventListener('click', () => {
      const { sos } = AppState.filter;
      if (!sos) return showToast('No SOS data available', 'warning');
      const txt = JSON.stringify(sos);
      navigator.clipboard.writeText(txt)
        .then(() => showToast('SOS matrix copied!', 'info'))
        .catch(() => showToast('Clipboard copy failed', 'error'));
    });

    bus.on('filterDesigned', () => {
      showAll = false;
      updateTable();
    });
    bus.on('fixpointConfigChanged', () => {
      if (fmt !== 'float') updateTable();
    });
  }

  function getCoeffQuantOpts() {
    const wi = parseInt(document.getElementById('inp-coeff-qi')?.value, 10);
    const wf = parseInt(document.getElementById('inp-coeff-qf')?.value, 10);
    return {
      fmt,
      wi: Number.isFinite(wi) ? wi : 2,
      wf: Number.isFinite(wf) ? wf : 13,
      q_mode: document.getElementById('sel-in-quant')?.value || 'round',
      ovfl: document.getElementById('sel-in-ovfl')?.value || 'sat',
      scale: 1,
    };
  }

  async function updateTable() {
    const tbody = document.getElementById('tbody-coeffs');
    const badge = document.getElementById('coeff-count-badge');
    const expandBtn = document.getElementById('btn-coeff-expand');
    const infoEl = document.getElementById('coeff-word-info');
    if (!tbody) return;

    const { b, a } = AppState.filter;
    if (!b || !a) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--md-sys-color-on-surface-variant); font-style:italic;">Design a filter to see coefficients</td></tr>';
      if (badge) badge.textContent = '';
      if (expandBtn) expandBtn.style.display = 'none';
      if (infoEl) infoEl.style.display = 'none';
      return;
    }

    const len = Math.max(b.length, a.length);
    if (badge) badge.textContent = `b:${b.length} a:${a.length}`;

    let bDisplay = b.map(v => formatFloat(v));
    let aDisplay = a.map(v => formatFloat(v));

    if (fmt !== 'float' && !AppState.ui.isLoading) {
      try {
        const res = await PyodideBridge.formatCoeffs(b, a, getCoeffQuantOpts());
        bDisplay = res.b_str;
        aDisplay = res.a_str;
        if (infoEl) {
          infoEl.style.display = '';
          infoEl.textContent = `W=${res.w}b  LSB=${res.lsb.toExponential(2)}  Range=[${res.min.toFixed(4)}, ${res.max.toFixed(4)}]`;
        }
      } catch (e) {
        if (infoEl) infoEl.style.display = 'none';
      }
    } else if (infoEl) {
      infoEl.style.display = 'none';
    }

    const limit = (!showAll && len > MAX_AUTO_ROWS) ? MAX_AUTO_ROWS : len;
    if (expandBtn) {
      if (len > MAX_AUTO_ROWS) {
        expandBtn.style.display = '';
        expandBtn.textContent = showAll ? `Show first ${MAX_AUTO_ROWS} rows` : `Show all ${len} rows`;
      } else {
        expandBtn.style.display = 'none';
      }
    }

    tbody.replaceChildren();
    for (let i = 0; i < limit; i++) {
      const tr = document.createElement('tr');
      const bVal = i < bDisplay.length ? bDisplay[i] : '';
      const aVal = i < aDisplay.length ? aDisplay[i] : '';

      const tdIdx = document.createElement('td');
      tdIdx.textContent = String(i);

      const tdB = makeCell(bVal, 'b', i);
      const tdA = makeCell(aVal, 'a', i);

      const tdDel = document.createElement('td');
      if (len > 1 && i === len - 1) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'md-btn md-btn--text';
        delBtn.style.cssText = 'min-height:22px; padding:0 4px; font-size:12px;';
        delBtn.textContent = '×';
        delBtn.title = 'Remove last row';
        delBtn.addEventListener('click', () => removeRow(i));
        tdDel.appendChild(delBtn);
      }

      tr.append(tdIdx, tdB, tdA, tdDel);
      tbody.appendChild(tr);
    }
  }

  function makeCell(text, col, idx) {
    const td = document.createElement('td');
    td.className = 'editable';
    td.textContent = text;
    if (fmt === 'float') {
      td.contentEditable = 'true';
      td.spellcheck = false;
      td.addEventListener('compositionstart', () => { isComposing = true; });
      td.addEventListener('compositionend', () => { isComposing = false; });
      td.addEventListener('blur', () => handleEdit(col, idx, td.textContent));
      td.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isComposing) {
          e.preventDefault();
          td.blur();
        }
      });
    }
    return td;
  }

  function formatFloat(val) {
    if (val === undefined || val === null) return '';
    if (Math.abs(val) < 1e-15) return '0';
    return Number(val).toPrecision(digits).replace(/\.?0+$/, '');
  }

  async function applyNewCoeffs(newB, newA, label = 'Coefficients updated') {
    if (!newB.length || !newA.length) return;
    if (Math.abs(newA[0]) < 1e-15) {
      return showToast('a[0] cannot be zero', 'error');
    }
    try {
      const res = await PyodideBridge.coeffsToZpkSos(newB, newA);
      AppState.filter = {
        b: res.b,
        a: res.a,
        zeros: res.zeros,
        poles: res.poles,
        gain: res.gain,
        sos: res.sos,
        order: res.order,
        method: 'Manual Edit',
      };
      AppState.analysis = {
        freqResponse: null, groupDelay: null, phaseDelay: null,
        impulseResponse: null, stepResponse: null, pzData: null, surface3d: null,
      };
      bus.emit('filterDesigned', AppState.filter);
      await runAnalysis(AppState.ui.activeTab);
      showToast(label, 'info');
    } catch (err) {
      showToast(`Coefficient update failed: ${err.message}`, 'error');
      updateTable();
    }
  }

  async function handleEdit(col, index, rawText) {
    const val = parseFloat(String(rawText).trim());
    if (Number.isNaN(val)) {
      updateTable();
      return showToast('Invalid coefficient number', 'error');
    }
    const newB = [...(AppState.filter.b || [1])];
    const newA = [...(AppState.filter.a || [1])];
    const target = col === 'b' ? newB : newA;
    while (target.length <= index) target.push(0);
    if (Math.abs((target[index] || 0) - val) < 1e-15) return;
    target[index] = val;
    await applyNewCoeffs(newB, newA);
  }

  async function addRow() {
    if (!AppState.filter.b) return;
    const newB = [...AppState.filter.b, 0];
    const newA = AppState.filter.a.length > 1 ? [...AppState.filter.a, 0] : [...AppState.filter.a];
    await applyNewCoeffs(newB, newA, 'Added coefficient tap');
  }

  async function removeRow(idx) {
    if (!AppState.filter.b) return;
    const newB = [...AppState.filter.b];
    const newA = [...AppState.filter.a];
    if (idx < newB.length && newB.length > 1) newB.pop();
    if (idx < newA.length && newA.length > 1) newA.pop();
    await applyNewCoeffs(newB, newA, 'Removed trailing row');
  }

  async function zeroSmallCoeffs() {
    if (!AppState.filter.b) return;
    const eps = 1e-12;
    const newB = AppState.filter.b.map(v => (Math.abs(v) < eps ? 0 : v));
    const newA = AppState.filter.a.map(v => (Math.abs(v) < eps ? 0 : v));
    await applyNewCoeffs(newB, newA, 'Zeroed |coeffs| < 1e-12');
  }

  async function quantizeCurrentCoeffs() {
    if (!AppState.filter.b) return showToast('Design a filter first', 'warning');
    try {
      const opts = getCoeffQuantOpts();
      const q = await PyodideBridge.quantizeCoeffs(AppState.filter.b, AppState.filter.a, opts);
      await applyNewCoeffs(q.b, q.a, `Quantized coeffs (${q.n_over} overflows)`);
    } catch (err) {
      showToast(`Quantization failed: ${err.message}`, 'error');
    }
  }

  return { init };
})();
