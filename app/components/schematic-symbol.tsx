import type { ReactNode } from "react";

export type SchematicKind =
  | "resistor"
  | "potentiometer"
  | "capacitor"
  | "capacitor-polarized"
  | "inductor"
  | "transformer"
  | "diode"
  | "zener"
  | "led"
  | "voltage"
  | "current"
  | "battery"
  | "ground"
  | "power"
  | "opamp"
  | "comparator"
  | "npn"
  | "pnp"
  | "nmos"
  | "pmos"
  | "switch"
  | "crystal"
  | "probe"
  | "logic-not"
  | "logic-and"
  | "logic-or";

export type SymbolPin = { x: number; y: number; name: string };

export const SCHEMATIC_LIBRARY: Array<{ kind: SchematicKind; label: string; category: "Passives" | "Sources" | "Semiconductors" | "Analog" | "Digital" | "Instruments" }> = [
  { kind: "resistor", label: "Resistor", category: "Passives" },
  { kind: "potentiometer", label: "Potentiometer", category: "Passives" },
  { kind: "capacitor", label: "Capacitor", category: "Passives" },
  { kind: "capacitor-polarized", label: "Polarized capacitor", category: "Passives" },
  { kind: "inductor", label: "Inductor", category: "Passives" },
  { kind: "transformer", label: "Transformer", category: "Passives" },
  { kind: "crystal", label: "Crystal", category: "Passives" },
  { kind: "voltage", label: "Voltage source", category: "Sources" },
  { kind: "current", label: "Current source", category: "Sources" },
  { kind: "battery", label: "Battery", category: "Sources" },
  { kind: "ground", label: "Ground", category: "Sources" },
  { kind: "power", label: "Power port", category: "Sources" },
  { kind: "diode", label: "Diode", category: "Semiconductors" },
  { kind: "zener", label: "Zener diode", category: "Semiconductors" },
  { kind: "led", label: "LED", category: "Semiconductors" },
  { kind: "npn", label: "NPN BJT", category: "Semiconductors" },
  { kind: "pnp", label: "PNP BJT", category: "Semiconductors" },
  { kind: "nmos", label: "N-channel MOSFET", category: "Semiconductors" },
  { kind: "pmos", label: "P-channel MOSFET", category: "Semiconductors" },
  { kind: "opamp", label: "Operational amplifier", category: "Analog" },
  { kind: "comparator", label: "Comparator", category: "Analog" },
  { kind: "switch", label: "SPST switch", category: "Analog" },
  { kind: "logic-not", label: "NOT gate", category: "Digital" },
  { kind: "logic-and", label: "AND gate", category: "Digital" },
  { kind: "logic-or", label: "OR gate", category: "Digital" },
  { kind: "probe", label: "Voltage probe", category: "Instruments" },
];

export function symbolPins(kind: SchematicKind): SymbolPin[] {
  if (kind === "ground") return [{ x: 0, y: -45, name: "GND" }];
  if (kind === "power") return [{ x: 0, y: 45, name: "PWR" }];
  if (kind === "probe") return [{ x: -50, y: 0, name: "sense" }];
  if (kind === "potentiometer") return [
    { x: -50, y: 0, name: "1" },
    { x: 50, y: 0, name: "2" },
    { x: 5, y: -45, name: "wiper" },
  ];
  if (kind === "opamp" || kind === "comparator") return [
    { x: -52, y: -20, name: "+" },
    { x: -52, y: 20, name: "−" },
    { x: 52, y: 0, name: "out" },
  ];
  if (kind === "npn" || kind === "pnp") return [
    { x: -50, y: 0, name: "B" },
    { x: 34, y: -45, name: "C" },
    { x: 34, y: 45, name: "E" },
  ];
  if (kind === "nmos" || kind === "pmos") return [
    { x: -50, y: 0, name: "G" },
    { x: 30, y: -45, name: "D" },
    { x: 30, y: 45, name: "S" },
  ];
  if (kind === "transformer") return [
    { x: -50, y: -30, name: "P1" },
    { x: -50, y: 30, name: "P2" },
    { x: 50, y: -30, name: "S1" },
    { x: 50, y: 30, name: "S2" },
  ];
  if (kind === "logic-and" || kind === "logic-or") return [
    { x: -52, y: -18, name: "A" },
    { x: -52, y: 18, name: "B" },
    { x: 52, y: 0, name: "Y" },
  ];
  if (kind === "logic-not") return [{ x: -52, y: 0, name: "A" }, { x: 52, y: 0, name: "Y" }];
  return [{ x: -50, y: 0, name: "1" }, { x: 50, y: 0, name: "2" }];
}

export function SchematicGlyph({ kind, title }: { kind: SchematicKind; title?: string }) {
  return (
    <svg className="schematic-glyph" viewBox="-60 -55 120 110" role={title ? "img" : "presentation"} aria-label={title}>
      {title ? <title>{title}</title> : null}
      <g className="schematic-symbol-ink"><SchematicSymbol kind={kind} /></g>
    </svg>
  );
}

