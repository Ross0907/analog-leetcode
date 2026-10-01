"use client";

import { CircuitJsWorkbench } from "./circuitjs-workbench";

const LAB_NETLIST = `V1 vin 0 PULSE(0 5 0 1u 1u 500u 1m)\nR1 vin vout 1k\nC1 vout 0 1u\n.tran 10u 5m\n.end`;

export function VisualCircuitLab() {
  return <div className="visual-lab"><CircuitJsWorkbench analysis={{ initialNetlist: LAB_NETLIST, probe: ["vin", "vout"] }}/></div>;
}
