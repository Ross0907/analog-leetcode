/// <reference lib="webworker" />

import { parse } from "@spice-ts/core";
import { Simulation, type ResultType } from "eecircuit-engine";
import {
  SIMULATOR_NETLIST_LIMITS,
  validateSimulatorNetlist,
  validateSimulatorProbes,
} from "../../lib/simulator-netlist-policy";
import {
  SIMULATOR_WORKER_PROTOCOL_VERSION,
  type SimulationPayload,
  type SimulatorWorkerMessage,
  type SimulatorWorkerReady,
  type SimulatorWorkerRequest,
  type SimulatorWorkerResponse,
  type Trace,
} from "../../lib/simulator-contract";

declare const self: DedicatedWorkerGlobalScope;

const MAX_OUTPUT_POINTS = SIMULATOR_NETLIST_LIMITS.outputPoints;
const MAX_OPERATING_POINT_NODES = 200;
let acceptedRun = false;
let simulator: Simulation | null = null;

self.onmessage = async (event: MessageEvent<SimulatorWorkerRequest>) => {
  const { id, netlist, type } = event.data;
  if (type !== "run" || acceptedRun || !simulator) return;
  acceptedRun = true;
  try {
    const probes = validateSimulatorProbes(event.data.probes);
    const analysisLine = validateSimulatorNetlist(netlist);
    const started = performance.now();
    const structuralNetlist = netlist.replace(/^\s*\.include\s+modelcard\.CMOS90\s*$/gim, "");
    const circuit = parse(structuralNetlist);
    const componentCount = circuit.toIR().components.length;
    if (componentCount > 80) throw new Error("This preview is limited to 80 components.");

    simulator.setNetList(netlist);
    const result = await simulator.runSim();
    const warnings = simulator.getError().slice(0, 8).map((warning) => safeLabel(warning, 160));
    const payload = normalizeNgspiceResult(result, analysisLine, probes, warnings, performance.now() - started);

    if (payload.traces.some((trace) => trace.values.length !== payload.x.length)) {
      throw new Error("Simulator returned inconsistent result dimensions.");
    }

    const response: SimulatorWorkerResponse = { type: "result", id, ok: true, payload };
    self.postMessage(response);
  } catch (error) {
    const response: SimulatorWorkerResponse = {
      type: "result",
      id,
      ok: false,
      error: safeError(error),
    };
    self.postMessage(response);
  }
};

void initializeSimulator();

async function initializeSimulator() {
  try {
    const initializedSimulator = new Simulation();
    await initializedSimulator.start();
    simulator = initializedSimulator;
    const ready: SimulatorWorkerReady = {
      type: "ready",
      protocolVersion: SIMULATOR_WORKER_PROTOCOL_VERSION,
    };
    self.postMessage(ready satisfies SimulatorWorkerMessage);
  } catch (error) {
    const response: SimulatorWorkerMessage = {
      type: "initialization-error",
      error: safeError(error),
    };
    self.postMessage(response);
  }
}