export function SchematicSymbol({ kind, showPinMarks = true }: { kind: SchematicKind; showPinMarks?: boolean }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, vectorEffect: "non-scaling-stroke" as const };
  const pins = symbolPins(kind);
  let body: ReactNode;

  if (kind === "resistor" || kind === "potentiometer") {
    body = <>
      <path {...common} d="M-50 0H-32L-27-10-17 10-7-10 3 10 13-10 23 10 28 0H50" />
      {kind === "potentiometer" ? <><path {...common} d="M5-34V-14" /><path {...common} d="m-1-21 6 7 6-7" /></> : null}
    </>;
  } else if (kind === "capacitor" || kind === "capacitor-polarized") {
    body = <>
      <path {...common} d="M-50 0H-8M8 0H50M-8-24V24" />
      {kind === "capacitor" ? <path {...common} d="M8-24V24" /> : <><path {...common} d="M12-24Q2 0 12 24" /><path {...common} d="M-23-19h10M-18-24v10" /></>}
    </>;
  } else if (kind === "inductor") {
    body = <path {...common} d="M-50 0h14c0-12 18-12 18 0 0-12 18-12 18 0 0-12 18-12 18 0 0-12 18-12 18 0h14" />;
  } else if (kind === "transformer") {
    body = <>
      <path {...common} d="M-50-30h12c-12 0-12 15 0 15-12 0-12 15 0 15-12 0-12 15 0 15-12 0-12 15 0 15h-12M50-30H38c12 0 12 15 0 15 12 0 12 15 0 15 12 0 12 15 0 15 12 0 12 15 0 15h12M-7-34v68M7-34v68" />
    </>;
  } else if (kind === "diode" || kind === "zener" || kind === "led") {
    body = <>
      <path {...common} d="M-50 0H-24M24 0H50M-24-24v48L24 0Z" />
      {kind === "zener" ? <path {...common} d="M24-25v10M24 15v10M18-15h6M24 15h6" /> : <path {...common} d="M24-25V25" />}
      {kind === "led" ? <><path {...common} d="m7-31 15-12m-6 0h6v6M19-21l15-12m-6 0h6v6" /></> : null}
    </>;
  } else if (kind === "voltage" || kind === "current") {
    body = <>
      <path {...common} d="M-50 0h16M34 0h16" /><circle {...common} cx="0" cy="0" r="34" />
      {kind === "voltage" ? <><path {...common} d="M-16-7v14M-23 0h14M11 0h14" /></> : <><path {...common} d="M0 17V-17M-7-10l7-7 7 7" /></>}
    </>;
  } else if (kind === "battery") {
    body = <><path {...common} d="M-50 0h30M20 0h30M-20-25v50M-8-15v30M8-25v50M20-15v30" /></>;
  } else if (kind === "ground") {
    body = <path {...common} d="M0-45V-12M-22-12h44M-15-4h30M-7 4H7" />;
  } else if (kind === "power") {
    // IEC/KiCad-style single-pin power port. The attached label supplies the
    // global net name; the open arrow is intentionally not a component body.
    body = <path {...common} d="M0 45V9M-13 9 0-8 13 9Z" />;
  } else if (kind === "opamp" || kind === "comparator") {
    body = <>
      <path {...common} d="M-52-20h22M-52 20h22M35 0h17M-30-38v76L35 0Z" />
      <path {...common} d="M-23-20h12M-17-26v12M-23 20h12" />
      {kind === "comparator" ? <path {...common} d="M9-9h12M9 9h12" /> : null}
    </>;
  } else if (kind === "npn" || kind === "pnp") {
    body = <>
      <path {...common} d="M-50 0h28M-22-28v56M-22-13 18-37 34-45M-22 13 18 37 34 45" />
      {kind === "npn" ? <path {...common} d="m14 30 13 10-16 2" /> : <path {...common} d="m4 28-13 2 9 13" />}
    </>;
  } else if (kind === "nmos" || kind === "pmos") {
    body = <>
      <path {...common} d="M-50 0h22M-22-27v54M-12-24v14M-12-7V7M-12 10v14M-12-17h42v-28M-12 17h42v28" />
      {kind === "pmos" ? <circle {...common} cx="-22" cy="0" r="5" /> : null}
      <path {...common} d={kind === "nmos" ? "M-1 0h18m-7-6 7 6-7 6" : "M17 0H-1m7-6-7 6 7 6"} />
    </>;
  } else if (kind === "switch") {
    body = <><path {...common} d="M-50 0h16M34 0h16M-34 0 24-25" /><circle {...common} cx="-34" cy="0" r="3" /><circle {...common} cx="34" cy="0" r="3" /></>;
  } else if (kind === "crystal") {
    body = <><path {...common} d="M-50 0h25M25 0h25M-25-22v44M25-22v44M-15-16h30v32h-30Z" /></>;
  } else if (kind === "probe") {
    body = <path {...common} d="M-50 0H-18M-18-12V12L5 0Z" />;
  } else if (kind === "logic-not") {
    body = <><path {...common} d="M-52 0h17M-35-32v64L30 0Z" /><circle {...common} cx="38" cy="0" r="8" /><path {...common} d="M46 0h6" /></>;
  } else if (kind === "logic-and") {
    body = <><path {...common} d="M-52-18h20M-52 18h20M-32-36v72H0a36 36 0 0 0 0-72Z" /><path {...common} d="M36 0h16" /></>;
  } else {
    body = <><path {...common} d="M-52-18h23M-52 18h23M-29-36Q0-30 0 0T-29 36Q-12 0-29-36ZM29 0h23" /></>;
  }

  return <>
    {body}
    {showPinMarks ? pins.map((pin) => <circle key={`${pin.x}:${pin.y}:${pin.name}`} className="schematic-pin-mark" cx={pin.x} cy={pin.y} r="2.8" fill="var(--symbol-paper, #fbfaf5)" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />) : null}
  </>;
}
