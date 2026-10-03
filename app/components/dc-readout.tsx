"use client";

import { useState } from 'react';
import { Download, Maximize2, Minimize2 } from 'lucide-react';
import { formatEngineering } from '../../lib/engineering';
import { exportInstrumentPng } from './instrument-export';
import { useInstrumentPanel, useInstrumentTheme } from './instrument-state';
import styles from './instrument-workspace.module.css';

export function DcReadout({ values, sampleTime }: { values: { name: string; value: number; unit?: string }[]; sampleTime?: number }) {
  const panel = useInstrumentPanel('dc');
  const theme = useInstrumentTheme();
  const [units, setUnits] = useState<'engineering' | 'base'>('engineering');
  const [error, setError] = useState<string | null>(null);
  const display = (value: number, unit = 'V') => !Number.isFinite(value) ? 'Unavailable' : units === 'base' ? Number(value.toPrecision(6)) + ' ' + unit : value === 0 ? '0 ' + unit : formatEngineering(value, unit);
  const note = sampleTime === undefined ? 'DC operating point' : 'Latest captured sample · ' + formatEngineering(sampleTime, 's');
  async function save() {
    setError(null);
    try { await exportInstrumentPng({ title: 'DC readings', theme, notes: [note], legend: values.map(point => ({ name: point.name, detail: display(point.value, point.unit) })) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'PNG export failed.'); }
  }
  return <section className={styles.readout} aria-label="DC readings" data-instrument-maximized={panel.maximized} hidden={panel.hidden}>
    <header className={styles.heading}><div><strong>DC readings</strong><p className={styles.note}>{note}</p></div><div className={styles.controls}>
      <button type="button" onClick={() => setUnits('engineering')}>Auto set</button>
      <button type="button" onClick={panel.toggleMaximized} aria-label={panel.maximized ? 'Restore instrument' : 'Maximize instrument'} title={panel.maximized ? 'Restore instrument' : 'Maximize instrument'}>{panel.maximized ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
      <button type="button" onClick={() => void save()} aria-label="Save instrument PNG" title="Save instrument PNG"><Download size={16}/></button>
    </div></header>
    <label className={styles.readoutUnits}>Units<select aria-label="DC readout units" value={units} onChange={event => setUnits(event.target.value as typeof units)}><option value="engineering">Automatic engineering units</option><option value="base">Base units (V, A)</option></select></label>
    <div className="op-grid">{values.map(point => <div key={point.name}><span>{point.name}</span><strong>{display(point.value, point.unit)}</strong></div>)}</div>
    {sampleTime !== undefined && <p className={styles.note}>These are the latest measured values, not a separate operating-point calculation.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
