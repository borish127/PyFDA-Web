/* ============================================================
   PyFDA Web — Pyodide Bridge
   Manages Pyodide lifecycle, package loading, and Python execution
   via a Background Web Worker
   ============================================================ */

const PyodideBridge = (() => {
  let worker = null;
  let ready = false;
  let msgCounter = 0;
  const pendingRequests = new Map();

  window.pyodideEngineReady = false;

  /* ----- Status Callback ----- */
  function updateLoadingStatus(msg, percent) {
    const mlStatus = document.getElementById('mini-loader-status');
    if (mlStatus) mlStatus.textContent = msg;
    
    // Optionally update progress bar if you have one
    const mlBar = document.getElementById('loading-bar-fill');
    if (mlBar) mlBar.style.width = percent + '%';
  }

  /* ----- Worker Message Router ----- */
  function handleWorkerMessage(e) {
    const data = e.data;
    if (data.type === 'status') {
      updateLoadingStatus(data.msg, data.percent);
      if (data.msg === 'Ready!') {
        window.pyodideEngineReady = true;
        const ml = document.getElementById('mini-loader');
        if (ml) ml.classList.add('hidden');
        
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.add('hidden');
      }
    } else if (data.type === 'response') {
      const { msgId, success, data: resultData, error } = data;
      const promiseObj = pendingRequests.get(msgId);
      if (promiseObj) {
        pendingRequests.delete(msgId);
        if (success) {
          promiseObj.resolve(resultData);
        } else {
          promiseObj.reject(new Error(error));
        }
      }
    }
  }

  /* ----- Dispatch helper ----- */
  function dispatchToWorker(type, payload = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const msgId = msgCounter++;
      
      // Optionally add a timeout fallback for freezing Python computations
      let timeoutId = null;
      if (timeoutMs > 0 && type !== 'init') {
          timeoutId = setTimeout(() => {
              if (pendingRequests.has(msgId)) {
                  pendingRequests.delete(msgId);
                  reject(new Error(`Worker execution timed out after ${timeoutMs}ms for function: ${payload?.funcName || 'unknown'}`));
              }
          }, timeoutMs);
      }

      pendingRequests.set(msgId, {
          resolve: (res) => {
              if (timeoutId) clearTimeout(timeoutId);
              resolve(res);
          },
          reject: (err) => {
              if (timeoutId) clearTimeout(timeoutId);
              reject(err);
          }
      });
      
      worker.postMessage({ type, msgId, payload });
    });
  }

  /* ----- Load Pyodide + Packages ----- */
  async function init() {
    updateLoadingStatus('Starting Web Worker…', 0);
    worker = new Worker('js/pyodide-worker.js');
    worker.onmessage = handleWorkerMessage;
    
    try {
        await dispatchToWorker('init', {}, 0); // no timeout for initialization
        ready = true;
        return true;
    } catch (err) {
        updateLoadingStatus(`Error: ${err.message}`, 0);
        console.error('Worker init failed:', err);
        throw err;
    }
  }

  /* ----- Run arbitrary Python code ----- */
  async function runPython(code) {
    if (!ready) throw new Error('Pyodide Worker not initialized');
    return dispatchToWorker('run_python', { code }, 0); // No timeout for arbitrary scripts
  }

  /* ----- Call a Python function and get JSON result ----- */
  async function callPython(funcName, argsJson) {
    if (!ready) throw new Error('Pyodide Worker not initialized');
    return dispatchToWorker('call_python', { funcName, argsJson }, 30000); // 30 sec timeout
  }

  /* ----- Specific endpoints wrapping callPython ----- */
  async function designFilter(specs) {
    return callPython('design_filter', JSON.stringify(specs));
  }

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
