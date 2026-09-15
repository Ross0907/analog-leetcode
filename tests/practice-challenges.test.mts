import assert from "node:assert/strict";
import test from "node:test";
import { Simulation } from "eecircuit-engine";
import { challenges } from "../lib/challenges";
import { practiceChallenges } from "../lib/practice-challenges";
import { validateSimulatorNetlist } from "../lib/simulator-netlist-policy";
import { validateCircuitJsText } from "../lib/circuitjs";

test("all 15 new worked answers agree with actual ngspice results", { timeout: 60_000 }, async () => {
  const simulator = new Simulation();
  await simulator.start();
  assert.equal(practiceChallenges.length, 15);
  for (const challenge of practiceChallenges) {
    assert.ok(challenge.nativeCircuit, challenge.slug);
    validateCircuitJsText(challenge.nativeCircuit);
    validateSimulatorNetlist(challenge.starterNetlist);
    const solution = challenge.solution!;
    const check = solution.verification;
    simulator.setNetList(`* ${challenge.title}\n${challenge.starterNetlist}`);
    const result = await simulator.runSim();
    assert.ok(result.numPoints > 0, `${challenge.slug}: no real solver output`);
    let measured: number;
    if (result.dataType === "complex") {
      const axis = result.data.find((series) => series.name === "frequency")!;
      const voltage = result.data.find((series) => series.name.toLowerCase() === `v(${check.node})`)!;
      assert.ok(axis && voltage, `${challenge.slug}: missing AC vectors`);
      measured = interpolate(axis.values.map((point) => point.real), voltage.values.map((point) => Math.hypot(point.real, point.img)), check.at!);
    } else {
      const voltage = result.data.find((series) => series.name.toLowerCase() === `v(${check.node})`)!;
      assert.ok(voltage, `${challenge.slug}: missing voltage vector`);
      if (check.kind === "transient") {
        const axis = result.data.find((series) => series.name === "time")!;
        assert.ok(axis, `${challenge.slug}: missing time`);
        measured = interpolate(axis.values, voltage.values, check.at!);
      } else measured = voltage.values[0];
    }
    measured = measured * (check.scale ?? 1) + (check.offset ?? 0);
    assert.ok(Number.isFinite(measured), `${challenge.slug}: non-finite value`);
    assert.ok(Math.abs(measured - solution.value) <= Math.abs(solution.value) * solution.tolerance,
      `${challenge.slug}: ngspice=${measured}, worked answer=${solution.value}`);
  }
});

test("every challenge has a unique stable identity and a valid SPICE analysis", () => {
  assert.equal(new Set(challenges.map((item) => item.slug)).size, challenges.length);
  assert.equal(new Set(challenges.map((item) => item.id)).size, challenges.length);
  for (const challenge of challenges) validateSimulatorNetlist(challenge.starterNetlist);
});

function interpolate(x: number[], y: number[], at: number) {
  const next = x.findIndex((value) => value >= at);
  assert.ok(next >= 0, "The requested measurement must be inside the simulated interval");
  if (next === 0) return y[0];
  const f = (at - x[next - 1]) / (x[next] - x[next - 1]);
  return y[next - 1] + f * (y[next] - y[next - 1]);
}
