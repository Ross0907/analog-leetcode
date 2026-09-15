export type Trace = {
  id: string;
  name: string;
  values: number[];
  unit: string;
  quantity: "voltage" | "magnitude" | "phase";
};

export type SimulationPayload = {
  engine: "ngspice-wasm";
  analysis: "dc" | "ac" | "transient" | "dc-sweep";
  xLabel: string;
  xUnit: string;
  yLabel: string;
  yUnit: string;
  x: number[];
  traces: Trace[];
  operatingPoint: Array<{ name: string; value: number }>;
  warnings: string[];
  runtimeMs: number;
};

export const SIMULATOR_WORKER_PROTOCOL_VERSION = 1 as const;
export const SIMULATOR_WORKER_INITIALIZATION_TIMEOUT_MS = 30_000;
export const SIMULATOR_RUN_TIMEOUT_MS = 4_000;

export type SimulatorWorkerRequest = {
  type: "run";
  id: string;
  netlist: string;
  probes?: string[];
};

export type SimulatorWorkerReady = {
  type: "ready";
  protocolVersion: typeof SIMULATOR_WORKER_PROTOCOL_VERSION;
};

export type SimulatorWorkerInitializationError = {
  type: "initialization-error";
  error: string;
};

export type SimulatorWorkerResponse =
  | { type: "result"; id: string; ok: true; payload: SimulationPayload }
  | { type: "result"; id: string; ok: false; error: string };

export type SimulatorWorkerMessage = SimulatorWorkerReady | SimulatorWorkerInitializationError | SimulatorWorkerResponse;
