"use client";

/* eslint-disable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex -- Keyboard-operable ARIA splitter with an adjustable value. */
import { useRef } from 'react';

export function WorkspaceDivider({ label, orientation, value, minimum, maximum, defaultValue, step = 2, unitsPerPixel = () => 1, onChange, onActive, className }: {
  label: string; orientation: 'horizontal' | 'vertical'; value: number; minimum: number; maximum: number; defaultValue: number; step?: number;
  unitsPerPixel?: () => number; onChange: (value: number) => void; onActive?: (active: boolean) => void; className?: string;
}) {
  const dragRef = useRef<{ id: number; coordinate: number; value: number; scale: number } | null>(null);
  const update = (next: number) => onChange(Math.min(maximum, Math.max(minimum, next)));
  const finish = () => { dragRef.current = null; onActive?.(false); };
  return <div role="separator" tabIndex={0} className={className} aria-label={label} aria-orientation={orientation}
    aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={Math.round(value)}
    onDoubleClick={() => update(defaultValue)}
    onPointerDown={(event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { id: event.pointerId, coordinate: orientation === 'vertical' ? event.clientX : event.clientY, value, scale: unitsPerPixel() };
      onActive?.(true);
    }}
    onPointerMove={(event) => {
      const start = dragRef.current;
      if (start?.id !== event.pointerId) return;
      update(start.value + ((orientation === 'vertical' ? event.clientX : event.clientY) - start.coordinate) * start.scale);
    }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={(event) => {
      const negative = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
      const positive = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
      if (![negative, positive, 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      update(event.key === 'Home' ? defaultValue : event.key === 'End' ? maximum : value + (event.key === negative ? -step : step));
    }}><span aria-hidden="true"/></div>;
}
