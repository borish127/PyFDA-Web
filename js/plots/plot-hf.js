/* ============================================================
   PyFDA Web — Magnitude & Phase Response Plot
   ============================================================ */

(function () {
  bus.on('plotFreqResponse', render);
  bus.on('fixpointResult', renderFixpointOverlay);

  function render(data) {
    const c = PlotManager.getThemeColors();
    const tab = AppState.ui.activeTab;

    if (tab === 'magnitude') {
      renderMagnitude(data, c);
    } else if (tab === 'phase') {
      renderPhase(data, c);
    }
  }

  function renderMagnitude(data, c) {
    const specs = AppState.specs;
    const traces = [];

    // Main magnitude trace
    traces.push({
      x: data.freq,
      y: data.mag_db,
      type: 'scatter',
      mode: 'lines',
      name: '|H(f)| (dB)',
      line: { color: c.primary, width: 2.5 },
      hovertemplate: '%{x:.1f} Hz<br>%{y:.2f} dB<extra></extra>',
    });

    // Spec-band shading
    const nyq = specs.fs / 2;
    const shapes = [];

    if (['lowpass', 'bandpass', 'bandstop'].includes(specs.responseType)) {
      // Passband tolerance band
      shapes.push({
        type: 'rect',
        x0: 0,
        x1: specs.responseType === 'lowpass' ? specs.fpb : (specs.responseType === 'bandpass' ? specs.fpb : specs.fpb),
        y0: -specs.apb,
        y1: 5,
        fillcolor: 'rgba(76, 175, 80, 0.08)',
        line: { color: 'rgba(76, 175, 80, 0.3)', width: 1 },
      });

      // Stopband region
      if (specs.responseType === 'lowpass') {
        shapes.push({
          type: 'rect',
          x0: specs.fsb, x1: nyq,
          y0: -120, y1: -specs.asb,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.3)', width: 1 },
        });
      }
    }

    const layout = PlotManager.baseLayout(
      '|H(f)| Magnitude Response',
      'Frequency (Hz)',
      'Magnitude (dB)',
      {
        shapes,
        yaxis: {
          title: { text: 'Magnitude (dB)', font: { size: 13 } },
          gridcolor: c.grid,
          zerolinecolor: c.grid,
          range: [Math.min(-80, ...(data.mag_db || [-80])), 5],
        },
        showlegend: true,
        legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
      }
    );

    PlotManager.plotToDiv('plot-magnitude', traces, layout);
  }

  function renderPhase(data, c) {
    const traces = [{
      x: data.freq,
      y: data.phase_deg,
      type: 'scatter',
      mode: 'lines',
      name: 'Phase (deg)',
      line: { color: c.tertiary, width: 2.5 },
      hovertemplate: '%{x:.1f} Hz<br>%{y:.2f}°<extra></extra>',
    }];

    const layout = PlotManager.baseLayout(
      'Phase Response',
      'Frequency (Hz)',
      'Phase (degrees)',
      { showlegend: true, legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' } }
    );

    PlotManager.plotToDiv('plot-phase', traces, layout);
  }

  function renderFixpointOverlay(fxData) {
    if (AppState.ui.activeTab !== 'magnitude') return;
    if (!fxData || !fxData.freq_norm) return;

    const c = PlotManager.getThemeColors();
    const fs = AppState.specs.fs;

    // Add fixpoint trace on top of existing plot
    const el = document.getElementById('plot-magnitude');
    if (!el || !el.data) return;

    const freqHz = fxData.freq_norm.map(f => f * fs / 2);

    Plotly.addTraces(el, {
      x: freqHz,
      y: fxData.mag_fix_db,
      type: 'scatter',
      mode: 'lines',
      name: `Fixpoint (${fxData.total_bits}-bit)`,
      line: { color: c.error, width: 2, dash: 'dash' },
      hovertemplate: '%{x:.1f} Hz<br>%{y:.2f} dB (FX)<extra></extra>',
    });
  }
})();
