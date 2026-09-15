"use client";

import { useState } from "react";
import { Activity, Network } from "lucide-react";
import { getChallenge, type JudgeKind } from "../../lib/challenges";
import { CIRCUITJS_STARTERS } from "../../lib/circuitjs-starters";
import type { CircuitDocument } from "../../lib/circuit-document";
import { SimulationConsole } from "./simulation-console";
import { CircuitJsWorkbench } from "./circuitjs-workbench";

export function ChallengeWorkbench({
  challengeSlug,
  starterNetlist,
  probe,
  judge,
}: {
  challengeSlug: string;
  starterNetlist: string;
  probe: string;
  judge: JudgeKind;
}) {
  const initialCircuit = getChallenge(challengeSlug)?.nativeCircuit ?? CIRCUITJS_STARTERS[challengeSlug];
  const [mode, setMode] = useState<"schematic" | "instruments">("schematic");
  const [prepared, setPrepared] = useState<{ document: CircuitDocument; deck: string } | null>(null);

  return (
    <div className="challenge-circuit-workbench">
      <div className="lab-modebar challenge-modebar">
        <div className="segmented-control" role="tablist" aria-label="Challenge workspace">
          <button className={mode === "schematic" ? "active" : ""} onClick={() => setMode("schematic")} role="tab" aria-selected={mode === "schematic"}><Network size={16} /> Schematic</button>
          <button className={mode === "instruments" ? "active" : ""} onClick={() => setMode("instruments")} role="tab" aria-selected={mode === "instruments"}><Activity size={16} /> SPICE &amp; grading</button>
        </div>
        <div className="lab-mode-note">Explore the native circuit and compare multiple probes.</div>
      </div>
      <div className="challenge-workbench-panel challenge-schematic-panel" hidden={mode !== "schematic"}>
        {initialCircuit ? <CircuitJsWorkbench key={challengeSlug} initialCircuit={initialCircuit} storageKey={challengeSlug} onPrepareGrading={judge ? (document, deck) => { setPrepared({ document, deck }); setMode('instruments'); } : undefined} modelNote={['cmos-inverter-trip-point', 'bjt-bias-across-beta', 'transimpedance-stability', 'mosfet-gate-drive'].includes(challengeSlug) ? 'The native circuit uses CircuitJS educational device and source models. Use the challenge SPICE deck for its specified transistor model, edge timing, and frequency-domain analysis.' : undefined}/> : <p>This challenge provides a SPICE circuit. Open SPICE &amp; grading to simulate its exact model.</p>}
      </div>
      <div className="challenge-workbench-panel challenge-instruments-panel" hidden={mode !== "instruments"}>
        <p className="lab-mode-note">{prepared ? 'Prepared from the current CircuitJS electrical graph and component values. After editing the schematic, prepare another snapshot before grading.' : judge ? 'Use Prepare SPICE & grading in the schematic to submit your actual circuit. This starter SPICE deck is available for preview.' : 'This is the challenge’s independent SPICE deck for its specified models and analyses. CircuitJS schematic edits are saved separately.'}</p>
        <SimulationConsole
          key={prepared?.deck ?? starterNetlist}
          initialNetlist={prepared?.deck ?? starterNetlist}
          probe={[probe]}
          challengeSlug={challengeSlug}
          judge={judge}
          circuitDocument={prepared?.document}
        />
      </div>
    </div>
  );
}
