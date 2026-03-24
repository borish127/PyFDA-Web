/* ============================================================
   PyFDA Web — Magnitude & Phase Response Plot
   With two-sided spectrum toggle and spec bounds overlay
   ============================================================ */

(function () {
  bus.on('plotFreqResponse', render);
  bus.on('fixpointResult', renderFixpointOverlay);
  bus.on('fixpointCleared', () => {
    // Redraw without fixpoint
    if (AppState.analysis.freqResponse) render(AppState.analysis.freqResponse);
  });

  // UI state for plot toggles
  const plotOpts = {
    showSpecs: true,
    twoSided: false,
  };

  // Bind toolbar toggles after DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('chk-show-specs')?.addEventListener('change', (e) => {
      plotOpts.showSpecs = e.target.checked;
      if (AppState.analysis.freqResponse) render(AppState.analysis.freqResponse);
    });
    document.getElementById('chk-two-sided')?.addEventListener('change', (e) => {
      plotOpts.twoSided = e.target.checked;
      if (AppState.analysis.freqResponse) render(AppState.analysis.freqResponse);
    });
  });

  function render(data) {
    const c = PlotManager.getThemeColors();
    const tab = AppState.ui.activeTab;

    if (tab === 'magnitude') {
      renderMagnitude(data, c);
    } else if (tab === 'phase') {
      renderPhase(data, c);
    }
  }

  function getFreqMultiplier() {
    const u = AppState.specs.freqUnit;
    if (u === 'khz') return 1e-3;
    if (u === 'mhz') return 1e-6;
    if (u === 'ghz') return 1e-9;
    return 1; // hz
  }

  function getFreqLabel() {
    const u = AppState.specs.freqUnit;
    if (u === 'khz') return 'kHz';
    if (u === 'mhz') return 'MHz';
    if (u === 'ghz') return 'GHz';
    if (u === 'normalized') return 'Normalized';
    return 'Hz';
  }

  function renderMagnitude(data, c) {
    const specs = AppState.specs;
    const traces = [];
    const fMul = getFreqMultiplier();
    const fLabel = getFreqLabel();
    const isNorm = specs.freqUnit === 'normalized';

    let freqX = isNorm ? data.freq.map(f => f / specs.fs) : data.freq.map(f => f * fMul);
    let magY = data.mag_db;

    // Two-sided: mirror to negative frequencies
    if (plotOpts.twoSided && freqX.length > 0) {
      const negFreq = freqX.slice().reverse().map(f => -f);
      const negMag = magY.slice().reverse();
      freqX = [...negFreq, ...freqX];
      magY = [...negMag, ...magY];
    }

    traces.push({
      x: freqX,
      y: magY,
      type: 'scatter',
      mode: 'lines',
      name: '|H(f)| (dB)',
      line: { color: c.primary, width: 2.5 },
      hovertemplate: `%{x:.4g} ${fLabel}<br>%{y:.2f} dB<extra></extra>`,
    });

    // Spec-band shading
    const shapes = [];
    if (plotOpts.showSpecs) {
      const fpb = specs.fpb * fMul;
      const fsb = specs.fsb * fMul;
      const fpb2 = specs.fpb2 * fMul;
      const fsb2 = specs.fsb2 * fMul;
      const nyq = (AppState.specs.freqUnit === 'normalized' ? 0.5 : (specs.fs / 2)) * fMul;

      if (specs.responseType === 'lowpass') {
        // Passband: 0 to Fpb, amplitude -Apb to 0
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: plotOpts.twoSided ? -fpb : 0, x1: fpb,
          y0: -specs.apb, y1: 5,
          fillcolor: 'rgba(76, 175, 80, 0.08)',
          line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
        });
        // Stopband: Fsb to Nyq
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fsb, x1: nyq,
          y0: -150, y1: -specs.asb,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
        });
        if (plotOpts.twoSided) {
          shapes.push({
            type: 'rect', xref: 'x', yref: 'y',
            x0: -nyq, x1: -fsb,
            y0: -150, y1: -specs.asb,
            fillcolor: 'rgba(244, 67, 54, 0.06)',
            line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
          });
        }
      } else if (specs.responseType === 'highpass') {
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fpb, x1: nyq,
          y0: -specs.apb, y1: 5,
          fillcolor: 'rgba(76, 175, 80, 0.08)',
          line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
        });
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: 0, x1: fsb,
          y0: -150, y1: -specs.asb,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
        });
      } else if (specs.responseType === 'bandpass') {
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fpb, x1: fpb2,
          y0: -specs.apb, y1: 5,
          fillcolor: 'rgba(76, 175, 80, 0.08)',
          line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
        });
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: 0, x1: fsb,
          y0: -150, y1: -specs.asb,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
        });
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fsb2, x1: nyq,
          y0: -150, y1: -specs.asb,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
        });
      } else if (specs.responseType === 'bandstop') {
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: 0, x1: fpb,
          y0: -specs.apb, y1: 5,
          fillcolor: 'rgba(76, 175, 80, 0.08)',
          line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
        });
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fpb2, x1: nyq,
          y0: -specs.apb, y1: 5,
          fillcolor: 'rgba(76, 175, 80, 0.08)',
          line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
        });
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fsb, x1: fsb2,
          y0: -150, y1: -specs.asb,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
        });
      }
    }

    const layout = PlotManager.baseLayout(
      '|H(f)| Magnitude Response',
      `Frequency (${fLabel})`,
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
    const fMul = getFreqMultiplier();
    const fLabel = getFreqLabel();
    const isNorm = AppState.specs.freqUnit === 'normalized';
    
    let freqX = isNorm ? data.freq.map(f => f / AppState.specs.fs) : data.freq.map(f => f * fMul);
    let phaseY = data.phase_deg;

    if (plotOpts.twoSided && freqX.length > 0) {
      const negFreq = freqX.slice().reverse().map(f => -f);
      const negPhase = phaseY.slice().reverse().map(p => -p);
      freqX = [...negFreq, ...freqX];
      phaseY = [...negPhase, ...phaseY];
    }

    const traces = [{
      x: freqX,
      y: phaseY,
      type: 'scatter',
      mode: 'lines',
      name: 'Phase (deg)',
      line: { color: c.tertiary, width: 2.5 },
      hovertemplate: `%{x:.4g} ${fLabel}<br>%{y:.2f}°<extra></extra>`,
    }];

    const layout = PlotManager.baseLayout(
      'Phase Response',
      `Frequency (${fLabel})`,
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
    const fMul = getFreqMultiplier();
    const nyq = AppState.specs.freqUnit === 'normalized' ? 0.5 : fs / 2;

    const el = document.getElementById('plot-magnitude');
    if (!el || !el.data) return;

    const freqHz = fxData.freq_norm.map(f => f * nyq * fMul);

    Plotly.addTraces(el, {
      x: freqHz,
      y: fxData.mag_fix_db,
      type: 'scatter',
      mode: 'lines',
      name: `Fixpoint (${fxData.total_bits}-bit)`,
      line: { color: c.error, width: 2, dash: 'dash' },
      hovertemplate: `%{x:.4g}<br>%{y:.2f} dB (FX)<extra></extra>`,
    });
  }
})();
