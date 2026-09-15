"use client";

import { useState } from "react";
import { Info, Network, Waves } from "lucide-react";
import { SimulationConsole } from "./simulation-console";
import { TextbookSchematicEditor } from "./textbook-schematic-editor";

const LAB_NETLIST = `V1 vin 0 PULSE(0 5 0 1u 1u 500u 1m)\nR1 vin vout 1k\nC1 vout 0 1u\n.tran 10u 5m\n.end`;

export function VisualCircuitLab() {
  const [mode, setMode] = useState<"schematic" | "instruments">("schematic");
  const [draftNetlist, setDraftNetlist] = useState(LAB_NETLIST);
  const [draftProbes, setDraftProbes] = useState<string[]>(["vout"]);
  const [runRevision, setRunRevision] = useState(0);
  return (
    <div className="visual-lab">
      <div className="lab-modebar">
        <div className="segmented-control" role="tablist" aria-label="Circuit lab mode">
          <button className={mode === "schematic" ? "active" : ""} onClick={() => setMode("schematic")} role="tab" aria-selected={mode === "schematic"}><Network size={16} /> Schematic editor</button>
          <button className={mode === "instruments" ? "active" : ""} onClick={() => setMode("instruments")} role="tab" aria-selected={mode === "instruments"}><Waves size={16} /> Instruments</button>
        </div>
        <div className="lab-mode-note"><Info size={14} /> The solver deck is generated from your drawing.</div>
      </div>

      {mode === "schematic" ? (
        <TextbookSchematicEditor onSimulate={(netlist, probes) => { setDraftNetlist(netlist); setDraftProbes(probes); setRunRevision((revision) => revision + 1); setMode("instruments"); }} />
      ) : (
        <div className="standalone-sim"><SimulationConsole key={`${runRevision}:${draftNetlist}`} initialNetlist={draftNetlist} probe={draftProbes} autoRun={runRevision > 0} /></div>
      )}
    </div>
  );
}
