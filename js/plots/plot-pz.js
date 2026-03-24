/* ============================================================
   PyFDA Web — Pole-Zero Plot
   ============================================================ */

(function () {
  bus.on('plotPZ', render);

  function render(data) {
    if (!data || !data.zeros_real) return;
    const c = PlotManager.getThemeColors();
    const traces = [];

    // Unit circle
    const theta = [];
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

    // Zeros (circles)
    if (data.zeros_real.length > 0) {
      traces.push({
        x: data.zeros_real,
        y: data.zeros_imag,
        type: 'scatter',
        mode: 'markers',
        name: 'Zeros',
        marker: {
          symbol: 'circle-open',
          size: 12,
          color: c.primary,
          line: { width: 2.5, color: c.primary },
        },
        hovertemplate: 'Zero<br>Re: %{x:.6f}<br>Im: %{y:.6f}<extra></extra>',
      });
    }

    // Poles (crosses)
    if (data.poles_real.length > 0) {
      traces.push({
        x: data.poles_real,
        y: data.poles_imag,
        type: 'scatter',
        mode: 'markers',
        name: 'Poles',
        marker: {
          symbol: 'x',
          size: 12,
          color: c.error,
          line: { width: 2.5, color: c.error },
        },
        hovertemplate: 'Pole<br>Re: %{x:.6f}<br>Im: %{y:.6f}<extra></extra>',
      });
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
