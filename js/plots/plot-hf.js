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
    qty: 'mag',     // 'mag', 're', 'im'
    zeroPhase: false,
    phaseOverlay: false,
    inset: 'off',   // 'off', 'passband', 'stopband'
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
    document.getElementById('sel-hf-qty')?.addEventListener('change', (e) => {
      plotOpts.qty = e.target.value;
      if (AppState.analysis.freqResponse) render(AppState.analysis.freqResponse);
    });
    document.getElementById('chk-zero-phase')?.addEventListener('change', (e) => {
      plotOpts.zeroPhase = e.target.checked;
      if (AppState.analysis.freqResponse) render(AppState.analysis.freqResponse);
    });
    document.getElementById('chk-phase-overlay')?.addEventListener('change', (e) => {
      plotOpts.phaseOverlay = e.target.checked;
      if (AppState.analysis.freqResponse) render(AppState.analysis.freqResponse);
    });
    document.getElementById('sel-hf-inset')?.addEventListener('change', (e) => {
      plotOpts.inset = e.target.value;
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

  function getFreqHelper() {
    const u = AppState.specs.freqUnit;
    if (u === 'normalized') return { dataMul: 1, fxNyq: 0.5, specMul: 1, nyq: 0.5, label: 'f / F_s' };
    if (u === 'f_ny') return { dataMul: 2, fxNyq: 1.0, specMul: 1, nyq: 1.0, label: 'f / f_Ny' };
    const mul = u === 'khz' ? 1e-3 : u === 'mhz' ? 1e-6 : u === 'ghz' ? 1e-9 : 1;
    const label = u === 'khz' ? 'kHz' : u === 'mhz' ? 'MHz' : u === 'ghz' ? 'GHz' : 'Hz';
    return { dataMul: mul, fxNyq: AppState.specs.fs / 2, specMul: 1, nyq: AppState.specs.fs / 2, label };
  }

  function renderMagnitude(data, c) {
    const specs = AppState.specs;
    const traces = [];
    const { dataMul, fxNyq, specMul, nyq, label: fLabel } = getFreqHelper();

    let freqX = data.freq.map(f => f * dataMul);

    let magY = [];
    let traceName = '';
    let hoverTemplate = '';
    let yLabel = '';

    if (plotOpts.qty === 're' && data.h_real) {
      magY = data.h_real;
      traceName = 'Re{H(f)}';
      hoverTemplate = `%{x:.4g} ${fLabel}<br>Re = %{y:.4f}<extra></extra>`;
      yLabel = 'Re{H(f)}';
    } else if (plotOpts.qty === 'im' && data.h_imag) {
      magY = data.h_imag;
      traceName = 'Im{H(f)}';
      hoverTemplate = `%{x:.4g} ${fLabel}<br>Im = %{y:.4f}<extra></extra>`;
      yLabel = 'Im{H(f)}';
    } else if (plotOpts.zeroPhase && data.h_real && data.h_imag && plotOpts.magScale === 'linear') {
      const nOrder = AppState.filter.order || 0;
      const nPts = data.freq.length;
      magY = data.h_real.map((re, i) => {
        const w = (Math.PI * i) / Math.max(1, nPts - 1);
        const shift = w * (nOrder / 2);
        return re * Math.cos(shift) - data.h_imag[i] * Math.sin(shift);
      });
      traceName = 'H_0(f) (Zero-Phase)';
      hoverTemplate = `%{x:.4g} ${fLabel}<br>%{y:.4f}<extra></extra>`;
      yLabel = 'Zero-Phase Amplitude';
    } else if (plotOpts.magScale === 'db') {
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
      const negFreq = freqX.toReversed().map(f => -f);
      const negMag = magY.toReversed();
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
      let fxFreqX = fx.freq_norm.map(f => f * fxNyq);

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
        const negFreq = fxFreqX.toReversed().map(f => -f);
        const negMag = fxMagY.toReversed();
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

    // Spec-band shading (specs.fpb etc. are already in display unit!)
    const shapes = [];
    if (plotOpts.showSpecs && !['allpass', 'hilbert', 'differentiator'].includes(specs.responseType)) {
      const fpb = specs.fpb * specMul;
      const fsb = specs.fsb * specMul;
      const fpb2 = specs.fpb2 * specMul;
      const fsb2 = specs.fsb2 * specMul;

      // Convert amplitude specs to dB cleanly regardless of ampUnit selector
      const ft = specs.filterFamily || 'iir';
      const toDbPb = (v) => {
        if (specs.ampUnit === 'db') return v;
        const lin = specs.ampUnit === 'power' ? Math.sqrt(Math.max(0, v)) : v;
        if (ft === 'iir') return -20 * Math.log10(Math.max(1e-6, 1 - Math.min(0.85, lin)));
        const l = Math.min(0.5, Math.max(1e-5, lin));
        return 20 * Math.log10((1 + l) / (1 - l));
      };
      const toDbSb = (v) => {
        if (specs.ampUnit === 'db') return v;
        const lin = specs.ampUnit === 'power' ? Math.sqrt(Math.max(0, v)) : v;
        return -20 * Math.log10(Math.max(1e-6, lin));
      };
      const apbDb = toDbPb(specs.apb);
      const asbDb = toDbSb(specs.asb);

      // Calculate spec limits based on current magnitude scale
      let pb_y0, pb_y1, sb_y0, sb_y1;
      if (plotOpts.magScale === 'db') {
        pb_y0 = ft === 'fir' ? -apbDb / 2 : -apbDb;
        pb_y1 = ft === 'fir' ? apbDb / 2 : 5;
        sb_y0 = -150;
        sb_y1 = -asbDb;
      } else if (plotOpts.magScale === 'linear') {
        pb_y0 = Math.pow(10, (ft === 'fir' ? -apbDb / 2 : -apbDb) / 20);
        pb_y1 = ft === 'fir' ? Math.pow(10, apbDb / 40) : 1.05;
        sb_y0 = 0;
        sb_y1 = Math.pow(10, -asbDb / 20);
      } else if (plotOpts.magScale === 'power') {
        pb_y0 = Math.pow(10, (ft === 'fir' ? -apbDb / 2 : -apbDb) / 10);
        pb_y1 = ft === 'fir' ? Math.pow(10, apbDb / 20) : 1.1;
        sb_y0 = 0;
        sb_y1 = Math.pow(10, -asbDb / 10);
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
    if (plotOpts.qty === 're' || plotOpts.qty === 'im' || (plotOpts.zeroPhase && plotOpts.magScale === 'linear')) {
      const minV = Math.min(...magY, -0.1);
      const maxV = Math.max(...magY, 0.1);
      const pad = Math.max(0.1, (maxV - minV) * 0.1);
      minMag = minV - pad;
      maxMag = maxV + pad;
    } else if (plotOpts.magScale === 'db') {
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

    const extraLayout = {
      shapes,
      yaxis: {
        title: { text: yLabel, font: { size: 13 } },
        gridcolor: c.grid,
        zerolinecolor: c.grid,
        range: [minMag, maxMag],
      },
      showlegend: true,
      legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
    };

    // Optional phase overlay on secondary Y axis
    if (plotOpts.phaseOverlay && data.phase_deg) {
      let phiOverlay = data.phase_deg.map(wrapPhaseDeg);
      if (plotOpts.twoSided && data.freq.length > 0) {
        const negPhi = phiOverlay.toReversed().map(p => -p);
        phiOverlay = [...negPhi, ...phiOverlay];
      }
      traces.push({
        x: freqX,
        y: phiOverlay,
        yaxis: 'y2',
        type: 'scatter',
        mode: 'lines',
        name: 'Phase (wrapped °)',
        line: { color: c.tertiary, width: 1.5, dash: 'dot' },
      });
      extraLayout.yaxis2 = {
        title: { text: 'Phase (°)', font: { size: 12 } },
        overlaying: 'y',
        side: 'right',
        showgrid: false,
        range: [-190, 190],
      };
    }

    // Optional zoom inset (Passband or Stopband detail)
    if (plotOpts.inset !== 'off' && freqX.length > 10 && !['allpass', 'hilbert', 'differentiator'].includes(specs.responseType)) {
      let xLo = 0, xHi = nyq;
      const rt = specs.responseType;
      if (plotOpts.inset === 'passband') {
        if (rt === 'lowpass') { xLo = 0; xHi = specs.fpb; }
        else if (rt === 'highpass') { xLo = specs.fpb; xHi = nyq; }
        else if (rt === 'bandpass') { xLo = specs.fpb; xHi = specs.fpb2; }
        else if (rt === 'bandstop') { xLo = 0; xHi = specs.fpb; }
      } else {
        if (rt === 'lowpass') { xLo = specs.fsb; xHi = nyq; }
        else if (rt === 'highpass') { xLo = 0; xHi = specs.fsb; }
        else if (rt === 'bandpass') { xLo = specs.fsb2; xHi = nyq; }
        else if (rt === 'bandstop') { xLo = specs.fsb; xHi = specs.fsb2; }
      }
      if (xHi <= xLo) { xLo = 0; xHi = nyq * 0.5; }
      const inX = [], inY = [];
      for (let i = 0; i < freqX.length; i++) {
        if (freqX[i] >= xLo && freqX[i] <= xHi) {
          inX.push(freqX[i]);
          inY.push(magY[i]);
        }
      }
      if (inX.length > 2) {
        traces.push({
          x: inX, y: inY,
          xaxis: 'x2', yaxis: 'y3',
          type: 'scatter', mode: 'lines',
          name: plotOpts.inset === 'passband' ? 'Inset PB' : 'Inset SB',
          line: { color: c.primary, width: 2 },
          showlegend: false,
        });
        extraLayout.xaxis2 = {
          domain: [0.56, 0.94], anchor: 'y3',
          showgrid: true, gridcolor: c.grid,
          tickfont: { size: 10 },
        };
        extraLayout.yaxis3 = {
          domain: [0.16, 0.50], anchor: 'x2',
          showgrid: true, gridcolor: c.grid,
          tickfont: { size: 10 },
        };
      }
    }

    const layout = PlotManager.baseLayout(
      '|H(f)| Magnitude Response',
      `Frequency (${fLabel})`,
      yLabel,
      extraLayout
    );

    PlotManager.plotToDiv('plot-magnitude', traces, layout);
  }

  function renderPhase(data, c) {
    const { dataMul, fxNyq, label: fLabel } = getFreqHelper();

    let freqX = data.freq.map(f => f * dataMul);

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
      const negFreq = freqX.toReversed().map(f => -f);
      const negPhase = phaseY.toReversed().map(p => -p);
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
      let fxFreqX = fx.freq_norm.map(f => f * fxNyq);

      let fxPhaseY = phaseOpts.unit === 'deg' ? fx.phase_fix_deg : fx.phase_fix_deg.map(deg => deg * Math.PI / 180);

      if (phaseOpts.wrap === 'wrap') {
        if (phaseOpts.unit === 'deg') {
          fxPhaseY = fxPhaseY.map(wrapPhaseDeg);
        } else {
          fxPhaseY = fxPhaseY.map(wrapPhaseRad);
        }
      }

      if (plotOpts.twoSided && fxFreqX.length > 0) {
        const negFreq = fxFreqX.toReversed().map(f => -f);
        const negPhase = fxPhaseY.toReversed().map(p => -p);
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
