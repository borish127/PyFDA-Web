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
    responseType: 'lowpass',      // lowpass, highpass, bandpass, bandstop, allpass, hilbert, differentiator
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
    winParam: 8,                  // First parameter for parameterized windows
    winParam2: 1,                 // Second parameter (e.g. gen. gaussian / exponential)
    wpb: 1,                       // Passband weight (remez/firls)
    wsb: 1,                       // Stopband weight
    wpb2: 1,                      // Band 2 weight
    wsb2: 1,                      // Band 2 stop weight
    gridDensity: 16,              // Remez grid density
    maStages: 1,                  // Moving average cascaded stages
    maNormalize: true,            // Moving average unity DC gain
    freqUnit: 'hz',               // hz, khz, mhz, ghz, normalized (F_s), f_ny
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
    coeffQI: 2,
    coeffQF: 13,
    signalQI: 2,
    signalQF: 13,
    overflow: 'sat',         // sat, wrap
    quantMode: 'round',      // round, floor, fix, ceil, rint
    result: null,
  },

  /* Last stimulus run (persisted so fixpoint sim can use the signal) */
  stimulus: {
    x: null,
    y: null,
  },
  lastStimulus: null,

  /* UI state */
  ui: {
    activeTab: 'magnitude',
    sidebarOpen: window.innerWidth > 900,
    theme: 'system',           // light, dark, system
    isDesigning: false,
    isLoading: true,
  }
};

/* ---------- Logger & Toast System ---------- */
const AppLogger = (() => {
  const entries = [];

  function append(level, message) {
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8);
    const tag = level === 'error' ? 'ERROR' : (level === 'warning' ? 'WARNING' : 'INFO');
    entries.push({ ts, tag, level, message: String(message) });
    if (entries.length > 200) entries.shift();

    const body = document.getElementById('logger-entries');
    const count = document.getElementById('logger-count');
    if (count) count.textContent = String(entries.length);
    if (body) {
      const div = document.createElement('div');
      div.className = `logger-entry ${level}`;
      div.textContent = `[${ts}] [${tag}] ${message}`;
      body.appendChild(div);
      if (body.childElementCount > 200) body.removeChild(body.firstElementChild);
      body.scrollTop = body.scrollHeight;
    }
  }

  function init() {
    const drawer = document.getElementById('logger-drawer');
    const toggleBtn = document.getElementById('btn-logger-toggle');
    const chevron = document.getElementById('logger-chevron');
    toggleBtn?.addEventListener('click', () => {
      const open = drawer?.classList.toggle('open');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (chevron) chevron.textContent = open ? '▼' : '▲';
      setTimeout(() => {
        document.querySelectorAll('.plot-panel.active .js-plotly-plot').forEach(el => {
          if (typeof Plotly !== 'undefined' && Plotly.Plots) Plotly.Plots.resize(el);
        });
      }, 60);
    });
    document.getElementById('btn-logger-clear')?.addEventListener('click', () => {
      entries.length = 0;
      const body = document.getElementById('logger-entries');
      const count = document.getElementById('logger-count');
      if (body) body.replaceChildren();
      if (count) count.textContent = '0';
    });
    document.getElementById('btn-logger-copy')?.addEventListener('click', () => {
      const txt = entries.map(e => `[${e.ts}] [${e.tag}] ${e.message}`).join('\n');
      navigator.clipboard.writeText(txt).then(() => showToast('Log copied to clipboard', 'info')).catch(() => { });
    });
  }

  return { append, init };
})();

function showToast(message, type = 'info', duration = 4000) {
  AppLogger.append(type, message);
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
function getSystemColorScheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(saved) {
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
    if (meta) meta.content = saved;
    AppState.ui.theme = saved;
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (meta) meta.content = 'light dark';
    AppState.ui.theme = 'system';
  }
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('pyfda-theme'); } catch (_) { }
  applyTheme(saved);

  window.addEventListener('storage', (e) => {
    if (e.key !== 'pyfda-theme') return;
    applyTheme(e.newValue);
    bus.emit('themeChanged', AppState.ui.theme);
    bus.emit('replotAll');
  });
}

