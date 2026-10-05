import { parseEngineeringNumber } from "./engineering";

export const SIMULATOR_NETLIST_LIMITS = Object.freeze({
  bytes: 12_000,
  lines: 180,
  outputPoints: 131_072,
  // ngspice adds accepted points around startup and waveform breakpoints.
  adaptiveOutputPoints: 262_144,
  // All raw vectors, including the axis and both complex components, count.
  resultValues: 8_388_608,
  probes: 32,
  transientEvents: 2_000,
});

const FORBIDDEN_DIRECTIVE = /^\s*\.(?:inc|lib|control|endc|shell|exec|csparam|func|global|hdl|verilog|load)\b/im;
const ALLOWED_DIRECTIVES = new Set(["op", "ac", "tran", "dc", "model", "subckt", "ends", "include", "end"]);
const TRUSTED_BROWSER_MODELCARDS = new Set(["modelcard.cmos90"]);

/** ngspice consumes its first line as a title, including when that line is a source. */
export function prepareSimulatorDeck(netlist: string) {
  return `* AnaCode browser preview\n${netlist}`;
}

/**
 * Validates the optional expert preview deck before it reaches ngspice-WASM.
 * This is a browser-containment policy only; server grading never accepts a
 * deck and instead recompiles the typed circuit document.
 */
export function validateSimulatorNetlist(netlist: string) {
  const bytes = new TextEncoder().encode(netlist).byteLength;
  if (!netlist.trim()) throw new Error("Enter a SPICE netlist to run.");
  if (bytes > SIMULATOR_NETLIST_LIMITS.bytes) throw new Error("Netlist exceeds the 12 KB preview limit.");
  if (netlist.split(/\r?\n/).length > SIMULATOR_NETLIST_LIMITS.lines) throw new Error("Netlist exceeds the 180-line preview limit.");
  if (FORBIDDEN_DIRECTIVE.test(netlist)) throw new Error("Files, libraries, control blocks, and execution directives are disabled in the browser lab.");

  const lines = netlist.split(/\r?\n/);
  const directives = lines.flatMap((line) => {
    const match = line.match(/^\s*\.([a-z][a-z0-9]*)\b/i);
    return match?.[1] ? [match[1].toLowerCase()] : [];
  });
  const unsupported = directives.find((directive) => !ALLOWED_DIRECTIVES.has(directive));
  if (unsupported) throw new Error(`.${unsupported} is not available in the bounded browser preview.`);

  for (const line of lines.filter((candidate) => /^\s*\.include\b/i.test(candidate))) {
    const fields = line.trim().split(/\s+/);
    const modelcard = fields[1]?.toLowerCase();
    if (fields.length !== 2 || !modelcard || !TRUSTED_BROWSER_MODELCARDS.has(modelcard)) {
      throw new Error("Only AnaCode's bundled CMOS90 model card may be selected in the browser simulator.");
    }
  }

  const analyses = lines.filter((line) => /^\s*\.(?:op|ac|tran|dc)\b/i.test(line));
  if (analyses.length !== 1) throw new Error("Use exactly one analysis directive per run.");
  validateAnalysis(analyses[0]!);
  validateTransientEvents(netlist, analyses[0]!);
  validateSimulatorDeviceBudget(lines);
  return analyses[0]!;
}

/** Resource accounting only. ngspice remains the parser and circuit solver.
 * The previous partial SPICE parser rejected standard B and X devices before
 * they reached ngspice. Count top-level devices and bounded subcircuit expansion
 * without interpreting their models or expressions.
 */
