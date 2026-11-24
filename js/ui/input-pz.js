/* ============================================================
   PyFDA Web — Input Poles & Zeros UI Logic
   Editable Poles/Zeros/Gain with Cartesian/Polar coordinates,
   Gain normalization (None / DC / Max), row add/delete, and b,a sync
   ============================================================ */

const InputPZ = (() => {
  let coordMode = 'cartesian'; // 'cartesian', 'polar_deg', 'polar_rad'
  let isComposing = false;

  function init() {
    document.getElementById('sel-pz-coord')?.addEventListener('change', (e) => {
      coordMode = e.target.value;
      updateHeaders();
      updateTable();
    });

    document.getElementById('sel-pz-norm')?.addEventListener('change', (e) => {
      applyNormalization(e.target.value);
    });

    document.getElementById('btn-pz-add-zero')?.addEventListener('click', () => addRoot('zero'));
    document.getElementById('btn-pz-add-pole')?.addEventListener('click', () => addRoot('pole'));
    document.getElementById('btn-pz-zero')?.addEventListener('click', zeroSmallRoots);

    const gainInput = document.getElementById('inp-gain');
    gainInput?.addEventListener('change', () => {
      const val = parseFloat(gainInput.value);
      if (Number.isFinite(val) && AppState.filter.zeros) {
        applyNewZPK(AppState.filter.zeros, AppState.filter.poles || [], val, 'Gain updated');
      }
    });

    document.getElementById('btn-copy-pz')?.addEventListener('click', () => {
      const { zeros, poles, gain } = AppState.filter;
      if (!zeros && !poles) return showToast('Design a filter first', 'warning');
      const fmtZ = z => {
        const [re, im] = asPair(z);
        return `${formatNum(re)} ${im >= 0 ? '+' : '-'} ${formatNum(Math.abs(im))}j`;
      };
      const txt = `zeros = [${(zeros || []).map(fmtZ).join(', ')}]\npoles = [${(poles || []).map(fmtZ).join(', ')}]\ngain = ${gain}`;
      navigator.clipboard.writeText(txt)
        .then(() => showToast('Poles & zeros copied!', 'info'))
        .catch(() => showToast('Clipboard copy failed', 'error'));
    });

    bus.on('filterDesigned', updateTable);
    updateHeaders();
  }

  function asPair(root) {
    if (Array.isArray(root)) return [Number(root[0] || 0), Number(root[1] || 0)];
    return [Number(root?.re || 0), Number(root?.im || 0)];
  }

  function updateHeaders() {
    const c1 = document.getElementById('th-pz-col1');
    const c2 = document.getElementById('th-pz-col2');
    if (!c1 || !c2) return;
    if (coordMode === 'cartesian') {
      c1.textContent = 'Real';
      c2.textContent = 'Imag';
    } else if (coordMode === 'polar_deg') {
      c1.textContent = 'Radius |z|';
      c2.textContent = 'Angle (°)';
    } else {
      c1.textContent = 'Radius |z|';
      c2.textContent = 'Angle (rad)';
    }
  }

  function toDisplayPair(root) {
    const [re, im] = asPair(root);
    if (coordMode === 'cartesian') return [re, im];
    const r = Math.hypot(re, im);
    let ang = Math.atan2(im, re);
    if (coordMode === 'polar_deg') ang = (ang * 180) / Math.PI;
    return [r, ang];
  }

  function fromDisplayPair(v1, v2) {
    if (coordMode === 'cartesian') return [v1, v2];
    const rad = coordMode === 'polar_deg' ? (v2 * Math.PI) / 180 : v2;
    return [v1 * Math.cos(rad), v1 * Math.sin(rad)];
  }

  function updateTable() {
    const tbody = document.getElementById('tbody-pz');
    const gainInput = document.getElementById('inp-gain');
    if (!tbody) return;

    const { zeros, poles, gain } = AppState.filter;
    if (gainInput) gainInput.value = gain !== undefined && gain !== null ? formatNum(gain) : '';

    if ((!zeros || zeros.length === 0) && (!poles || poles.length === 0)) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--md-sys-color-on-surface-variant); font-style:italic;">Design a filter to see poles/zeros</td></tr>';
      return;
    }

    tbody.replaceChildren();
    (zeros || []).forEach((z, idx) => tbody.appendChild(buildRow('Zero', 'zero', idx, z)));
    (poles || []).forEach((p, idx) => tbody.appendChild(buildRow('Pole', 'pole', idx, p)));
  }

  function buildRow(label, kind, idx, root) {
    const tr = document.createElement('tr');
    const [v1, v2] = toDisplayPair(root);
    const [re, im] = asPair(root);
    const isPoleOutside = kind === 'pole' && Math.hypot(re, im) > 1.0001;

    const tdType = document.createElement('td');
    tdType.textContent = label;
    tdType.style.fontWeight = '600';
    tdType.style.color = isPoleOutside ? 'var(--md-sys-color-error)' : (kind === 'zero' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-tertiary, var(--md-sys-color-secondary))');

    const td1 = makeCell(formatNum(v1), kind, idx, 0);
    const td2 = makeCell(formatNum(v2), kind, idx, 1);

    const tdDel = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-btn md-btn--text';
    btn.style.cssText = 'min-height:22px; padding:0 4px; font-size:12px;';
    btn.textContent = '×';
    btn.title = `Delete ${label.toLowerCase()}`;
    btn.addEventListener('click', () => removeRoot(kind, idx));
    tdDel.appendChild(btn);

    tr.append(tdType, td1, td2, tdDel);
    return tr;
  }

  function makeCell(text, kind, idx, part) {
    const td = document.createElement('td');
    td.className = 'editable';
    td.contentEditable = 'true';
    td.spellcheck = false;
    td.textContent = text;
    td.addEventListener('compositionstart', () => { isComposing = true; });
    td.addEventListener('compositionend', () => { isComposing = false; });
    td.addEventListener('blur', () => handleCellEdit(kind, idx, part, td.textContent));
    td.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !isComposing) {
        e.preventDefault();
        td.blur();
      }
    });
    return td;
  }

  async function applyNewZPK(zeros, poles, gain, msg = 'Poles/Zeros updated') {
    try {
      const res = await PyodideBridge.zpkToBaSos(zeros, poles, gain);
      AppState.filter = {
        b: res.b,
        a: res.a,
        zeros: res.zeros,
        poles: res.poles,
        gain: res.gain,
        sos: res.sos,
        order: res.order,
        method: 'P/Z Edit',
      };
      AppState.analysis = {
        freqResponse: null, groupDelay: null, phaseDelay: null,
        impulseResponse: null, stepResponse: null, pzData: null, surface3d: null,
      };
      bus.emit('filterDesigned', AppState.filter);
      await runAnalysis(AppState.ui.activeTab);
      showToast(msg, 'info');
    } catch (err) {
      showToast(`P/Z conversion failed: ${err.message}`, 'error');
      updateTable();
    }
  }

  async function handleCellEdit(kind, idx, part, rawText) {
    const val = parseFloat(String(rawText).trim());
    if (Number.isNaN(val)) {
      updateTable();
      return showToast('Invalid number', 'error');
    }
    const zeros = (AppState.filter.zeros || []).map(asPair);
    const poles = (AppState.filter.poles || []).map(asPair);
    const arr = kind === 'zero' ? zeros : poles;
    if (!arr[idx]) return;

    const [c1, c2] = toDisplayPair(arr[idx]);
    const oldVal = part === 0 ? c1 : c2;
    if (Math.abs(oldVal - val) < 1e-12) return;

    const nextPair = part === 0 ? [val, c2] : [c1, val];
    arr[idx] = fromDisplayPair(nextPair[0], nextPair[1]);
    await applyNewZPK(zeros, poles, AppState.filter.gain ?? 1.0);
  }

  async function addRoot(kind) {
    const zeros = (AppState.filter.zeros || []).map(asPair);
    const poles = (AppState.filter.poles || []).map(asPair);
    if (kind === 'zero') zeros.push([-1, 0]);
    else poles.push([0, 0]);
    await applyNewZPK(zeros, poles, AppState.filter.gain ?? 1.0, `Added ${kind}`);
  }

  async function removeRoot(kind, idx) {
    const zeros = (AppState.filter.zeros || []).map(asPair);
    const poles = (AppState.filter.poles || []).map(asPair);
    if (kind === 'zero') zeros.splice(idx, 1);
    else poles.splice(idx, 1);
    await applyNewZPK(zeros, poles, AppState.filter.gain ?? 1.0, `Removed ${kind}`);
  }

  async function zeroSmallRoots() {
    const eps = 1e-12;
    const snap = r => {
      const [re, im] = asPair(r);
      return [Math.abs(re) < eps ? 0 : re, Math.abs(im) < eps ? 0 : im];
    };
    const zeros = (AppState.filter.zeros || []).map(snap);
    const poles = (AppState.filter.poles || []).map(snap);
    await applyNewZPK(zeros, poles, AppState.filter.gain ?? 1.0, 'Snapped small P/Z parts to 0');
  }

  async function applyNormalization(mode) {
    if (mode === 'none' || !AppState.filter.b) return;
    const { b, a, zeros, poles, gain } = AppState.filter;
    let factor = 1;
    if (mode === 'dc') {
      const sumB = b.reduce((s, v) => s + v, 0);
      const sumA = a.reduce((s, v) => s + v, 0);
      const dc = Math.abs(sumA) > 1e-12 ? Math.abs(sumB / sumA) : 1;
      if (dc > 1e-12) factor = 1 / dc;
    } else if (mode === 'max') {
      const fr = AppState.analysis.freqResponse || await PyodideBridge.freqResponse(b, a, 1.0, 512);
      const maxH = Math.max(...(fr.mag || [1]));
      if (maxH > 1e-12) factor = 1 / maxH;
    }
    const newGain = (gain ?? 1) * factor;
    await applyNewZPK(zeros || [], poles || [], newGain, `Normalized gain (${mode.toUpperCase()} = 1)`);
  }

  function formatNum(n) {
    if (n === undefined || n === null || Number.isNaN(n)) return '0';
    if (Math.abs(n) < 1e-14) return '0';
    return Number(n).toFixed(5).replace(/\.?0+$/, '');
  }

  return { init };
})();
