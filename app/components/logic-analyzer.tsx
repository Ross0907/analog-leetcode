"use client";

import { useCallback, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { formatEngineering } from '../../lib/engineering';
import { heldSampleIndex, logicState, logicWord, logicPath } from '../../lib/logic-analysis';
import type { SimulationPayload } from '../../lib/simulator-contract';
import { probeColor } from '../../lib/probe-colors';
import { instrumentTraceColor } from '../../lib/instrument-interactions';
import { useInstrumentTheme, useTraceAppearance } from './instrument-state';
import { TraceContextMenu } from './trace-context-menu';
import styles from './instrument-workspace.module.css';

export function LogicAnalyzer({ payload }: { payload: SimulationPayload }) {
  const id = useId();
  const theme = useInstrumentTheme();
  const [appearances, setAppearances] = useTraceAppearance();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [low, setLow] = useState(0.8);
  const [high, setHigh] = useState(2);
  const [cursor, setCursor] = useState(1);
  const [busIds, setBusIds] = useState<string[]>([]);
  const [view, setView] = useState({ start: 0, end: 1 });
  const [selection, setSelection] = useState<{ id: string; start: number; end: number } | null>(null);
  const selectionRef = useRef(selection);
  const channels = payload.traces.filter((trace) => trace.quantity === 'voltage');
  const start = payload.x[0] ?? 0, end = payload.x.at(-1) ?? start;
  const visibleStart = start + view.start * (end - start), visibleEnd = start + view.end * (end - start);
  const cursorTime = visibleStart + cursor * (visibleEnd - visibleStart);
  const index = heldSampleIndex(payload.x, cursorTime);
  const selected = channels.filter((trace) => busIds.includes(trace.id)).slice(0, 16);
  const word = logicWord(selected.map((trace) => trace.values[index]!), low, high);
  const selectedTrace = channels.find((trace) => trace.id === menu?.id);
  const xFraction = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  };
  const reset = () => { setView({ start: 0, end: 1 }); setSelection(null); selectionRef.current = null; };
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>, traceId: string) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); closeMenu();
    const fraction = xFraction(event);
    selectionRef.current = { id: traceId, start: fraction, end: fraction };
    setSelection(selectionRef.current);
  };
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!selectionRef.current) return;
    selectionRef.current = { ...selectionRef.current, end: xFraction(event) };
    setSelection(selectionRef.current);
  };
  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const selection = selectionRef.current;
    if (!selection) return;
    if (event.type !== 'pointercancel') {
      const finish = xFraction(event);
      if (Math.abs(finish - selection.start) * event.currentTarget.getBoundingClientRect().width >= 6) {
        const span = view.end - view.start;
        setView({ start: view.start + Math.min(selection.start, finish) * span, end: view.start + Math.max(selection.start, finish) * span });
        setCursor(0.5);
      } else setCursor(finish);
    }
    selectionRef.current = null; setSelection(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <section className={styles.logic} aria-label="Logic analyzer" data-theme={theme} data-x-min={visibleStart} data-x-max={visibleEnd}>
    <div className={styles.heading}><strong>Logic analyzer</strong><span>Thresholds applied to measured node voltages</span></div>
    <div className={styles.controls}>
      <label htmlFor={id + '-low'}>Low ≤ V<input id={id + '-low'} type="number" step="0.1" value={low} onChange={(event) => setLow(Number(event.target.value))}/></label>
      <label htmlFor={id + '-high'}>High ≥ V<input id={id + '-high'} type="number" step="0.1" value={high} onChange={(event) => setHigh(Number(event.target.value))}/></label>
      <label htmlFor={id + '-cursor'}>Cursor<input id={id + '-cursor'} type="range" min="0" max="1" step="0.001" value={cursor} onChange={(event) => setCursor(Number(event.target.value))}/></label>
      <output>{formatEngineering(cursorTime, 's')}</output>
      <button type="button" onClick={reset}>Reset view</button>
    </div>
    {high <= low ? <p role="alert">The high threshold must exceed the low threshold.</p> : channels.length === 0 ? <p>Add a voltage probe to view digital states.</p> : <>
      <div className={styles.logicRows}>{channels.map((trace, channel) => {
        const appearance = appearances[trace.id];
        const color = instrumentTraceColor(appearance?.color ?? trace.color ?? probeColor(trace.id), theme);
        const waveform = logicPath(payload.x, trace.values, visibleStart, visibleEnd, low, high);
        return <div className={styles.logicRow} key={trace.id}>
          <label style={{ color }}><input aria-label={'Include ' + trace.name + ' in bus'} type="checkbox" checked={busIds.includes(trace.id)} disabled={!busIds.includes(trace.id) && busIds.length >= 16} onChange={(event) => setBusIds(event.target.checked ? [...busIds, trace.id] : busIds.filter((value) => value !== trace.id))}/><button type="button" aria-label={'Style ' + trace.name} title="Trace appearance" onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); setMenu({ id: trace.id, x: bounds.left, y: bounds.bottom }); }}>D{channel} · {trace.name}</button></label>
          <svg viewBox="0 0 1000 46" preserveAspectRatio="none" role="img" aria-label={trace.name + ' digital waveform'} onPointerDown={(event) => pointerDown(event, trace.id)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onDoubleClick={reset} onContextMenu={(event) => { event.preventDefault(); if (event.target instanceof SVGPathElement) setMenu({ id: trace.id, x: event.clientX, y: event.clientY }); else closeMenu(); }}>
            <path d={waveform.path} fill="none" stroke={color} strokeWidth={appearance?.width ?? 1.8} vectorEffect="non-scaling-stroke" pointerEvents="stroke"/>
            <line x1={cursor * 1000} x2={cursor * 1000} y1="0" y2="46" stroke="currentColor" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
            {selection?.id === trace.id && <rect className={styles.logicSelection} x={1000 * Math.min(selection.start, selection.end)} y="0" width={1000 * Math.abs(selection.end - selection.start)} height="46"/>}
          </svg>
          <output style={{ color }}>{logicState(trace.values[index]!, low, high)}</output>
          {waveform.truncated && <small>More than 6,000 transitions. Zoom into a shorter time window to inspect every edge.</small>}
        </div>;
      })}</div>
      <div className={styles.logicAxis}><span>{formatEngineering(visibleStart, 's')}</span><span>{formatEngineering(visibleEnd, 's')}</span></div>
      <p className={styles.note}>Drag across a lane to zoom · Double-click to reset · Right-click a trace to style. Select up to 16 channels for a bus; the first selected channel in the list is bit 0. Voltages between thresholds display X.</p>
      {selected.length > 0 && <output className={styles.bus} aria-label="Logic bus value">{word.hex} <span>{word.binary}</span></output>}
    </>}
    {menu && selectedTrace && <TraceContextMenu name={selectedTrace.name} x={menu.x} y={menu.y} color={appearances[selectedTrace.id]?.color ?? selectedTrace.color ?? probeColor(selectedTrace.id)} width={appearances[selectedTrace.id]?.width ?? 1.8} onClose={closeMenu} onChange={(change) => setAppearances((current) => ({ ...current, [selectedTrace.id]: { ...current[selectedTrace.id], ...change } }))}/>}
  </section>;
}
