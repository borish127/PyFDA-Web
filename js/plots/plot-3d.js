/* ============================================================
   PyFDA Web — 3D Surface Plot |H(z)|
   With dB scale and frequency response unit circle wrap-around
   ============================================================ */

(function () {
  bus.on('plot3D', render);

  const plot3Dopts = {
    scale: 'linear', // 'linear' or 'db'
  };

  // Bind change event
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sel-3d-scale')?.addEventListener('change', (e) => {
      plot3Dopts.scale = e.target.value;
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
      // Convert to dB: 20 * log10(H)
      // Since data.z is absolute magnitude, we compute 20 * log10(val)
      // Clip to [-60, 40] dB for a clean 3D visualization without runaway peaks/valleys
      zData = data.z.map(row => row.map(val => {
        const db = 20 * Math.log10(Math.max(val, 1e-5));
        return Math.max(-60, Math.min(40, db));
      }));
      zTitle = '|H(z)| (dB)';
      hoverTemplate = 'Re: %{x:.3f}<br>Im: %{y:.3f}<br>|H(z)|: %{z:.2f} dB<extra></extra>';
    }

    const traces = [{
      x: data.x,
      y: data.y,
      z: zData,
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
      hovertemplate: hoverTemplate,
      lighting: {
        ambient: 0.6,
        diffuse: 0.6,
        specular: 0.3,
        roughness: 0.5,
      },
    }];

    // Add unit circle at z=0 (or z=-60 if dB)
    const uc_z_level = plot3Dopts.scale === 'db' ? -60 : 0;
    const uc_x = [], uc_y = [], uc_z = [];
    for (let i = 0; i <= 360; i += 2) {
      const rad = (i * Math.PI) / 180;
      uc_x.push(Math.cos(rad));
      uc_y.push(Math.sin(rad));
      uc_z.push(uc_z_level);
    }
    traces.push({
      x: uc_x, y: uc_y, z: uc_z,
      type: 'scatter3d', mode: 'lines',
      name: 'Unit Circle',
      line: { color: '#ffffff', width: 4 },
      hoverinfo: 'skip',
    });

    // Wrapped Frequency Response Trace on Unit Circle
    if (AppState.analysis.freqResponse) {
      const fr = AppState.analysis.freqResponse;
      const uc_fr_x = [];
      const uc_fr_y = [];
      const uc_fr_z = [];

      const nPoints = fr.freq.length;
      // Freq goes from 0 to fs/2 (which is 0 to pi in radians)
      for (let i = 0; i < nPoints; i++) {
        const rad = Math.PI * (fr.freq[i] / (AppState.specs.fs / 2));
        uc_fr_x.push(Math.cos(rad));
        uc_fr_y.push(Math.sin(rad));
        
        let val = fr.mag[i];
        if (plot3Dopts.scale === 'db') {
          val = 20 * Math.log10(Math.max(val, 1e-5));
          val = Math.max(-60, Math.min(40, val));
        }
        uc_fr_z.push(val);
      }
      // Mirror to form the bottom half (-pi to 0)
      for (let i = nPoints - 1; i >= 0; i--) {
        const rad = -Math.PI * (fr.freq[i] / (AppState.specs.fs / 2));
        uc_fr_x.push(Math.cos(rad));
        uc_fr_y.push(Math.sin(rad));
        
        let val = fr.mag[i];
        if (plot3Dopts.scale === 'db') {
          val = 20 * Math.log10(Math.max(val, 1e-5));
          val = Math.max(-60, Math.min(40, val));
        }
        uc_fr_z.push(val);
      }

      traces.push({
        x: uc_fr_x, y: uc_fr_y, z: uc_fr_z,
        type: 'scatter3d', mode: 'lines',
        name: 'Freq Response |H(e^jω)|',
        line: { color: '#00e676', width: 6 },
        hovertemplate: plot3Dopts.scale === 'db'
          ? '|H(e^jω)|: %{z:.2f} dB<extra></extra>'
          : '|H(e^jω)|: %{z:.3f}<extra></extra>',
      });
    }

    // Add pole/zero markers if available
    if (AppState.analysis.pzData) {
      const pz = AppState.analysis.pzData;

      // Zeros
      if (pz.zeros_real && pz.zeros_real.length > 0) {
        traces.push({
          x: pz.zeros_real, y: pz.zeros_imag,
          z: pz.zeros_real.map(() => uc_z_level),
          type: 'scatter3d', mode: 'markers',
          name: 'Zeros',
          marker: { size: 6, color: c.primary, symbol: 'circle' },
        });
      }

      // Poles
      if (pz.poles_real && pz.poles_real.length > 0) {
        traces.push({
          x: pz.poles_real, y: pz.poles_imag,
          z: pz.poles_real.map(() => uc_z_level),
          type: 'scatter3d', mode: 'markers',
          name: 'Poles',
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
