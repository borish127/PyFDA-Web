/* ============================================================
   PyFDA Web — 3D Surface / Mesh / Contour Plot |H(z)|
   Supports Surface, Wireframe Mesh, 2D Contour, Linear vs dB scale,
   lighting toggle, unit circle overlay, and P/Z plane markers.
   ============================================================ */

(function () {
  bus.on('plot3D', render);

  const plot3Dopts = {
    scale: 'linear', // 'linear' or 'db'
    mode: 'surface', // 'surface', 'mesh', 'contour'
    polar: true,
    lighting: true,
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sel-3d-scale')?.addEventListener('change', (e) => {
      plot3Dopts.scale = e.target.value;
      if (AppState.analysis.surface3d) render(AppState.analysis.surface3d);
    });
    document.getElementById('sel-3d-mode')?.addEventListener('change', (e) => {
      plot3Dopts.mode = e.target.value;
      if (AppState.analysis.surface3d) render(AppState.analysis.surface3d);
    });
    document.getElementById('chk-3d-polar')?.addEventListener('change', (e) => {
      plot3Dopts.polar = e.target.checked;
      if (AppState.analysis.surface3d) render(AppState.analysis.surface3d);
    });
    document.getElementById('chk-3d-light')?.addEventListener('change', (e) => {
      plot3Dopts.lighting = e.target.checked;
      if (AppState.analysis.surface3d) render(AppState.analysis.surface3d);
    });
  });

  function render(data) {
    if (!data || !data.x) return;
    const c = PlotManager.getThemeColors();

    let zData = data.z;
    let zTitle = '|H(z)|';
    let hoverTemplate = 'Re: %{x:.3f}<br>Im: %{y:.3f}<br>|H(z)|: %{z:.3f}<extra></extra>';

    if (plot3Dopts.scale === 'db') {
      zData = data.z.map(row => row.map(val => {
        const db = 20 * Math.log10(Math.max(val, 1e-5));
        return Math.max(-60, Math.min(40, db));
      }));
      zTitle = '|H(z)| (dB)';
      hoverTemplate = 'Re: %{x:.3f}<br>Im: %{y:.3f}<br>|H(z)|: %{z:.2f} dB<extra></extra>';
    }

    const colorscale = [
      [0, '#1a237e'], [0.25, '#3a5ba9'], [0.5, '#adc6ff'], [0.75, '#ffb74d'], [1, '#d32f2f'],
    ];

    if (plot3Dopts.mode === 'contour') {
      const contourTraces = [{
        x: data.x,
        y: data.y,
        z: zData,
        type: 'contour',
        colorscale,
        contours: { coloring: 'heatmap', showlabels: true },
        hovertemplate: hoverTemplate,
      }];
      if (plot3Dopts.polar) {
        const theta = Array.from({ length: 181 }, (_, i) => (2 * Math.PI * i) / 180);
        contourTraces.push({
          x: theta.map(Math.cos), y: theta.map(Math.sin),
          type: 'scatter', mode: 'lines', name: 'Unit Circle',
          line: { color: '#ffffff', width: 2, dash: 'dash' },
        });
      }
      const layout2d = PlotManager.baseLayout(
        `2D Contour ${zTitle} on z-Plane`, 'Re(z)', 'Im(z)',
        { xaxis: { scaleanchor: 'y', scaleratio: 1, gridcolor: c.grid }, showlegend: true }
      );
      PlotManager.plotToDiv('plot-3d', contourTraces, layout2d);
      return;
    }

    const traces = [{
      x: data.x,
      y: data.y,
      z: zData,
      type: 'surface',
      colorscale,
      hidesurface: plot3Dopts.mode === 'mesh',
      contours: {
        x: { show: plot3Dopts.mode === 'mesh', color: c.textSecondary, width: 1 },
        y: { show: plot3Dopts.mode === 'mesh', color: c.textSecondary, width: 1 },
        z: { show: true, usecolormap: true, highlightcolor: '#fff', project: { z: false } },
      },
      hovertemplate: hoverTemplate,
      lighting: plot3Dopts.lighting
        ? { ambient: 0.6, diffuse: 0.7, specular: 0.35, roughness: 0.45 }
        : { ambient: 1.0, diffuse: 0.0, specular: 0.0 },
    }];

    const ucZ = plot3Dopts.scale === 'db' ? -60 : 0;
    if (plot3Dopts.polar) {
      const ucX = [], ucY = [], ucZv = [];
      for (let i = 0; i <= 360; i += 2) {
        const rad = (i * Math.PI) / 180;
        ucX.push(Math.cos(rad));
        ucY.push(Math.sin(rad));
        ucZv.push(ucZ);
      }
      traces.push({
        x: ucX, y: ucY, z: ucZv,
        type: 'scatter3d', mode: 'lines',
        name: 'Unit Circle',
        line: { color: '#ffffff', width: 4 },
        hoverinfo: 'skip',
      });
    }

    if (AppState.analysis.freqResponse) {
      const fr = AppState.analysis.freqResponse;
      const ucFrX = [], ucFrY = [], ucFrZ = [];
      const nPoints = fr.freq.length;
      const fMax = fr.freq[nPoints - 1] || 1;
      for (let i = 0; i < nPoints; i++) {
        const rad = Math.PI * (fr.freq[i] / fMax);
        ucFrX.push(Math.cos(rad));
        ucFrY.push(Math.sin(rad));
        let val = fr.mag[i];
        if (plot3Dopts.scale === 'db') val = Math.max(-60, Math.min(40, 20 * Math.log10(Math.max(val, 1e-5))));
        ucFrZ.push(val);
      }
      for (let i = nPoints - 1; i >= 0; i--) {
        const rad = -Math.PI * (fr.freq[i] / fMax);
        ucFrX.push(Math.cos(rad));
        ucFrY.push(Math.sin(rad));
        let val = fr.mag[i];
        if (plot3Dopts.scale === 'db') val = Math.max(-60, Math.min(40, 20 * Math.log10(Math.max(val, 1e-5))));
        ucFrZ.push(val);
      }
      traces.push({
        x: ucFrX, y: ucFrY, z: ucFrZ,
        type: 'scatter3d', mode: 'lines',
        name: 'Freq Response |H(e^jω)|',
        line: { color: '#00e676', width: 5 },
      });
    }

    if (AppState.analysis.pzData) {
      const pz = AppState.analysis.pzData;
      if (pz.zeros_real?.length) {
        traces.push({
          x: pz.zeros_real, y: pz.zeros_imag, z: pz.zeros_real.map(() => ucZ),
          type: 'scatter3d', mode: 'markers', name: 'Zeros',
          marker: { size: 6, color: c.primary, symbol: 'circle' },
        });
      }
      if (pz.poles_real?.length) {
        traces.push({
          x: pz.poles_real, y: pz.poles_imag, z: pz.poles_real.map(() => ucZ),
          type: 'scatter3d', mode: 'markers', name: 'Poles',
          marker: { size: 6, color: c.error, symbol: 'x' },
        });
      }
    }

    const layout = {
      title: {
        text: `3D Transfer Function ${zTitle} Surface`,
        font: { family: 'Outfit, sans-serif', size: 18, color: c.text },
        x: 0.03, xanchor: 'left',
      },
      paper_bgcolor: c.paper,
      font: { family: 'Inter, sans-serif', size: 12, color: c.text },
      scene: {
        xaxis: { title: 'Re(z)', gridcolor: c.grid, backgroundcolor: c.bg },
        yaxis: { title: 'Im(z)', gridcolor: c.grid, backgroundcolor: c.bg },
        zaxis: { title: zTitle, gridcolor: c.grid, backgroundcolor: c.bg },
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
