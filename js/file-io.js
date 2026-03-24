/* ============================================================
   PyFDA Web — File I/O (Browser File API)
   Export/Import filter designs via browser download/upload
   ============================================================ */

const FileIO = (() => {

  function init() {
    document.getElementById('btn-export')?.addEventListener('click', showExportMenu);
    document.getElementById('btn-import')?.addEventListener('click', triggerImport);
  }

  /* ---------- Export ---------- */
  async function showExportMenu() {
    if (!AppState.filter.b) {
      showToast('Design a filter before exporting', 'error');
      return;
    }

    // Simple format selection via prompt (could be replaced with a modal)
    const format = prompt(
      'Export format:\n\n' +
      '1 — NumPy (.npz)\n' +
      '2 — CSV (.csv)\n' +
      '3 — MATLAB (.mat)\n' +
      '4 — JSON (.json)\n\n' +
      'Enter number:',
      '1'
    );

    const formatMap = { '1': 'npz', '2': 'csv', '3': 'mat', '4': 'json' };
    const fmt = formatMap[format];
    if (!fmt) return;

    try {
      const data = {
        b: AppState.filter.b,
        a: AppState.filter.a,
        zeros: AppState.filter.zeros,
        poles: AppState.filter.poles,
        gain: AppState.filter.gain,
        sos: AppState.filter.sos,
        order: AppState.filter.order,
        method: AppState.filter.method,
        specs: AppState.specs,
      };

      const result = await PyodideBridge.exportData(fmt, data);

      // Convert base64 to blob and download
      const binaryStr = atob(result.data_b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: result.mime });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Exported as ${result.filename}`);

    } catch (err) {
      showToast(`Export failed: ${err.message}`, 'error');
    }
  }

  /* ---------- Import ---------- */
  function triggerImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.npz,.csv,.mat,.json';
    input.style.display = 'none';

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        // Detect format from extension
        const ext = file.name.split('.').pop().toLowerCase();
        const formatMap = { npz: 'npz', csv: 'csv', mat: 'mat', json: 'json' };
        const format = formatMap[ext];
        if (!format) {
          showToast(`Unsupported file format: .${ext}`, 'error');
          return;
        }

        // Read file as base64
        const dataB64 = await readFileAsBase64(file);

        // Import via Python
        const result = await PyodideBridge.importData(format, dataB64);

        // Update app state
        if (result.b) AppState.filter.b = result.b;
        if (result.a) AppState.filter.a = result.a;
        if (result.zeros) AppState.filter.zeros = result.zeros;
        if (result.poles) AppState.filter.poles = result.poles;
        if (result.gain !== undefined) AppState.filter.gain = result.gain;
        if (result.sos) AppState.filter.sos = result.sos;
        if (result.order) AppState.filter.order = result.order;

        // Clear cached analysis
        AppState.analysis = {
          freqResponse: null, groupDelay: null, phaseDelay: null,
          impulseResponse: null, stepResponse: null, pzData: null, surface3d: null,
        };

        bus.emit('filterDesigned', AppState.filter);
        await runAnalysis(AppState.ui.activeTab);

        showToast(`Imported filter from ${file.name}`);

      } catch (err) {
        showToast(`Import failed: ${err.message}`, 'error');
      }
    });

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return { init };
})();
