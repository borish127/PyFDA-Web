/* ============================================================
   PyFDA Web — Pyodide Bridge
   Manages Pyodide lifecycle, package loading, and Python execution
   ============================================================ */

const PyodideBridge = (() => {
  let pyodide = null;
  let ready = false;
  window.pyodideEngineReady = false;
  const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';

  /* ----- Status Callback ----- */
  function updateLoadingStatus(msg, percent) {
    const mlStatus = document.getElementById('mini-loader-status');
    if (mlStatus) mlStatus.textContent = msg;
  }

  /* ----- Load Pyodide + Packages ----- */
  async function init() {
    try {
      updateLoadingStatus('Loading Pyodide runtime…', 10);

      // Dynamically load the Pyodide script if not already present
      if (!window.loadPyodide) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = PYODIDE_CDN;
          s.onload = resolve;
          s.onerror = () => reject(new Error('Failed to load Pyodide CDN'));
          document.head.appendChild(s);
        });
      }

      updateLoadingStatus('Initializing Python interpreter…', 25);
      pyodide = await window.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
      });

      updateLoadingStatus('Installing NumPy…', 40);
      await pyodide.loadPackage('numpy');

      updateLoadingStatus('Installing SciPy…', 60);
      await pyodide.loadPackage('scipy');

      updateLoadingStatus('Loading DSP modules…', 80);
      // Load our Python modules
      const modules = ['filter_design', 'filter_analysis', 'fixpoint', 'io_utils'];
      for (const mod of modules) {
        const resp = await fetch(`python/${mod}.py`);
        if (resp.ok) {
          const code = await resp.text();
          await pyodide.runPythonAsync(code);
        }
      }

      updateLoadingStatus('Ready!', 100);
      ready = true;
      window.pyodideEngineReady = true;
      const ml = document.getElementById('mini-loader');
      if (ml) ml.classList.add('hidden');
      return true;
    } catch (err) {
      updateLoadingStatus(`Error: ${err.message}`, 0);
      console.error('Pyodide init failed:', err);
      throw err;
    }
  }

  /* ----- Run arbitrary Python code ----- */
  async function runPython(code) {
    if (!ready) throw new Error('Pyodide not initialized');
    try {
      return await pyodide.runPythonAsync(code);
    } catch (err) {
      console.error('Python error:', err);
      throw err;
    }
  }

  /* ----- Call a Python function and get JSON result ----- */
  async function callPython(funcName, argsJson) {
    if (!ready) throw new Error('Pyodide not initialized');
    
    // Attach to window to avoid fragile string interpolation in Python
    window.__pyfda_args = argsJson;
    
    const code = `
import json
import js
try:
    _args = json.loads(js.window.__pyfda_args)
    _res = ${funcName}(**_args) if isinstance(_args, dict) else ${funcName}(*_args)
    _out = {"success": True, "data": _res}
except Exception as e:
    _out = {"success": False, "error": type(e).__name__ + ": " + str(e)}
json.dumps(_out, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
`;
    try {
      const resultStr = await pyodide.runPythonAsync(code);
      const parsed = JSON.parse(resultStr);
      if (!parsed.success) {
        throw new Error(parsed.error);
      }
      return parsed.data;
    } catch (err) {
      console.error(`Python call ${funcName} failed:`, err);
      throw err;
    }
  }

  /* ----- Design filter ----- */
  async function designFilter(specs) {
    // Pass the specs object directly so Python's **_args unrolls it 
    // into responseType='...', fs=..., etc.
    return callPython('design_filter', JSON.stringify(specs));
  }

  /* ----- Analysis functions ----- */
  async function freqResponse(b, a, fs, nPoints) {
    return callPython('freq_response', JSON.stringify({ b, a, fs, n_points: nPoints }));
  }

  async function groupDelay(b, a, fs, nPoints) {
    return callPython('group_delay_analysis', JSON.stringify({ b, a, fs, n_points: nPoints }));
  }

  async function phaseDelay(b, a, fs, nPoints) {
    return callPython('phase_delay', JSON.stringify({ b, a, fs, n_points: nPoints }));
  }

  async function impulseResponse(b, a, nSamples) {
    return callPython('impulse_response', JSON.stringify({ b, a, n_samples: nSamples }));
  }

  async function stepResponse(b, a, nSamples) {
    return callPython('step_response', JSON.stringify({ b, a, n_samples: nSamples }));
  }

  async function stimulusResponse(b, a, stimExpr, fs, nSamples) {
    return callPython('stimulus_response', JSON.stringify({
      b, a, stim_expr: stimExpr, fs, n_samples: nSamples
    }));
  }

  async function pzData(b, a) {
    return callPython('pz_data', JSON.stringify({ b, a }));
  }

  async function surface3D(b, a, nPoints) {
    return callPython('surface_3d', JSON.stringify({ b, a, n_points: nPoints }));
  }

  /* ----- Fixpoint simulation ----- */
  async function fixpointSim(b, a, x, config) {
    return callPython('fixpoint_filter', JSON.stringify({ b, a, x, ...config }));
  }

  /* ----- File I/O ----- */
  async function exportData(format, data) {
    return callPython('export_filter', JSON.stringify({ format, ...data }));
  }

  async function importData(format, dataB64) {
    return callPython('import_filter', JSON.stringify({ format, data_b64: dataB64 }));
  }

  function isReady() { return ready; }

  return {
    init, runPython, callPython, isReady,
    designFilter, freqResponse, groupDelay, phaseDelay,
    impulseResponse, stepResponse, stimulusResponse,
    pzData, surface3D, fixpointSim, exportData, importData
  };
})();
