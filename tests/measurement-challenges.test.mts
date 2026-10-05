import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from 'eecircuit-engine';
import { measurementChallenges } from '../lib/measurement-challenges';
import { evaluateDesignChecks } from '../lib/design-checks';
import { validateSimulatorNetlist } from '../lib/simulator-netlist-policy';
import { normalizeNgspiceResult } from '../lib/simulator-results';
import { validateCircuitJsText } from '../lib/circuitjs';

test('new transient and frequency exercises require edits and their solutions pass real ngspice', { timeout: 60000 }, async () => {
  const edits = [['C1 out 0 100n', 'C1 out 0 47n'], ['R1 vin mid 20', 'R1 vin mid 200'], ['R1 out 0 10k', 'R1 out 0 1.59k'], ['C1 mid 0 10n', 'C1 mid 0 100n']];
  const simulation = new Simulation(); await simulation.start();
  for (const [index, lesson] of measurementChallenges.entries()) {
    validateCircuitJsText(lesson.nativeCircuit!);
    for (const solved of [false, true]) {
      const deck = solved ? lesson.starterNetlist.replace(...edits[index] as [string, string]) : lesson.starterNetlist;
      simulation.setNetList('* Measurement exercise\n' + deck);
      const raw = await simulation.runSim();
      const result = normalizeNgspiceResult(raw, validateSimulatorNetlist(deck), ['vin', 'out'], [], 0);
      const checks = evaluateDesignChecks(lesson.designChecks!, result);
      assert.equal(checks.every(check => check.passed), solved, lesson.slug + ': ' + checks.map(check => check.message).join('; '));
    }
  }
});
