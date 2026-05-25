/* ============================================================
   PyFDA Web — Group Delay & Phase Delay Plots
   With samples vs physical time (ms) toggle
   ============================================================ */

(function () {
  bus.on('plotGroupDelay', renderGroupDelay);
  bus.on('plotPhaseDelay', renderPhaseDelay);
  bus.on('fixpointResult', () => {
    if (AppState.analysis.groupDelay) renderGroupDelay(AppState.analysis.groupDelay);
    if (AppState.analysis.phaseDelay) renderPhaseDelay(AppState.analysis.phaseDelay);
  });
  bus.on('fixpointCleared', () => {
    if (AppState.analysis.groupDelay) renderGroupDelay(AppState.analysis.groupDelay);
    if (AppState.analysis.phaseDelay) renderPhaseDelay(AppState.analysis.phaseDelay);
  });

  const delayOpts = {
    unit: 'samples', // 'samples' or 'time'
  };

  // Bind selector after DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sel-delay-unit')?.addEventListener('change', (e) => {
      delayOpts.unit = e.target.value;
      if (AppState.analysis.groupDelay) renderGroupDelay(AppState.analysis.groupDelay);
      if (AppState.analysis.phaseDelay) renderPhaseDelay(AppState.analysis.phaseDelay);
    });
  });

  function renderGroupDelay(data) {
    const c = PlotManager.getThemeColors();
    const isNorm = AppState.specs.freqUnit === 'normalized';
    let fMul = 1; let fLabel = 'Hz';
    if (!isNorm) {
      const u = AppState.specs.freqUnit;
      if (u === 'khz') { fMul = 1e-3; fLabel = 'kHz'; }
      else if (u === 'mhz') { fMul = 1e-6; fLabel = 'MHz'; }
      else if (u === 'ghz') { fMul = 1e-9; fLabel = 'GHz'; }
    } else {
      fLabel = 'Normalized';
    }

    let freqX = isNorm ? data.freq.map(f => f / AppState.specs.fs) : data.freq.map(f => f * fMul);
    
    let gdY = data.group_delay;
    let yLabel = 'Group Delay (samples)';
    let hoverTemplate = `%{x:.4g} ${fLabel}<br>τg = %{y:.4f} samples<extra></extra>`;
    let traceName = 'τg (samples)';

    if (delayOpts.unit === 'time') {
      const fs = AppState.specs.fs || 48000;
      gdY = data.group_delay.map(samples => (samples / fs) * 1000); // in ms
      yLabel = 'Group Delay (ms)';
      hoverTemplate = `%{x:.4g} ${fLabel}<br>τg = %{y:.4f} ms<extra></extra>`;
      traceName = 'τg (ms)';
    }

    const traces = [{
      x: freqX,
      y: gdY,
      type: 'scatter',
      mode: 'lines',
      name: traceName,
      line: { color: c.primary, width: 2.5 },
      hovertemplate: hoverTemplate,
    }];

    // Overlay Fixpoint simulation data if available
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      const nyq = AppState.specs.freqUnit === 'normalized' ? 0.5 : AppState.specs.fs / 2;
      const fxFreqX = fx.freq_norm.map(f => f * nyq * fMul);
      
      let fxGdY = fx.gd_fix;
      let fxHoverTemplate = `%{x:.4g} ${fLabel}<br>τg = %{y:.4f} samples (FX)<extra></extra>`;

      if (delayOpts.unit === 'time') {
        const fs = AppState.specs.fs || 48000;
        fxGdY = fx.gd_fix.map(samples => (samples / fs) * 1000);
        fxHoverTemplate = `%{x:.4g} ${fLabel}<br>τg = %{y:.4f} ms (FX)<extra></extra>`;
      }

      traces.push({
        x: fxFreqX,
        y: fxGdY,
        type: 'scatter',
        mode: 'lines',
        name: `Fixpoint (${fx.total_bits}-bit)`,
        line: { color: c.error, width: 2, dash: 'dash' },
        hovertemplate: fxHoverTemplate,
      });
    }

    const layout = PlotManager.baseLayout(
      'Group Delay τg(f)',
      `Frequency (${fLabel})`,
      yLabel,
      {
        showlegend: true,
        legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
      }
    );

    PlotManager.plotToDiv('plot-group-delay', traces, layout);
  }

  function renderPhaseDelay(data) {
    const c = PlotManager.getThemeColors();
    const isNorm = AppState.specs.freqUnit === 'normalized';
    let fMul = 1; let fLabel = 'Hz';
    if (!isNorm) {
      const u = AppState.specs.freqUnit;
      if (u === 'khz') { fMul = 1e-3; fLabel = 'kHz'; }
      else if (u === 'mhz') { fMul = 1e-6; fLabel = 'MHz'; }
      else if (u === 'ghz') { fMul = 1e-9; fLabel = 'GHz'; }
    } else {
      fLabel = 'Normalized';
    }

    let freqX = isNorm ? data.freq.map(f => f / AppState.specs.fs) : data.freq.map(f => f * fMul);
    
    let pdY = data.phase_delay;
    let yLabel = 'Phase Delay (samples)';
    let hoverTemplate = `%{x:.4g} ${fLabel}<br>PD = %{y:.4f} samples<extra></extra>`;
    let traceName = 'Phase Delay (samples)';

    if (delayOpts.unit === 'time') {
      const fs = AppState.specs.fs || 48000;
      pdY = data.phase_delay.map(samples => (samples / fs) * 1000); // in ms
      yLabel = 'Phase Delay (ms)';
      hoverTemplate = `%{x:.4g} ${fLabel}<br>PD = %{y:.4f} ms<extra></extra>`;
      traceName = 'Phase Delay (ms)';
    }

    const traces = [{
      x: freqX,
      y: pdY,
      type: 'scatter',
      mode: 'lines',
      name: traceName,
      line: { color: c.tertiary, width: 2.5 },
      hovertemplate: hoverTemplate,
    }];

    // Overlay Fixpoint simulation data if available
    if (AppState.fixpoint.enabled && AppState.fixpoint.result) {
      const fx = AppState.fixpoint.result;
      const nyq = AppState.specs.freqUnit === 'normalized' ? 0.5 : AppState.specs.fs / 2;
      const fxFreqX = fx.freq_norm.map(f => f * nyq * fMul);
      
      let fxPdY = fx.pd_fix;
      let fxHoverTemplate = `%{x:.4g} ${fLabel}<br>PD = %{y:.4f} samples (FX)<extra></extra>`;

      if (delayOpts.unit === 'time') {
        const fs = AppState.specs.fs || 48000;
        fxPdY = fx.pd_fix.map(samples => (samples / fs) * 1000);
        fxHoverTemplate = `%{x:.4g} ${fLabel}<br>PD = %{y:.4f} ms (FX)<extra></extra>`;
      }

      traces.push({
        x: fxFreqX,
        y: fxPdY,
        type: 'scatter',
        mode: 'lines',
        name: `Fixpoint (${fx.total_bits}-bit)`,
        line: { color: c.error, width: 2, dash: 'dash' },
        hovertemplate: fxHoverTemplate,
      });
    }

    const layout = PlotManager.baseLayout(
      'Phase Delay',
      `Frequency (${fLabel})`,
      yLabel,
      {
        showlegend: true,
        legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
      }
    );

    PlotManager.plotToDiv('plot-phase-delay', traces, layout);
  }
})();
