"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TraceAppearance } from './instrument-state';
import { InlineColorPicker } from './color-picker';
import styles from './instrument-workspace.module.css';

export function TraceContextMenu({ name, x, y, color, width, onChange, onClose, children }: {
  name: string; x: number; y: number; color: string; width: number;
  onChange: (appearance: TraceAppearance) => void; onClose: () => void; children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const element = ref.current; if (!element) return;
    const place = () => {
      const bounds = element.getBoundingClientRect();
      const next = { left: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)) };
      setPosition(current => current.left === next.left && current.top === next.top ? current : next);
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(element);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [x, y]);
  useEffect(() => {
    ref.current?.focus();
    const pointer = (event: PointerEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', pointer, true); document.removeEventListener('keydown', key); };
  }, [onClose]);
  return createPortal(<div ref={ref} role="dialog" aria-label={'Trace style: ' + name} tabIndex={-1} className={styles.traceMenu}
    style={position}>
    <div className={styles.menuHeading}><strong>{name}</strong><button type="button" onClick={onClose} aria-label="Close trace menu">×</button></div>
    <InlineColorPicker label="Line color" value={color} onChange={color => onChange({ color })}/>
    <label htmlFor={id + '-width'}>Line thickness<select id={id + '-width'} value={width} onChange={(event) => onChange({ width: Number(event.target.value) })}>{[1, 1.5, 1.7, 1.8, 2, 2.5, 3, 4, 5].map((value) => <option key={value} value={value}>{value} px</option>)}</select></label>
    {children}
  </div>, document.body);
}
