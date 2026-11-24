/* ============================================================
   PyFDA Web — Time-Domain Transient & Stimulus/FFT Plots
   Supports Impulse, Step, and full Stimulus Generator (presets,
   noise, bandlimiting, time vs FFT spectrum, fixpoint & error).
   ============================================================ */

(function () {
  bus.on('plotImpulse', renderImpulse);
  bus.on('plotStep', renderStep);
  bus.on('plotStimulus', runStimulus);
  bus.on('fixpointResult', () => {
    if (AppState.analysis.impulseResponse && AppState.ui.activeTab === 'impulse') renderImpulse(AppState.analysis.impulseResponse);
    if (AppState.analysis.stepResponse && AppState.ui.activeTab === 'step') renderStep(AppState.analysis.stepResponse);
    if (AppState.ui.activeTab === 'stimulus') renderStimulusCached();
  });
  bus.on('fixpointCleared', () => {
    if (AppState.analysis.impulseResponse && AppState.ui.activeTab === 'impulse') renderImpulse(AppState.analysis.impulseResponse);
    if (AppState.analysis.stepResponse && AppState.ui.activeTab === 'step') renderStep(AppState.analysis.stepResponse);
    if (AppState.ui.activeTab === 'stimulus') renderStimulusCached();
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-stimulus-run')?.addEventListener('click', runStimulus);
    document.getElementById('sel-stim-type')?.addEventListener('change', (e) => {
      const exprField = document.getElementById('field-stim-expr');
      if (exprField) exprField.style.display = e.target.value === 'custom' ? '' : 'none';
      if (AppState.ui.activeTab === 'stimulus' && AppState.filter.b) runStimulus();
    });

    ['sel-stim-domain', 'chk-stim-db', 'chk-stim-err', 'chk-stim-stem', 'inp-stim-dbmin'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderStimulusCached);
    });
    ['sel-stim-noise', 'sel-stim-win', 'chk-stim-bl'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        if (AppState.ui.activeTab === 'stimulus' && AppState.filter.b) runStimulus();
      });
    });
  });

  function buildStemTraces(x, y, name, color) {
    const stemX = [];
    const stemY = [];
    for (let i = 0; i < x.length; i++) {
      stemX.push(x[i], x[i], null);
      stemY.push(0, y[i], null);
    }
    return [
      {
        x: stemX, y: stemY,
        type: 'scatter', mode: 'lines',
        line: { color, width: 1.5 },
        showlegend: false, hoverinfo: 'skip',
      },
      {
        x, y,
        type: 'scatter', mode: 'markers',
        name,
        marker: { color, size: 6 },
        hovertemplate: 'n = %{x}<br>y = %{y:.5f}<extra></extra>',
      },
    ];
  }

  function renderImpulse(data) {
    const c = PlotManager.getThemeColors();
    let maxIdx = data.h.length - 1;
    while (maxIdx > 20 && Math.abs(data.h[maxIdx]) < 1e-6) maxIdx--;
    const nSlice = data.n.slice(0, maxIdx + 5);
    const hSlice = data.h.slice(0, maxIdx + 5);

    const traces = buildStemTraces(nSlice, hSlice, 'h[n] (Float)', c.primary);
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      traces.push({
        x: fx.n.slice(0, nSlice.length),
        y: fx.y_fix_imp.slice(0, nSlice.length),
        type: 'scatter', mode: 'markers',
        name: `h_q[n] (${fx.total_bits}b)`,
        marker: { color: c.error, size: 6, symbol: 'diamond-open', line: { width: 2 } },
      });
    }

    const layout = PlotManager.baseLayout('Impulse Response h[n]', 'Sample index (n)', 'Amplitude', {
      showlegend: true, legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
    });
    PlotManager.plotToDiv('plot-impulse', traces, layout);
  }

  function renderStep(data) {
    const c = PlotManager.getThemeColors();
    const traces = [{
      x: data.n, y: data.s,
      type: 'scatter', mode: 'lines',
      name: 'Step s[n]',
      line: { color: c.primary, width: 2.5 },
      hovertemplate: 'n = %{x}<br>s[n] = %{y:.5f}<extra></extra>',
    }];
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      traces.push({
        x: fx.n.slice(0, data.n.length),
        y: fx.y_fix_step.slice(0, data.n.length),
        type: 'scatter', mode: 'lines',
        name: `s_q[n] (${fx.total_bits}b)`,
        line: { color: c.error, width: 2, dash: 'dash' },
      });
    }
    const layout = PlotManager.baseLayout('Step Response s[n]', 'Sample index (n)', 'Amplitude', {
      showlegend: true, legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
    });
    PlotManager.plotToDiv('plot-step', traces, layout);
  }

  function getStimulusOptions() {
    const num = (id, dflt) => {
      const v = parseFloat(document.getElementById(id)?.value);
      return Number.isFinite(v) ? v : dflt;
    };
    const fs = (typeof InputSpecs !== 'undefined' && InputSpecs.getEffectiveFsHz)
      ? InputSpecs.getEffectiveFsHz()
      : (AppState.specs.fs || 48000);
    return {
      stim_type: document.getElementById('sel-stim-type')?.value || 'sine',
      stim_expr: document.getElementById('inp-stimulus')?.value?.trim() || 'sin(2*pi*n*1000/fs)',
      fs,
      n_samples: Math.max(16, Math.min(8192, Math.round(num('inp-stim-n', 256)))),
      n_start: Math.max(0, Math.round(num('inp-stim-n0', 0))),
      amp: num('inp-stim-amp', 1),
      freq1: num('inp-stim-f1', 1000),
      phi1_deg: num('inp-stim-phi', 0),
      dc: num('inp-stim-dc', 0),
      noise_type: document.getElementById('sel-stim-noise')?.value || 'none',
      noise_std: Math.max(0, num('inp-stim-noise-std', 0.1)),
      bandlimit: Boolean(document.getElementById('chk-stim-bl')?.checked),
      fft_win: document.getElementById('sel-stim-win')?.value || 'rectangular',
    };
  }

  async function runStimulus() {
    if (!AppState.filter.b) return;
    try {
      const opts = getStimulusOptions();
      const res = await PyodideBridge.stimulusResponse(AppState.filter.b, AppState.filter.a, opts);
      AppState.lastStimulus = { ...res, ...opts };

      if (AppState.fixpoint.enabled && typeof FixpointPanel !== 'undefined') {
        await FixpointPanel.runFixpointSim(res.x, opts);
      } else {
        renderStimulusPlot(res);
      }
    } catch (err) {
      showToast(`Stimulus error: ${err.message}`, 'error');
    }
  }

  function renderStimulusCached() {
    if (AppState.lastStimulus) renderStimulusPlot(AppState.lastStimulus);
  }

  function renderStimulusPlot(data) {
    const c = PlotManager.getThemeColors();
    const domain = document.getElementById('sel-stim-domain')?.value || 'time';
    const isDb = Boolean(document.getElementById('chk-stim-db')?.checked);
    const showErr = Boolean(document.getElementById('chk-stim-err')?.checked);
    const isStem = Boolean(document.getElementById('chk-stim-stem')?.checked);
    const dbMin = parseFloat(document.getElementById('inp-stim-dbmin')?.value) || -100;

    const fx = (AppState.fixpoint.enabled && AppState.fixpoint.result) ? AppState.fixpoint.result : null;
    const metricsEl = document.getElementById('stim-metrics');
    if (metricsEl) {
      const pXqText = fx && fx.p_xq_dbw !== null && fx.p_xq_dbw !== undefined
        ? ` | P_Xq = ${fx.p_xq_dbw.toFixed(2)} dBW | P_Yq = ${fx.p_yq_dbw?.toFixed(2) ?? '—'} dBW`
        : '';
      metricsEl.textContent = `P_X = ${data.p_x_dbw.toFixed(2)} dBW | P_Y = ${data.p_y_dbw.toFixed(2)} dBW${pXqText} | NENBW = ${data.nenbw.toFixed(2)} (${data.nenbw_db.toFixed(2)} dB) | CGAIN = ${data.cgain.toFixed(3)}`;
    }

    const traces = [];
    if (domain === 'fft') {
      const yX = isDb ? data.x_fft_db : data.x_fft_lin;
      const yY = isDb ? data.y_fft_db : data.y_fft_lin;
      traces.push({
        x: data.fft_freq, y: yX,
        type: 'scatter', mode: 'lines',
        name: 'Input X(f)', line: { color: c.textSecondary, width: 1.5, dash: 'dot' },
      });
      traces.push({
        x: data.fft_freq, y: yY,
        type: 'scatter', mode: 'lines',
        name: 'Output Y(f)', line: { color: c.primary, width: 2.3 },
      });
      if (fx && fx.y_fix_fft_db && fx.y_fix_fft_db.length === data.fft_freq.length) {
        const yFix = isDb ? fx.y_fix_fft_db : fx.y_fix_fft_db.map(v => Math.pow(10, v / 20));
        traces.push({
          x: data.fft_freq, y: yFix,
          type: 'scatter', mode: 'lines',
          name: `Output Y_q(f) (${fx.total_bits}b)`, line: { color: c.error, width: 2, dash: 'dash' },
        });
      }
      const layout = PlotManager.baseLayout(
        'Stimulus FFT Spectrum',
        'Frequency (Hz)',
        isDb ? 'Magnitude (dB)' : 'Magnitude (Linear)',
        {
          showlegend: true,
          legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
          yaxis: isDb ? { range: [dbMin, 5], title: { text: 'Magnitude (dB)', font: { size: 13 } }, gridcolor: c.grid } : undefined,
        }
      );
      PlotManager.plotToDiv('plot-stimulus-chart', traces, layout);
      return;
    }

    // Time domain
    const n0 = data.n_start || 0;
    const xPlot = n0 < data.n.length ? data.n.slice(n0) : data.n;
    const xArr = n0 < data.x.length ? data.x.slice(n0) : data.x;
    const yArr = n0 < data.y.length ? data.y.slice(n0) : data.y;
    const toPlotY = (arr) => isDb ? arr.map(v => Math.max(dbMin, 20 * Math.log10(Math.max(Math.abs(v), 1e-12)))) : arr;

    traces.push({
      x: xPlot, y: toPlotY(xArr),
      type: 'scatter', mode: isStem ? 'lines+markers' : 'lines',
      name: 'Input x[n]', line: { color: c.textSecondary, width: 1.5, dash: 'dot' },
    });
    if (isStem) {
      traces.push(...buildStemTraces(xPlot, toPlotY(yArr), 'Output y[n]', c.primary));
    } else {
      traces.push({
        x: xPlot, y: toPlotY(yArr),
        type: 'scatter', mode: 'lines',
        name: 'Output y[n]', line: { color: c.primary, width: 2.3 },
      });
    }

    if (fx && fx.y_fix_stim && fx.y_fix_stim.length === data.y.length) {
      const yFix = n0 < fx.y_fix_stim.length ? fx.y_fix_stim.slice(n0) : fx.y_fix_stim;
      traces.push({
        x: xPlot, y: toPlotY(yFix),
        type: 'scatter', mode: isStem ? 'markers' : 'lines',
        name: `Fixpoint y_q[n] (${fx.total_bits}b)`, line: { color: c.error, width: 2, dash: 'dash' },
      });
      if (showErr) {
        const err = yArr.map((v, i) => v - yFix[i]);
        traces.push({
          x: xPlot, y: toPlotY(err),
          type: 'scatter', mode: 'lines',
          name: 'Error (y - y_q)', line: { color: '#ff9800', width: 1.6 },
        });
      }
    }

    const layout = PlotManager.baseLayout(
      'Stimulus Response (Time)',
      'Sample index (n)',
      isDb ? 'Amplitude (dB)' : 'Amplitude',
      { showlegend: true, legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' } }
    );
    PlotManager.plotToDiv('plot-stimulus-chart', traces, layout);
  }
})();
