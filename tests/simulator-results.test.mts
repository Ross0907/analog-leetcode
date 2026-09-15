import assert from "node:assert/strict";
import test from "node:test";
import type { ResultType } from "eecircuit-engine";
import { chooseProbes, normalizeNgspiceResult } from "../lib/simulator-results";
import { prepareSimulatorDeck } from "../lib/simulator-netlist-policy";

const real = (data: Array<{ name: string; type: string; values: number[] }>, numPoints = 3) => ({ dataType: "real", numPoints, data }) as ResultType;
const traceData = real([
  { name: "time", type: "time", values: [0, 1, 2] },
  { name: "v(in)", type: "voltage", values: [1, 2, 3] },
  { name: "v(out)", type: "voltage", values: [0.5, 1, 1.5] },
  { name: "i(v1)", type: "current", values: [-0.1, -0.2, -0.3] },
]);

test("all requested voltage and supported current vectors preserve actual ngspice samples", () => {
  const payload = normalizeNgspiceResult(traceData, ".tran 1 2", ["out", "i(v1)"], [], 10);
  assert.equal(payload.traces.length, 2);
  assert.deepEqual(payload.traces[0]!.values, [0.5, 1, 1.5]);
  assert.deepEqual(payload.traces[1]!.values, [-0.1, -0.2, -0.3]);
  assert.equal(payload.traces[1]!.quantity, "current"); assert.equal(payload.traces[1]!.unit, "A");
  assert.equal(payload.engine, "ngspice-wasm");
});

test("missing probes fail explicitly and 32 simultaneous nodes are accepted", () => {
  assert.throws(() => normalizeNgspiceResult(traceData, ".tran 1 2", ["missing"], [], 0), /unavailable/);
  const names = Array.from({ length: 32 }, (_, i) => `n${i}`);
  assert.deepEqual(chooseProbes(names, names), names);
  assert.throws(() => chooseProbes([...names, "extra"], []), /Select up to 32/);
  assert.deepEqual(chooseProbes(["out", "in"], ["V(OUT)", "out"]), ["out"]);
});

test("operating point preserves source current and its unit", () => {
  const payload = normalizeNgspiceResult(real([
    { name: "v(out)", type: "voltage", values: [2] },
    { name: "v1#branch", type: "current", values: [-0.002] },
  ], 1), ".op", [], [], 0);
  assert.deepEqual(payload.operatingPoint, [{ name: "V(out)", value: 2, unit: "V" }, { name: "I(v1)", value: -0.002, unit: "A" }]);
});

test("invalid sample dimensions, nonfinite values and backwards time are rejected", () => {
  assert.throws(() => normalizeNgspiceResult({ ...traceData, numPoints: 4 }, ".tran 1 2", [], [], 0), /dimensions/);
  assert.throws(() => normalizeNgspiceResult(real([{ name: "time", type: "time", values: [0, 1, Infinity] }]), ".tran 1 2", [], [], 0), /non-finite/);
  assert.throws(() => normalizeNgspiceResult(real([{ name: "time", type: "time", values: [0, 2, 1] }]), ".tran 1 2", [], [], 0), /increase/);
  assert.throws(() => normalizeNgspiceResult(traceData, ".dc V1 0 2 1", [], [], 0), /no sweep axis/);
});

test("DC sweep reads its named axis and excludes the axis from voltage traces", () => {
  const payload = normalizeNgspiceResult(real([
    { name: "v(v-sweep)", type: "voltage", values: [0, 1, 2] },
    { name: "v(out)", type: "voltage", values: [0, 0.5, 1] },
  ]), ".dc V1 0 2 1", [], [], 0);
  assert.equal(payload.analysis, "dc-sweep"); assert.equal(payload.traces.length, 1);
  assert.deepEqual(payload.x, [0, 1, 2]);
});

test("AC uses complex magnitudes and unwraps the actual phase across ±180 degrees", () => {
  const angles = [170, -170, -160];
  const result = { dataType: "complex", numPoints: 3, data: [
    { name: "frequency", type: "frequency", values: [1, 10, 100].map((real) => ({ real, img: 0 })) },
    { name: "v(out)", type: "voltage", values: angles.map((angle) => ({ real: 2 * Math.cos(angle * Math.PI / 180), img: 2 * Math.sin(angle * Math.PI / 180) })) },
  ] } as ResultType;
  const payload = normalizeNgspiceResult(result, ".ac dec 1 1 100", ["out"], [], 0);
  assert.equal(payload.traces.length, 2);
  assert.ok(payload.traces[0]!.values.every((v) => Math.abs(v - 20 * Math.log10(2)) < 1e-8));
  [170, 190, 200].forEach((angle, i) => assert.ok(Math.abs(payload.traces[1]!.values[i]! - angle) < 1e-8));
});

test("actual ngspice solves 32 independently requested divider nodes without dropping probes", { timeout: 30_000 }, async () => {
  const { Simulation } = await import("eecircuit-engine");
  const simulator = new Simulation();
  await simulator.start();
  const nodes = Array.from({ length: 32 }, (_, i) => `n${i + 1}`);
  const branches = nodes.map((node, i) => `R${2 * i + 1} vin ${node} 1k\nR${2 * i + 2} ${node} 0 1k`).join("\n");
  simulator.setNetList(`* 32 actual node probes\nV1 vin 0 SIN(0 1 1k)\n${branches}\n.tran 10u 1m\n.end`);
  const raw = await simulator.runSim();
  const payload = normalizeNgspiceResult(raw, ".tran 10u 1m", nodes, [], 0);
  assert.equal(payload.traces.length, 32);
  const realVin = raw.data.find((series) => series.name.toLowerCase() === "v(vin)");
  assert.ok(realVin && raw.dataType === "real");
  for (const trace of payload.traces) {
    assert.equal(trace.values.length, payload.x.length);
    trace.values.forEach((value, i) => assert.ok(Math.abs(value - Number(realVin.values[i]) / 2) < 1e-8));
  }
});

test("untitled challenge decks retain the voltage source on their first line in actual ngspice", { timeout: 30_000 }, async () => {
  const { Simulation } = await import("eecircuit-engine");
  const simulator = new Simulation();
  await simulator.start();
  simulator.setNetList(prepareSimulatorDeck("V1 vin 0 2\nR1 vin out 1k\nR2 out 0 1k\n.op\n.end"));
  const payload = normalizeNgspiceResult(await simulator.runSim(), ".op", [], [], 0);
  assert.equal(payload.operatingPoint.find((point) => point.name === "V(vin)")?.value, 2);
  assert.equal(payload.operatingPoint.find((point) => point.name === "V(out)")?.value, 1);
});
