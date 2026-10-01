export type HdlResult = { log: string; exitCode: number; vcd: string | null; runtimeMs: number };
export type HdlLanguage = '2005' | '2012';
export function simulateHdl(input: { design: string; testbench: string; language: HdlLanguage }, onStage: (stage: string) => void) {
  let cancel = () => {};
  const result = new Promise<HdlResult>((resolve, reject) => {
    const worker = new Worker('/hdl/runner.worker.js', { type: 'module' });
    const start = performance.now();
    let settled = false;
    const finish = (error?: Error, value?: HdlResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error); else resolve(value!);
    };
    // Includes cold WASM loading. Termination also interrupts infinite delta cycles.
    const timer = setTimeout(() => finish(new Error('Stopped after 20 seconds. Check for an endless loop or shorten the testbench.')), 20_000);
    cancel = () => finish(new Error('Simulation stopped.'));
    worker.onerror = () => finish(new Error('The HDL runtime could not start. Reload and try again.'));
    worker.onmessage = ({ data }) => {
      if (data.type === 'stage') onStage(data.stage);
      else if (data.type === 'error') finish(new Error(data.error));
      else if (data.type === 'result') finish(undefined, { log: data.log, exitCode: data.exitCode, vcd: data.vcd, runtimeMs: performance.now() - start });
    };
    worker.postMessage(input);
  });
  return { result, cancel: () => cancel() };
}
