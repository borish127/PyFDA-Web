/* ============================================================
   PyFDA Web — Transient Response Plots (Impulse, Step, Stimulus)
   ============================================================ */

(function () {
  bus.on('plotImpulse', renderImpulse);
  bus.on('plotStep', renderStep);
  bus.on('plotStimulus', renderStimulus);
  bus.on('fixpointResult', () => {
    if (AppState.analysis.impulseResponse) renderImpulse(AppState.analysis.impulseResponse);
    if (AppState.analysis.stepResponse) renderStep(AppState.analysis.stepResponse);
    if (AppState.stimulus.x) renderStimulus();
  });
  bus.on('fixpointCleared', () => {
    if (AppState.analysis.impulseResponse) renderImpulse(AppState.analysis.impulseResponse);
    if (AppState.analysis.stepResponse) renderStep(AppState.analysis.stepResponse);
    if (AppState.stimulus.x) renderStimulus();
  });

  // Stimulus button
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-stimulus-run')?.addEventListener('click', runStimulus);
  });

  function renderImpulse(data) {
    const c = PlotManager.getThemeColors();

    // Stem plot: markers + lines to zero
    const traces = [];

    // Vertical stems
    for (let i = 0; i < data.n.length; i++) {
      traces.push({
        x: [data.n[i], data.n[i]],
        y: [0, data.h[i]],
        type: 'scatter',
        mode: 'lines',
        line: { color: c.primary, width: 1.5 },
        showlegend: false,
        hoverinfo: 'skip',
      });
    }

    // Markers on top
    traces.push({
      x: data.n,
      y: data.h,
      type: 'scatter',
      mode: 'markers',
      name: 'h[n]',
      marker: { color: c.primary, size: 6 },
      hovertemplate: 'n = %{x}<br>h[n] = %{y:.6e}<extra></extra>',
    });

    // Zero line
    traces.push({
      x: [data.n[0], data.n[data.n.length - 1]],
      y: [0, 0],
      type: 'scatter', mode: 'lines',
      line: { color: c.grid, width: 0.8 },
      showlegend: false, hoverinfo: 'skip',
    });

    // Fixpoint overlay
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      const y_fx = fx.y_fix_imp;
      if (y_fx) {
        for (let i = 0; i < fx.n.length; i++) {
          traces.push({
            x: [fx.n[i], fx.n[i]],
            y: [0, y_fx[i]],
            type: 'scatter', mode: 'lines',
            line: { color: c.error, width: 1, dash: 'dot' },
            showlegend: false, hoverinfo: 'skip',
          });
        }
        traces.push({
          x: fx.n,
          y: y_fx,
          type: 'scatter', mode: 'markers',
          name: `Fixpoint (${fx.total_bits}-bit)`,
          marker: { color: c.error, size: 5, symbol: 'diamond' },
          hovertemplate: 'n = %{x}<br>h_fx[n] = %{y:.6e}<extra></extra>',
        });
      }
    }

    const layout = PlotManager.baseLayout(
      'Impulse Response h[n]',
      'Sample n',
      'Amplitude',
      {
        showlegend: true,
        legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
      }
    );

    PlotManager.plotToDiv('plot-impulse', traces, layout);
  }

  function renderStep(data) {
    const c = PlotManager.getThemeColors();

    const traces = [{
      x: data.n,
      y: data.s,
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Step Response',
      line: { color: c.primary, width: 2 },
      marker: { color: c.primary, size: 4 },
      hovertemplate: 'n = %{x}<br>s[n] = %{y:.6f}<extra></extra>',
    }];

    // Overlay Fixpoint simulation data if available
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      const y_fx_step = fx.y_fix_step;
      if (y_fx_step) {
        traces.push({
          x: fx.n,
          y: y_fx_step,
          type: 'scatter',
          mode: 'lines+markers',
          name: `Fixpoint (${fx.total_bits}-bit)`,
          line: { color: c.error, width: 1.5, dash: 'dash' },
          marker: { color: c.error, size: 4, symbol: 'diamond' },
          hovertemplate: 'n = %{x}<br>s_fx[n] = %{y:.6f}<extra></extra>',
        });
      }
    }

    const layout = PlotManager.baseLayout(
      'Step Response',
      'Sample n',
      'Amplitude',
      {
        showlegend: true,
        legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
      }
    );

    PlotManager.plotToDiv('plot-step', traces, layout);
  }

  function renderStimulus() {
    if (!AppState.stimulus.x) return;
    const c = PlotManager.getThemeColors();
    const n = AppState.stimulus.n || Array.from({length: AppState.stimulus.x.length}, (_, i) => i);
    const traces = [
      {
        x: n, y: AppState.stimulus.x,
        type: 'scatter', mode: 'lines',
        name: 'Input x[n]',
        line: { color: c.secondary, width: 1.5 },
      },
      {
        x: n, y: AppState.stimulus.y,
        type: 'scatter', mode: 'lines',
        name: 'Output y[n]',
        line: { color: c.primary, width: 2.5 },
      },
    ];

    // Overlay Fixpoint simulation data if available
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      if (fx.y_fix_stim) {
        traces.push({
          x: fx.n.slice(0, fx.y_fix_stim.length),
          y: fx.y_fix_stim,
          type: 'scatter',
          mode: 'lines',
          name: `Fixpoint (${fx.total_bits}-bit)`,
          line: { color: c.error, width: 2, dash: 'dash' },
        });
      }
    }

    const layout = PlotManager.baseLayout(
      'Stimulus Response',
      'Sample n',
      'Amplitude',
      {
        showlegend: true,
        legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
      }
    );

    PlotManager.plotToDiv('plot-stimulus-chart', traces, layout);
  }

  async function runStimulus() {
    if (!AppState.filter.b) {
      showToast('Design a filter first', 'error');
      return;
    }

    const expr = document.getElementById('inp-stimulus')?.value;
    if (!expr) { showToast('Enter a stimulus expression', 'error'); return; }

    try {
      const result = await PyodideBridge.stimulusResponse(
        AppState.filter.b, AppState.filter.a, expr, AppState.specs.fs, 512
      );

      // Persist stimulus data so fixpoint sim can use the same input signal
      AppState.stimulus.n = result.n;
      AppState.stimulus.x = result.x;
      AppState.stimulus.y = result.y;

      renderStimulus();

    } catch (err) {
      showToast(`Stimulus error: ${err.message}`, 'error');
    }
  }
})();
