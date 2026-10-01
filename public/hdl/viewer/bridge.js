// VCDrom is MIT licensed. Keep the upstream renderer untouched; only adapt its input.
let running = false;
let pending = null;
function showError() {
  const error = document.getElementById('error');
  error.hidden = false;
  error.textContent = 'This VCD could not be displayed. Download it to inspect in GTKWave.';
}
// The upstream file importer is async; DOM event dispatch cannot await it.
window.addEventListener('unhandledrejection', showError);
window.addEventListener('error', showError);
async function display(vcd) {
  if (running) { pending = vcd; return; }
  running = true;
  try {
    // v1.6 exposes its file-open control, not the later trunk URL argument.
    // Use that upstream importer so VCD parsing and rendering remain VCDrom's.
    await window.VCDrom('waveform');
    const input = document.getElementById('inputfile');
    if (!input) throw new Error('VCDrom file input is missing');
    const transfer = new DataTransfer();
    transfer.items.add(new File([vcd], 'dump.vcd', { type: 'text/plain' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('error').hidden = true;
  } catch {
    showError();
  } finally {
    running = false;
    if (pending !== null) { const next = pending; pending = null; void display(next); }
  }
}
window.addEventListener('message', event => {
  if(event.source !== window.parent || event.origin !== location.origin) return;
  if(event.data?.type !== 'anacode-vcd' || typeof event.data.vcd !== 'string' || event.data.vcd.length > 8*1024*1024) return;
  void display(event.data.vcd);
});
window.parent.postMessage({ type: 'anacode-viewer-ready' }, location.origin);
