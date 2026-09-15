import assert from "node:assert/strict";
import test from "node:test";
import { circuitPresets } from "../lib/circuit-presets";
import { generateSpiceDeckFromCircuitDocument } from "../lib/circuit-spice";
import {
  SIMULATOR_NETLIST_LIMITS,
  validateSimulatorNetlist,
  validateSimulatorProbes,
} from "../lib/simulator-netlist-policy";

test("every generated launch deck satisfies the independently tested worker policy", () => {
  for (const [slug, circuit] of Object.entries(circuitPresets)) {
    const generated = generateSpiceDeckFromCircuitDocument(circuit, { target: "browser-preview" });
    assert.doesNotThrow(() => validateSimulatorNetlist(generated.deck), slug);
    const voltageNodes = generated.ir.probes.flatMap((probe) => probe.quantity === "voltage" ? [probe.node] : []);
    assert.doesNotThrow(() => validateSimulatorProbes(voltageNodes));
  }
});

test("execution, file, control, and untrusted include directives are rejected case-insensitively", () => {
  for (const directive of [
    ".control",
    "  .ShElL calc.exe",
    ".exec /bin/sh",
    ".lib secrets.lib",
    ".include ../../secret",
    ".include modelcard.CMOS90 extra-token",
    ".hdl payload.v",
  ]) {
    assert.throws(
      () => validateSimulatorNetlist(`R1 in 0 1k\n${directive}\n.op\n.end`),
      /disabled|bundled CMOS90/i,
      directive,
    );
  }
  assert.doesNotThrow(() => validateSimulatorNetlist("R1 in 0 1k\n.include modelcard.CMOS90\n.op\n.end"));
});

test("analysis count, syntax, direction, and output sizes are bounded", () => {
  assert.throws(() => validateSimulatorNetlist("R1 in 0 1k\n.end"), /exactly one analysis/i);
  assert.throws(() => validateSimulatorNetlist("R1 in 0 1k\n.op\n.ac dec 10 1 1k\n.end"), /exactly one analysis/i);
  assert.throws(() => validateSimulatorNetlist("R1 in 0 1k\n.op unexpected\n.end"), /does not accept/i);
  assert.throws(() => validateSimulatorNetlist("R1 in 0 1k\n.dc V1 0 5 -0.1\n.end"), /must move/i);
  assert.throws(() => validateSimulatorNetlist("R1 in 0 1k\n.tran 1n 1m\n.end"), /point preview limit/i);
  assert.throws(() => validateSimulatorNetlist("R1 in 0 1k\n.ac dec 1000 1 1meg\n.end"), /point preview limit/i);
});

test("periodic-source event bombs and oversized decks are rejected", () => {
  assert.throws(
    () => validateSimulatorNetlist("V1 in 0 PULSE(0 5 0 1n 1n 1n 2n)\nR1 in 0 1k\n.tran 1u 10u\n.end"),
    /pulse periods/i,
  );
  assert.throws(
    () => validateSimulatorNetlist("V1 in 0 SIN(0 1 1meg)\nR1 in 0 1k\n.tran 10u 10m\n.end"),
    /sine periods/i,
  );
  const tooManyLines = `${Array.from({ length: SIMULATOR_NETLIST_LIMITS.lines }, () => "* bounded comment").join("\n")}\n.op`;
  assert.throws(() => validateSimulatorNetlist(tooManyLines), /180-line/i);
  const tooManyBytes = `* ${"x".repeat(SIMULATOR_NETLIST_LIMITS.bytes)}\n.op`;
  assert.throws(() => validateSimulatorNetlist(tooManyBytes), /12 KB/i);
});

test("probe requests are deduplicated, bounded, and syntax checked", () => {
  assert.deepEqual(validateSimulatorProbes(["out", "OUT", "out"]), ["out"]);
  assert.doesNotThrow(() => validateSimulatorProbes(Array.from({ length: 32 }, (_, i) => `n${i}`)));
  assert.throws(() => validateSimulatorProbes(Array.from({ length: 33 }, (_, i) => `n${i}`)), /no more than 32/i);
  assert.throws(() => validateSimulatorProbes(["out); shell"]), /invalid/i);
  assert.throws(() => validateSimulatorProbes(["x".repeat(65)]), /invalid/i);
  assert.throws(() => validateSimulatorProbes("out"), /no more than 32/i);
});
