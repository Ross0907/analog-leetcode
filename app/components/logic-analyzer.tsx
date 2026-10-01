"use client";

import { useId, useState } from 'react';
import { formatEngineering } from '../../lib/engineering';
import { logicState, logicWord } from '../../lib/logic-analysis';
import type { SimulationPayload } from '../../lib/simulator-contract';
import { probeColor } from '../../lib/probe-colors';
import styles from './instrument-workspace.module.css';

export function LogicAnalyzer({ payload }: { payload: SimulationPayload }) {
  const id = useId();
  const [low, setLow] = useState(0.8);
  const [high, setHigh] = useState(2);
  const [cursor, setCursor] = useState(1);
  const [busIds, setBusIds] = useState<string[]>([]);
  const channels = payload.traces.filter((trace) => trace.quantity === 'voltage');
  const index = Math.min(payload.x.length - 1, Math.max(0, Math.round(cursor * (payload.x.length - 1))));
  const start = payload.x[0] ?? 0, end = payload.x.at(-1) ?? start;
  const selected = channels.filter((trace) => busIds.includes(trace.id)).slice(0, 16);
  const word = logicWord(selected.map((trace) => trace.values[index]!), low, high);
  return <section className={styles.logic} aria-label="Logic analyzer">
    <div className={styles.heading}><strong>Logic analyzer</strong><span>Thresholds applied to measured node voltages</span></div>
    <div className={styles.controls}>
      <label htmlFor={id + '-low'}>Low ≤ V<input id={id + '-low'} type="number" step="0.1" value={low} onChange={(event) => setLow(Number(event.target.value))}/></label>
      <label htmlFor={id + '-high'}>High ≥ V<input id={id + '-high'} type="number" step="0.1" value={high} onChange={(event) => setHigh(Number(event.target.value))}/></label>
      <label htmlFor={id + '-cursor'}>Cursor<input id={id + '-cursor'} type="range" min="0" max="1" step="0.001" value={cursor} onChange={(event) => setCursor(Number(event.target.value))}/></label>
      <output>{formatEngineering(payload.x[index] ?? 0, 's')}</output>
    </div>
    {high <= low ? <p role="alert">The high threshold must exceed the low threshold.</p> : channels.length === 0 ? <p>Add a voltage probe to view digital states.</p> : <>
      <div className={styles.logicRows}>{channels.map((trace, channel) => {
        const color = trace.color ?? probeColor(trace.id);
        const y = (value: number) => { const state = logicState(value, low, high); return state === 1 ? 9 : state === 0 ? 37 : 23; };
        const x = (sample: number) => end > start ? 1000 * (payload.x[sample]! - start) / (end - start) : 0;
        const path = ['M0 ' + y(trace.values[0]!)]; let transitions = 0;
        for (let sample = 1; sample < payload.x.length; sample++) {
          if (logicState(trace.values[sample]!, low, high) !== logicState(trace.values[sample - 1]!, low, high)) {
            if (++transitions > 6000) break;
            path.push('H' + x(sample) + 'V' + y(trace.values[sample]!));
          }
        }
        if (transitions <= 6000) path.push('H1000');
        return <div className={styles.logicRow} key={trace.id}>
          <label style={{ color }}><input type="checkbox" checked={busIds.includes(trace.id)} disabled={!busIds.includes(trace.id) && busIds.length >= 16} onChange={(event) => setBusIds(event.target.checked ? [...busIds, trace.id] : busIds.filter((value) => value !== trace.id))}/>D{channel} · {trace.name}</label>
          <svg viewBox="0 0 1000 46" preserveAspectRatio="none" role="img" aria-label={trace.name + ' digital waveform'}><path d={path.join(' ')} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/><line x1={cursor * 1000} x2={cursor * 1000} y1="0" y2="46" stroke="currentColor" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"/></svg>
          <output style={{ color }}>{logicState(trace.values[index]!, low, high)}</output>
          {transitions > 6000 && <small>More than 6,000 transitions. Shorten the time window to inspect every edge.</small>}
        </div>;
      })}</div>
      <p className={styles.note}>Select up to 16 channels for a bus. The first selected channel in the list is bit 0. Voltages between thresholds display X.</p>
      {selected.length > 0 && <output className={styles.bus} aria-label="Logic bus value">{word.hex} <span>{word.binary}</span></output>}
    </>}
  </section>;
}
