import { MAX_CIRCUITJS_PROBES, readCircuitJsProbe, type CircuitJsApi, type CircuitJsProbe } from './circuitjs';
import type { SimulationPayload } from './simulator-contract';

export const MAX_ACQUISITION_SAMPLES = 131_072;
export const ACQUISITION_SAMPLE_OPTIONS = [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, MAX_ACQUISITION_SAMPLES];
// Time plus every channel share a 16 MiB typed-array budget. Snapshots are
// published by the UI at a bounded rate, never on each solver timestep.
export const MAX_ACQUISITION_VALUES = 2_097_152;

export function acquisitionCapacity(channels: number, requested: number) {
  if (!Number.isInteger(channels) || channels < 1 || channels > MAX_CIRCUITJS_PROBES) throw new Error('Enable between 1 and 32 probes.');
  if (!Number.isInteger(requested) || requested < 128 || requested > MAX_ACQUISITION_SAMPLES) throw new Error('Choose between 128 and 131,072 samples.');
  return Math.min(requested, Math.floor(MAX_ACQUISITION_VALUES / (channels + 1)));
}

/** Fixed-storage chronological ring: no growing arrays, synthesized samples or interpolation. */
export class AcquisitionBuffer {
  readonly capacity: number;
  readonly times: Float64Array;
  readonly channels: Float64Array[];
  private head = 0;
  private size = 0;
  private accepted = 0;
  constructor(channelCount: number, requested: number) {
    this.capacity = acquisitionCapacity(channelCount, requested);
    this.times = new Float64Array(this.capacity);
    this.channels = Array.from({ length: channelCount }, () => new Float64Array(this.capacity));
  }
  get count() { return this.size; }
  get totalSamples() { return this.accepted; }
  get byteLength() { return (this.channels.length + 1) * this.times.byteLength; }
  clear() { this.head = 0; this.size = 0; }
  append(time: number, values: ArrayLike<number>) {
    if (!Number.isFinite(time) || values.length !== this.channels.length) throw new Error('The circuit returned an invalid sample. Check its connections and component values.');
    for (let index = 0; index < values.length; index++) if (!Number.isFinite(values[index])) throw new Error('The circuit returned an invalid sample. Check its connections and component values.');
    const previous = (this.head + this.capacity - 1) % this.capacity;
    if (this.size && time <= this.times[previous]!) return false;
    this.times[this.head] = time;
    for (let index = 0; index < values.length; index++) this.channels[index]![this.head] = values[index]!;
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
    this.accepted++;
    return true;
  }
  snapshot(windowSeconds: number) {
    let first = (this.head + this.capacity - this.size) % this.capacity;
    let count = this.size;
    const last = this.times[(this.head + this.capacity - 1) % this.capacity]!;
    while (count > 2 && this.times[first]! < last - windowSeconds) { first = (first + 1) % this.capacity; count--; }
    const x = Array.from({ length: count }, (_, index) => this.times[(first + index) % this.capacity]!);
    const values = this.channels.map((channel) => Array.from({ length: count }, (_, index) => channel[(first + index) % this.capacity]!));
    return { x, values };
  }
}

export function startCircuitJsAcquisition(api: CircuitJsApi, probes: CircuitJsProbe[], options: {
  duration: number; samples: number; onError?: (message: string) => void;
}) {
  const { duration } = options;
  if (!Number.isFinite(duration) || duration < 1e-9 || duration > 10) throw new Error('Choose a time window between 1 ns and 10 seconds.');
  const active = probes.filter((probe) => probe.enabled);
  const buffer = new AcquisitionBuffer(active.length, options.samples);
  const elements = api.getElements();
  if (active.some((probe) => !elements.includes(probe.element) || probe.post < 0 || probe.post >= probe.element.getPostCount())) throw new Error('A probed component was removed. Choose its replacement before starting.');
  const interval = duration / (buffer.capacity - 1);
  const previousHook = api.ontimestep;
  const previousMaxStep = api.getMaxTimeStep();
  const acquisitionStep = Math.min(previousMaxStep > 0 ? previousMaxStep : interval, interval);
  const started = performance.now();
  const readings = new Float64Array(active.length);
  let stopped = false;
  let lastTime = -Infinity;
  let resets = 0;
  function stop() {
    if (stopped) return;
    stopped = true;
    if (api.ontimestep === hook) api.ontimestep = previousHook;
    // Preserve an explicit timestep change made by the user during acquisition.
    if (api.getMaxTimeStep() === acquisitionStep) api.setMaxTimeStep(previousMaxStep);
    // Acquiring and freezing a view never pause the running circuit.
  }
  function hook(current: CircuitJsApi) {
    previousHook?.(current);
    if (stopped) return;
    try {
      const time = current.getTime();
      if (time < lastTime) { buffer.clear(); lastTime = -Infinity; resets++; }
      if (time - lastTime < interval * (1 - 1e-9)) return;
      for (let index = 0; index < active.length; index++) readings[index] = readCircuitJsProbe(active[index]!);
      if (buffer.append(time, readings)) lastTime = time;
    } catch (cause) {
      stop();
      options.onError?.(cause instanceof Error ? cause.message : 'Acquisition stopped.');
    }
  }
  api.setMaxTimeStep(acquisitionStep);
  api.ontimestep = hook;
  api.setSimRunning(true);
  return {
    stop,
    get stopped() { return stopped; },
    get count() { return buffer.count; },
    get totalSamples() { return buffer.totalSamples; },
    capacity: buffer.capacity,
    byteLength: buffer.byteLength,
    snapshot(): SimulationPayload | null {
      if (buffer.count < 2) return null;
      const { x, values } = buffer.snapshot(duration);
      return {
        engine: 'circuitjs1', analysis: 'transient', xLabel: 'Time', xUnit: 's', yLabel: 'Voltage', yUnit: 'V', x,
        traces: active.map((probe, index) => ({ id: probe.id, name: probe.name, color: probe.color, quantity: probe.kind, unit: probe.kind === 'current' ? 'A' : 'V', values: values[index]!, node: `node ${probe.element.getNodeId(probe.post)}` })),
        operatingPoint: active.map((probe, index) => ({ name: probe.name, value: values[index]!.at(-1)!, unit: probe.kind === 'current' ? 'A' : 'V' })),
        warnings: [
          ...(buffer.capacity < options.samples ? [`Record depth is ${buffer.capacity.toLocaleString()} samples per channel to fit the acquisition memory limit.`] : []),
          ...(resets ? ['The time record restarted after the circuit was reset.'] : []),
        ], runtimeMs: performance.now() - started,
      };
    },
  };
}

export type CircuitJsAcquisition = ReturnType<typeof startCircuitJsAcquisition>;
