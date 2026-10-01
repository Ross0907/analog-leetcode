// SPDX-License-Identifier: GPL-2.0-or-later
// Adapter for the pinned, source-built Icarus Verilog WebAssembly distribution.
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
  // MEMFS buffers are JavaScript allocations, outside the WASM heap limit.
  // Share one generated-file budget across all three modules. Track each
  // file's high-water mark: overwrite/truncate never double-counts existing
  // capacity, and closing/unlinking cannot reset the per-run safety budget.
  const perFileBytes = 8 * 1024 * 1024;
  const totalFileBytes = 32 * 1024 * 1024;
  const maximumFiles = 128;
  let generatedBytes = 0;
  let generatedFiles = 0;
  let installingInput = false;
  const fileSizes = new WeakMap();
  function countFile(node, initialSize = 0) {
    if (fileSizes.has(node)) return;
    if (generatedFiles >= maximumFiles) throw Error('Generated file count exceeded 128. Reuse output files or reduce the testbench.');
    generatedFiles++;
    fileSizes.set(node, initialSize);
  }
  function reserveFile(fs, node, size) {
    if (!fs.isFile(node.mode) || installingInput) return;
    if (!Number.isSafeInteger(size) || size < 0 || size > perFileBytes) throw Error('Generated file exceeded 8 MiB. Reduce dump depth or simulation time.');
    // Existing input files are bounded separately; only additional storage
    // becomes generated output if the HDL later reopens one for writing.
    countFile(node, node.usedBytes ?? 0);
    const previous = fileSizes.get(node);
    const growth = Math.max(0, size - previous);
    if (generatedBytes + growth > totalFileBytes) throw Error('Generated files exceeded 32 MiB in total. Reduce the number of dumps or simulation time.');
    generatedBytes += growth;
    fileSizes.set(node, Math.max(previous, size));
  }
  function installInput(module, path, contents) {
    installingInput = true;
    try { module.FS.writeFile(path, contents); }
    finally { installingInput = false; }
  }
  // Initialization has already created /dev and other runtime infrastructure.
  // Intercept regular-file creation before allocation, including empty files.
  function boundFs(module) {
    const fs = module.FS;
    const createNode = fs.createNode.bind(fs);
    fs.createNode = (parent, name, mode, ...rest) => {
      const generated = !installingInput && fs.isFile(mode);
      if (generated && generatedFiles >= maximumFiles) throw Error('Generated file count exceeded 128. Reuse output files or reduce the testbench.');
      const node = createNode(parent, name, mode, ...rest);
      if (generated) countFile(node);
      return node;
    };
    const write = fs.write.bind(fs);
    fs.write = (stream, buffer, offset, length, position, ...rest) => {
      const currentSize = stream.node?.usedBytes ?? 0;
      const start = position ?? ((stream.flags & 1024) ? currentSize : stream.position ?? 0);
      const end = Math.max(currentSize, start + length);
      if (fs.isFile(stream.node.mode)) reserveFile(fs, stream.node, end);
      else if (end > perFileBytes) {
        // Preserve the existing cap on a single unterminated output stream;
        // device nodes do not consume generated-file count or storage quotas.
        throw Error('Output stream exceeded 8 MiB. Reduce the simulation output.');
      }
      return write(stream, buffer, offset, length, position, ...rest);
    };
    // Cover sparse extension/truncation as well as ordinary writes. Emscripten
    // routes both truncate and ftruncate through this method before resizing.
    const setAttributes = fs.doSetAttr.bind(fs);
    fs.doSetAttr = (stream, node, attributes) => {
      if (attributes.size !== undefined) reserveFile(fs, node, attributes.size);
      return setAttributes(stream, node, attributes);
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
  installInput(pp, '/design.v', design + '\n');
  installInput(pp, '/tb.v', testbench + '\n');
  const ppExit = pp.callMain(['-L', '/design.v', '/tb.v']);
  if (ppExit) return { log: log.join('\n'), exitCode: ppExit, vcd: null };
  onStage('Compiling');
  const compiler = boundFs(await initCompiler(options));
  installInput(compiler, '/ivl.conf', `basedir:/\nmodule:system.vpi\ngeneration:${language}\ngeneration:no-specify\nout:/out.vvp\nroot:tb\niwidth:32\nwidthcap:65536\nfunctor:cprop\nfunctor:nodangle\nflag:DLL=vvp.tgt\n`);
  installInput(compiler, '/src.v', preprocessed.join('\n') + '\n');
  const compileExit = compiler.callMain(['-C/ivl.conf', '--', '/src.v']);
  if (compileExit) return { log: log.join('\n'), exitCode: compileExit, vcd: null };
  const program = compiler.FS.readFile('/out.vvp');
  onStage('Simulating');
  const runtime = boundFs(await initRuntime(options));
  installInput(runtime, '/sim.vvp', program);
  const exitCode = runtime.callMain(['/sim.vvp']) ?? 0;
  let vcd = null;
  try { vcd = runtime.FS.readFile('/dump.vcd', { encoding: 'utf8' }); } catch { /* A testbench may intentionally omit a dump. */ }
  return { log: log.join('\n'), exitCode, vcd };
}
