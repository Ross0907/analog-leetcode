"use client";

import styles from './circuitjs-workbench.module.css';

const symbols = [
  { label: 'Resistor', short: 'R', file: 'Device--R_US', native: 'ResistorElm' },
  { label: 'Capacitor', short: 'C', file: 'Device--C', native: 'CapacitorElm' },
  { label: 'Inductor', short: 'L', file: 'Device--L', native: 'InductorElm' },
  { label: 'Diode', short: 'D', file: 'Device--D', native: 'DiodeElm' },
  { label: 'N-channel MOSFET', short: 'NMOS', file: 'Device--Q_NMOS', native: 'NMosfetElm' },
  { label: 'P-channel MOSFET', short: 'PMOS', file: 'Device--Q_PMOS', native: 'PMosfetElm' },
  { label: 'Operational amplifier', short: 'Op-amp', file: 'Amplifier_Operational--LM2904', native: 'OpAmpElm' },
  { label: 'Voltage source', short: 'V', file: 'Simulation_SPICE--VDC', native: 'DCVoltageElm' },
  { label: 'Current source', short: 'I', file: 'Simulation_SPICE--IDC', native: 'CurrentElm' },
  { label: 'Ground', short: 'GND', file: 'power--GNDREF', native: 'GroundElm' },
] as const;

export function KiCadSymbolPalette({ disabled, onAdd }: { disabled: boolean; onAdd: (nativeType: string) => void }) {
  return <div className={styles.symbolPalette} aria-label="Component library">
    <div className={styles.symbolButtons}>{symbols.map((symbol) => <button
      type="button" key={symbol.native} disabled={disabled}
      aria-label={`Add ${symbol.label.toLowerCase()}`}
      title={`${symbol.label} · KiCad library symbol`}
      onClick={() => onAdd(symbol.native)}
    >
      {/* Same KiCad artwork and presentation treatment as the live editor. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/kicad/presentation/${symbol.file}.svg`} alt="" width={30} height={30}/>
      <span>{symbol.short}</span>
    </button>)}</div>
    <a href="/kicad/NOTICE.html" target="_blank" rel="noreferrer">KiCad symbols</a>
  </div>;
}
