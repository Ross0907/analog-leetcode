import assert from "node:assert/strict";
import test from "node:test";
import { Simulation } from "eecircuit-engine";
import { converterChallenges, wiringChallenges } from "../lib/converter-challenges";
import { validateSimulatorNetlist } from "../lib/simulator-netlist-policy";
import { validateCircuitJsText } from "../lib/circuitjs";

test("six converter worked answers agree with real ngspice, including switch hold and quantization residue", { timeout: 60_000 }, async () => {
  const simulator = new Simulation();
  await simulator.start();
  assert.equal(converterChallenges.length, 6);
  for (const challenge of converterChallenges) {
    assert.ok(challenge.nativeCircuit, challenge.slug);
    validateCircuitJsText(challenge.nativeCircuit);
    validateSimulatorNetlist(challenge.starterNetlist);
    assert.equal(challenge.judge, null, "numeric practice must not pretend to have topology grading");
    const solution = challenge.solution!;
    const check = solution.verification;
    simulator.setNetList(`* ${challenge.title}\n${challenge.starterNetlist}`);
    const result = await simulator.runSim();
    assert.ok(result.numPoints > 0, `${challenge.slug}: no real solver output`);
    assert.equal(result.dataType, "real");
    if (result.dataType !== "real") throw new Error("Expected real data");
    const voltage = result.data.find((series) => series.name.toLowerCase() === `v(${check.node})`);
    assert.ok(voltage, `${challenge.slug}: missing voltage vector`);
    let measured = voltage.values[0];
    if (check.kind === "transient") {
      const axis = result.data.find((series) => series.name === "time");
      assert.ok(axis, `${challenge.slug}: missing time`);
      const next = axis.values.findIndex((value) => value >= check.at!);
      assert.ok(next > 0, "Measurement time must be within the solved interval");
      const fraction = (check.at! - axis.values[next - 1]) / (axis.values[next] - axis.values[next - 1]);
      measured = voltage.values[next - 1] + fraction * (voltage.values[next] - voltage.values[next - 1]);
    }
    measured = measured * (check.scale ?? 1) + (check.offset ?? 0);
    assert.ok(Number.isFinite(measured), `${challenge.slug}: non-finite value`);
    assert.ok(Math.abs(measured - solution.value) <= Math.abs(solution.value) * solution.tolerance,
      `${challenge.slug}: ngspice=${measured}, worked answer=${solution.value}`);
  }
});

test("parts-only starters supply separate native components, output label, and actionable wiring guidance", () => {
  assert.ok(wiringChallenges.length >= 2);
  for (const challenge of wiringChallenges) {
    assert.equal(challenge.starterMode, "parts-only");
    assert.ok(challenge.judge);
    assert.ok(challenge.nativeCircuit);
    validateCircuitJsText(challenge.nativeCircuit);
    assert.doesNotMatch(challenge.nativeCircuit, /^(?:w|rw) /m, "a wiring exercise must not contain a solved wire network");
    assert.match(challenge.nativeCircuit, /^207 .* vout$/m);
    assert.ok(challenge.wiringInstructions && challenge.wiringInstructions.length >= 3);
    assert.deepEqual(challenge.recommendedProbes, ["vout"]);
  }
});
