/* ============================================================
   PyFDA Web — Pole-Zero Plot
   With detailed polar coordinate tooltips (Radius & Angle)
   ============================================================ */

(function () {
  bus.on('plotPZ', render);
  bus.on('fixpointResult', () => {
    if (AppState.analysis.pzData) render(AppState.analysis.pzData);
  });
  bus.on('fixpointCleared', () => {
    if (AppState.analysis.pzData) render(AppState.analysis.pzData);
  });

  function render(data) {
    if (!data || !data.zeros_real) return;
    const c = PlotManager.getThemeColors();
    const traces = [];

    // Unit circle
    const uc_x = [];
    const uc_y = [];
    for (let i = 0; i <= 360; i += 1) {
      const rad = (i * Math.PI) / 180;
      uc_x.push(Math.cos(rad));
      uc_y.push(Math.sin(rad));
    }

    traces.push({
      x: uc_x,
      y: uc_y,
      type: 'scatter',
      mode: 'lines',
      name: 'Unit Circle',
      line: { color: c.grid, width: 1.5, dash: 'dot' },
      hoverinfo: 'skip',
    });

    // Helper to generate hover labels in polar coordinates
    const makeHoverText = (realArr, imagArr, labelPrefix) => {
      const texts = [];
      for (let i = 0; i < realArr.length; i++) {
        const re = realArr[i];
        const im = imagArr[i];
        const r = Math.sqrt(re * re + im * im);
        const rad = Math.atan2(im, re);
        const deg = rad * 180 / Math.PI;
        const angleNormalized = rad / Math.PI; // normalized angle as fraction of pi
        texts.push(`${labelPrefix}<br>Re: ${re.toFixed(6)}<br>Im: ${im.toFixed(6)}<br>Radius (r): ${r.toFixed(4)}<br>Angle (θ): ${deg.toFixed(1)}° (${angleNormalized.toFixed(3)}π rad)`);
      }
      return texts;
    };

    // Zeros (circles)
    if (data.zeros_real.length > 0) {
      const zerosText = makeHoverText(data.zeros_real, data.zeros_imag, 'Zero');
      traces.push({
        x: data.zeros_real,
        y: data.zeros_imag,
        text: zerosText,
        type: 'scatter',
        mode: 'markers',
        name: 'Zeros',
        marker: {
          symbol: 'circle-open',
          size: 12,
          color: c.primary,
          line: { width: 2.5, color: c.primary },
        },
        hovertemplate: '%{text}<extra></extra>',
      });
    }

    // Poles (crosses)
    if (data.poles_real.length > 0) {
      const polesText = makeHoverText(data.poles_real, data.poles_imag, 'Pole');
      traces.push({
        x: data.poles_real,
        y: data.poles_imag,
        text: polesText,
        type: 'scatter',
        mode: 'markers',
        name: 'Poles',
        marker: {
          symbol: 'x',
          size: 12,
          color: c.error,
          line: { width: 2.5, color: c.error },
        },
        hovertemplate: '%{text}<extra></extra>',
      });
    }

    // Overlay Fixpoint simulation poles/zeros if available
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      if (fx.zeros_fix_real && fx.zeros_fix_real.length > 0) {
        const fxZerosText = makeHoverText(fx.zeros_fix_real, fx.zeros_fix_imag, 'Quantized Zero');
        traces.push({
          x: fx.zeros_fix_real,
          y: fx.zeros_fix_imag,
          text: fxZerosText,
          type: 'scatter',
          mode: 'markers',
          name: `Zeros (FX: ${fx.total_bits}-bit)`,
          marker: {
            symbol: 'circle',
            size: 8,
            color: '#ff9800',
          },
          hovertemplate: '%{text}<extra></extra>',
        });
      }
      if (fx.poles_fix_real && fx.poles_fix_real.length > 0) {
        const fxPolesText = makeHoverText(fx.poles_fix_real, fx.poles_fix_imag, 'Quantized Pole');
        traces.push({
          x: fx.poles_fix_real,
          y: fx.poles_fix_imag,
          text: fxPolesText,
          type: 'scatter',
          mode: 'markers',
          name: `Poles (FX: ${fx.total_bits}-bit)`,
          marker: {
            symbol: 'diamond-open',
            size: 8,
            color: '#e65100',
            line: { width: 2, color: '#e65100' },
          },
          hovertemplate: '%{text}<extra></extra>',
        });
      }
    }

    // Axis lines
    traces.push({
      x: [-1.8, 1.8], y: [0, 0],
      type: 'scatter', mode: 'lines',
      line: { color: c.grid, width: 0.8 },
      hoverinfo: 'skip', showlegend: false,
    });
    traces.push({
      x: [0, 0], y: [-1.8, 1.8],
      type: 'scatter', mode: 'lines',
      line: { color: c.grid, width: 0.8 },
      hoverinfo: 'skip', showlegend: false,
    });

    const layout = PlotManager.baseLayout(
      'Pole-Zero Plot',
      'Real',
      'Imaginary',
      {
        xaxis: {
          title: { text: 'Real', font: { size: 13 } },
          gridcolor: c.grid, zerolinecolor: c.grid,
          scaleanchor: 'y', scaleratio: 1,
          range: [-1.8, 1.8],
        },
        yaxis: {
          title: { text: 'Imaginary', font: { size: 13 } },
          gridcolor: c.grid, zerolinecolor: c.grid,
          range: [-1.8, 1.8],
        },
        showlegend: true,
        legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
        hovermode: 'closest',
      }
    );

    PlotManager.plotToDiv('plot-pz', traces, layout);
  }
})();
