"use client";
import { useRef, type RefObject } from 'react';
import styles from './hdl-workspace.module.css';

export function HdlResizeHandle({ axis, value, min, max, container, label, controls, onChange, onDragging }: { axis: 'x' | 'y'; value: number; min: number; max: number; container: RefObject<HTMLDivElement | null>; label: string; controls: string; onChange: (value: number) => void; onDragging: (dragging: boolean) => void }) {
  const dragRef = useRef<{ origin: number; value: number; extent: number } | null>(null);
  const change = (next: number) => onChange(Math.max(min,Math.min(max,next)));
  // WAI-ARIA's window splitter is a focusable separator with arrow-key sizing.
  // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex
  return <div className={styles.resizeHandle} data-axis={axis} role="separator" aria-label={label} aria-controls={controls} aria-orientation={axis==='x'?'vertical':'horizontal'} aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
    onKeyDown={event=>{const less=axis==='x'?'ArrowLeft':'ArrowUp', more=axis==='x'?'ArrowRight':'ArrowDown';if([less,more,'Home','End'].includes(event.key)){event.preventDefault();change(event.key==='Home'?min:event.key==='End'?max:value+(event.key===less?-2:2));}}}
    onPointerDown={event=>{if(event.button!==0)return;const rect=container.current?.getBoundingClientRect();if(!rect)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);dragRef.current={origin:axis==='x'?event.clientX:event.clientY,value,extent:axis==='x'?rect.width:rect.height};onDragging(true);}}
    onPointerMove={event=>{if(dragRef.current){const next=axis==='x'?event.clientX:event.clientY;change(dragRef.current.value+(next-dragRef.current.origin)/dragRef.current.extent*100);}}}
    onPointerUp={event=>{dragRef.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);onDragging(false);}}
    onPointerCancel={()=>{dragRef.current=null;onDragging(false);}}><span/></div>;
}
