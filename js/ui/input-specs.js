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

  /* Enforces valid chronological frequencies when switching response types */
  function enforceValidFrequencies() {
    const rt = AppState.specs.responseType;
    const isNorm = AppState.specs.freqUnit === 'normalized';
    const fs = AppState.specs.fs || 48000;

    // Define 4 safe, chronologically ordered points to guarantee successful design.
    // For normalized, Nyquist is 0.5. We use 0.1, 0.2, 0.3, 0.4.
    // For absolute, Nyquist is fs / 2. We use 10%, 20%, 30%, 40% of fs.
    let p1, p2, p3, p4;
    if (isNorm) {
      p1 = 0.1; p2 = 0.2; p3 = 0.3; p4 = 0.4;
    } else {
      p1 = fs * 0.1;
      p2 = fs * 0.2;
      p3 = fs * 0.3;
      p4 = fs * 0.4;
    }

    // Assign values based on mathematical requirements of the response type
    if (rt === 'lowpass') {
      AppState.specs.fpb = p1;
      AppState.specs.fsb = p2;
    } else if (rt === 'highpass') {
      AppState.specs.fsb = p1;
      AppState.specs.fpb = p2;
    } else if (rt === 'bandpass') {
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
    bindSegmented('seg-response', (val) => {
      AppState.specs.responseType = val;
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

    let prevUnit = AppState.specs.freqUnit;

    // Frequency & amplitude unit selectors
    document.getElementById('sel-freq-unit')?.addEventListener('change', (e) => {
      const newUnit = e.target.value;
      if (prevUnit !== 'normalized' && newUnit === 'normalized') {
        AppState.specs.fpb = 0.1;
        AppState.specs.fsb = 0.2;
        AppState.specs.fpb2 = 0.3;
        AppState.specs.fsb2 = 0.4;
      } else if (prevUnit === 'normalized' && newUnit !== 'normalized') {
        AppState.specs.fpb = 1000;
        AppState.specs.fsb = 5000;
        AppState.specs.fpb2 = 8000;
        AppState.specs.fsb2 = 12000;
      }

      const elFpb = document.getElementById('inp-fpb');
      const elFsb = document.getElementById('inp-fsb');
      const elFpb2 = document.getElementById('inp-fpb2');
      const elFsb2 = document.getElementById('inp-fsb2');

      if (elFpb) elFpb.value = AppState.specs.fpb;
      if (elFsb) elFsb.value = AppState.specs.fsb;
      if (elFpb2) elFpb2.value = AppState.specs.fpb2;
      if (elFsb2) elFsb2.value = AppState.specs.fsb2;

      AppState.specs.freqUnit = newUnit;
      prevUnit = newUnit;
      updateLabels();
      updateFieldVisibility();
    });

    document.getElementById('sel-amp-unit')?.addEventListener('change', (e) => {
      AppState.specs.ampUnit = e.target.value;
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
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Design Filter';
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
    bandpass: 'Bandpass', bandstop: 'Bandstop', allpass: 'Allpass',
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
    const isBandType = (rt === 'bandpass' || rt === 'bandstop');
    const isAllpass = (rt === 'allpass');
    const isFIR = AppState.specs.filterFamily === 'fir';

    // Reorder DOM fields based on frequency mathematical rules
    updateFieldOrder();

    // Band edges
    show('field-fpb', !isAllpass);
    show('field-fsb', !isAllpass);
    show('field-fpb2', isBandType);
    show('field-fsb2', isBandType);

    // Ripple / attenuation
    const needsRipple = ['cheby1', 'ellip', 'firwin', 'firwin2', 'remez', 'firls'].includes(dm);
    const needsAtten = ['cheby2', 'ellip', 'remez', 'firls', 'butter', 'bessel'].includes(dm) || !isFIR;
    show('field-apb', needsRipple || !isFIR);
    show('field-asb', needsAtten || !isFIR);

    // Window (for firwin/firwin2)
    show('field-window', dm === 'firwin' || dm === 'firwin2');

    // Freq unit toggle for normalized
    show('field-fs', AppState.specs.freqUnit !== 'normalized');
  }

  /* Dynamically reorder frequency specifications chronologically */
  function updateFieldOrder() {
    const rt = AppState.specs.responseType;
    let order = [];

    // Determine exact physical array order mathematically
    if (rt === 'lowpass') order = ['field-fpb', 'field-fsb'];
    else if (rt === 'highpass') order = ['field-fsb', 'field-fpb'];
    else if (rt === 'bandpass') order = ['field-fsb', 'field-fpb', 'field-fpb2', 'field-fsb2'];
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

  /* Update field labels based on units */
  function updateLabels() {
    const u = AppState.specs.freqUnit;
    let fUnit = '(Hz)';
    if (u === 'khz') fUnit = '(kHz)';
    else if (u === 'mhz') fUnit = '(MHz)';
    else if (u === 'ghz') fUnit = '(GHz)';
    else if (u === 'normalized') fUnit = '(normalized)';

    const isTwoSided = (AppState.specs.responseType === 'bandpass' || AppState.specs.responseType === 'bandstop');

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

  /* Validate inputs */
  function validate() {
    let valid = true;
    const s = AppState.specs;
    const nyquist = s.fs / 2;

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

    if (s.freqUnit === 'hz') {
      check('inp-fs', s.fs > 0, 'Sampling frequency must be > 0');
      check('inp-fpb', s.fpb > 0 && s.fpb < nyquist, `Passband freq must be 0 < Fpb < ${nyquist} Hz`);
      if (s.responseType !== 'allpass') {
        check('inp-fsb', s.fsb > 0 && s.fsb < nyquist, `Stopband freq must be 0 < Fsb < ${nyquist} Hz`);
      }
    }

    if (['cheby1', 'ellip'].includes(s.designMethod)) {
      check('inp-apb', s.apb > 0, 'Passband ripple must be > 0');
    }

    check('inp-asb', s.asb > 0, 'Stopband attenuation must be > 0');

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

  return { init, getFreqMultiplier, loadFromState, syncUI, refreshUI };
})();
