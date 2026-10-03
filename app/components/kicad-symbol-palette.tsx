"use client";

import styles from './circuitjs-workbench.module.css';

const symbols = [
  { label: 'Resistor', short: 'R', file: 'resistor', native: 'ResistorElm' },
  { label: 'Capacitor', short: 'C', file: 'capacitor', native: 'CapacitorElm' },
  { label: 'Inductor', short: 'L', file: 'inductor-compact', native: 'InductorElm' },
  { label: 'Diode', short: 'D', file: 'diode', native: 'DiodeElm' },
  { label: 'N-channel MOSFET', short: 'NMOS', file: 'nmos', native: 'NMosfetElm' },
  { label: 'P-channel MOSFET', short: 'PMOS', file: 'pmos', native: 'PMosfetElm' },
  { label: 'NPN transistor', short: 'NPN', file: 'npn', native: 'NTransistorElm' },
  { label: 'PNP transistor', short: 'PNP', file: 'pnp', native: 'PTransistorElm' },
  { label: 'Operational amplifier', short: 'Op-amp', file: 'opamp-wide', native: 'OpAmpElm' },
  { label: 'Voltage source', short: 'DC', file: 'battery', native: 'DCVoltageElm' },
  { label: 'Power rail', short: 'Rail', file: null, native: 'RailElm' },
  { label: 'Current source', short: 'I', file: 'current-source', native: 'CurrentElm' },
  { label: 'Ground', short: 'GND', file: 'ground', native: 'GroundElm' },
] as const;

export function KiCadSymbolPalette({ disabled, onAdd }: { disabled: boolean; onAdd: (nativeType: string) => void }) {
  return <div className={styles.symbolPalette} aria-label="Component library">
    <div className={styles.symbolButtons}>{symbols.map((symbol) => <button
      type="button" key={symbol.native} disabled={disabled}
      aria-label={`Add ${symbol.label.toLowerCase()}`}
      title={`${symbol.label} · ${symbol.file ? 'Analog Canvas symbol' : 'CircuitJS one-terminal supply'}`}
      onClick={() => onAdd(symbol.native)}
    >
      {/* Same attributed Analog Canvas definitions as the live editor. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {symbol.file ? <img src={`/analog-canvas/svg/${symbol.file}.svg`} alt="" width={30} height={30}/> : <span aria-hidden="true">V+</span>}
      <span>{symbol.short}</span>
    </button>)}</div>
    <a href="/analog-canvas/NOTICE.html" target="_blank" rel="noreferrer">Symbol credits</a>
  </div>;
}
