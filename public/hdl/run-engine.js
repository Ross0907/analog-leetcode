// SPDX-License-Identifier: GPL-2.0-or-later
// Adapter for the unmodified, pinned VeriSim build of Icarus Verilog.
import initPreprocessor from './icarus/ivlpp.js';
import initCompiler from './icarus/ivl.js';
import initRuntime from './icarus/vvp.js';

export async function runHdl({ design, testbench, language }, onStage = () => {}) {
  const encoder = new TextEncoder();
  if (![design, testbench].every(s => typeof s === 'string' && s.length <= 131072 && encoder.encode(s).byteLength <= 131072)) throw Error('Each source file must be at most 128 KiB.');
  if (!['2012', '2005'].includes(language)) throw Error('Choose Verilog 2005 or SystemVerilog 2012.');
  const log = [];
  let logSize = 0;
  const print = s => {
    logSize += encoder.encode(s).byteLength + 1;
    if (logSize > 262144) throw Error('Console output exceeded 256 KiB. Reduce the simulation duration.');
    log.push(s);
  };
  const options = { noInitialRun: true, print, printErr: print };
  // Bound generated files before MEMFS grows them; all source and output stay in memory.
  function boundFs(module) {
    const write = module.FS.write.bind(module.FS);
    module.FS.write = (stream, buffer, offset, length, position, ...rest) => {
      if (Math.max(position ?? stream.position ?? 0, stream.node?.usedBytes ?? 0) + length > 8 * 1024 * 1024) {
        throw Error('Generated file exceeded 8 MiB. Reduce dump depth or simulation time.');
      }
      return write(stream, buffer, offset, length, position, ...rest);
    };
    return module;
  }
  onStage('Preprocessing');
  const preprocessed = [];
  let ppSize = 0;
  const pp = boundFs(await initPreprocessor({ ...options, print: s => {
    ppSize += encoder.encode(s).byteLength + 1;
    if (ppSize > 1024 * 1024) throw Error('Preprocessed source exceeds 1 MiB.');
    preprocessed.push(s);
  } }));
  pp.FS.writeFile('/design.v', design + '\n');
  pp.FS.writeFile('/tb.v', testbench + '\n');
  const ppExit = pp.callMain(['-L', '/design.v', '/tb.v']);
  if (ppExit) return { log: log.join('\n'), exitCode: ppExit, vcd: null };
  onStage('Compiling');
  const compiler = boundFs(await initCompiler({ ...options, printErr: s => {
    // This port emits the VPI record for the statically linked runtime but its
    // compiler has no dynamic loader. Suppress only that known loader pair.
    if (s === "error: Failed to open 'system.vpi' because:" || /^\s+: dynamic linking not enabled$/.test(s)) return;
    print(s);
  } }));
  compiler.FS.writeFile('/ivl.conf', `basedir:/\nmodule:system.vpi\ngeneration:${language}\ngeneration:no-specify\nout:/out.vvp\nroot:tb\niwidth:32\nwidthcap:65536\nfunctor:cprop\nfunctor:nodangle\nflag:DLL=vvp.tgt\n`);
  compiler.FS.writeFile('/src.v', preprocessed.join('\n') + '\n');
  const compileExit = compiler.callMain(['-C/ivl.conf', '--', '/src.v']);
  if (compileExit) return { log: log.join('\n'), exitCode: compileExit, vcd: null };
  const program = compiler.FS.readFile('/out.vvp');
  onStage('Simulating');
  const runtime = boundFs(await initRuntime(options));
  runtime.FS.writeFile('/sim.vvp', program);
  const exitCode = runtime.callMain(['/sim.vvp']) ?? 0;
  let vcd = null;
  try { vcd = runtime.FS.readFile('/dump.vcd', { encoding: 'utf8' }); } catch { /* A testbench may intentionally omit a dump. */ }
  return { log: log.join('\n'), exitCode, vcd };
}
