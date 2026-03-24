/* ============================================================
   PyFDA Web — Group Delay & Phase Delay Plots
   ============================================================ */

(function () {
  bus.on('plotGroupDelay', renderGroupDelay);
  bus.on('plotPhaseDelay', renderPhaseDelay);

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

    const traces = [{
      x: freqX,
      y: data.group_delay,
      type: 'scatter',
      mode: 'lines',
      name: 'τg (samples)',
      line: { color: c.primary, width: 2.5 },
      hovertemplate: `%{x:.4g} ${fLabel}<br>τg = %{y:.4f} samples<extra></extra>`,
    }];

    const layout = PlotManager.baseLayout(
      'Group Delay τg(f)',
      `Frequency (${fLabel})`,
      'Group Delay (samples)',
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

    const traces = [{
      x: freqX,
      y: data.phase_delay,
      type: 'scatter',
      mode: 'lines',
      name: 'Phase Delay (samples)',
      line: { color: c.tertiary, width: 2.5 },
      hovertemplate: `%{x:.4g} ${fLabel}<br>PD = %{y:.4f} samples<extra></extra>`,
    }];

    const layout = PlotManager.baseLayout(
      'Phase Delay',
      `Frequency (${fLabel})`,
      'Phase Delay (samples)',
      {
        showlegend: true,
        legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
      }
    );

    PlotManager.plotToDiv('plot-phase-delay', traces, layout);
  }
})();
