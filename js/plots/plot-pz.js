/* ============================================================
   PyFDA Web — Pole-Zero (z-plane) Plot
   Unit circle, zeros (o), poles (x), stability badge, fixpoint overlay,
   and optional |H(f)| magnitude overlay around the unit circle.
   ============================================================ */

(function () {
  bus.on('plotPZ', render);
  bus.on('fixpointResult', () => {
    if (AppState.analysis.pzData) render(AppState.analysis.pzData);
  });
  bus.on('fixpointCleared', () => {
    if (AppState.analysis.pzData) render(AppState.analysis.pzData);
  });

  const pzOpts = {
    showHf: false,
    logHf: false,
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('chk-pz-hf')?.addEventListener('change', (e) => {
      pzOpts.showHf = e.target.checked;
      if (AppState.analysis.pzData) render(AppState.analysis.pzData);
    });
    document.getElementById('chk-pz-log')?.addEventListener('change', (e) => {
      pzOpts.logHf = e.target.checked;
      if (AppState.analysis.pzData) render(AppState.analysis.pzData);
    });
  });

  function render(data) {
    const c = PlotManager.getThemeColors();
    const traces = [];

    // Unit circle points
    const theta = Array.from({ length: 201 }, (_, i) => (2 * Math.PI * i) / 200);
    traces.push({
      x: theta.map(Math.cos),
      y: theta.map(Math.sin),
      type: 'scatter',
      mode: 'lines',
      name: 'Unit Circle |z|=1',
      line: { color: c.textSecondary, width: 1.5, dash: 'dash' },
      hoverinfo: 'skip',
    });

    // Optional |H(f)| radial projection around unit circle (matching pyfda plot_pz.py)
    if (pzOpts.showHf && AppState.analysis.freqResponse) {
      const fr = AppState.analysis.freqResponse;
      const nPts = fr.freq.length;
      const step = Math.max(1, Math.floor(nPts / 256));
      const fMax = fr.freq[nPts - 1] || 1;
      const hx = [];
      const hy = [];

      const scaleRadius = (m, dbVal) => {
        if (pzOpts.logHf) {
          const clamped = Math.max(-80, Math.min(20, dbVal));
          return 1 + (clamped + 80) / 160 * 0.5;
        }
        return 1 + Math.min(1.5, m) * 0.5;
      };

      for (let i = 0; i < nPts; i += step) {
        const ang = Math.PI * (fr.freq[i] / fMax);
        const r = scaleRadius(fr.mag[i], fr.mag_db[i]);
        hx.push(r * Math.cos(ang));
        hy.push(r * Math.sin(ang));
      }
      for (let i = nPts - 1; i >= 0; i -= step) {
        const ang = -Math.PI * (fr.freq[i] / fMax);
        const r = scaleRadius(fr.mag[i], fr.mag_db[i]);
        hx.push(r * Math.cos(ang));
        hy.push(r * Math.sin(ang));
      }

      traces.push({
        x: hx,
        y: hy,
        type: 'scatter',
        mode: 'lines',
        name: pzOpts.logHf ? '|H(f)| (Log)' : '|H(f)| around |z|=1',
        line: { color: c.tertiary, width: 1.8 },
      });
    }

    // Zeros (Float)
    if (data.zeros_real && data.zeros_real.length > 0) {
      traces.push({
        x: data.zeros_real,
        y: data.zeros_imag,
        type: 'scatter',
        mode: 'markers',
        name: `Zeros (${data.zeros_real.length})`,
        marker: {
          symbol: 'circle-open',
          size: 11,
          color: c.primary,
          line: { width: 2.5, color: c.primary },
        },
        hovertemplate: 'Zero: %{x:.5f} + %{y:.5f}j<br>|z| = %{customdata:.5f}<extra></extra>',
        customdata: data.zeros_real.map((re, i) => Math.hypot(re, data.zeros_imag[i])),
      });
    }

    // Poles (Float)
    let isStable = true;
    if (data.poles_real && data.poles_real.length > 0) {
      const radii = data.poles_real.map((re, i) => Math.hypot(re, data.poles_imag[i]));
      isStable = radii.every(r => r < 1.0001);

      traces.push({
        x: data.poles_real,
        y: data.poles_imag,
        type: 'scatter',
        mode: 'markers',
        name: `Poles (${data.poles_real.length})`,
        marker: {
          symbol: 'x',
          size: 11,
          color: c.error,
          line: { width: 2.5, color: c.error },
        },
        hovertemplate: 'Pole: %{x:.5f} + %{y:.5f}j<br>|p| = %{customdata:.5f}<extra></extra>',
        customdata: radii,
      });
    }

    // Fixpoint overlay
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      if (fx.zeros_fix_real && fx.zeros_fix_real.length > 0) {
        traces.push({
          x: fx.zeros_fix_real,
          y: fx.zeros_fix_imag,
          type: 'scatter',
          mode: 'markers',
          name: `Zeros FX (${fx.total_bits}-bit)`,
          marker: { symbol: 'circle-open', size: 9, color: '#ff9800', line: { width: 1.8, color: '#ff9800' } },
        });
      }
      if (fx.poles_fix_real && fx.poles_fix_real.length > 0) {
        traces.push({
          x: fx.poles_fix_real,
          y: fx.poles_fix_imag,
          type: 'scatter',
          mode: 'markers',
          name: `Poles FX (${fx.total_bits}-bit)`,
          marker: { symbol: 'x-thin', size: 10, color: '#ff9800', line: { width: 1.8, color: '#ff9800' } },
        });
      }
    }

    let maxCoord = pzOpts.showHf ? 1.8 : 1.2;
    [...(data.zeros_real || []), ...(data.poles_real || [])].forEach(v => {
      if (Math.abs(v) > maxCoord - 0.2) maxCoord = Math.abs(v) + 0.3;
    });
    [...(data.zeros_imag || []), ...(data.poles_imag || [])].forEach(v => {
      if (Math.abs(v) > maxCoord - 0.2) maxCoord = Math.abs(v) + 0.3;
    });

    const layout = PlotManager.baseLayout(
      `Pole-Zero Plot (${isStable ? 'Stable' : 'UNSTABLE'})`,
      'Real(z)',
      'Imag(z)',
      {
        xaxis: {
          title: { text: 'Real(z)', font: { size: 13 } },
          range: [-maxCoord, maxCoord],
          gridcolor: c.grid,
          zerolinecolor: c.textSecondary,
          zerolinewidth: 1,
        },
        yaxis: {
          title: { text: 'Imag(z)', font: { size: 13 } },
          range: [-maxCoord, maxCoord],
          scaleanchor: 'x',
          scaleratio: 1,
          gridcolor: c.grid,
          zerolinecolor: c.textSecondary,
          zerolinewidth: 1,
        },
        showlegend: true,
        legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
      }
    );

    PlotManager.plotToDiv('plot-pz', traces, layout);
  }
})();
