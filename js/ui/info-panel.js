/* ============================================================
   PyFDA Web — Design Info & H(f) Verification Panel
   Displays filter metrics, stability, target vs achieved H(f) table,
   and method-specific algorithm notes matching pyfda Input Info tab.
   ============================================================ */

const InfoPanel = (() => {
  const METHOD_DOCS = {
    butter: 'Butterworth IIR: Maximally flat magnitude response in passband & stopband (no ripple), monotonic transition. Steepness increases with filter order N.',
    cheby1: 'Chebyshev Type I IIR: Equiripple in passband (Apb) and monotonic in stopband. Achieves steeper roll-off than Butterworth for the same order.',
    cheby2: 'Chebyshev Type II (Inverse) IIR: Monotonic in passband and equiripple in stopband (Asb). Often preferred when passband flatness matters.',
    ellip: 'Elliptic (Cauer) IIR: Equiripple in both passband and stopband; yields the minimum possible filter order for given Apb, Asb, and transition width.',
    bessel: 'Bessel / Thomson IIR: Maximally flat group delay in the passband with minimal pulse overshoot. Order estimation uses a Butterworth fallback if Auto.',
    firwin: 'Windowed FIR (firwin): Linear-phase FIR obtained by truncating the ideal sinc impulse response with a selected taper window.',
    firwin2: 'Arbitrary Frequency Sampling FIR (firwin2): Windowed linear-phase FIR fitting piecewise target points.',
    remez: 'Equiripple (Parks-McClellan / Remez): Optimal minimax Chebyshev approximation weighted by W_PB / W_SB. Supports LP/HP/BP/BS, Hilbert, and Differentiator.',
    firls: 'Least-Squares (firls): Minimizes the weighted integrated squared error between ideal and achieved response over specified bands.',
    mavg: 'Moving Average FIR: Cascaded boxcar integrators yielding exact sinc nulls at f_S / N with constant group delay.',
  };

  function init() {
    bus.on('filterDesigned', updateInfo);
  }

  function getScaledSpecs() {
    const s = { ...AppState.specs };
    const mul = (typeof InputSpecs !== 'undefined' && InputSpecs.getFreqMultiplier)
      ? InputSpecs.getFreqMultiplier() : 1;
    if (s.freqUnit !== 'normalized' && s.freqUnit !== 'f_ny') {
      s.fs *= mul; s.fpb *= mul; s.fsb *= mul; s.fpb2 *= mul; s.fsb2 *= mul;
    }
    return s;
  }

  async function updateInfo() {
    const summaryEl = document.getElementById('info-summary');
    const docEl = document.getElementById('info-algo-text');
    const hfWrap = document.getElementById('info-hf-wrap');
    const tbody = document.getElementById('tbody-info-hf');
    if (!summaryEl) return;

    const { b, a, poles, order, method, sos } = AppState.filter;
    const dm = AppState.specs.designMethod;
    if (docEl) docEl.textContent = METHOD_DOCS[dm] || 'Custom filter coefficients or P/Z edit.';

    if (!b || !a) {
      summaryEl.textContent = 'Design a filter to inspect performance and stability.';
      if (hfWrap) hfWrap.style.display = 'none';
      return;
    }

    const maxPole = (poles && poles.length)
      ? Math.max(...poles.map(p => Array.isArray(p) ? Math.hypot(p[0], p[1]) : Math.hypot(p.re, p.im)))
      : 0;
    const stable = maxPole < 1.00001;
    const stages = sos ? sos.length : Math.ceil(order / 2);
    const sumB = b.reduce((s, v) => s + v, 0);
    const sumA = a.reduce((s, v) => s + v, 0);
    const dcGain = Math.abs(sumA) > 1e-12 ? Math.abs(sumB / sumA) : 0;
    const dcDb = 20 * Math.log10(Math.max(dcGain, 1e-12));

    summaryEl.replaceChildren();
    const lines = [
      `Method: ${method || dm}  |  Order N = ${order}  |  SOS Stages = ${stages}`,
      `Max |pole| = ${maxPole.toFixed(5)} (${stable ? 'Stable' : 'UNSTABLE'})`,
      `DC Gain |H(0)| = ${dcGain.toFixed(4)} (${dcDb.toFixed(2)} dB)`,
    ];
    lines.forEach((line, idx) => {
      const div = document.createElement('div');
      div.textContent = line;
      if (idx === 1) {
        div.style.color = stable ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)';
        div.style.fontWeight = '600';
      }
      summaryEl.appendChild(div);
    });

    if (!tbody || !hfWrap) return;
    try {
      const perf = await PyodideBridge.filterPerformance(b, a, getScaledSpecs());
      const rows = perf.rows || [];
      if (!rows.length) {
        hfWrap.style.display = 'none';
        return;
      }
      hfWrap.style.display = '';
      tbody.replaceChildren();
      rows.forEach(r => {
        const tr = document.createElement('tr');
        const tdBand = document.createElement('td');
        tdBand.textContent = `${r.label} (${formatHz(r.freq)})`;

        const tdSpec = document.createElement('td');
        tdSpec.textContent = `${Number(r.spec_db).toFixed(2)} dB`;

        const tdAct = document.createElement('td');
        tdAct.textContent = `${Number(r.actual_db).toFixed(2)} dB`;

        const tdOk = document.createElement('td');
        tdOk.textContent = r.passed ? 'PASS' : 'FAIL';
        tdOk.style.fontWeight = '700';
        tdOk.style.color = r.passed ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)';

        tr.append(tdBand, tdSpec, tdAct, tdOk);
        tbody.appendChild(tr);
      });
    } catch (e) {
      hfWrap.style.display = 'none';
    }
  }

  function formatHz(f) {
    const n = Number(f);
    if (!Number.isFinite(n)) return '';
    if (n <= 1.0 && (AppState.specs.freqUnit === 'normalized' || AppState.specs.freqUnit === 'f_ny')) {
      return AppState.specs.freqUnit === 'f_ny' ? (n * 2).toFixed(3) : n.toFixed(3);
    }
    const mul = (typeof InputSpecs !== 'undefined' && InputSpecs.getFreqMultiplier)
      ? InputSpecs.getFreqMultiplier() : 1;
    const val = n / mul;
    return val >= 100 ? val.toFixed(1) : val.toPrecision(4);
  }

  return { init };
})();
