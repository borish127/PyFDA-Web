/* ============================================================
   PyFDA Web — 3D Surface Plot |H(z)|
   ============================================================ */

(function () {
  bus.on('plot3D', render);

  function render(data) {
    if (!data || !data.x) return;
    const c = PlotManager.getThemeColors();

    const traces = [{
      x: data.x,
      y: data.y,
      z: data.z,
      type: 'surface',
      colorscale: [
        [0,   '#1a237e'],
        [0.15, '#283593'],
        [0.3, '#3a5ba9'],
        [0.45, '#5c8aff'],
        [0.6, '#adc6ff'],
        [0.75, '#ffb74d'],
        [0.9, '#ff7043'],
        [1,   '#d32f2f'],
      ],
      contours: {
        z: { show: true, usecolormap: true, highlightcolor: '#fff', project: { z: false } }
      },
      hovertemplate: 'Re: %{x:.3f}<br>Im: %{y:.3f}<br>|H(z)|: %{z:.3f}<extra></extra>',
      lighting: {
        ambient: 0.6,
        diffuse: 0.6,
        specular: 0.3,
        roughness: 0.5,
      },
    }];

    // Add unit circle at z=0
    const uc_x = [], uc_y = [], uc_z = [];
    for (let i = 0; i <= 360; i += 2) {
      const rad = (i * Math.PI) / 180;
      uc_x.push(Math.cos(rad));
      uc_y.push(Math.sin(rad));
      uc_z.push(0);
    }
    traces.push({
      x: uc_x, y: uc_y, z: uc_z,
      type: 'scatter3d', mode: 'lines',
      name: 'Unit Circle',
      line: { color: '#ffffff', width: 4 },
      hoverinfo: 'skip',
    });

    // Add pole/zero markers if available
    if (AppState.analysis.pzData) {
      const pz = AppState.analysis.pzData;

      // Zeros
      if (pz.zeros_real && pz.zeros_real.length > 0) {
        traces.push({
          x: pz.zeros_real, y: pz.zeros_imag,
          z: pz.zeros_real.map(() => 0),
          type: 'scatter3d', mode: 'markers',
          name: 'Zeros',
          marker: { size: 6, color: c.primary, symbol: 'circle' },
        });
      }

      // Poles
      if (pz.poles_real && pz.poles_real.length > 0) {
        traces.push({
          x: pz.poles_real, y: pz.poles_imag,
          z: pz.poles_real.map(() => 0),
          type: 'scatter3d', mode: 'markers',
          name: 'Poles',
          marker: { size: 6, color: c.error, symbol: 'x' },
        });
      }
    }

    const layout = {
      title: {
        text: '3D |H(z)| Surface',
        font: { family: 'Outfit, sans-serif', size: 18, color: c.text },
        x: 0.03, xanchor: 'left',
      },
      paper_bgcolor: c.paper,
      font: { family: 'Inter, sans-serif', size: 12, color: c.text },
      scene: {
        xaxis: { title: 'Re(z)', gridcolor: c.grid, backgroundcolor: c.bg },
        yaxis: { title: 'Im(z)', gridcolor: c.grid, backgroundcolor: c.bg },
        zaxis: { title: '|H(z)|', gridcolor: c.grid, backgroundcolor: c.bg },
        camera: { eye: { x: 1.5, y: 1.5, z: 1.0 } },
        bgcolor: c.bg,
      },
      margin: { l: 10, r: 10, t: 50, b: 10 },
      showlegend: true,
      legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
      autosize: true,
    };

    PlotManager.plotToDiv('plot-3d', traces, layout);
  }
})();