function toggleTheme() {
  const systemScheme = getSystemColorScheme();
  const explicit = document.documentElement.getAttribute('data-theme');
  const rendered = (explicit === 'light' || explicit === 'dark') ? explicit : systemScheme;
  const target = rendered === 'dark' ? 'light' : 'dark';

  try {
    if (target === systemScheme) {
      localStorage.removeItem('pyfda-theme');
    } else {
      localStorage.setItem('pyfda-theme', target);
    }
  } catch (_) { }

  applyTheme(target === systemScheme ? null : target);
  bus.emit('themeChanged', AppState.ui.theme);

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
    const isActive = t.dataset.tab === tabName;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('.plot-panel').forEach(p => {
    p.classList.toggle('active', p.id === `plot-${tabName}`);
  });

  bus.emit('tabChanged', tabName);
}

/* ---------- Design Filter Action ---------- */
async function designFilter() {
  if (!window.pyodideEngineReady) {
    if (typeof startPyodideInit === 'function') startPyodideInit();
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
    const isNorm = specs.freqUnit === 'normalized';
    const isFNy = specs.freqUnit === 'f_ny';
    if (!isNorm && !isFNy) {
      specs.fs = specs.fs * mul;
      specs.fpb = specs.fpb * mul;
      specs.fsb = specs.fsb * mul;
      specs.fpb2 = specs.fpb2 * mul;
      specs.fsb2 = specs.fsb2 * mul;
      if (specs.fs <= 0) throw new Error('Sampling frequency must be > 0');
    }

    const nyq = isNorm ? 0.5 : (isFNy ? 1.0 : specs.fs / 2);
    if (!['allpass', 'hilbert', 'differentiator'].includes(specs.responseType)) {
      if (specs.fpb <= 0) throw new Error('Passband frequency must be > 0');
      if (specs.fpb >= nyq) throw new Error('Passband frequency must be < Nyquist');
    }

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
      weights: result.weights || null,
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
  const fs = (typeof InputSpecs !== 'undefined' && InputSpecs.getEffectiveFsHz)
    ? InputSpecs.getEffectiveFsHz()
    : AppState.specs.fs;

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
      case 'stimulus': {
        bus.emit('plotStimulus');
        break;
      }
    }
  } catch (err) {
    showToast(`Analysis error: ${err.message}`, 'error');
    console.error('Analysis error:', err);
  }
}


/* ---------- Pyodide Lifecycle Management ---------- */
let pyodideInitStarted = false;
function startPyodideInit() {
  if (pyodideInitStarted) return;
  pyodideInitStarted = true;

  const ml = document.getElementById('mini-loader');
  if (ml) ml.classList.remove('hidden');

  PyodideBridge.init().then(() => {
    AppState.ui.isLoading = false;
    bus.emit('pyodideReady');

    if (ml) {
      ml.classList.add('success');
      const mlStatus = document.getElementById('mini-loader-status');
      if (mlStatus) mlStatus.textContent = 'Ready!';

      setTimeout(() => {
        ml.classList.add('hidden');
        setTimeout(() => {
          ml.classList.remove('success');
        }, 500);
      }, 1500);
    }
  }).catch(err => {
    console.warn('Pyodide background preload did not complete:', err);
    if (ml) ml.classList.add('hidden');
  });
}

