/* ============================================================
   PyFDA Web — Fixpoint Simulation UI Logic
   Per-stage Q_C, Q_X, Q_A (Auto/Full/Manual), Q_Y (Lock Q_X),
   topology selector, overflow/SNR telemetry, and Verilog HDL modal.
   ============================================================ */

const FixpointPanel = (() => {
  const defaultConfig = {
    topology: 'auto',
    coeff_qi: 2, coeff_qf: 13,
    in_qi: 0, in_qf: 15, in_ovfl: 'sat', in_quant: 'round',
    accu_mode: 'auto', acc_qi: 4, acc_qf: 28, acc_ovfl: 'wrap', acc_quant: 'floor',
    lock_xy: true,
    out_qi: 0, out_qf: 15, out_ovfl: 'sat', out_quant: 'round',
  };

  let config = { ...defaultConfig };

  function init() {
    bindNum('inp-coeff-qi', 'coeff_qi', () => { updateWordLabels(); bus.emit('fixpointConfigChanged'); });
    bindNum('inp-coeff-qf', 'coeff_qf', () => { updateWordLabels(); bus.emit('fixpointConfigChanged'); });
    bindNum('inp-sig-qi', 'in_qi', () => { syncLockedOutput(); updateWordLabels(); });
    bindNum('inp-sig-qf', 'in_qf', () => { syncLockedOutput(); updateWordLabels(); });
    bindNum('inp-acc-qi', 'acc_qi', updateWordLabels);
    bindNum('inp-acc-qf', 'acc_qf', updateWordLabels);
    bindNum('inp-out-qi', 'out_qi');
    bindNum('inp-out-qf', 'out_qf');

    bindSel('sel-fx-topology', 'topology');
    bindSel('sel-in-ovfl', 'in_ovfl', syncLockedOutput);
    bindSel('sel-in-quant', 'in_quant', syncLockedOutput);
    bindSel('sel-acc-mode', 'accu_mode', updateAccControls);
    bindSel('sel-acc-ovfl', 'acc_ovfl');
    bindSel('sel-acc-quant', 'acc_quant');
    bindSel('sel-out-ovfl', 'out_ovfl');
    bindSel('sel-out-quant', 'out_quant');

    document.getElementById('chk-fx-lock-xy')?.addEventListener('change', (e) => {
      config.lock_xy = e.target.checked;
      syncLockedOutput();
      updateOutputControls();
    });

    document.getElementById('btn-fixpoint-sim')?.addEventListener('click', () => runFixpointSim());
    document.getElementById('btn-fx-verilog')?.addEventListener('click', openVerilogModal);
    document.getElementById('btn-fixpoint-clear')?.addEventListener('click', clearFixpoint);

    document.getElementById('verilog-modal-close')?.addEventListener('click', () => {
      document.getElementById('verilog-modal')?.close();
    });
    document.getElementById('btn-verilog-copy')?.addEventListener('click', () => {
      const code = document.getElementById('verilog-code')?.textContent || '';
      navigator.clipboard.writeText(code)
        .then(() => showToast('Verilog HDL copied!', 'info'))
        .catch(() => showToast('Clipboard copy failed', 'error'));
    });
    document.getElementById('btn-verilog-download')?.addEventListener('click', () => {
      const code = document.getElementById('verilog-code')?.textContent || '';
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pyfda_${(AppState.specs.designMethod || 'filter')}.v`;
      a.click();
      URL.revokeObjectURL(url);
    });

    bus.on('filterDesigned', () => {
      calculateOptimalCoeffBits();
      if (AppState.fixpoint.enabled) runFixpointSim();
    });

    updateAccControls();
    updateOutputControls();
    updateWordLabels();
  }

  function bindNum(id, key, after) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const val = parseInt(el.value, 10);
      if (!Number.isNaN(val)) {
        config[key] = Math.max(0, val);
        if (after) after();
      }
    });
  }

  function bindSel(id, key, after) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      config[key] = el.value;
      if (after) after();
    });
  }

  function syncLockedOutput() {
    if (!config.lock_xy) return;
    config.out_qi = config.in_qi;
    config.out_qf = config.in_qf;
    config.out_ovfl = config.in_ovfl;
    config.out_quant = config.in_quant;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('inp-out-qi', config.out_qi);
    set('inp-out-qf', config.out_qf);
    set('sel-out-ovfl', config.out_ovfl);
    set('sel-out-quant', config.out_quant);
  }

  function updateAccControls() {
    const isMan = config.accu_mode === 'man';
    ['inp-acc-qi', 'inp-acc-qf'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !isMan;
    });
    updateWordLabels();
  }

  function updateOutputControls() {
    const locked = Boolean(config.lock_xy);
    ['inp-out-qi', 'inp-out-qf', 'sel-out-ovfl', 'sel-out-quant'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = locked;
    });
  }

  function updateWordLabels() {
    const qcEl = document.getElementById('fx-qc-info');
    if (qcEl) {
      const wc = 1 + config.coeff_qi + config.coeff_qf;
      qcEl.textContent = `W=${wc}b (LSB=${Math.pow(2, -config.coeff_qf).toExponential(1)})`;
    }
    const qxEl = document.getElementById('fx-qx-info');
    if (qxEl) qxEl.textContent = `W=${1 + config.in_qi + config.in_qf}b`;

    const qaEl = document.getElementById('fx-qa-info');
    if (qaEl) {
      if (config.accu_mode === 'man') qaEl.textContent = `W=${1 + config.acc_qi + config.acc_qf}b (Man)`;
      else if (config.accu_mode === 'full') qaEl.textContent = 'Full precision';
      else qaEl.textContent = 'Auto';
    }
  }

  function calculateOptimalCoeffBits() {
    const { b, a } = AppState.filter;
    if (!b || !a) return;
    const maxVal = Math.max(...b.map(Math.abs), ...a.map(Math.abs), 1e-12);
    const reqQi = maxVal >= 1 ? Math.ceil(Math.log2(maxVal)) + 1 : 0;
    const optQi = Math.max(0, Math.min(8, reqQi));
    const optQf = Math.max(4, 15 - optQi);

    config.coeff_qi = optQi;
    config.coeff_qf = optQf;
    const elQi = document.getElementById('inp-coeff-qi');
    const elQf = document.getElementById('inp-coeff-qf');
    if (elQi) elQi.value = optQi;
    if (elQf) elQf.value = optQf;
    updateWordLabels();
    bus.emit('fixpointConfigChanged');
  }

  function clearFixpoint() {
    AppState.fixpoint.enabled = false;
    AppState.fixpoint.result = null;
    const stats = document.getElementById('fx-stats-box');
    if (stats) stats.style.display = 'none';
    bus.emit('fixpointCleared');
    showToast('Fixpoint overlay cleared', 'info');
  }

  async function runFixpointSim(stimSignal = null, stimOpts = null) {
    if (!AppState.filter.b) {
      showToast('Design a filter first', 'warning');
      return null;
    }

    const spinner = document.getElementById('fixpoint-spinner');
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const { b, a, sos } = AppState.filter;
      const stimInput = stimSignal || AppState.lastStimulus?.x || null;
      const payload = {
        ...config,
        n_samples: stimInput ? stimInput.length : 256,
        fs: (typeof InputSpecs !== 'undefined' && InputSpecs.getEffectiveFsHz)
          ? InputSpecs.getEffectiveFsHz()
          : (AppState.specs.fs || 48000),
        n_start: stimOpts?.n_start || AppState.lastStimulus?.n_start || 0,
        fft_win: stimOpts?.fft_win || AppState.lastStimulus?.fft_win || 'rectangular',
      };
      const result = await PyodideBridge.fixpointSim(b, a, stimInput, payload, sos);

      AppState.fixpoint.enabled = true;
      AppState.fixpoint.config = { ...config };
      AppState.fixpoint.result = result;

      renderStats(result);
      bus.emit('fixpointResult', result);
      showToast(`Fixpoint (${result.topology}) simulated — SNR: ${result.snr_db.toFixed(1)} dB`, 'info');
      return result;
    } catch (err) {
      showToast(`Fixpoint error: ${err.message}`, 'error');
      return null;
    } finally {
      if (spinner) spinner.style.display = 'none';
    }
  }

  function renderStats(res) {
    const box = document.getElementById('fx-stats-box');
    if (!box || !res) return;
    box.style.display = '';
    const ov = res.overflow_counts || { coeff: 0, input: 0, acc: 0, output: 0 };
    const totalOv = (ov.coeff || 0) + (ov.input || 0) + (ov.acc || 0) + (ov.output || 0);
    box.replaceChildren();

    const line1 = document.createElement('div');
    line1.textContent = `Topology: ${res.topology} | Q_A: ${res.acc_wi}.${res.acc_wf} | SNR: ${res.snr_db.toFixed(1)} dB`;
    line1.style.fontWeight = '600';

    const line2 = document.createElement('div');
    line2.textContent = `Overflows — Coeff:${ov.coeff} In:${ov.input} Acc:${ov.acc} Out:${ov.output}`;
    line2.style.color = totalOv > 0 ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-primary)';

    const qaEl = document.getElementById('fx-qa-info');
    if (qaEl) qaEl.textContent = `Q${res.acc_wi}.${res.acc_wf} (${1 + res.acc_wi + res.acc_wf}b)`;

    box.append(line1, line2);
  }

  async function openVerilogModal() {
    if (!AppState.filter.b) return showToast('Design a filter first', 'warning');
    try {
      const res = await PyodideBridge.generateVerilog(AppState.filter.b, AppState.filter.a, config);
      const codeEl = document.getElementById('verilog-code');
      const badgeEl = document.getElementById('verilog-topo-badge');
      if (codeEl) codeEl.textContent = res.verilog;
      if (badgeEl) badgeEl.textContent = res.topology;
      document.getElementById('verilog-modal')?.showModal();
    } catch (err) {
      showToast(`Verilog error: ${err.message}`, 'error');
    }
  }

  return { init, runFixpointSim, getConfig: () => ({ ...config }) };
})();
