/* ============================================================
   PyFDA Web — Group Delay & Phase Delay Plots
   ============================================================ */

(function () {
  bus.on('plotGroupDelay', renderGroupDelay);
  bus.on('plotPhaseDelay', renderPhaseDelay);

  function renderGroupDelay(data) {
    const c = PlotManager.getThemeColors();
    const traces = [{
      x: data.freq,
      y: data.group_delay,
      type: 'scatter',
      mode: 'lines',
      name: 'τg (samples)',
      line: { color: c.primary, width: 2.5 },
      hovertemplate: '%{x:.1f} Hz<br>τg = %{y:.4f} samples<extra></extra>',
    }];

    const layout = PlotManager.baseLayout(
      'Group Delay τg(f)',
      'Frequency (Hz)',
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
    const traces = [{
      x: data.freq,
      y: data.phase_delay,
      type: 'scatter',
      mode: 'lines',
      name: 'Phase Delay (samples)',
      line: { color: c.tertiary, width: 2.5 },
      hovertemplate: '%{x:.1f} Hz<br>PD = %{y:.4f} samples<extra></extra>',
    }];

    const layout = PlotManager.baseLayout(
      'Phase Delay',
      'Frequency (Hz)',
      'Phase Delay (samples)',
      {
        showlegend: true,
        legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(0,0,0,0)' },
      }
    );

    PlotManager.plotToDiv('plot-phase-delay', traces, layout);
  }
})();