function validateSimulatorDeviceBudget(lines: string[]) {
  type Device = { model?: string };
  const top: Device[] = [], models = new Map<string, Device[]>();
  let active: Device[] | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('*') || line.startsWith('+')) continue;
    const fields = line.split(/\s+/), directive = fields[0].toLowerCase();
    if (directive === '.subckt') {
      if (active) throw new Error('Nested subcircuit definitions are not supported in the bounded preview.');
      const name = fields[1]?.toLowerCase();
      if (!name || !/^[a-z0-9_./-]{1,64}$/.test(name) || models.has(name)) throw new Error('Subcircuit names must be valid and unique.');
      active = []; models.set(name, active); continue;
    }
    if (directive === '.ends') {
      if (!active) throw new Error('Unexpected .ends in the preview deck.');
      active = null; continue;
    }
    if (line.startsWith('.')) continue;
    if (!/^[a-z]/i.test(line)) throw new Error('A device line must begin with its SPICE reference.');
    let model: string | undefined;
    if (/^x/i.test(line)) {
      const parameters = fields.findIndex(field => /^(?:params:|[^=]+=)/i.test(field));
      model = fields[(parameters < 0 ? fields.length : parameters) - 1]?.toLowerCase();
      if (!model) throw new Error('Subcircuit instance is missing its model name.');
    }
    (active ?? top).push({ model });
  }
  if (active) throw new Error('Close each subcircuit definition with .ends.');
  if (top.length > 80) throw new Error('This preview is limited to 80 top-level components.');
  const budget = 2048;
  function expanded(devices: Device[], stack: string[]): number {
    if (stack.length > 8) throw new Error('Subcircuit nesting exceeds the eight-level preview limit.');
    let count = 0;
    for (const device of devices) {
      if (!device.model) count++;
      else {
        if (stack.includes(device.model)) throw new Error('Recursive subcircuits are not allowed.');
        const children = models.get(device.model);
        if (!children) throw new Error(`Subcircuit ${device.model} is not defined in this deck.`);
        // Count the instance itself as well, so even empty subcircuits cannot
        // create an unbounded expansion tree without consuming the budget.
        count += 1 + expanded(children, [...stack, device.model]);
      }
      if (count > budget) throw new Error('Expanded subcircuits exceed the 2048-device preview limit.');
    }
    return count;
  }
  expanded(top, []);
}

export function validateSimulatorProbes(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > SIMULATOR_NETLIST_LIMITS.probes) {
    throw new Error(`Select no more than ${SIMULATOR_NETLIST_LIMITS.probes} probes.`);
  }
  if (!value.every((probe): probe is string => typeof probe === "string" && /^(?:[a-z0-9_:+.-]{1,64}|[vi]\([a-z0-9_:+.-]{1,64}\))$/i.test(probe))) {
    throw new Error("A requested probe is invalid. Use a node name, V(node), or I(source).");
  }
  const unique = new Map<string, string>();
  for (const probe of value) {
    const canonical = probe.toLowerCase().replace(/^v\(([^)]+)\)$/, "$1");
    if (!unique.has(canonical)) unique.set(canonical, probe);
  }
  return [...unique.values()];
}

