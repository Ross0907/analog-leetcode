import type { ResultType } from "eecircuit-engine";
import { SIMULATOR_NETLIST_LIMITS } from "./simulator-netlist-policy";
import type { SimulationPayload, Trace } from "./simulator-contract";
import { probeColor } from "./probe-colors";

type Vector = { key: string; name: string; unit: string; quantity: "voltage" | "current" };

function vector(name: string, type: string): Vector | null {
  const voltage = name.match(/^v\(([^)]+)\)$/i);
  const current = name.match(/^i\(([^)]+)\)$/i) ?? name.match(/^(.+)#branch$/i);
  if (voltage && type === "voltage") return { key: voltage[1]!.toLowerCase(), name: `V(${voltage[1]})`, unit: "V", quantity: "voltage" };
  if (current && type === "current") return { key: `i(${current[1]!.toLowerCase()})`, name: `I(${current[1]})`, unit: "A", quantity: "current" };
  return null;
}

/** Preserve requested probe identity; unavailable nodes are an error, never silently replaced. */
export function chooseProbes(available: string[], requested: string[]): string[] {
  const names = new Map(available.map((name) => [name.toLowerCase(), name]));
  const preferred = [...new Set(requested.map((name) => name.toLowerCase().replace(/^v\(([^)]+)\)$/, "$1")))];
  for (const name of preferred) if (!names.has(name)) throw new Error(`Probe ${name} is unavailable in this result. Available: ${available.join(", ").slice(0, 150)}.`);
  const selected = preferred.length ? preferred.map((name) => names.get(name)!) : available;
  if (selected.length > SIMULATOR_NETLIST_LIMITS.probes) throw new Error(`This result has ${selected.length} probes. Select up to ${SIMULATOR_NETLIST_LIMITS.probes} to plot.`);
  if (!selected.length) throw new Error("No voltage or current vector is available to plot.");
  return selected;
}

/** Convert only actual ngspice vectors. No circuit evaluation or synthetic waveforms. */
export function normalizeNgspiceResult(result: ResultType, analysisLine: string, requested: string[], warnings: string[], runtimeMs: number): SimulationPayload {
  if (result.numPoints < 1 || result.numPoints > SIMULATOR_NETLIST_LIMITS.outputPoints) throw new Error(`ngspice returned ${result.numPoints} points; the limit is ${SIMULATOR_NETLIST_LIMITS.outputPoints}.`);
  const directive = analysisLine.trim().split(/\s+/)[0]?.toLowerCase();
  const base = { engine: "ngspice-wasm" as const, warnings, runtimeMs, operatingPoint: [] };
  function samples(values: number[], label: string) {
    if (values.length !== result.numPoints) throw new Error(`${label} has inconsistent result dimensions.`);
    if (values.some((value) => !Number.isFinite(value))) throw new Error(`${label} contains a non-finite result.`);
    return values;
  }
  if (directive === ".ac") {
    if (result.dataType !== "complex") throw new Error("ngspice returned a non-complex AC result.");
    const frequency = result.data.find((series) => series.type === "frequency" || series.name.toLowerCase() === "frequency");
    if (!frequency) throw new Error("ngspice AC result has no frequency axis.");
    const x = samples(frequency.values.map((p) => p.real), "AC frequency");
    if (x.some((value, i) => value <= 0 || (i > 0 && value <= x[i - 1]!))) throw new Error("AC frequency axis must increase and remain positive.");
    const vectors = result.data.flatMap((series) => { const info = vector(series.name, series.type); return info ? [{ ...info, series }] : []; });
    const selected = chooseProbes(vectors.map((v) => v.key), requested);
    const traces = selected.flatMap((key): Trace[] => {
      const v = vectors.find((candidate) => candidate.key === key)!;
      samples(v.series.values.map((p) => p.real), v.name);
      samples(v.series.values.map((p) => p.img), v.name);
      const magnitude = v.series.values.map((p) => 20 * Math.log10(Math.max(Math.hypot(p.real, p.img), 1e-15)));
      const phase = unwrapPhase(v.series.values.map((p) => Math.atan2(p.img, p.real) * 180 / Math.PI));
      return [
        { id: `magnitude:${key}`, name: v.name, values: magnitude, unit: "dB", quantity: "magnitude", node: key, color: probeColor(key) },
        { id: `phase:${key}`, name: `∠${v.name}`, values: phase, unit: "°", quantity: "phase", node: key, color: probeColor(key) },
      ];
    });
    return { ...base, analysis: "ac", xLabel: "Frequency", xUnit: "Hz", yLabel: "Response", yUnit: "dB", x, traces };
  }
  if (result.dataType !== "real") throw new Error("ngspice returned an unexpected complex result.");
  const vectors = result.data.flatMap((series) => { const info = vector(series.name, series.type); return info ? [{ ...info, series }] : []; });
  if (directive === ".op") {
    if (vectors.length > 200) throw new Error("Operating point exceeds the 200-vector limit.");
    const operatingPoint = vectors.map((v) => ({ name: v.name, value: samples(v.series.values, v.name)[0]!, unit: v.unit }));
    if (!operatingPoint.length) throw new Error("ngspice returned no operating-point values.");
    return { ...base, analysis: "dc", xLabel: "Node", xUnit: "", yLabel: "Operating point", yUnit: "V", x: [], traces: [], operatingPoint };
  }
  const transient = directive === ".tran";
  const axis = transient
    ? result.data.find((v) => v.type === "time" || v.name.toLowerCase() === "time")
    : result.data.find((v) => /^(?:v\()?v-sweep\)?$|^(?:i\()?i-sweep\)?$/i.test(v.name));
  if (!axis) throw new Error(`ngspice ${transient ? "transient" : "DC sweep"} result has no ${transient ? "time" : "sweep"} axis.`);
  const x = samples(axis.values, "Result axis");
  if (transient && x.some((value, i) => i > 0 && value <= x[i - 1]!)) throw new Error("Transient time axis must increase.");
  const candidates = vectors.filter((v) => v.series !== axis);
  const selected = chooseProbes(candidates.map((v) => v.key), requested);
  const traces = selected.map((key): Trace => {
    const v = candidates.find((candidate) => candidate.key === key)!;
    return { id: `${v.quantity}:${key}`, name: v.name, values: samples(v.series.values, v.name), unit: v.unit, quantity: v.quantity, node: key, color: probeColor(key) };
  });
  return { ...base, analysis: transient ? "transient" : "dc-sweep", xLabel: transient ? "Time" : "Sweep value", xUnit: transient ? "s" : axis.type === "current" ? "A" : "V", yLabel: "Amplitude", yUnit: "V", x, traces };
}

function unwrapPhase(values: number[]) {
  let offset = 0;
  return values.map((value, i) => {
    if (i > 0) {
      const difference = value - values[i - 1]!;
      if (difference > 180) offset -= 360;
      if (difference < -180) offset += 360;
    }
    return value + offset;
  });
}
