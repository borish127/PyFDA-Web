/* ============================================================
   PyFDA Web — Magnitude & Phase Response Plot
   With magnitude scale options, phase wrapping, unit selection,
   two-sided spectrum toggle, and spec bounds overlay
   ============================================================ */

(function () {
  bus.on('plotFreqResponse', render);
  bus.on('fixpointResult', () => {
    if (AppState.analysis.freqResponse) render(AppState.analysis.freqResponse);
  });
  bus.on('fixpointCleared', () => {
    if (AppState.analysis.freqResponse) render(AppState.analysis.freqResponse);
  });

  // UI state for plot toggles
  const plotOpts = {
    showSpecs: true,
    twoSided: false,
    magScale: 'db', // 'db', 'linear', 'power'
  };

  const phaseOpts = {
    unit: 'deg', // 'deg', 'rad'
    wrap: 'unwrap', // 'unwrap', 'wrap'
  };

  function wrapPhaseDeg(deg) {
    let wrapped = (deg + 180) % 360;
    if (wrapped < 0) wrapped += 360;
    return wrapped - 180;
  }

  function wrapPhaseRad(rad) {
    let wrapped = (rad + Math.PI) % (2 * Math.PI);
    if (wrapped < 0) wrapped += 2 * Math.PI;
    return wrapped - Math.PI;
  }

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
    document.getElementById('sel-mag-scale')?.addEventListener('change', (e) => {
      plotOpts.magScale = e.target.value;
      if (AppState.analysis.freqResponse) render(AppState.analysis.freqResponse);
    });
    document.getElementById('sel-phase-unit')?.addEventListener('change', (e) => {
      phaseOpts.unit = e.target.value;
      if (AppState.analysis.freqResponse) render(AppState.analysis.freqResponse);
    });
    document.getElementById('sel-phase-wrap')?.addEventListener('change', (e) => {
      phaseOpts.wrap = e.target.value;
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
    
    let magY = [];
    let traceName = '';
    let hoverTemplate = '';
    let yLabel = '';

    if (plotOpts.magScale === 'db') {
      magY = data.mag_db;
      traceName = '|H(f)| (dB)';
      hoverTemplate = `%{x:.4g} ${fLabel}<br>%{y:.2f} dB<extra></extra>`;
      yLabel = 'Magnitude (dB)';
    } else if (plotOpts.magScale === 'linear') {
      magY = data.mag;
      traceName = '|H(f)| (Linear)';
      hoverTemplate = `%{x:.4g} ${fLabel}<br>%{y:.4f}<extra></extra>`;
      yLabel = 'Magnitude (Absolute)';
    } else if (plotOpts.magScale === 'power') {
      magY = data.mag.map(m => m * m);
      traceName = '|H(f)|² (Power)';
      hoverTemplate = `%{x:.4g} ${fLabel}<br>%{y:.4f}<extra></extra>`;
      yLabel = 'Power (Squared Magnitude)';
    }

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
      name: traceName,
      line: { color: c.primary, width: 2.5 },
      hovertemplate: hoverTemplate,
    });

    // Overlay Fixpoint simulation data if available
    let fxMagY = [];
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      const nyq = specs.freqUnit === 'normalized' ? 0.5 : specs.fs / 2;
      let fxFreqX = fx.freq_norm.map(f => f * nyq * fMul);
      
      let fxHoverTemplate = '';

      if (plotOpts.magScale === 'db') {
        fxMagY = fx.mag_fix_db;
        fxHoverTemplate = `%{x:.4g} ${fLabel}<br>%{y:.2f} dB (FX)<extra></extra>`;
      } else if (plotOpts.magScale === 'linear') {
        fxMagY = fx.mag_fix_db.map(db => Math.pow(10, db / 20));
        fxHoverTemplate = `%{x:.4g} ${fLabel}<br>%{y:.4f} (FX)<extra></extra>`;
      } else if (plotOpts.magScale === 'power') {
        fxMagY = fx.mag_fix_db.map(db => Math.pow(10, db / 10));
        fxHoverTemplate = `%{x:.4g} ${fLabel}<br>%{y:.4f} (FX)<extra></extra>`;
      }

      if (plotOpts.twoSided && fxFreqX.length > 0) {
        const negFreq = fxFreqX.slice().reverse().map(f => -f);
        const negMag = fxMagY.slice().reverse();
        fxFreqX = [...negFreq, ...fxFreqX];
        fxMagY = [...negMag, ...fxMagY];
      }

      traces.push({
        x: fxFreqX,
        y: fxMagY,
        type: 'scatter',
        mode: 'lines',
        name: `Fixpoint (${fx.total_bits}-bit)`,
        line: { color: c.error, width: 2, dash: 'dash' },
        hovertemplate: fxHoverTemplate,
      });
    }

    // Spec-band shading
    const shapes = [];
    if (plotOpts.showSpecs) {
      const fpb = specs.fpb * fMul;
      const fsb = specs.fsb * fMul;
      const fpb2 = specs.fpb2 * fMul;
      const fsb2 = specs.fsb2 * fMul;
      const nyq = (AppState.specs.freqUnit === 'normalized' ? 0.5 : (specs.fs / 2)) * fMul;

      // Calculate spec limits based on current magnitude scale
      let pb_y0, pb_y1, sb_y0, sb_y1;
      if (plotOpts.magScale === 'db') {
        pb_y0 = -specs.apb;
        pb_y1 = 5;
        sb_y0 = -150;
        sb_y1 = -specs.asb;
      } else if (plotOpts.magScale === 'linear') {
        pb_y0 = Math.pow(10, -specs.apb / 20);
        pb_y1 = 1.05;
        sb_y0 = 0;
        sb_y1 = Math.pow(10, -specs.asb / 20);
      } else if (plotOpts.magScale === 'power') {
        pb_y0 = Math.pow(10, -specs.apb / 10);
        pb_y1 = 1.1;
        sb_y0 = 0;
        sb_y1 = Math.pow(10, -specs.asb / 10);
      }

      if (specs.responseType === 'lowpass') {
        // Passband: 0 to Fpb
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: plotOpts.twoSided ? -fpb : 0, x1: fpb,
          y0: pb_y0, y1: pb_y1,
          fillcolor: 'rgba(76, 175, 80, 0.08)',
          line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
        });
        // Stopband: Fsb to Nyq
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fsb, x1: nyq,
          y0: sb_y0, y1: sb_y1,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
        });
        if (plotOpts.twoSided) {
          shapes.push({
            type: 'rect', xref: 'x', yref: 'y',
            x0: -nyq, x1: -fsb,
            y0: sb_y0, y1: sb_y1,
            fillcolor: 'rgba(244, 67, 54, 0.06)',
            line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
          });
        }
      } else if (specs.responseType === 'highpass') {
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fpb, x1: nyq,
          y0: pb_y0, y1: pb_y1,
          fillcolor: 'rgba(76, 175, 80, 0.08)',
          line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
        });
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: plotOpts.twoSided ? -fsb : 0, x1: fsb,
          y0: sb_y0, y1: sb_y1,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
        });
        if (plotOpts.twoSided) {
          shapes.push({
            type: 'rect', xref: 'x', yref: 'y',
            x0: -nyq, x1: -fpb,
            y0: pb_y0, y1: pb_y1,
            fillcolor: 'rgba(76, 175, 80, 0.08)',
            line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
          });
          shapes.push({
            type: 'rect', xref: 'x', yref: 'y',
            x0: -fsb, x1: 0,
            y0: sb_y0, y1: sb_y1,
            fillcolor: 'rgba(244, 67, 54, 0.06)',
            line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
          });
        }
      } else if (specs.responseType === 'bandpass') {
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fpb, x1: fpb2,
          y0: pb_y0, y1: pb_y1,
          fillcolor: 'rgba(76, 175, 80, 0.08)',
          line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
        });
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: plotOpts.twoSided ? -fsb : 0, x1: fsb,
          y0: sb_y0, y1: sb_y1,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
        });
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fsb2, x1: nyq,
          y0: sb_y0, y1: sb_y1,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
        });
        if (plotOpts.twoSided) {
          shapes.push({
            type: 'rect', xref: 'x', yref: 'y',
            x0: -fpb2, x1: -fpb,
            y0: pb_y0, y1: pb_y1,
            fillcolor: 'rgba(76, 175, 80, 0.08)',
            line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
          });
          shapes.push({
            type: 'rect', xref: 'x', yref: 'y',
            x0: -fsb, x1: 0,
            y0: sb_y0, y1: sb_y1,
            fillcolor: 'rgba(244, 67, 54, 0.06)',
            line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
          });
          shapes.push({
            type: 'rect', xref: 'x', yref: 'y',
            x0: -nyq, x1: -fsb2,
            y0: sb_y0, y1: sb_y1,
            fillcolor: 'rgba(244, 67, 54, 0.06)',
            line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
          });
        }
      } else if (specs.responseType === 'bandstop') {
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: plotOpts.twoSided ? -fpb : 0, x1: fpb,
          y0: pb_y0, y1: pb_y1,
          fillcolor: 'rgba(76, 175, 80, 0.08)',
          line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
        });
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fpb2, x1: nyq,
          y0: pb_y0, y1: pb_y1,
          fillcolor: 'rgba(76, 175, 80, 0.08)',
          line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
        });
        shapes.push({
          type: 'rect', xref: 'x', yref: 'y',
          x0: fsb, x1: fsb2,
          y0: sb_y0, y1: sb_y1,
          fillcolor: 'rgba(244, 67, 54, 0.06)',
          line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
        });
        if (plotOpts.twoSided) {
          shapes.push({
            type: 'rect', xref: 'x', yref: 'y',
            x0: -fpb, x1: 0,
            y0: pb_y0, y1: pb_y1,
            fillcolor: 'rgba(76, 175, 80, 0.08)',
            line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
          });
          shapes.push({
            type: 'rect', xref: 'x', yref: 'y',
            x0: -nyq, x1: -fpb2,
            y0: pb_y0, y1: pb_y1,
            fillcolor: 'rgba(76, 175, 80, 0.08)',
            line: { color: 'rgba(76, 175, 80, 0.4)', width: 1.5 },
          });
          shapes.push({
            type: 'rect', xref: 'x', yref: 'y',
            x0: -fsb2, x1: -fsb,
            y0: sb_y0, y1: sb_y1,
            fillcolor: 'rgba(244, 67, 54, 0.06)',
            line: { color: 'rgba(244, 67, 54, 0.4)', width: 1.5 },
          });
        }
      }
    }

    let minMag, maxMag;
    if (plotOpts.magScale === 'db') {
      minMag = Math.min(-80, ...(data.mag_db || [-80]));
      if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
        minMag = Math.min(minMag, ...(AppState.fixpoint.result.mag_fix_db || []));
      }
      minMag = Math.max(-150, minMag);
      maxMag = 5;
    } else {
      minMag = 0;
      let maxVal = Math.max(...magY);
      if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
        maxVal = Math.max(maxVal, ...(fxMagY || []));
      }
      maxMag = Math.max(1.1, maxVal * 1.1);
    }

    const layout = PlotManager.baseLayout(
      '|H(f)| Magnitude Response',
      `Frequency (${fLabel})`,
      yLabel,
      {
        shapes,
        yaxis: {
          title: { text: yLabel, font: { size: 13 } },
          gridcolor: c.grid,
          zerolinecolor: c.grid,
          range: [minMag, maxMag],
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
    
    // Choose starting phase source (degrees or radians)
    let phaseY = phaseOpts.unit === 'deg' ? data.phase_deg : data.phase_rad;

    // Apply wrapping if requested
    if (phaseOpts.wrap === 'wrap') {
      if (phaseOpts.unit === 'deg') {
        phaseY = phaseY.map(wrapPhaseDeg);
      } else {
        phaseY = phaseY.map(wrapPhaseRad);
      }
    }

    if (plotOpts.twoSided && freqX.length > 0) {
      const negFreq = freqX.slice().reverse().map(f => -f);
      const negPhase = phaseY.slice().reverse().map(p => -p);
      freqX = [...negFreq, ...freqX];
      phaseY = [...negPhase, ...phaseY];
    }

    let yLabel = phaseOpts.unit === 'deg' ? 'Phase (degrees)' : 'Phase (radians)';
    let hoverTemplate = phaseOpts.unit === 'deg'
      ? `%{x:.4g} ${fLabel}<br>%{y:.2f}°<extra></extra>`
      : `%{x:.4g} ${fLabel}<br>%{y:.4f} rad<extra></extra>`;

    const traces = [{
      x: freqX,
      y: phaseY,
      type: 'scatter',
      mode: 'lines',
      name: phaseOpts.unit === 'deg' ? 'Phase (deg)' : 'Phase (rad)',
      line: { color: c.tertiary, width: 2.5 },
      hovertemplate: hoverTemplate,
    }];

    // Overlay Fixpoint simulation data if available
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      const nyq = AppState.specs.freqUnit === 'normalized' ? 0.5 : AppState.specs.fs / 2;
      let fxFreqX = fx.freq_norm.map(f => f * nyq * fMul);
      
      let fxPhaseY = phaseOpts.unit === 'deg' ? fx.phase_fix_deg : fx.phase_fix_deg.map(deg => deg * Math.PI / 180);

      if (phaseOpts.wrap === 'wrap') {
        if (phaseOpts.unit === 'deg') {
          fxPhaseY = fxPhaseY.map(wrapPhaseDeg);
        } else {
          fxPhaseY = fxPhaseY.map(wrapPhaseRad);
        }
      }

      if (plotOpts.twoSided && fxFreqX.length > 0) {
        const negFreq = fxFreqX.slice().reverse().map(f => -f);
        const negPhase = fxPhaseY.slice().reverse().map(p => -p);
        fxFreqX = [...negFreq, ...fxFreqX];
        fxPhaseY = [...negPhase, ...fxPhaseY];
      }

      traces.push({
        x: fxFreqX,
        y: fxPhaseY,
        type: 'scatter',
        mode: 'lines',
        name: `Fixpoint (${fx.total_bits}-bit)`,
        line: { color: c.error, width: 2, dash: 'dash' },
        hovertemplate: phaseOpts.unit === 'deg'
          ? `%{x:.4g} ${fLabel}<br>%{y:.2f}° (FX)<extra></extra>`
          : `%{x:.4g} ${fLabel}<br>%{y:.4f} rad (FX)<extra></extra>`,
      });
    }

    const layout = PlotManager.baseLayout(
      'Phase Response',
      `Frequency (${fLabel})`,
      yLabel,
      { showlegend: true, legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' } }
    );

    PlotManager.plotToDiv('plot-phase', traces, layout);
  }
})();