function validateAnalysis(line: string) {
  const tokens = line.trim().split(/\s+/);
  const directive = tokens[0]?.toLowerCase();
  if (directive === ".op") {
    if (tokens.length !== 1) throw new Error(".op does not accept preview options.");
    return;
  }
  if (directive === ".tran") {
    if (tokens.length < 3 || tokens.length > 5) throw new Error("Use .tran <step> <stop> [start] [max-step].");
    const step = positiveNumber(tokens[1], "transient step");
    const stop = positiveNumber(tokens[2], "transient stop time");
    const start = tokens[3] ? nonNegativeNumber(tokens[3], "transient start time") : 0;
    if (start >= stop) throw new Error("Transient start time must be below stop time.");
    const maximumStep = tokens[4] ? positiveNumber(tokens[4], "maximum transient step") : step;
    // A tiny explicit maximum step can force a much denser solver record.
    const intervals = (stop - start) / Math.min(step, maximumStep);
    // ngspice retains t=0 for an ordinary record, but starts strictly after a
    // nonzero TSTART. Settling must not consume one of the recorded samples.
    enforcePointLimit(Math.ceil(intervals - 1e-9 * Math.max(1, intervals)) + (start === 0 ? 1 : 0));
    return;
  }
  if (directive === ".ac") {
    if (tokens.length !== 5 || !tokens[1]) throw new Error("Use .ac <dec|oct|lin> <points> <start> <stop>.");
    const mode = tokens[1].toLowerCase();
    if (!new Set(["dec", "oct", "lin"]).has(mode)) throw new Error("AC sweep mode must be dec, oct, or lin.");
    const points = integerNumber(tokens[2], "AC point count", 1_000);
    const start = positiveNumber(tokens[3], "AC start frequency");
    const stop = positiveNumber(tokens[4], "AC stop frequency");
    if (stop <= start) throw new Error("AC stop frequency must exceed the start frequency.");
    const intervals = mode === "lin" ? 1 : mode === "dec" ? Math.log10(stop / start) : Math.log2(stop / start);
    enforcePointLimit(mode === "lin" ? points : Math.ceil(points * intervals) + 1);
    return;
  }
  if (directive === ".dc") {
    if (tokens.length !== 5) throw new Error("Use .dc <source> <start> <stop> <step>.");
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(tokens[1] ?? "")) throw new Error("DC sweep source name is invalid.");
    const start = boundedNumber(tokens[2], "DC start value");
    const stop = boundedNumber(tokens[3], "DC stop value");
    const step = boundedNumber(tokens[4], "DC step");
    if (step === 0 || (stop - start) / step < 0) throw new Error("DC step must move from the start value toward the stop value.");
    enforcePointLimit(Math.floor(Math.abs((stop - start) / step)) + 1);
  }
}

function validateTransientEvents(netlist: string, analysisLine: string) {
  if (!/^\s*\.tran\b/i.test(analysisLine)) return;
  const stop = positiveNumber(analysisLine.trim().split(/\s+/)[2], "transient stop time");
  for (const match of netlist.matchAll(/\bPULSE\s*\(([^)]*)\)/gi)) {
    const args = (match[1] ?? "").trim().split(/[\s,]+/);
    if (args.length < 7) throw new Error("PULSE requires seven bounded parameters in this preview.");
    const period = positiveNumber(args[6], "PULSE period");
    if (stop / period > SIMULATOR_NETLIST_LIMITS.transientEvents) {
      throw new Error(`Transient source exceeds ${SIMULATOR_NETLIST_LIMITS.transientEvents} pulse periods.`);
    }
  }
  for (const match of netlist.matchAll(/\bSIN\s*\(([^)]*)\)/gi)) {
    const args = (match[1] ?? "").trim().split(/[\s,]+/);
    if (args.length < 3) throw new Error("SIN requires offset, amplitude, and frequency.");
    const frequency = positiveNumber(args[2], "SIN frequency");
    if (stop * frequency > SIMULATOR_NETLIST_LIMITS.transientEvents) {
      throw new Error(`Transient source exceeds ${SIMULATOR_NETLIST_LIMITS.transientEvents} sine periods.`);
    }
  }
}

function boundedNumber(token: string | undefined, label: string) {
  const value = token ? parseEngineeringNumber(token) : null;
  if (value === null || Math.abs(value) > 1e12) throw new Error(`${label} is invalid or outside the preview range.`);
  return value;
}

function positiveNumber(token: string | undefined, label: string) {
  const value = boundedNumber(token, label);
  if (value <= 0) throw new Error(`${label} must be positive.`);
  return value;
}

function nonNegativeNumber(token: string | undefined, label: string) {
  const value = boundedNumber(token, label);
  if (value < 0) throw new Error(`${label} cannot be negative.`);
  return value;
}

function integerNumber(token: string | undefined, label: string, maximum: number) {
  const value = boundedNumber(token, label);
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${label} must be an integer from 1 to ${maximum}.`);
  return value;
}

function enforcePointLimit(points: number) {
  if (!Number.isFinite(points) || points < 1 || points > SIMULATOR_NETLIST_LIMITS.outputPoints) {
    throw new Error(`Analysis exceeds the ${SIMULATOR_NETLIST_LIMITS.outputPoints.toLocaleString()}-point preview limit.`);
  }
}
