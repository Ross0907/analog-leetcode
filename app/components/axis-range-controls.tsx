"use client";
import { useState } from 'react';
import { parseEngineeringNumber } from '../../lib/engineering';
export function AxisRangeControls({ x, y, xUnit, yUnit, xBounds, onApply }: { x: [number, number]; y?: [number, number]; xUnit: string; yUnit?: string; xBounds?: [number, number]; onApply: (x: [number, number], y?: [number, number]) => void }) {
  const [draft, setDraft] = useState<Record<string,string>>({}), [error, setError] = useState('');
  const fields = { 'X start': x[0], 'X end': x[1], ...(y ? { 'Y start': y[0], 'Y end': y[1] } : {}) };
  return <form aria-label="Display axis limits" style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:8, padding:'8px 12px', fontSize:11, borderBottom:'1px solid var(--line)' }} onSubmit={event => { event.preventDefault(); const values = Object.entries(fields).map(([name,value]) => parseEngineeringNumber(draft[name] ?? String(value))); if (values.some(v => v === null) || !(values[1]! > values[0]!) || (y && !(values[3]! > values[2]!))) { setError('Enter finite limits with end greater than start.'); return; } if(xBounds && (values[0]! < xBounds[0] - Math.abs(xBounds[0])*1e-12 || values[1]! > xBounds[1] + Math.abs(xBounds[1])*1e-12)) { setError(`X limits must stay within ${xBounds[0]} to ${xBounds[1]} ${xUnit}.`); return; } onApply([values[0]!,values[1]!], y ? [values[2]!,values[3]!] : undefined); setDraft({}); setError(''); }}>
    {Object.entries(fields).map(([name, value]) => <label key={name} style={{ display:'grid', gap:3 }}>{name} / {name.startsWith('X') ? xUnit : yUnit}<input aria-label={name} inputMode="decimal" value={draft[name] ?? String(Number(value.toPrecision(8)))} onChange={event => setDraft({ ...draft, [name]:event.target.value })} style={{ width:100, padding:5, border:'1px solid var(--line)', borderRadius:4, background:'var(--surface)', color:'var(--ink)' }}/></label>)}<button type="submit">Apply limits</button>{error && <span role="alert">{error}</span>}
  </form>;
}
