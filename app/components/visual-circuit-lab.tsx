"use client";

import { useState } from "react";
import { Activity, Network } from "lucide-react";
import { SimulationConsole } from "./simulation-console";
import { CircuitJsWorkbench } from "./circuitjs-workbench";

const LAB_NETLIST = `V1 vin 0 PULSE(0 5 0 1u 1u 500u 1m)\nR1 vin vout 1k\nC1 vout 0 1u\n.tran 10u 5m\n.end`;

export function VisualCircuitLab() {
  const [mode, setMode] = useState<"schematic" | "instruments">("schematic");
  return (
    <div className="visual-lab">
      <div className="lab-modebar">
        <div className="segmented-control" role="tablist" aria-label="Circuit lab mode">
          <button className={mode === "schematic" ? "active" : ""} onClick={() => setMode("schematic")} role="tab" aria-selected={mode === "schematic"}><Network size={16} /> Schematic editor</button>
          <button className={mode === "instruments" ? "active" : ""} onClick={() => setMode("instruments")} role="tab" aria-selected={mode === "instruments"}><Activity size={16} /> SPICE analysis</button>
        </div>
        <div className="lab-mode-note">CircuitJS editor with voltage and current probes at every node.</div>
      </div>

      <div hidden={mode !== "schematic"}><CircuitJsWorkbench /></div>
      <div className="standalone-sim" hidden={mode !== "instruments"}>
        <p className="lab-mode-note">Independent ngspice workspace for AC, DC and transient analysis. Import a SPICE deck here; native CircuitJS files open in the schematic editor.</p>
        <SimulationConsole initialNetlist={LAB_NETLIST} probe={["vin", "vout"]} />
      </div>
    </div>
  );
}