/* ---------- Bootstrap ---------- */
const bus = new EventBus();

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();

  // Initialize UI modules immediately so they are visible/interactive
  if (typeof InputSpecs !== 'undefined') InputSpecs.init();
  if (typeof InputCoeffs !== 'undefined') InputCoeffs.init();
  if (typeof InputPZ !== 'undefined') InputPZ.init();
  if (typeof FixpointPanel !== 'undefined') FixpointPanel.init();
  if (typeof InfoPanel !== 'undefined') InfoPanel.init();
  if (typeof FileIO !== 'undefined') FileIO.init();
  if (typeof PlotManager !== 'undefined') PlotManager.init();
  AppLogger.init();

  // Preload on first user interaction or when the page is fully loaded and idle
  const interactionEvents = ['pointerdown', 'keydown', 'touchstart'];
  const onInteraction = () => {
    interactionEvents.forEach(e => window.removeEventListener(e, onInteraction, { passive: true }));
    startPyodideInit();
  };
  interactionEvents.forEach(e => window.addEventListener(e, onInteraction, { passive: true, once: true }));

  // Fallback preload after all initial assets (fonts, styles, scripts) have settled
  window.addEventListener('load', () => {
    setTimeout(startPyodideInit, 2500);
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
      const isActive = t.dataset.sideTab === target;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
    });

    // Translate the track horizontally (apply standard CSS transition)
    if (sidebarTrack) {
      sidebarTrack.style.transition = '';
      sidebarTrack.style.transform = `translateX(-${idx * 100}%)`;
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

  // Plot Tab clicks & keyboard navigation
  document.querySelectorAll('.plot-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.querySelectorAll('[role="tablist"]').forEach(tablist => {
    tablist.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
      const idx = tabs.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      let nextIdx = idx;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = tabs.length - 1;
      tabs[nextIdx].focus();
      tabs[nextIdx].click();
    });
  });

  // Make the horizontal plot tabs container scrollable with the scroll wheel
  const plotTabsContainer = document.querySelector('.plot-tabs');
  if (plotTabsContainer) {
    plotTabsContainer.addEventListener('wheel', (evt) => {
      if (evt.deltaY !== 0) {
        evt.preventDefault();
        plotTabsContainer.scrollLeft += evt.deltaY;
      }
    }, { passive: false });
  }

  // Chip toggle active state fallback for browsers without CSS :has()
  if (!CSS.supports('selector(:has(*))')) {
    document.querySelectorAll('.md-chip input[type="checkbox"]').forEach(cb => {
      const chip = cb.closest('.md-chip');
      if (cb.checked) chip?.classList.add('active');
      cb.addEventListener('change', () => chip?.classList.toggle('active', cb.checked));
    });
  }

  // Tab change → run analysis
  const moreBtn = document.getElementById('btn-plot-more');
  const morePopover = document.getElementById('plot-more-popover');

  function closeMorePopover() {
    if (morePopover) morePopover.hidden = true;
    if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
  }

  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!morePopover) return;
    const willOpen = morePopover.hidden;
    morePopover.hidden = !willOpen;
    moreBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (morePopover && !morePopover.hidden && !e.target.closest('#plot-more-wrap')) {
      closeMorePopover();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMorePopover();
  });

  function updateToolbarActionsVisibility(tabName) {
    const show = (id, visible) => {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? '' : 'none';
    };

    closeMorePopover();

    // Primary controls on the bar
    show('select-mag-scale-container', tabName === 'magnitude');
    show('chip-show-specs-container', tabName === 'magnitude');
    show('select-phase-unit-container', tabName === 'phase');
    show('select-phase-wrap-container', tabName === 'phase');
    show('select-delay-unit-container', tabName === 'group-delay' || tabName === 'phase-delay');
    show('chip-pz-hf-container', tabName === 'pz');
    show('chip-pz-log-container', tabName === 'pz');
    show('select-3d-scale-container', tabName === '3d');
    show('select-3d-mode-container', tabName === '3d');

    // Secondary controls inside Options popover
    const hasMore = (tabName === 'magnitude' || tabName === 'phase' || tabName === '3d');
    show('plot-more-wrap', hasMore);
    show('select-hf-qty-container', tabName === 'magnitude');
    show('select-inset-container', tabName === 'magnitude');
    show('chip-zero-phase-container', tabName === 'magnitude');
    show('chip-phase-overlay-container', tabName === 'magnitude');
    show('chip-two-sided-container', tabName === 'magnitude' || tabName === 'phase');
    show('chip-3d-polar-container', tabName === '3d');
    show('chip-3d-light-container', tabName === '3d');
  }

  // Initialize visibility on load
  updateToolbarActionsVisibility(AppState.ui.activeTab);

  bus.on('tabChanged', (tabName) => {
    updateToolbarActionsVisibility(tabName);
    runAnalysis(tabName);
  });

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
