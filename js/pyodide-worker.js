/* ============================================================
   PyFDA Web — Pyodide Web Worker
   Executes heavy Python math off the main browser thread
   ============================================================ */

importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');

let pyodide = null;
let ready = false;

async function initPyodide() {
  postMessage({ type: 'status', msg: 'Loading Pyodide runtime…', percent: 10 });
  
  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
  });

  postMessage({ type: 'status', msg: 'Installing NumPy…', percent: 40 });
  await pyodide.loadPackage('numpy');

  postMessage({ type: 'status', msg: 'Installing SciPy…', percent: 60 });
  await pyodide.loadPackage('scipy');

  postMessage({ type: 'status', msg: 'Loading DSP modules…', percent: 80 });
  const modules = ['filter_design', 'filter_analysis', 'fixpoint', 'io_utils'];
  for (const mod of modules) {
    // Relative to this worker script (js/pyodide-worker.js) -> go up to parent
    const resp = await fetch('../python/' + mod + '.py');
    if (resp.ok) {
      const code = await resp.text();
      await pyodide.runPythonAsync(code);
    } else {
      throw new Error("Failed to load module: " + mod);
    }
  }

  // Pre-load our json and js execution wrapper in global scope
  await pyodide.runPythonAsync(`
import json

def _execute_func(func_name, args_str):
    try:
        _args = json.loads(args_str)
        _func = globals()[func_name]
        _res = _func(**_args) if isinstance(_args, dict) else _func(*_args)
        _out = {"success": True, "data": _res}
    except Exception as e:
        _out = {"success": False, "error": type(e).__name__ + ": " + str(e)}
    
    return json.dumps(_out, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
  `);

  ready = true;
  postMessage({ type: 'status', msg: 'Ready!', percent: 100 });
}

onmessage = async (e) => {
  const { type, msgId, payload } = e.data;

  try {
    if (type === 'init') {
      await initPyodide();
      postMessage({ type: 'response', msgId, success: true });
    } else if (type === 'call_python') {
      if (!ready) throw new Error("Pyodide not ready");
      const { funcName, argsJson } = payload;
      
      pyodide.globals.set('_bridge_func', funcName);
      pyodide.globals.set('_bridge_args', argsJson);
      
      const resultStr = await pyodide.runPythonAsync('_execute_func(_bridge_func, _bridge_args)');
      const parsed = JSON.parse(resultStr);
      
      if (parsed.success) {
        postMessage({ type: 'response', msgId, success: true, data: parsed.data });
      } else {
        postMessage({ type: 'response', msgId, success: false, error: parsed.error });
      }
    } else if (type === 'run_python') {
      if (!ready) throw new Error("Pyodide not ready");
      const result = await pyodide.runPythonAsync(payload.code);
      postMessage({ type: 'response', msgId, success: true, data: result });
    }
  } catch (err) {
    postMessage({ type: 'response', msgId, success: false, error: err.message });
  }
};