function normalizeNgspiceResult(result: ResultType, analysisLine: string, requestedProbes: string[], warnings: string[], runtimeMs: number): SimulationPayload {
  if (result.numPoints < 1 || result.numPoints > MAX_OUTPUT_POINTS) throw new Error(`ngspice returned ${result.numPoints.toLocaleString()} points; the limit is ${MAX_OUTPUT_POINTS.toLocaleString()}.`);
  const directive = analysisLine.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (directive === ".ac") {
    if (result.dataType !== "complex") throw new Error("ngspice returned a non-complex AC result.");
    const frequency = result.data.find((series) => series.type === "frequency" || series.name.toLowerCase() === "frequency");
    if (!frequency) throw new Error("ngspice AC result has no frequency axis.");
    const x = finiteArray(frequency.values.map((point) => point.real), "AC frequency");
    frequency.values.forEach((point) => finiteNumber(point.img, "AC frequency"));
    const voltageSeries = result.data.flatMap((series) => {
      const node = voltageNode(series.name);
      return node && series.type === "voltage" ? [{ node, series }] : [];
    });
    const selectedNodes = chooseProbes(voltageSeries.map(({ node }) => node), requestedProbes);
    const traces: Trace[] = selectedNodes.flatMap((node, index) => {
      const series = voltageSeries.find((candidate) => candidate.node.toLowerCase() === node.toLowerCase())?.series;
      if (!series) return [];
      const magnitude = finiteArray(series.values.map((point) => 20 * Math.log10(Math.max(Math.hypot(point.real, point.img), 1e-15))), `AC magnitude at ${safeLabel(node)}`);
      const phase = unwrapPhase(finiteArray(series.values.map((point) => Math.atan2(point.img, point.real) * 180 / Math.PI), `AC phase at ${safeLabel(node)}`));
      const label = safeLabel(node);
      return [
        { id: `magnitude:${index}:${label}`, name: `V(${label})`, values: magnitude, unit: "dB", quantity: "magnitude" as const },
        { id: `phase:${index}:${label}`, name: `∠V(${label})`, values: phase, unit: "°", quantity: "phase" as const },
      ];
    });
    return { engine: "ngspice-wasm", analysis: "ac", xLabel: "Frequency", xUnit: "Hz", yLabel: "Response", yUnit: "dB", x, traces, operatingPoint: [], warnings, runtimeMs };
  }

  if (result.dataType !== "real") throw new Error("ngspice returned an unexpected complex result.");
  const voltageSeries = result.data.flatMap((series) => {
    const node = voltageNode(series.name);
    return node && series.type === "voltage" ? [{ node, series }] : [];
  });
  if (directive === ".tran") {
    const time = result.data.find((series) => series.type === "time" || series.name.toLowerCase() === "time");
    if (!time) throw new Error("ngspice transient result has no time axis.");
    const x = finiteArray(time.values, "transient time");
    const selectedNodes = chooseProbes(voltageSeries.map(({ node }) => node), requestedProbes);
    const traces = selectedNodes.flatMap((node) => {
      const series = voltageSeries.find((candidate) => candidate.node.toLowerCase() === node.toLowerCase())?.series;
      return series ? [voltageTrace(node, finiteArray(series.values, `transient voltage at ${safeLabel(node)}`), "V")] : [];
    });
    return { engine: "ngspice-wasm", analysis: "transient", xLabel: "Time", xUnit: "s", yLabel: "Voltage", yUnit: "V", x, traces, operatingPoint: [], warnings, runtimeMs };
  }
  if (directive === ".dc") {
    const sweep = result.data.find((series) => series.name.toLowerCase() === "v(v-sweep)") ?? result.data[0];
    if (!sweep) throw new Error("ngspice DC sweep result has no sweep axis.");
    const x = finiteArray(sweep.values, "DC sweep value");
    const candidates = voltageSeries.filter(({ series }) => series !== sweep);
    const selectedNodes = chooseProbes(candidates.map(({ node }) => node), requestedProbes);
    const traces = selectedNodes.flatMap((node) => {
      const series = candidates.find((candidate) => candidate.node.toLowerCase() === node.toLowerCase())?.series;
      return series ? [voltageTrace(node, finiteArray(series.values, `DC sweep voltage at ${safeLabel(node)}`), "V")] : [];
    });
    return { engine: "ngspice-wasm", analysis: "dc-sweep", xLabel: "Sweep value", xUnit: "V", yLabel: "Voltage", yUnit: "V", x, traces, operatingPoint: [], warnings, runtimeMs };
  }
  const operatingPoint = voltageSeries.slice(0, MAX_OPERATING_POINT_NODES).map(({ node, series }) => ({ name: `V(${safeLabel(node)})`, value: finiteNumber(series.values[0]!, "operating-point voltage") }));
  if (!operatingPoint.length) throw new Error("ngspice returned no operating-point voltages.");
  const values = operatingPoint.map((point) => point.value);
  return {
    engine: "ngspice-wasm", analysis: "dc", xLabel: "Node", xUnit: "", yLabel: "Voltage", yUnit: "V",
    x: values.map((_, index) => index), traces: [{ id: "operating-point", name: "Operating point", values, unit: "V", quantity: "voltage" }], operatingPoint, warnings, runtimeMs,
  };
}

function chooseProbes(nodes: string[], preferred: string[]) {
  const available = [...new Set(nodes.filter((node) => node !== "0" && /^[a-z0-9_:+.-]{1,64}$/i.test(node)))];
  const availableByCanonicalName = new Map(available.map((node) => [node.toLowerCase(), node]));
  const selected = preferred.flatMap((node) => {
    const availableNode = availableByCanonicalName.get(node.toLowerCase());
    return availableNode ? [availableNode] : [];
  });
  for (const node of available) {
    if (selected.length >= SIMULATOR_NETLIST_LIMITS.probes) break;
    if (!selected.includes(node)) selected.push(node);
  }
  if (selected.length === 0) throw new Error("No non-ground voltage node is available to plot.");
  return selected;
}

function voltageTrace(node: string, values: number[], unit: string): Trace {
  const label = safeLabel(node);
  return { id: `voltage:${label}`, name: `V(${label})`, values, unit, quantity: "voltage" };
}

function voltageNode(name: string) {
  const match = name.match(/^v\(([^)]+)\)$/i);
  return match?.[1] ? safeLabel(match[1], 64) : null;
}

function unwrapPhase(values: number[]) {
  const output: number[] = [];
  let offset = 0;
  for (const value of values) {
    const previous = output[output.length - 1];
    if (previous !== undefined) {
      const adjusted = value + offset;
      if (adjusted - previous > 180) offset -= 360;
      else if (adjusted - previous < -180) offset += 360;
    }
    output.push(value + offset);
  }
  return output;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Simulation failed.";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 240);
}

function finiteArray(values: Iterable<number>, label: string) {
  const output = [...values];
  if (output.length === 0) throw new Error(`${label} returned no samples.`);
  if (output.length > MAX_OUTPUT_POINTS) throw new Error(`${label} exceeds the ${MAX_OUTPUT_POINTS.toLocaleString()}-point result limit.`);
  output.forEach((value) => finiteNumber(value, label));
  return output;
}

function finiteNumber(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite result.`);
  return value;
}

function safeLabel(value: string, maximum = 80) {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 ? " " : character;
    })
    .join("")
    .slice(0, maximum);
}

export {};
