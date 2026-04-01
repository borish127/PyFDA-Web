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
    sidebarOpen: window.innerWidth > 900,
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

    // GPU Compositor automatically stretches the .main-svg mechanically via CSS.
    // We defer heavy mathematical SVG computation entirely until the animation finishes.
    setTimeout(() => {
      if (typeof Plotly !== 'undefined') {
        const activePlot = document.querySelector('.plot-panel.active');
        if (activePlot && activePlot.classList.contains('js-plotly-plot')) {
          Plotly.relayout(activePlot, { autosize: true });
          Plotly.Plots.resize(activePlot);
        }
      }
    }, 400);
  }
}

/* ---------- Tab Switching ---------- */
function switchTab(tabName) {
  AppState.ui.activeTab = tabName;

  document.querySelectorAll('.plot-tab[data-tab]').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  document.querySelectorAll('.plot-panel').forEach(p => {
    p.classList.toggle('active', p.id === `plot-${tabName}`);
  });

  bus.emit('tabChanged', tabName);
}

/* ---------- Design Filter Action ---------- */
async function designFilter() {
  if (!window.pyodideEngineReady) {
    showToast("Please wait, initializing math engine...");
    return;
  }
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
      specs.fs = specs.fs * mul;
      specs.fpb = specs.fpb * mul;
      specs.fsb = specs.fsb * mul;
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

    if (window.innerWidth <= 900 && AppState.ui.sidebarOpen) {
      toggleSidebar();
    }

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

  // Hide full-screen overlay after a short delay to show the logo
  setTimeout(() => {
    if (overlay) overlay.classList.add('hidden');
  }, 800);

  // Initialize UI modules immediately so they are visible/interactive
  if (typeof InputSpecs !== 'undefined') InputSpecs.init();
  if (typeof InputCoeffs !== 'undefined') InputCoeffs.init();
  if (typeof InputPZ !== 'undefined') InputPZ.init();
  if (typeof FixpointPanel !== 'undefined') FixpointPanel.init();
  if (typeof FileIO !== 'undefined') FileIO.init();
  if (typeof PlotManager !== 'undefined') PlotManager.init();

  // Load Pyodide in the background
  PyodideBridge.init().then(() => {
    AppState.ui.isLoading = false;
    bus.emit('pyodideReady');
  }).catch(err => {
    showToast('Failed to initialize Python environment', 'error', 10000);
  });

  // Event listeners
  document.getElementById('btn-theme')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-menu')?.addEventListener('click', toggleSidebar);
  document.querySelector('.sidebar-backdrop')?.addEventListener('click', toggleSidebar);

  // Topbar Logo Click to open About Tab
  const openAboutPane = () => {
    if (!AppState.ui.sidebarOpen) toggleSidebar();
    const aboutTab = document.querySelector('[data-side-tab="about"]');
    if (aboutTab) aboutTab.click();
  };
  document.querySelector('.top-bar__logo')?.addEventListener('click', openAboutPane);
  document.querySelector('.top-bar__title')?.addEventListener('click', openAboutPane);

  // Sidebar tab sliding logic
  const sideTabsArray = ['design', 'analysis', 'about'];
  let currentSideTabIdx = 0;
  const sidebarTrack = document.getElementById('sidebar-track');
  const sidebarViewport = document.querySelector('.sidebar-viewport');

  function gotoSideTab(idx) {
    if (idx < 0) idx = 0;
    if (idx > 2) idx = 2;
    currentSideTabIdx = idx;
    const target = sideTabsArray[idx];

    // Update active tab styling
    document.querySelectorAll('.sidebar-tabs [data-side-tab]').forEach(t => {
      t.classList.toggle('active', t.dataset.sideTab === target);
    });

    // Translate the track horizontally (apply standard CSS transition)
    if (sidebarTrack) {
      sidebarTrack.style.transition = '';
      sidebarTrack.style.transform = `translateX(-${idx * 100}%)`;
    }

    // Toggle floating Design footer visibility
    const footer = document.querySelector('.sidebar-footer');
    if (footer) {
      footer.style.display = target === 'design' ? '' : 'none';
    }
  }

  // Bind clicks structurally
  document.querySelectorAll('.sidebar-tabs [data-side-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      gotoSideTab(sideTabsArray.indexOf(tab.dataset.sideTab));
    });
  });

  // Mobile swipe gestures: slide tabs OR slide to close
  const sidebarEl = document.querySelector('.sidebar');
  if (sidebarViewport && sidebarTrack && sidebarEl) {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwipingTabs = false;
    let isClosingSidebar = false;
    let isScrolling = false;
    let intendedAction = null; // 'tabs' or 'close'

    sidebarEl.addEventListener('touchstart', (e) => {
      if (window.innerWidth > 900) return; // Disable finger swipe tracking on desktop
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = startX;
      isSwipingTabs = false;
      isClosingSidebar = false;
      isScrolling = false;

      // Determine intent margin (rightmost 50px of sidebar)
      const rect = sidebarEl.getBoundingClientRect();
      if (startX > rect.right - 50) {
        intendedAction = 'close';
      } else {
        intendedAction = 'tabs';
      }

      sidebarTrack.style.transition = 'none'; // Strip CSS transition to natively follow finger for tabs
      sidebarEl.style.transition = 'none'; // Strip CSS transition to natively follow finger for closing
    }, { passive: true });

    sidebarEl.addEventListener('touchmove', (e) => {
      if (window.innerWidth > 900) return;
      if (isScrolling) return;

      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const deltaX = x - startX;
      const deltaY = y - startY;

      if (!isSwipingTabs && !isClosingSidebar && !isScrolling) {
        // Did they gesture vertically (slope > 1) or horizontally?
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          isScrolling = true;
          return; // Let standard CSS vertical scroll take over
        } else if (Math.abs(deltaX) > 10) {
          if (intendedAction === 'close' && deltaX < 0) {
            isClosingSidebar = true;
          } else {
            isSwipingTabs = true;
          }
        }
      }

      if (isSwipingTabs) {
        if (e.cancelable) e.preventDefault(); // Stop native browser horizontal drag
        
        let newX = -(currentSideTabIdx * sidebarViewport.clientWidth) + deltaX;
        
        // Add rubber-banding physics if swiping past the array bounds
        if (newX > 0) newX = newX * 0.3;
        const maxOffset = -((sideTabsArray.length - 1) * sidebarViewport.clientWidth);
        if (newX < maxOffset) newX = maxOffset + (newX - maxOffset) * 0.3;

        sidebarTrack.style.transform = `translateX(${newX}px)`;
        currentX = x;
      } else if (isClosingSidebar) {
        if (e.cancelable) e.preventDefault();
        
        // Drag sidebar to the left. Disallow dragging further right than 0.
        let newX = Math.min(0, deltaX);
        sidebarEl.style.transform = `translateX(${newX}px)`;
        currentX = x;
      }
    }, { passive: false });

    sidebarEl.addEventListener('touchend', (e) => {
      if (window.innerWidth > 900) return;
      sidebarTrack.style.transition = ''; // Restore smooth CSS physics
      sidebarEl.style.transition = '';
      
      if (isSwipingTabs) {
        const deltaX = currentX - startX;
        const width = sidebarViewport.clientWidth;
        
        // Snap logic: over 20% traversal or fast flick commits the tab change
        if (deltaX < -(width * 0.2)) {
          gotoSideTab(currentSideTabIdx + 1);
        } else if (deltaX > (width * 0.2)) {
          gotoSideTab(currentSideTabIdx - 1);
        } else {
          // Snap back
          gotoSideTab(currentSideTabIdx);
        }
      } else if (isClosingSidebar) {
        const deltaX = currentX - startX;
        sidebarEl.style.transform = ''; // Clear inline transform so toggleSidebar CSS class logic takes over
        
        if (deltaX < -50) {
          if (AppState.ui.sidebarOpen) toggleSidebar();
        }
      }
    }, { passive: true });
  }

  // Plot Tab clicks
  document.querySelectorAll('.plot-tab[data-tab]').forEach(tab => {
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

  // Plotly robust resize listener
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      document.querySelectorAll('.plot-panel.active .js-plotly-plot').forEach(el => {
        if (typeof Plotly !== 'undefined' && Plotly.Plots && Plotly.Plots.resize) {
          Plotly.Plots.resize(el);
        }
      });
    }, 250);
  });
});
