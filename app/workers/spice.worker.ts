/// <reference lib="webworker" />

import { parse } from "@spice-ts/core";
import { Simulation } from "eecircuit-engine";
import {
  validateSimulatorNetlist,
  validateSimulatorProbes,
  prepareSimulatorDeck,
} from "../../lib/simulator-netlist-policy";
import {
  SIMULATOR_WORKER_PROTOCOL_VERSION,
  type SimulatorWorkerMessage,
  type SimulatorWorkerReady,
  type SimulatorWorkerRequest,
  type SimulatorWorkerResponse,
} from "../../lib/simulator-contract";

import { normalizeNgspiceResult } from "../../lib/simulator-results";

declare const self: DedicatedWorkerGlobalScope;

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

    simulator.setNetList(prepareSimulatorDeck(netlist));
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

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Simulation failed.";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 240);
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
