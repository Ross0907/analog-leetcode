"use client";

import { getChallenge, type JudgeKind } from "../../lib/challenges";
import { CIRCUITJS_STARTERS } from "../../lib/circuitjs-starters";
import { SimulationConsole } from "./simulation-console";
import { CircuitJsWorkbench } from "./circuitjs-workbench";

export function ChallengeWorkbench({ challengeSlug, starterNetlist, probe, judge }: {
  challengeSlug: string; starterNetlist: string; probe: string; judge: JudgeKind;
}) {
  const challenge = getChallenge(challengeSlug);
  const initialCircuit = challenge?.nativeCircuit ?? CIRCUITJS_STARTERS[challengeSlug];
  const analysis = { initialNetlist: starterNetlist, probe: [probe], challengeSlug, judge, requireSchematic: challenge?.starterMode === 'parts-only' };
  return <div className="challenge-circuit-workbench">
    <div className="challenge-workbench-panel challenge-schematic-panel">
      {initialCircuit ? <CircuitJsWorkbench key={challengeSlug} initialCircuit={initialCircuit} storageKey={challengeSlug}
        analysis={analysis} recommendedProbes={challenge?.recommendedProbes} wiringInstructions={challenge?.wiringInstructions}
        modelNote={challenge?.blocks || ['cmos-inverter-trip-point', 'bjt-bias-across-beta', 'transimpedance-stability', 'mosfet-gate-drive'].includes(challengeSlug) ? 'Use SPICE analysis for the challenge’s specified transistor models, edge timing, and frequency response.' : undefined}/>
        : <SimulationConsole {...analysis}/>}
    </div>
  </div>;
}
