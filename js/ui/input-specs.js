/* ============================================================
   PyFDA Web — Input Specs UI Logic
   Manages filter specification controls and validation
   ============================================================ */

const InputSpecs = (() => {

  /* Predefined filter examples */
  const EXAMPLES = {
    // Medical / Bio
    ecg_notch: {
      responseType: 'bandstop', filterFamily: 'iir', designMethod: 'butter',
      freqUnit: 'hz', ampUnit: 'db', fs: 1000,
      fpb: 45, fsb: 49, fsb2: 51, fpb2: 55, apb: 1, asb: 40, order: null
    },
    ecg_notch_60: {
      responseType: 'bandstop', filterFamily: 'iir', designMethod: 'butter',
      freqUnit: 'hz', ampUnit: 'db', fs: 1000,
      fpb: 55, fsb: 58, fsb2: 62, fpb2: 65, apb: 1, asb: 40, order: null
    },
    ecg_artifact: {
      responseType: 'highpass', filterFamily: 'iir', designMethod: 'butter',
      freqUnit: 'hz', ampUnit: 'db', fs: 500,
      fsb: 0.1, fpb: 0.5, apb: 1, asb: 30, order: 4
    },
    eeg_alpha: {
      responseType: 'bandpass', filterFamily: 'fir', designMethod: 'firwin', window: 'hamming',
      freqUnit: 'hz', ampUnit: 'db', fs: 250,
      fsb: 6, fpb: 8, fpb2: 12, fsb2: 14, apb: 0.5, asb: 50, order: null
    },
    eeg_theta: {
      responseType: 'bandpass', filterFamily: 'fir', designMethod: 'firwin', window: 'blackman',
      freqUnit: 'hz', ampUnit: 'db', fs: 250,
      fsb: 2, fpb: 4, fpb2: 8, fsb2: 10, apb: 0.1, asb: 60, order: null
    },

    // Audio / Acoustic
    audio_subwoofer: {
      responseType: 'lowpass', filterFamily: 'iir', designMethod: 'butter',
      freqUnit: 'hz', ampUnit: 'db', fs: 48000,
      fpb: 80, fsb: 120, apb: 1, asb: 24, order: null
    },
    audio_aa: {
      responseType: 'lowpass', filterFamily: 'fir', designMethod: 'remez',
      freqUnit: 'hz', ampUnit: 'db', fs: 48000,
      fpb: 20000, fsb: 22050, apb: 0.1, asb: 80, order: null
    },
    recording_voice: {
      responseType: 'bandpass', filterFamily: 'fir', designMethod: 'remez',
      freqUnit: 'hz', ampUnit: 'db', fs: 48000,
      fsb: 40, fpb: 80, fpb2: 12000, fsb2: 14000, apb: 0.5, asb: 50, order: null
    },
    dc_blocker: {
      responseType: 'highpass', filterFamily: 'iir', designMethod: 'butter',
      freqUnit: 'hz', ampUnit: 'db', fs: 44100,
      fsb: 10, fpb: 20, apb: 1, asb: 40, order: 4
    },
    guitar_cab: {
      responseType: 'bandpass', filterFamily: 'iir', designMethod: 'cheby2',
      freqUnit: 'hz', ampUnit: 'db', fs: 48000,
      fsb: 50, fpb: 80, fpb2: 5000, fsb2: 7000, apb: 1, asb: 40, order: null
    },

    // RF & Telecom
    fm_radio_if: {
      responseType: 'bandpass', filterFamily: 'fir', designMethod: 'remez',
      freqUnit: 'mhz', ampUnit: 'db', fs: 40,
      fsb: 10.5, fpb: 10.6, fpb2: 10.8, fsb2: 10.9, apb: 0.5, asb: 60, order: 120
    },
    wifi_baseband: {
      responseType: 'lowpass', filterFamily: 'fir', designMethod: 'firwin', window: 'hamming',
      freqUnit: 'mhz', ampUnit: 'db', fs: 40,
      fpb: 9, fsb: 11, apb: 0.5, asb: 50, order: null
    },
    gsm_baseband: {
      responseType: 'lowpass', filterFamily: 'fir', designMethod: 'firwin', window: 'hamming',
      freqUnit: 'khz', ampUnit: 'db', fs: 1000,
      fpb: 100, fsb: 135, apb: 1, asb: 60, order: null
    },
    telecom_voice: {
      responseType: 'bandpass', filterFamily: 'iir', designMethod: 'ellip',
      freqUnit: 'hz', ampUnit: 'db', fs: 8000,
      fsb: 200, fpb: 300, fpb2: 3400, fsb2: 3600, apb: 1, asb: 40, order: null
    },
    am_radio: {
      responseType: 'bandpass', filterFamily: 'iir', designMethod: 'cheby1',
      freqUnit: 'khz', ampUnit: 'db', fs: 2000,
      fsb: 440, fpb: 450, fpb2: 460, fsb2: 470, apb: 0.5, asb: 60, order: null
    },
    bt_le: {
      responseType: 'lowpass', filterFamily: 'fir', designMethod: 'firwin', window: 'hamming',
      freqUnit: 'mhz', ampUnit: 'db', fs: 10,
      fpb: 0.5, fsb: 1.0, apb: 1, asb: 50, order: null
    },

    // Misc
    ultrasound: {
      responseType: 'bandpass', filterFamily: 'iir', designMethod: 'cheby1',
      freqUnit: 'mhz', ampUnit: 'db', fs: 40,
      fsb: 1.5, fpb: 2.0, fpb2: 10.0, fsb2: 12.0, apb: 1, asb: 60, order: null
    },
    seismic: {
      responseType: 'lowpass', filterFamily: 'fir', designMethod: 'remez',
      freqUnit: 'hz', ampUnit: 'db', fs: 100,
      fpb: 10, fsb: 15, apb: 0.1, asb: 60, order: null
    }
  };

  /* Parameterized windows config matching python/filter_design.py _build_window_arg */
  const WIN_PARAMS = {
    kaiser: { l1: 'Beta (β)', d1: 8.0 },
    tukey: { l1: 'Alpha (α)', d1: 0.5 },
    gaussian: { l1: 'Sigma (σ)', d1: 7.0 },
    general_gaussian: { l1: 'Shape (p)', d1: 1.5, l2: 'Sigma (σ)', d2: 7.0 },
    dpss: { l1: 'Half-BW (NW)', d1: 3.0 },
    chebwin: { l1: 'Atten. (dB)', d1: 80.0 },
    exponential: { l1: 'Decay (τ)', d1: 3.0 },
    taylor: { l1: 'Sidelobes (nbar)', d1: 4 },
  };

  /* Helper: amplitude conversion matching python/filter_design.py unit2lin / lin2db */
  function convertAmp(val, ft, kind, fromUnit, toUnit) {
    if (fromUnit === toUnit) return val;
    let lin;
    if (fromUnit === 'db') {
      if (kind === 'pb') {
        if (ft === 'iir') lin = 1 - Math.pow(10, -val / 20);
        else { const p = Math.pow(10, val / 20); lin = (p - 1) / (p + 1); }
      } else {
        lin = Math.pow(10, -val / 20);
      }
    } else if (fromUnit === 'power') {
      lin = Math.sqrt(Math.max(0, val));
    } else {
      lin = val;
    }

    let out;
    if (toUnit === 'db') {
      if (kind === 'pb') {
        if (ft === 'iir') out = -20 * Math.log10(Math.max(1e-6, 1 - Math.min(0.85, lin)));
        else {
          const v = Math.min(0.5, Math.max(1e-5, lin));
          out = 20 * Math.log10((1 + v) / (1 - v));
        }
      } else {
        out = -20 * Math.log10(Math.max(1e-6, lin));
      }
    } else if (toUnit === 'power') {
      out = lin * lin;
    } else {
      out = lin;
    }
    return Number(out.toPrecision(5));
  }

  /* Enforces valid chronological frequencies when switching response types */
  function enforceValidFrequencies() {
    const rt = AppState.specs.responseType;
    const u = AppState.specs.freqUnit;
    const fs = AppState.specs.fs || 48000;

    // Define 4 safe, chronologically ordered points to guarantee successful design.
    // For normalized F_s (0..0.5): 0.1, 0.2, 0.3, 0.4
    // For f_Ny (0..1.0): 0.2, 0.4, 0.6, 0.8
    // For absolute, Nyquist is fs / 2: 10%, 20%, 30%, 40% of fs.
    let p1, p2, p3, p4;
    if (u === 'normalized') {
      p1 = 0.1; p2 = 0.2; p3 = 0.3; p4 = 0.4;
    } else if (u === 'f_ny') {
      p1 = 0.2; p2 = 0.4; p3 = 0.6; p4 = 0.8;
    } else {
      p1 = fs * 0.1;
      p2 = fs * 0.2;
      p3 = fs * 0.3;
      p4 = fs * 0.4;
    }

    // Assign values based on mathematical requirements of the response type
    if (rt === 'lowpass' || rt === 'differentiator') {
      AppState.specs.fpb = p1;
      AppState.specs.fsb = p2;
    } else if (rt === 'highpass') {
      AppState.specs.fsb = p1;
      AppState.specs.fpb = p2;
    } else if (rt === 'bandpass' || rt === 'hilbert') {
      AppState.specs.fsb = p1;
      AppState.specs.fpb = p2;
      AppState.specs.fpb2 = p3;
      AppState.specs.fsb2 = p4;
    } else if (rt === 'bandstop') {
      AppState.specs.fpb = p1;
      AppState.specs.fsb = p2;
      AppState.specs.fsb2 = p3;
      AppState.specs.fpb2 = p4;
    }

    // Synchronize the DOM inputs with the new valid state
    const syncVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val !== null && val !== undefined ? val : '';
    };

    syncVal('inp-fpb', AppState.specs.fpb);
    syncVal('inp-fsb', AppState.specs.fsb);
    syncVal('inp-fpb2', AppState.specs.fpb2);
    syncVal('inp-fsb2', AppState.specs.fsb2);
  }

  function init() {
    // Hilbert and Differentiator require FIR ( equiripple / firwin )
    bindSegmented('seg-response', (val) => {
      AppState.specs.responseType = val;
      if ((val === 'hilbert' || val === 'differentiator') && AppState.specs.filterFamily !== 'fir') {
        AppState.specs.filterFamily = 'fir';
        const segFam = document.getElementById('seg-family');
        segFam?.querySelectorAll('.md-segmented__btn').forEach(b => {
          b.classList.toggle('active', b.dataset.value === 'fir');
        });
        updateMethodOptions();
        if (val === 'hilbert' || val === 'differentiator') {
          AppState.specs.designMethod = 'remez';
          const selM = document.getElementById('sel-method');
          if (selM) selM.value = 'remez';
        }
      }
      enforceValidFrequencies();
      updateFieldVisibility();
      updateLabels();
    });

    bindSegmented('seg-family', (val) => {
      AppState.specs.filterFamily = val;
      updateMethodOptions();
      updateFieldVisibility();
    });

    // Method select
    const selMethod = document.getElementById('sel-method');
    selMethod?.addEventListener('change', () => {
      AppState.specs.designMethod = selMethod.value;
      updateFieldVisibility();
    });

    const unitScaleHz = (u) => (u === 'khz' ? 1e3 : u === 'mhz' ? 1e6 : u === 'ghz' ? 1e9 : 1);
    let prevUnit = AppState.specs.freqUnit;
    let prevAmpUnit = AppState.specs.ampUnit;

    // Frequency unit selector: proportional conversion across Hz / kHz / MHz / GHz / F_s / f_Ny
    document.getElementById('sel-freq-unit')?.addEventListener('change', (e) => {
      const newUnit = e.target.value;
      if (newUnit === prevUnit) return;

      const isPrevNorm = prevUnit === 'normalized' || prevUnit === 'f_ny';
      const isNewNorm = newUnit === 'normalized' || newUnit === 'f_ny';
      const oldFsHz = isPrevNorm ? (AppState.specs.fs || 48000) : (AppState.specs.fs * unitScaleHz(prevUnit));

      const toFsRatio = (v) => {
        if (prevUnit === 'normalized') return v;
        if (prevUnit === 'f_ny') return v / 2;
        return (v * unitScaleHz(prevUnit)) / (oldFsHz || 48000);
      };

      const fromFsRatio = (r) => {
        let out;
        if (newUnit === 'normalized') out = r;
        else if (newUnit === 'f_ny') out = r * 2;
        else out = (r * oldFsHz) / unitScaleHz(newUnit);
        return Number(out.toPrecision(6));
      };

      AppState.specs.fpb = fromFsRatio(toFsRatio(AppState.specs.fpb));
      AppState.specs.fsb = fromFsRatio(toFsRatio(AppState.specs.fsb));
      AppState.specs.fpb2 = fromFsRatio(toFsRatio(AppState.specs.fpb2));
      AppState.specs.fsb2 = fromFsRatio(toFsRatio(AppState.specs.fsb2));

      if (!isNewNorm) {
        AppState.specs.fs = Number((oldFsHz / unitScaleHz(newUnit)).toPrecision(6));
      } else {
        AppState.specs.fs = oldFsHz;
      }

      const setInput = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setInput('inp-fs', AppState.specs.fs);
      setInput('inp-fpb', AppState.specs.fpb);
      setInput('inp-fsb', AppState.specs.fsb);
      setInput('inp-fpb2', AppState.specs.fpb2);
      setInput('inp-fsb2', AppState.specs.fsb2);

      AppState.specs.freqUnit = newUnit;
      prevUnit = newUnit;
      updateLabels();
      updateFieldVisibility();
    });

    // Amplitude unit selector: convert between dB / V / W matching IIR vs FIR formulas
    document.getElementById('sel-amp-unit')?.addEventListener('change', (e) => {
      const newUnit = e.target.value;
      const ft = AppState.specs.filterFamily || 'iir';
      AppState.specs.apb = convertAmp(AppState.specs.apb, ft, 'pb', prevAmpUnit, newUnit);
      AppState.specs.asb = convertAmp(AppState.specs.asb, ft, 'sb', prevAmpUnit, newUnit);
      AppState.specs.ampUnit = newUnit;
      prevAmpUnit = newUnit;

      const elApb = document.getElementById('inp-apb');
      const elAsb = document.getElementById('inp-asb');
      if (elApb) elApb.value = AppState.specs.apb;
      if (elAsb) elAsb.value = AppState.specs.asb;
      updateLabels();
    });

    // Numeric inputs
    bindNumericInput('inp-fs', 'fs');
    bindNumericInput('inp-fpb', 'fpb');
    bindNumericInput('inp-fpb2', 'fpb2');
    bindNumericInput('inp-fsb', 'fsb');
    bindNumericInput('inp-fsb2', 'fsb2');
    bindNumericInput('inp-apb', 'apb');
    bindNumericInput('inp-asb', 'asb');
    bindNumericInput('inp-order', 'order', true);
    bindNumericInput('inp-win-param', 'winParam');
    bindNumericInput('inp-win-param2', 'winParam2');
    bindNumericInput('inp-wpb', 'wpb');
    bindNumericInput('inp-wsb', 'wsb');
    bindNumericInput('inp-wpb2', 'wpb2');
    bindNumericInput('inp-wsb2', 'wsb2');
    bindNumericInput('inp-grid-density', 'gridDensity');
    bindNumericInput('inp-ma-stages', 'maStages');

    document.getElementById('chk-ma-norm')?.addEventListener('change', (e) => {
      AppState.specs.maNormalize = e.target.checked;
    });

    // Sort button for frequency edges
    document.getElementById('btn-sort-edges')?.addEventListener('click', () => {
      const rt = AppState.specs.responseType;
      if (rt === 'lowpass') {
        const [a, b] = [AppState.specs.fpb, AppState.specs.fsb].sort((x, y) => x - y);
        AppState.specs.fpb = a; AppState.specs.fsb = b;
      } else if (rt === 'highpass') {
        const [a, b] = [AppState.specs.fsb, AppState.specs.fpb].sort((x, y) => x - y);
        AppState.specs.fsb = a; AppState.specs.fpb = b;
      } else if (rt === 'bandpass' || rt === 'hilbert') {
        const [a, b, c, d] = [AppState.specs.fsb, AppState.specs.fpb, AppState.specs.fpb2, AppState.specs.fsb2].sort((x, y) => x - y);
        AppState.specs.fsb = a; AppState.specs.fpb = b; AppState.specs.fpb2 = c; AppState.specs.fsb2 = d;
      } else if (rt === 'bandstop') {
        const [a, b, c, d] = [AppState.specs.fpb, AppState.specs.fsb, AppState.specs.fsb2, AppState.specs.fpb2].sort((x, y) => x - y);
        AppState.specs.fpb = a; AppState.specs.fsb = b; AppState.specs.fsb2 = c; AppState.specs.fpb2 = d;
      }
      ['fpb', 'fsb', 'fpb2', 'fsb2'].forEach(k => {
        const el = document.getElementById(`inp-${k}`);
        if (el) el.value = AppState.specs[k];
      });
      showToast('Sorted frequency edges ascending', 'info');
    });

    // Auto order checkbox
    document.getElementById('chk-auto-order')?.addEventListener('change', (e) => {
      const orderInput = document.getElementById('inp-order');
      if (e.target.checked) {
        AppState.specs.order = null;
        if (orderInput) {
          orderInput.value = '';
          orderInput.placeholder = 'Auto';
          orderInput.disabled = true;
        }
      } else {
        if (orderInput) {
          orderInput.disabled = false;
          orderInput.value = orderInput.value || '10';
        }
        AppState.specs.order = parseInt(orderInput?.value) || 10;
      }
    });

    // Window select
    document.getElementById('sel-window')?.addEventListener('change', (e) => {
      AppState.specs.window = e.target.value;
      const wp = WIN_PARAMS[e.target.value];
      if (wp) {
        AppState.specs.winParam = wp.d1;
        const el1 = document.getElementById('inp-win-param');
        if (el1) el1.value = wp.d1;
        if (wp.l2) {
          AppState.specs.winParam2 = wp.d2;
          const el2 = document.getElementById('inp-win-param2');
          if (el2) el2.value = wp.d2;
        }
      }
      updateFieldVisibility();
    });

    // Design button
    document.getElementById('btn-design')?.addEventListener('click', () => {
      if (validate()) designFilter();
    });

    // Examples select
    const selExample = document.getElementById('sel-example');
    if (selExample) {
      selExample.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val && EXAMPLES[val]) {
          Object.assign(AppState.specs, EXAMPLES[val]);
          loadFromState();

          if (validate()) designFilter();
        }
      });
    }

    // Designing state feedback
    bus.on('designStart', () => {
      const btn = document.getElementById('btn-design');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="md-spinner"></span> Designing…'; }
    });

    bus.on('designEnd', () => {
      const btn = document.getElementById('btn-design');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Design Filter';
      }
    });

    updateMethodOptions();
    updateFieldVisibility();
    updateLabels();

    bus.on('filterLoaded', syncUI);
    bus.on('specsImported', refreshUI);
  }

  /* Bind segmented buttons */
  function bindSegmented(containerId, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.md-segmented__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.md-segmented__btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(btn.dataset.value);
        // Update the external label for response type
        if (containerId === 'seg-response') updateResponseLabel(btn.dataset.value);
      });
    });
  }

  /* Map value to full name and update the label span */
  const RESPONSE_NAMES = {
    lowpass: 'Lowpass', highpass: 'Highpass',
    bandpass: 'Bandpass', bandstop: 'Bandstop',
    allpass: 'Allpass', hilbert: 'Hilbert', differentiator: 'Differentiator',
  };

  function updateResponseLabel(value) {
    const lbl = document.getElementById('lbl-response-text');
    if (lbl) lbl.textContent = RESPONSE_NAMES[value] || value;
  }

  /* Bind a numeric input to state */
  function bindNumericInput(inputId, stateKey, allowNull = false) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', () => {
      const val = el.value.trim();
      if (allowNull && val === '') {
        AppState.specs[stateKey] = null;
      } else {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          AppState.specs[stateKey] = num;
          el.classList.remove('error');
        }
      }
    });
  }

  /* Show/hide fields based on response type and design method */
  function updateFieldVisibility() {
    const rt = AppState.specs.responseType;
    const dm = AppState.specs.designMethod;
    const isBandType = (rt === 'bandpass' || rt === 'bandstop' || rt === 'hilbert');
    const isAllpass = (rt === 'allpass');
    const isDiff = (rt === 'differentiator');
    const isMavg = (dm === 'mavg');
    const isWindowMethod = (dm === 'firwin' || dm === 'firwin2');
    const hasWeights = (dm === 'remez' || dm === 'firls') && !isAllpass;
    const winMeta = isWindowMethod ? WIN_PARAMS[AppState.specs.window] : null;

    // Reorder DOM fields based on frequency mathematical rules
    updateFieldOrder();

    // Band edges
    show('field-fpb', !isAllpass);
    show('field-fsb', !isAllpass && !isDiff && !isMavg);
    show('field-fpb2', isBandType && !isMavg);
    show('field-fsb2', isBandType && !isMavg);

    // Ripple / attenuation
    show('field-apb', !isAllpass && !isMavg && !isDiff);
    show('field-asb', !isAllpass && !isMavg && !isDiff);

    // Window + parameterized window controls
    show('field-window', isWindowMethod);
    show('field-win-param-row', Boolean(winMeta));
    if (winMeta) {
      setLabel('lbl-win-param', winMeta.l1);
      show('field-win-param2', Boolean(winMeta.l2));
      if (winMeta.l2) setLabel('lbl-win-param2', winMeta.l2);
    }

    // Remez Grid Density & Moving Average options
    show('field-grid-density', dm === 'remez' && !isAllpass);
    show('field-ma-opts', isMavg);

    // Weights
    show('field-weights', hasWeights);
    show('field-weights-2', hasWeights && isBandType);

    // Freq unit toggle for normalized F_s / f_Ny
    show('field-fs', AppState.specs.freqUnit !== 'normalized' && AppState.specs.freqUnit !== 'f_ny');
  }

  /* Dynamically reorder frequency specifications chronologically */
  function updateFieldOrder() {
    const rt = AppState.specs.responseType;
    let order = [];

    // Determine exact physical array order mathematically
    if (rt === 'lowpass' || rt === 'differentiator') order = ['field-fpb', 'field-fsb'];
    else if (rt === 'highpass') order = ['field-fsb', 'field-fpb'];
    else if (rt === 'bandpass' || rt === 'hilbert') order = ['field-fsb', 'field-fpb', 'field-fpb2', 'field-fsb2'];
    else if (rt === 'bandstop') order = ['field-fpb', 'field-fsb', 'field-fsb2', 'field-fpb2'];
    else return; // Allpass has no edges

    // Reorder by inserting each element right before the apb (Ripple) container
    const refNode = document.getElementById('field-apb');
    const parent = refNode ? refNode.parentNode : null;
    if (!parent) return;

    order.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        parent.insertBefore(el, refNode);
      }
    });
  }

  /* Get the multiplier to convert display units to Hz */
  function getFreqMultiplier() {
    const u = AppState.specs.freqUnit;
    if (u === 'khz') return 1e3;
    if (u === 'mhz') return 1e6;
    if (u === 'ghz') return 1e9;
    return 1; // Hz
  }

  /* Get effective Fs in Hz for SciPy frequency response (1.0 when normalized) */
  function getEffectiveFsHz() {
    const u = AppState.specs.freqUnit;
    if (u === 'normalized' || u === 'f_ny') return 1.0;
    return (AppState.specs.fs || 48000) * getFreqMultiplier();
  }

  /* Update field labels based on units */
  function updateLabels() {
    const u = AppState.specs.freqUnit;
    let fUnit = '(Hz)';
    if (u === 'khz') fUnit = '(kHz)';
    else if (u === 'mhz') fUnit = '(MHz)';
    else if (u === 'ghz') fUnit = '(GHz)';
    else if (u === 'normalized') fUnit = '(f / F_s)';
    else if (u === 'f_ny') fUnit = '(f / f_Ny)';

    const isTwoSided = (AppState.specs.responseType === 'bandpass' || AppState.specs.responseType === 'bandstop' || AppState.specs.responseType === 'hilbert');

    setLabel('lbl-fs', `Sampling Freq ${fUnit}`);

    if (isTwoSided) {
      setLabel('lbl-fpb', `Passband Edge 1 ${fUnit}`);
      setLabel('lbl-fsb', `Stopband Edge 1 ${fUnit}`);
      setLabel('lbl-fpb2', `Passband Edge 2 ${fUnit}`);
      setLabel('lbl-fsb2', `Stopband Edge 2 ${fUnit}`);
    } else {
      setLabel('lbl-fpb', `Passband Edge ${fUnit}`);
      setLabel('lbl-fsb', `Stopband Edge ${fUnit}`);
      setLabel('lbl-fpb2', `Passband Edge 2 ${fUnit}`);
      setLabel('lbl-fsb2', `Stopband Edge 2 ${fUnit}`);
    }

    const aUnit = AppState.specs.ampUnit === 'db' ? '(dB)' : AppState.specs.ampUnit === 'linear' ? '(V/V)' : '(W/W)';
    setLabel('lbl-apb', `Passband Ripple ${aUnit}`);
    setLabel('lbl-asb', `Stopband Atten. ${aUnit}`);
  }

  /* Update design method dropdown based on family */
  function updateMethodOptions() {
    const iirGroup = document.getElementById('optgroup-iir');
    const firGroup = document.getElementById('optgroup-fir');
    const sel = document.getElementById('sel-method');

    if (AppState.specs.filterFamily === 'iir') {
      if (iirGroup) iirGroup.style.display = '';
      if (firGroup) firGroup.style.display = 'none';
      if (!['butter', 'cheby1', 'cheby2', 'ellip', 'bessel'].includes(AppState.specs.designMethod)) {
        if (sel) { sel.value = 'butter'; AppState.specs.designMethod = 'butter'; }
      } else {
        if (sel) sel.value = AppState.specs.designMethod;
      }
    } else {
      if (iirGroup) iirGroup.style.display = 'none';
      if (firGroup) firGroup.style.display = '';
      if (!['firwin', 'firwin2', 'remez', 'firls', 'mavg'].includes(AppState.specs.designMethod)) {
        if (sel) { sel.value = 'firwin'; AppState.specs.designMethod = 'firwin'; }
      } else {
        if (sel) sel.value = AppState.specs.designMethod;
      }
    }
  }

  /* Validate inputs across all frequency & amplitude units */
  function validate() {
    let valid = true;
    const s = AppState.specs;
    const u = s.freqUnit;
    const nyquist = u === 'normalized' ? 0.5 : (u === 'f_ny' ? 1.0 : s.fs / 2);

    const check = (id, condition, msg) => {
      const el = document.getElementById(id);
      if (!condition) {
        el?.classList.add('error');
        showToast(msg, 'error');
        valid = false;
      } else {
        el?.classList.remove('error');
      }
    };

    if (u !== 'normalized' && u !== 'f_ny') {
      check('inp-fs', s.fs > 0, 'Sampling frequency must be > 0');
    }

    if (!['allpass', 'hilbert', 'differentiator'].includes(s.responseType)) {
      check('inp-fpb', s.fpb > 0 && s.fpb < nyquist, `Passband freq must be 0 < Fpb < ${nyquist}`);
      if (s.designMethod !== 'mavg') {
        check('inp-fsb', s.fsb > 0 && s.fsb < nyquist, `Stopband freq must be 0 < Fsb < ${nyquist}`);
      }
      if (s.responseType === 'bandpass' || s.responseType === 'bandstop') {
        check('inp-fpb2', s.fpb2 > 0 && s.fpb2 < nyquist, `Passband Edge 2 must be 0 < Fpb2 < ${nyquist}`);
        check('inp-fsb2', s.fsb2 > 0 && s.fsb2 < nyquist, `Stopband Edge 2 must be 0 < Fsb2 < ${nyquist}`);
      }
    }

    if (s.responseType !== 'allpass' && s.designMethod !== 'mavg' && s.responseType !== 'differentiator') {
      if (['cheby1', 'ellip', 'remez', 'firls', 'firwin', 'firwin2'].includes(s.designMethod)) {
        check('inp-apb', s.apb > 0, 'Passband ripple must be > 0');
      }
      check('inp-asb', s.asb > 0, 'Stopband attenuation must be > 0');
    }

    return valid;
  }

  /* Helpers */
  function show(id, visible) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  }

  function setLabel(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /* Load from AppState.specs */
  function loadFromState() {
    const s = AppState.specs;

    const segResp = document.getElementById('seg-response');
    if (segResp) {
      segResp.querySelectorAll('.md-segmented__btn').forEach(b => b.classList.remove('active'));
      const activeBtn = segResp.querySelector(`[data-value="${s.responseType}"]`);
      if (activeBtn) activeBtn.classList.add('active');
      updateResponseLabel(s.responseType);
    }

    const segFam = document.getElementById('seg-family');
    if (segFam) {
      segFam.querySelectorAll('.md-segmented__btn').forEach(b => b.classList.remove('active'));
      const activeBtn = segFam.querySelector(`[data-value="${s.filterFamily}"]`);
      if (activeBtn) activeBtn.classList.add('active');
    }

    const selFreqUnit = document.getElementById('sel-freq-unit');
    if (selFreqUnit && s.freqUnit) selFreqUnit.value = s.freqUnit;

    const selAmpUnit = document.getElementById('sel-amp-unit');
    if (selAmpUnit && s.ampUnit) selAmpUnit.value = s.ampUnit;

    const selWindow = document.getElementById('sel-window');
    if (selWindow && s.window) selWindow.value = s.window;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val !== null && val !== undefined ? val : '';
    };

    setVal('inp-fs', s.fs);
    setVal('inp-fpb', s.fpb);
    setVal('inp-fpb2', s.fpb2);
    setVal('inp-fsb', s.fsb);
    setVal('inp-fsb2', s.fsb2);
    setVal('inp-apb', s.apb);
    setVal('inp-asb', s.asb);
    setVal('inp-win-param', s.winParam ?? 8);
    setVal('inp-win-param2', s.winParam2 ?? 1);
    setVal('inp-wpb', s.wpb ?? 1);
    setVal('inp-wsb', s.wsb ?? 1);
    setVal('inp-wpb2', s.wpb2 ?? 1);
    setVal('inp-wsb2', s.wsb2 ?? 1);
    setVal('inp-grid-density', s.gridDensity ?? 16);
    setVal('inp-ma-stages', s.maStages ?? 1);
    const chkMa = document.getElementById('chk-ma-norm');
    if (chkMa) chkMa.checked = s.maNormalize !== false;

    const chkAuto = document.getElementById('chk-auto-order');
    if (chkAuto) {
      chkAuto.checked = (s.order === null || s.order === undefined);
      const inpOrder = document.getElementById('inp-order');
      if (inpOrder) {
        if (chkAuto.checked) {
          inpOrder.disabled = true;
          inpOrder.value = '';
          inpOrder.placeholder = 'Auto';
        } else {
          inpOrder.disabled = false;
          inpOrder.value = s.order;
        }
      }
    }

    updateMethodOptions();
    updateFieldVisibility();
    updateLabels();
  }

  function refreshUI(loadedSpecs) {
    if (loadedSpecs) {
      Object.assign(AppState.specs, loadedSpecs);
    }
    loadFromState();
  }

  function syncUI(data) {
    // Legacy fallback mapping
    if (data.rt) AppState.specs.responseType = data.rt;
    if (data.fc) AppState.specs.filterFamily = data.fc;
    if (data.method || data.fc) {
      AppState.specs.designMethod = data.method || data.fc;
    }

    if (data.specs) {
      Object.assign(AppState.specs, data.specs);
    }

    loadFromState();
  }

  return { init, getFreqMultiplier, getEffectiveFsHz, loadFromState, syncUI, refreshUI };
})();
