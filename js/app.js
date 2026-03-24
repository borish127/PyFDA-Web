/* ============================================================
   PyFDA Web — Application Bootstrap & State Management
   ============================================================ */

/* ---------- Event Bus ---------- */
class EventBus {
  constructor() { this._handlers = {}; }

  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const h = this._handlers[event];
    if (h) this._handlers[event] = h.filter(fn => fn !== handler);
  }

  emit(event, data) {
    const h = this._handlers[event];
    if (h) h.forEach(fn => {
      try { fn(data); } catch (e) { console.error(`EventBus [${event}]:`, e); }
    });
  }
}

/* ---------- App State ---------- */
const AppState = {
  /* Filter specifications */
  specs: {
    responseType: 'lowpass',      // lowpass, highpass, bandpass, bandstop, allpass
    filterFamily: 'iir',          // iir, fir
    designMethod: 'butter',       // butter, cheby1, cheby2, ellip, bessel, firwin, firwin2, remez, firls, mavg
    fs: 48000,                    // Sampling frequency (Hz)
    fpb: 1000,                    // Passband edge (Hz)
    fsb: 5000,                    // Stopband edge (Hz)
    fpb2: 8000,                   // Second passband edge for BP/BS
    fsb2: 12000,                  // Second stopband edge for BP/BS
    apb: 1,                       // Passband ripple (dB)
    asb: 60,                      // Stopband attenuation (dB)
    order: null,                  // null = auto, number = manual
    window: 'hamming',            // Window type for firwin
    freqUnit: 'hz',               // hz, normalized
    ampUnit: 'db',                // db, linear, power
  },

  /* Designed filter data */
  filter: {
    b: null,
    a: null,
    zeros: null,
    poles: null,
    gain: null,
    sos: null,
    order: null,
    method: null,
  },

  /* Analysis results (cached) */
  analysis: {
    freqResponse: null,
    groupDelay: null,
    phaseDelay: null,
    impulseResponse: null,
    stepResponse: null,
    pzData: null,
    surface3d: null,
  },

  /* Fixpoint configuration */
  fixpoint: {
    enabled: false,
    coeffQI: 1,
    coeffQF: 15,
    signalQI: 1,
    signalQF: 15,
    overflow: 'saturate',    // wrap, saturate
    quantMode: 'round',      // round, truncate
    result: null,
  },

  /* UI state */
  ui: {
    activeTab: 'magnitude',
    sidebarOpen: false,
    theme: 'system',           // light, dark, system
    isDesigning: false,
    isLoading: true,
  }
};

