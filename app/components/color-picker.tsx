"use client";

import { useId, useState, type PointerEvent } from 'react';
import { hexToHsv, hsvToHex, normalizeHexColor, type HsvColor } from '../../lib/color-picker';
import styles from './color-picker.module.css';

const DEFAULT_PRESETS = ['#e5ae36', '#19a7ce', '#ef5b66', '#65b853', '#9c70dd', '#eb8634', '#d957ae', '#397ee8', '#171b24', '#6b7280', '#aeb7c6', '#ffffff'];

/** An inline, keyboard-accessible picker; it never opens an operating-system dialog. */
export function InlineColorPicker({ value, onChange, label = 'Color', presets = DEFAULT_PRESETS }: {
  value: string; onChange: (color: string) => void; label?: string; presets?: readonly string[];
}) {
  const id = useId(), color = normalizeHexColor(value) ?? '#000000';
  const [editing, setEditing] = useState<{ source: string; hsv: HsvColor } | null>(null);
  const [draft, setDraft] = useState<{ source: string; text: string } | null>(null);
  const hsv = editing?.source === color ? editing.hsv : hexToHsv(color);
  const hexText = draft?.source === color ? draft.text : color;
  const change = (next: HsvColor) => { const hex = hsvToHex(next); setEditing({ source: hex, hsv: next }); setDraft(null); onChange(hex); };
  const pick = (next: string) => { setEditing(null); setDraft(null); onChange(next); };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    change({ ...hsv, s: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)), v: Math.max(0, Math.min(100, 100 - (event.clientY - bounds.top) / bounds.height * 100)) });
  };
  return <div className={styles.picker} role="group" aria-label={label + ' picker'}>
    <div className={styles.saturation} aria-hidden="true" style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); move(event); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}>
      <span style={{ left: hsv.s + '%', top: 100 - hsv.v + '%', backgroundColor: color }}/>
    </div>
    <div className={styles.sliders}>
      <label htmlFor={id + '-h'}>Hue<input className={styles.hue} id={id + '-h'} type="range" min="0" max="359" value={Math.round(hsv.h)} aria-label={label + ' hue'} onChange={event => change({ ...hsv, h: Number(event.target.value) })}/></label>
      <label htmlFor={id + '-s'}>Saturation<input id={id + '-s'} type="range" min="0" max="100" value={Math.round(hsv.s)} aria-label={label + ' saturation'} onChange={event => change({ ...hsv, s: Number(event.target.value) })}/></label>
      <label htmlFor={id + '-v'}>Brightness<input id={id + '-v'} type="range" min="0" max="100" value={Math.round(hsv.v)} aria-label={label + ' brightness'} onChange={event => change({ ...hsv, v: Number(event.target.value) })}/></label>
    </div>
    <div className={styles.presets}>{presets.map(preset => <button type="button" key={preset} style={{ backgroundColor: preset }} aria-label={label + ': ' + preset} aria-pressed={color === normalizeHexColor(preset)} title={preset} onClick={() => pick(preset)}/>)}</div>
    <label className={styles.hex} htmlFor={id + '-hex'}><span className={styles.preview} style={{ backgroundColor: color }}/><span>Hex</span><input id={id + '-hex'} type="text" value={hexText} spellCheck={false} maxLength={7} aria-label={label} aria-invalid={normalizeHexColor(hexText) === null} onChange={event => { const text = event.target.value; setDraft({ source: color, text }); const valid = normalizeHexColor(text); if (valid && text.replace('#', '').length === 6) { setEditing(null); onChange(valid); } }} onBlur={() => { const valid = normalizeHexColor(hexText); if (valid) pick(valid); else setDraft(null); }} onKeyDown={event => { if (event.key === 'Enter') { const valid = normalizeHexColor(hexText); if (valid) pick(valid); } }}/></label>
  </div>;
}
