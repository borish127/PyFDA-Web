/* ============================================================
   PyFDA Web — Fixpoint Panel UI
   ============================================================ */

const FixpointPanel = (() => {

  function init() {
    // Bind inputs (with non-negative integer validation)
    bindInput('inp-coeff-qi', 'coeffQI');
    bindInput('inp-coeff-qf', 'coeffQF');
    bindInput('inp-sig-qi',   'signalQI');
    bindInput('inp-sig-qf',   'signalQF');

    document.getElementById('sel-overflow')?.addEventListener('change', (e) => {
      AppState.fixpoint.overflow = e.target.value;
    });

    document.getElementById('sel-quant')?.addEventListener('change', (e) => {
      AppState.fixpoint.quantMode = e.target.value;
    });

    document.getElementById('btn-fixpoint-sim')?.addEventListener('click', runFixpointSim);

    // Clear button: reset fixpoint result and notify plots
    document.getElementById('btn-fixpoint-clear')?.addEventListener('click', () => {
      AppState.fixpoint.result = null;
      bus.emit('fixpointCleared');
    });

    // Auto-calculate optimal bits when filter changes
    bus.on('filterDesigned', calculateOptimalCoeffBits);
  }

  /**
   * Bind a numeric input field to an AppState.fixpoint key.
   * Only accepts non-negative integers (QI / QF bit widths).
   */
  function bindInput(id, key) {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const raw = e.target.value.trim();
      // Reject anything that is not a non-negative integer
      if (raw === '' || !/^\d+$/.test(raw)) return;
      const val = parseInt(raw, 10);
      if (!isNaN(val) && val >= 0) AppState.fixpoint[key] = val;
    });
  }

  function calculateOptimalCoeffBits() {
    const filter = AppState.filter;
    if (!filter || !filter.b) return;

    let maxVal = 0;
    // Check if we have an IIR filter and if SOS is available
    const isIIR = filter.a && filter.a.length > 1 && !filter.a.slice(1).every(v => v === 0);
    if (isIIR && filter.sos && filter.sos.length > 0) {
      // SOS coefficients: each row is [b0, b1, b2, 1.0, a1, a2]
      const Ns = filter.sos.length;
      const g = filter.sos.map(sec => Math.max(Math.abs(sec[0]), Math.abs(sec[1]), Math.abs(sec[2])));
      const K = g.reduce((prod, val) => prod * val, 1.0);
      const K_dist = K > 1e-30 ? Math.pow(K, 1.0 / Ns) : 0.0;

      for (let i = 0; i < Ns; i++) {
        const sec = filter.sos[i];
        // Scale numerator by K_dist / g[i] (which is the actual scale applied in python)
        const scale = g[i] > 1e-30 ? K_dist / g[i] : 0.0;
        for (let j = 0; j < 3; j++) {
          maxVal = Math.max(maxVal, Math.abs(sec[j] * scale));
        }
        maxVal = Math.max(maxVal, Math.abs(sec[4]), Math.abs(sec[5]));
      }
    } else {
      // Direct Form coefficients
      const maxB = Math.max(...filter.b.map(Math.abs));
      const maxA = filter.a ? Math.max(...filter.a.map(Math.abs)) : 0;
      maxVal = Math.max(maxB, maxA);
    }

    // Calculate WI (integer bits)
    let qi = 0;
    if (maxVal > 0) {
      qi = Math.max(0, Math.ceil(Math.log2(maxVal) + 1e-9) + 1);
    }

    // Maintain the current total word length of the coefficients if possible
    const currentTotal = 1 + AppState.fixpoint.coeffQI + AppState.fixpoint.coeffQF;
    const targetTotal = currentTotal > 1 ? currentTotal : 16; // default 16
    
    let qf = targetTotal - 1 - qi;
    if (qf < 0) {
      qf = 0;
    }

    // Update AppState
    AppState.fixpoint.coeffQI = qi;
    AppState.fixpoint.coeffQF = qf;

    // Update UI inputs
    const qiInput = document.getElementById('inp-coeff-qi');
    const qfInput = document.getElementById('inp-coeff-qf');
    if (qiInput) qiInput.value = qi;
    if (qfInput) qfInput.value = qf;
  }

  async function runFixpointSim() {
    if (!window.pyodideEngineReady) {
      showToast("Please wait, initializing math engine...");
      return;
    }

    if (!AppState.filter.b) {
      showToast('Design a filter first', 'error');
      return;
    }

    const btn = document.getElementById('btn-fixpoint-sim');
    const spinner = document.getElementById('fixpoint-spinner');

    try {
      if (btn) btn.disabled = true;
      if (spinner) spinner.style.display = '';

      const { b, a, sos } = AppState.filter;
      const fs = AppState.specs.fs;
      const config = {
        coeff_qi: AppState.fixpoint.coeffQI,
        coeff_qf: AppState.fixpoint.coeffQF,
        signal_qi: AppState.fixpoint.signalQI,
        signal_qf: AppState.fixpoint.signalQF,
        overflow: AppState.fixpoint.overflow,
        quant_mode: AppState.fixpoint.quantMode,
      };

      // Use the last stimulus signal if available, otherwise null → impulse
      const stimulusX = (AppState.stimulus && AppState.stimulus.x)
        ? AppState.stimulus.x
        : null;

      const result = await PyodideBridge.fixpointSim(b, a, stimulusX, config, sos);
      AppState.fixpoint.result = result;
      bus.emit('fixpointResult', result);
      showToast('Fixpoint simulation complete');

    } catch (err) {
      showToast(`Fixpoint error: ${err.message}`, 'error');
    } finally {
      if (btn) btn.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  }

  return { init };
})();