/* ---------- Toast System ---------- */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(16px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ---------- Theme ---------- */
function initTheme() {
  const saved = localStorage.getItem('pyfda-theme');
  if (saved && saved !== 'system') {
    document.documentElement.setAttribute('data-theme', saved);
    AppState.ui.theme = saved;
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pyfda-theme', next);
  AppState.ui.theme = next;
  bus.emit('themeChanged', next);

  // Update Plotly plots theme
  bus.emit('replotAll');
}

/* ---------- Sidebar Toggle (Desktop + Mobile) ---------- */
function toggleSidebar() {
  const isMobile = window.innerWidth <= 900;

  if (isMobile) {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.querySelector('.sidebar-backdrop');
    const open = sidebar.classList.toggle('open');
    backdrop.classList.toggle('open', open);
    AppState.ui.sidebarOpen = open;
  } else {
    const shell = document.querySelector('.app-shell');
    const collapsed = shell.classList.toggle('sidebar-collapsed');
    AppState.ui.sidebarOpen = !collapsed;

    // Resize plots after transition completes
    setTimeout(() => {
      document.querySelectorAll('.plot-panel.active .js-plotly-plot').forEach(el => {
        Plotly.Plots.resize(el);
      });
    }, 450);
  }
}

/* ---------- Tab Switching ---------- */
function switchTab(tabName) {
  AppState.ui.activeTab = tabName;

  document.querySelectorAll('.plot-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  document.querySelectorAll('.plot-panel').forEach(p => {
    p.classList.toggle('active', p.id === `plot-${tabName}`);
  });

  bus.emit('tabChanged', tabName);
}

/* ---------- Design Filter Action ---------- */
async function designFilter() {
  if (AppState.ui.isDesigning) return;
  AppState.ui.isDesigning = true;
  bus.emit('designStart');

  try {
    // Validate specs
    const specs = { ...AppState.specs };

    // Apply frequency unit multiplier (user enters kHz/MHz/GHz, DSP needs Hz)
    const mul = (typeof InputSpecs !== 'undefined' && InputSpecs.getFreqMultiplier)
      ? InputSpecs.getFreqMultiplier() : 1;
    if (specs.freqUnit !== 'normalized') {
      specs.fs   = specs.fs * mul;
      specs.fpb  = specs.fpb * mul;
      specs.fsb  = specs.fsb * mul;
      specs.fpb2 = specs.fpb2 * mul;
      specs.fsb2 = specs.fsb2 * mul;
    }

    if (specs.fs <= 0) throw new Error('Sampling frequency must be > 0');
    if (specs.fpb <= 0) throw new Error('Passband frequency must be > 0');
    if (specs.fpb >= specs.fs / 2) throw new Error('Passband frequency must be < Fs/2');

    // Call Pyodide
    const result = await PyodideBridge.designFilter(specs);

    // Update state
    AppState.filter = {
      b: result.b,
      a: result.a,
      zeros: result.zeros,
      poles: result.poles,
      gain: result.gain,
      sos: result.sos || null,
      order: result.order,
      method: result.method,
    };

    // Clear cached analysis
    AppState.analysis = {
      freqResponse: null, groupDelay: null, phaseDelay: null,
      impulseResponse: null, stepResponse: null, pzData: null, surface3d: null,
    };

    bus.emit('filterDesigned', AppState.filter);
    showToast(`${result.method} filter designed (order ${result.order})`, 'info');

    // Update order field with the computed value
    const orderInput = document.getElementById('inp-order');
    if (orderInput) {
      orderInput.value = result.order;
    }

    // Run analysis for current tab
    await runAnalysis(AppState.ui.activeTab);

  } catch (err) {
    showToast(err.message || 'Filter design failed', 'error');
    console.error('Design error:', err);
  } finally {
    AppState.ui.isDesigning = false;
    bus.emit('designEnd');
  }
}

/* ---------- Run Analysis ---------- */
async function runAnalysis(tabName) {
  if (!AppState.filter.b) return;
  const { b, a } = AppState.filter;
  const fs = AppState.specs.fs;

  try {
    switch (tabName) {
      case 'magnitude':
      case 'phase': {
        if (!AppState.analysis.freqResponse) {
          AppState.analysis.freqResponse = await PyodideBridge.freqResponse(b, a, fs, 2048);
        }
        bus.emit('plotFreqResponse', AppState.analysis.freqResponse);
        break;
      }
      case 'group-delay': {
        if (!AppState.analysis.groupDelay) {
          AppState.analysis.groupDelay = await PyodideBridge.groupDelay(b, a, fs, 2048);
        }
        bus.emit('plotGroupDelay', AppState.analysis.groupDelay);
        break;
      }
      case 'phase-delay': {
        if (!AppState.analysis.phaseDelay) {
          AppState.analysis.phaseDelay = await PyodideBridge.phaseDelay(b, a, fs, 2048);
        }
        bus.emit('plotPhaseDelay', AppState.analysis.phaseDelay);
        break;
      }
      case 'pz': {
        if (!AppState.analysis.pzData) {
          AppState.analysis.pzData = await PyodideBridge.pzData(b, a);
        }
        bus.emit('plotPZ', AppState.analysis.pzData);
        break;
      }
      case 'impulse': {
        if (!AppState.analysis.impulseResponse) {
          AppState.analysis.impulseResponse = await PyodideBridge.impulseResponse(b, a, 256);
        }
        bus.emit('plotImpulse', AppState.analysis.impulseResponse);
        break;
      }
      case 'step': {
        if (!AppState.analysis.stepResponse) {
          AppState.analysis.stepResponse = await PyodideBridge.stepResponse(b, a, 256);
        }
        bus.emit('plotStep', AppState.analysis.stepResponse);
        break;
      }
      case '3d': {
        if (!AppState.analysis.surface3d) {
          AppState.analysis.surface3d = await PyodideBridge.surface3D(b, a, 100);
        }
        bus.emit('plot3D', AppState.analysis.surface3d);
        break;
      }
    }
  } catch (err) {
    showToast(`Analysis error: ${err.message}`, 'error');
    console.error('Analysis error:', err);
  }
}

/* ---------- Bootstrap ---------- */
const bus = new EventBus();

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();

  // Loading overlay
  const overlay = document.getElementById('loading-overlay');
  const statusEl = document.getElementById('loading-status');
  const barFill = document.getElementById('loading-bar-fill');

  PyodideBridge.setStatusCallback((msg, pct) => {
    if (statusEl) statusEl.textContent = msg;
    if (barFill) barFill.style.width = `${pct}%`;
  });

  try {
    await PyodideBridge.init();
    AppState.ui.isLoading = false;

    // Small delay for the "Ready" message to be visible
    await new Promise(r => setTimeout(r, 600));

    if (overlay) overlay.classList.add('hidden');

    // Initialize UI modules
    bus.emit('pyodideReady');

    // Initialize input panels
    if (typeof InputSpecs !== 'undefined') InputSpecs.init();
    if (typeof InputCoeffs !== 'undefined') InputCoeffs.init();
    if (typeof InputPZ !== 'undefined') InputPZ.init();
    if (typeof FixpointPanel !== 'undefined') FixpointPanel.init();
    if (typeof FileIO !== 'undefined') FileIO.init();

    // Initialize plot modules
    if (typeof PlotManager !== 'undefined') PlotManager.init();

  } catch (err) {
    showToast('Failed to initialize Python environment', 'error', 10000);
  }

  // Event listeners
  document.getElementById('btn-theme')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-menu')?.addEventListener('click', toggleSidebar);
  document.querySelector('.sidebar-backdrop')?.addEventListener('click', toggleSidebar);

  // Tab clicks
  document.querySelectorAll('.plot-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Chip toggle active state (for checkboxes inside chips)
  document.querySelectorAll('.md-chip input[type="checkbox"]').forEach(cb => {
    const chip = cb.closest('.md-chip');
    if (cb.checked) chip?.classList.add('active');
    cb.addEventListener('change', () => chip?.classList.toggle('active', cb.checked));
  });

  // Tab change → run analysis
  bus.on('tabChanged', (tabName) => runAnalysis(tabName));
});
