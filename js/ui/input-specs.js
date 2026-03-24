/* ============================================================
   PyFDA Web — Input Specs UI Logic
   Manages filter specification controls and validation
   ============================================================ */

const InputSpecs = (() => {

  function init() {
    bindSegmented('seg-response', (val) => {
      AppState.specs.responseType = val;
      updateFieldVisibility();
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

    // Frequency & amplitude unit selectors
    document.getElementById('sel-freq-unit')?.addEventListener('change', (e) => {
      AppState.specs.freqUnit = e.target.value;
      updateLabels();
    });

    document.getElementById('sel-amp-unit')?.addEventListener('change', (e) => {
      AppState.specs.ampUnit = e.target.value;
      updateLabels();
    });

    // Numeric inputs
    bindNumericInput('inp-fs',    'fs');
    bindNumericInput('inp-fpb',   'fpb');
    bindNumericInput('inp-fpb2',  'fpb2');
    bindNumericInput('inp-fsb',   'fsb');
    bindNumericInput('inp-fsb2',  'fsb2');
    bindNumericInput('inp-apb',   'apb');
    bindNumericInput('inp-asb',   'asb');
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

    updateFieldVisibility();
    updateLabels();
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
    show('field-fs', AppState.specs.freqUnit === 'hz');
  }

  /* Update field labels based on units */
  function updateLabels() {
    const fUnit = AppState.specs.freqUnit === 'hz' ? '(Hz)' : '(normalized)';
    setLabel('lbl-fpb', `Passband Edge ${fUnit}`);
    setLabel('lbl-fsb', `Stopband Edge ${fUnit}`);

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
      if (sel) { sel.value = 'butter'; AppState.specs.designMethod = 'butter'; }
    } else {
      if (iirGroup) iirGroup.style.display = 'none';
      if (firGroup) firGroup.style.display = '';
      if (sel) { sel.value = 'firwin'; AppState.specs.designMethod = 'firwin'; }
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

  return { init };
})();
