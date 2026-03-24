/* ============================================================
   PyFDA Web — File I/O (Browser File API)
   Export via MD3 modal, Import via file picker
   ============================================================ */

const FileIO = (() => {

  function init() {
    document.getElementById('btn-export')?.addEventListener('click', openExportModal);
    document.getElementById('btn-import')?.addEventListener('click', triggerImport);

    // Modal close
    document.getElementById('export-modal-close')?.addEventListener('click', closeExportModal);
    document.getElementById('export-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeExportModal();
    });

    // Format buttons inside modal
    document.querySelectorAll('[data-export-fmt]').forEach(btn => {
      btn.addEventListener('click', () => {
        const fmt = btn.dataset.exportFmt;
        executeExport(fmt);
      });
    });
  }

  /* ---------- Dynamic Filename ---------- */
  function generateFilename() {
    const s = AppState.specs;
    const f = AppState.filter;
    const resp = s.responseType || 'filter';
    const method = s.designMethod || 'unknown';
    const order = f.order != null ? f.order : 'auto';
    return `pyfda_${resp}_${method}_order${order}`;
  }

  /* ---------- Export Modal ---------- */
  function openExportModal() {
    if (!AppState.filter.b) {
      showToast('Design a filter before exporting', 'error');
      return;
    }

    // Populate dynamic filename
    const filenameInput = document.getElementById('export-filename');
    if (filenameInput) filenameInput.value = generateFilename();

    document.getElementById('export-modal-backdrop')?.classList.add('open');
  }

  function closeExportModal() {
    document.getElementById('export-modal-backdrop')?.classList.remove('open');
  }

  /* ---------- Execute Export ---------- */
  async function executeExport(fmt) {
    const filenameInput = document.getElementById('export-filename');
    const baseName = filenameInput?.value.trim() || generateFilename();

    // Close modal immediately for responsiveness
    closeExportModal();

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

      // Override filename with the user-provided name + correct extension
      const filename = `${baseName}.${fmt}`;

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
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Exported as ${filename}`);

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
