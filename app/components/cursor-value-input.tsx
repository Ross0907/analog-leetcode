"use client";

import { useState, type CSSProperties } from 'react';
import { parseEngineeringNumber } from '../../lib/engineering';

/** Draft text permits precise decimal/exponent/engineering entry without slider quantization. */
export function CursorValueInput({ label, value, minimum, maximum, unit, onChange, style }: {
  label: string; value: number; minimum: number; maximum: number; unit: string; onChange: (value: number) => void; style?: CSSProperties;
}) {
  const [draft, setDraft] = useState<string | null>(null), [error, setError] = useState('');
  const commit = () => {
    if (draft === null) return;
    const number = parseEngineeringNumber(draft.replace(/µ/g, 'u'));
    if (number === null || number < minimum || number > maximum) { setError(`Enter ${minimum.toPrecision(6)} to ${maximum.toPrecision(6)} ${unit}. Reset or zoom out for a wider range.`); return; }
    onChange(number); setDraft(null); setError('');
  };
  return <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
    <input type="text" inputMode="decimal" aria-label={label} aria-invalid={Boolean(error)} title={`${label} in ${unit || 'axis units'}. Decimal, exponent and prefixes such as 1m or 2k are accepted. Press Enter to apply.`} value={draft ?? String(Number(value.toPrecision(12)))} style={{ ...style, width: '100%', minWidth: 0, boxSizing: 'border-box', textAlign: 'right' }} onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commit(); } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(null); setError(''); } }}/>
    <small style={{ fontSize: 9, textAlign: 'right', color: 'var(--muted)' }}>{unit}</small>
    {error && <small role="alert" style={{ fontSize: 10, color: 'var(--red,#bf4545)' }}>{error}</small>}
  </span>;
}
