/* ============================================================
   PyFDA Web — Plot Manager
   Plotly.js wrapper with MD3 theming and shared configuration
   ============================================================ */

const PlotManager = (() => {

  function init() {
    // Listen for theme changes to replot
    bus.on('replotAll', replotAll);

    // Resize plots when window resizes
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        document.querySelectorAll('.plot-panel.active .js-plotly-plot').forEach(el => {
          Plotly.Plots.resize(el);
        });
      }, 200);
    });
  }

  function getThemeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      bg: style.getPropertyValue('--md-sys-color-surface-container-lowest').trim() || '#ffffff',
      paper: style.getPropertyValue('--md-sys-color-surface-container-lowest').trim() || '#ffffff',
      text: style.getPropertyValue('--md-sys-color-on-surface').trim() || '#1a1b20',
      grid: style.getPropertyValue('--md-sys-color-outline-variant').trim() || '#c4c6d0',
      primary: style.getPropertyValue('--md-sys-color-primary').trim() || '#3a5ba9',
      secondary: style.getPropertyValue('--md-sys-color-secondary').trim() || '#565e71',
      tertiary: style.getPropertyValue('--md-sys-color-tertiary').trim() || '#705574',
      error: style.getPropertyValue('--md-sys-color-error').trim() || '#ba1a1a',
      primaryCtr: style.getPropertyValue('--md-sys-color-primary-container').trim() || '#d8e2ff',
    };
  }

  function baseLayout(title, xLabel, yLabel, extraLayout = {}) {
    const c = getThemeColors();
    return Object.assign({
      title: {
        text: title,
        font: { family: 'Outfit, sans-serif', size: 18, color: c.text },
        x: 0.03, xanchor: 'left',
      },
      paper_bgcolor: c.paper,
      plot_bgcolor: c.bg,
      font: { family: 'Inter, sans-serif', size: 12, color: c.text },
      xaxis: {
        title: { text: xLabel, font: { size: 13 } },
        gridcolor: c.grid,
        zerolinecolor: c.grid,
        linecolor: c.grid,
      },
      yaxis: {
        title: { text: yLabel, font: { size: 13 } },
        gridcolor: c.grid,
        zerolinecolor: c.grid,
        linecolor: c.grid,
      },
      margin: { l: 60, r: 30, t: 50, b: 50 },
      showlegend: false,
      autosize: true,
      hovermode: 'x unified',
      dragmode: 'pan',
    }, extraLayout);
  }

  function baseConfig() {
    return {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      scrollZoom: true,
    };
  }

  function plotToDiv(divId, traces, layout = {}, configOverrides = {}) {
    const emptyState = document.getElementById('plot-empty-state');
    if (emptyState) emptyState.classList.add('hidden');

    const el = document.getElementById(divId);
    if (!el) return;
    const config = Object.assign(baseConfig(), configOverrides);
    Plotly.react(el, traces, layout, config).then(() => {
      Plotly.Plots.resize(el);
      setupPlotInteractions(el);
    });
  }

  function setupPlotInteractions(el) {
    if (el._hasInteractionListeners) return;

    // Desktop "Ctrl + Mouse Wheel" Zoom
    el.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) {
        // Stop Plotly from zooming, allow normal page scroll
        e.stopPropagation();
      } else {
        // Prevent default browser zoom so Plotly can zoom
        e.preventDefault();
      }
    }, { capture: true, passive: false });

    // Custom Legend Click / Double Click Handler to improve Trackpad & Mobile usability
    let clickTimeout = null;
    let lastClickedCurve = null;
    let lastClickTime = 0;

    el.on('plotly_legendclick', (data) => {
      const curveNumber = data.curveNumber;
      const currentTime = Date.now();
      const timeDiff = currentTime - lastClickTime;

      // Double-click threshold: 450ms is friendly for trackpads and touch
      if (lastClickedCurve === curveNumber && timeDiff < 450) {
        if (clickTimeout) clearTimeout(clickTimeout);
        clickTimeout = null;
        lastClickTime = 0; // Reset
        lastClickedCurve = null;
        
        handleLegendDoubleClick(el, curveNumber);
      } else {
        lastClickedCurve = curveNumber;
        lastClickTime = currentTime;
        
        if (clickTimeout) clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
          handleLegendSingleClick(el, curveNumber);
          clickTimeout = null;
        }, 280); // 280ms window for double-click
      }

      return false; // Prevent Plotly's default legend toggle/isolate behavior
    });

    // Also disable double click event default behavior
    el.on('plotly_legenddoubleclick', () => {
      return false;
    });

    el._hasInteractionListeners = true;
  }

  function handleLegendSingleClick(el, curveNumber) {
    if (!el.data || !el.data[curveNumber]) return;
    const trace = el.data[curveNumber];
    const currentVisibility = (trace.visible === undefined) ? true : trace.visible;
    const nextVisibility = (currentVisibility === true) ? 'legendonly' : true;
    
    Plotly.restyle(el, { visible: nextVisibility }, [curveNumber]);
  }

  function handleLegendDoubleClick(el, curveNumber) {
    if (!el.data) return;
    const totalTraces = el.data.length;
    
    // Check if the clicked trace is already the ONLY visible trace
    let otherTracesVisible = false;
    for (let i = 0; i < totalTraces; i++) {
      if (i !== curveNumber) {
        const visibility = (el.data[i].visible === undefined) ? true : el.data[i].visible;
        if (visibility === true) {
          otherTracesVisible = true;
          break;
        }
      }
    }

    const nextVisibilities = [];
    for (let i = 0; i < totalTraces; i++) {
      if (otherTracesVisible) {
        // Isolate: clicked trace is true, all others are 'legendonly'
        nextVisibilities.push(i === curveNumber ? true : 'legendonly');
      } else {
        // Restore all: all traces are set to true
        nextVisibilities.push(true);
      }
    }

    // Apply restyle to all traces
    Plotly.restyle(el, { visible: nextVisibilities });
  }

  function replotAll() {
    // Re-emit analysis events to replot with new theme
    const tab = AppState.ui.activeTab;
    if (AppState.analysis.freqResponse && (tab === 'magnitude' || tab === 'phase')) {
      bus.emit('plotFreqResponse', AppState.analysis.freqResponse);
    }
    if (AppState.analysis.groupDelay && tab === 'group-delay') {
      bus.emit('plotGroupDelay', AppState.analysis.groupDelay);
    }
    if (AppState.analysis.phaseDelay && tab === 'phase-delay') {
      bus.emit('plotPhaseDelay', AppState.analysis.phaseDelay);
    }
    if (AppState.analysis.pzData && tab === 'pz') {
      bus.emit('plotPZ', AppState.analysis.pzData);
    }
    if (AppState.analysis.impulseResponse && tab === 'impulse') {
      bus.emit('plotImpulse', AppState.analysis.impulseResponse);
    }
    if (AppState.analysis.stepResponse && tab === 'step') {
      bus.emit('plotStep', AppState.analysis.stepResponse);
    }
    if (AppState.analysis.surface3d && tab === '3d') {
      bus.emit('plot3D', AppState.analysis.surface3d);
    }
    if (AppState.stimulus.x && tab === 'stimulus') {
      bus.emit('plotStimulus');
    }
  }

  return { init, getThemeColors, baseLayout, baseConfig, plotToDiv, replotAll };
})();
