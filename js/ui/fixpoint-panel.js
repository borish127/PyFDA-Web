/* ============================================================
   PyFDA Web — Fixpoint Panel UI
   ============================================================ */

const FixpointPanel = (() => {

  function init() {
    const toggle = document.getElementById('chk-fixpoint');
    const fields = document.getElementById('fixpoint-fields');

    toggle?.addEventListener('change', () => {
      const on = toggle.checked;
      AppState.fixpoint.enabled = on;
      if (fields) fields.style.display = on ? '' : 'none';

      // Clear fixpoint data and redraw plots when disabled
      if (!on) {
        AppState.fixpoint.result = null;
        bus.emit('fixpointCleared');
      }
    });

    // Bind inputs
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
  }

  function bindInput(id, key) {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (!isNaN(val) && val >= 0) AppState.fixpoint[key] = val;
    });
  }

  async function runFixpointSim() {
    if (!AppState.filter.b) {
      showToast('Design a filter first', 'error');
      return;
    }

    const btn = document.getElementById('btn-fixpoint-sim');
    const spinner = document.getElementById('fixpoint-spinner');

    try {
      if (btn) btn.disabled = true;
      if (spinner) spinner.style.display = '';

      const { b, a } = AppState.filter;
      const fs = AppState.specs.fs;
      const config = {
        coeff_qi: AppState.fixpoint.coeffQI,
        coeff_qf: AppState.fixpoint.coeffQF,
        signal_qi: AppState.fixpoint.signalQI,
        signal_qf: AppState.fixpoint.signalQF,
        overflow: AppState.fixpoint.overflow,
        quant_mode: AppState.fixpoint.quantMode,
      };

      const result = await PyodideBridge.fixpointSim(b, a, null, config);
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
