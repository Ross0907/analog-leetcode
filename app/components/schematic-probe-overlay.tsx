"use client";
import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { circuitJsElementName, supportsCircuitJsCurrent, type CircuitJsApi, type CircuitJsProbe } from '../../lib/circuitjs';
import { isProbeWire, probeAttachment, probeNodeName, probePosition } from '../../lib/circuitjs-probes';
import styles from './circuitjs-workbench.module.css';
type Point = { x: number; y: number };
/** Independent probe controls never dispatch a native component drag. */
export function SchematicProbeOverlay({ api, frame, probes, disabled, onChange, onMessage, selectedProbeId, onSelectProbe }: {
  api: RefObject<CircuitJsApi | null>; frame: RefObject<HTMLIFrameElement | null>; probes: CircuitJsProbe[];
  disabled?: boolean; onChange: (probes: CircuitJsProbe[]) => void; onMessage: (message: string) => void;
  selectedProbeId?: string | null; onSelectProbe?: (id: string) => void;
}) {
  const groupsRef = useRef(new Map<string, SVGGElement>());
  const offsetsRef = useRef(new Map<string, Point>());
  const dragRef = useRef<{ id: string; start: Point; offset: Point; current: Point } | null>(null);
  useEffect(() => {
    let request = 0;
    const position = () => {
      const native = api.current, canvas = frame.current?.contentDocument?.querySelector('canvas');
      if (native && canvas && frame.current?.offsetWidth) {
        const rect = canvas.getBoundingClientRect();
        const markerScale = Math.max(.6, Math.min(1, Math.sqrt(Math.abs(native.screenX(16) - native.screenX(0)) / 16)));
        const zoom = Math.abs(native.screenX(16) - native.screenX(0)) / 16;
        const obstacles = native.getElements().filter(element => !isProbeWire(element) && element.getPostCount()).flatMap(element => {
          const xs = Array.from({ length: element.getPostCount() }, (_, i) => rect.left + native.screenX(element.getPostX(i)));
          const ys = Array.from({ length: element.getPostCount() }, (_, i) => rect.top + native.screenY(element.getPostY(i)));
          const bounds = { left: Math.min(...xs) - 10, right: Math.max(...xs) + (element.getType() === 'LabeledNodeElm' ? 45 : 10), top: Math.min(...ys) - 15, bottom: Math.max(...ys) + 15 };
          // Source values sit beside the symbol, outside its terminal envelope.
          // Reserve that ink as well, including the two-line PWL period label.
          if (/VoltageElm$|CurrentElm$/.test(element.getType()) && xs.length === 2) {
            const cx = (xs[0] + xs[1]) / 2, cy = (ys[0] + ys[1]) / 2;
            const width = Math.max(70, (element.getEditableValue()?.text.length ?? 8) * 10) * zoom;
            return [bounds, Math.abs(xs[0] - xs[1]) < Math.abs(ys[0] - ys[1])
              ? { left: cx - width - 20 * zoom, right: cx - 10 * zoom, top: cy - 18 * zoom, bottom: cy + 24 * zoom }
              : { left: cx - width / 2, right: cx + width / 2, top: cy - 42 * zoom, bottom: cy - 8 * zoom }];
          }
          return [bounds];
        });
        const occupied: Point[] = [];
        for (const probe of probes.filter(probe => probe.enabled)) {
          const group = groupsRef.current.get(probe.id);
          if (!group) continue;
          const point = probePosition(probe), x = rect.left + native.screenX(point.x), y = rect.top + native.screenY(point.y);
          const directions = [{ x: -32, y: -29 }, { x: 32, y: -29 }, { x: -32, y: 29 }, { x: 32, y: 29 }, { x: -54, y: 0 }, { x: 54, y: 0 }, { x: 0, y: -48 }, { x: 0, y: 48 }].map(offset => ({ x: offset.x * markerScale, y: offset.y * markerScale }));
          const score = (offset: Point) => {
            const cx = x + offset.x, cy = y + offset.y;
            return obstacles.reduce((sum, box) => sum + (cx + 19 > box.left && cx - 19 < box.right && cy + 20 > box.top && cy - 14 < box.bottom ? 10 : 0), 0)
              + occupied.reduce((sum, other) => sum + (Math.abs(cx - other.x) < 42 && Math.abs(cy - other.y) < 38 ? 100 : 0), 0)
              + (cx < 24 || cx > rect.right - 24 || cy < rect.top + 24 || cy > rect.bottom - 24 ? 1000 : 0);
          };
          const drag = dragRef.current?.id === probe.id ? dragRef.current : null;
          const offset = drag?.current ?? probe.markerOffset ?? directions.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
          offsetsRef.current.set(probe.id, offset);
          occupied.push({ x: x + offset.x, y: y + offset.y });
          group.setAttribute('transform', `translate(${x} ${y})`);
          group.querySelector('[data-lead]')?.setAttribute('d', `M0 0 L${offset.x} ${offset.y}`);
          group.querySelector('[data-grip]')?.setAttribute('transform', `translate(${offset.x} ${offset.y}) scale(${markerScale})`);
          group.querySelector('[data-body]')?.setAttribute('transform', `rotate(${Math.atan2(offset.y, offset.x) * 180 / Math.PI})`);
        }
      }
      request = requestAnimationFrame(position);
    };
    request = requestAnimationFrame(position);
    return () => cancelAnimationFrame(request);
  }, [api, frame, probes]);
  const release = (event: PointerEvent<SVGGElement>, probe: CircuitJsProbe, cancelled = false) => {
    const drag = dragRef.current; dragRef.current = null;
    if (!drag || drag.id !== probe.id) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled || Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 3) return;
    const native = api.current, iframe = frame.current, canvas = iframe?.contentDocument?.querySelector('canvas');
    const rect = canvas?.getBoundingClientRect(), frameRect = iframe?.getBoundingClientRect();
    const hit = native && rect && frameRect ? native.hitTest?.(event.clientX - frameRect.left - rect.left, event.clientY - frameRect.top - rect.top) : null;
    if (native && hit && hit.distance <= 14 && probe.kind === 'voltage') {
      const duplicate = probes.some(other => other.id !== probe.id && other.kind === 'voltage' && other.element.getNodeId(other.post) === hit.element.getNodeId(hit.post));
      if (duplicate) { onMessage('That node already has a probe. Move the grip into clear space to reposition it.'); return; }
      onChange(probes.map(other => other.id === probe.id ? { ...other, ...probeAttachment(hit.element, hit.post, hit.x, hit.y, hit.pathFraction), name: `V(${probeNodeName(native, hit.element, hit.post)})`, markerOffset: undefined } : other));
      onMessage('Probe connected to the selected node.');
    } else {
      if (native && hit && hit.distance <= 14 && probe.kind === 'current' && supportsCircuitJsCurrent(hit.element)) {
        if (probes.some(other => other.id !== probe.id && other.kind === 'current' && other.element === hit.element)) { onMessage('That branch already has a current probe. Move the grip into clear space to reposition it.'); return; }
        const name = `I(${circuitJsElementName(hit.element, native.getElements().indexOf(hit.element))})`;
        onChange(probes.map(other => other.id === probe.id ? { ...other, ...probeAttachment(hit.element, hit.post, hit.x, hit.y, hit.pathFraction), name, markerOffset: undefined } : other));
        onMessage('Current probe connected to the selected branch.');
        return;
      }
      onChange(probes.map(other => other.id === probe.id ? { ...other, markerOffset: drag.current } : other));
      onMessage('Probe moved. Its electrical connection is unchanged.');
    }
  };
  return <svg className={styles.markers} aria-label="Schematic probes">{probes.map((probe, index) => probe.enabled && <g key={probe.id} data-selected={selectedProbeId === probe.id || undefined} ref={element => { if (element) groupsRef.current.set(probe.id, element); else groupsRef.current.delete(probe.id); }} color={probe.color}>
    {selectedProbeId === probe.id && <circle r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/>}
    <path data-lead fill="none" stroke="currentColor" strokeWidth="1.6"/><circle r="2.2" fill="currentColor"/>
    <g data-grip role="button" tabIndex={disabled ? -1 : 0} aria-label={`Move probe ${index + 1} ${probe.name}`} aria-pressed={selectedProbeId === probe.id} aria-disabled={disabled || undefined} className={styles.probeGrip}
      onPointerDown={event => { if (disabled || event.button !== 0) return; event.preventDefault(); event.stopPropagation(); onSelectProbe?.(probe.id); event.currentTarget.setPointerCapture(event.pointerId); const offset = offsetsRef.current.get(probe.id) ?? { x: -32, y: -29 }; dragRef.current = { id: probe.id, start: { x: event.clientX, y: event.clientY }, offset, current: offset }; }}
      onPointerMove={event => { const drag = dragRef.current; if (drag?.id === probe.id) { event.preventDefault(); event.stopPropagation(); drag.current = { x: Math.max(-200, Math.min(200, drag.offset.x + event.clientX - drag.start.x)), y: Math.max(-200, Math.min(200, drag.offset.y + event.clientY - drag.start.y)) }; } }}
      onPointerUp={event => release(event, probe)} onPointerCancel={event => release(event, probe, true)}
      onKeyDown={event => { if (disabled) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectProbe?.(probe.id); return; } const step = event.shiftKey ? 20 : 5, offset = offsetsRef.current.get(probe.id) ?? { x: -32, y: -29 }; if (event.key.toLowerCase() === 'r') { event.preventDefault(); const direction = event.shiftKey ? -1 : 1; onChange(probes.map(other => other.id === probe.id ? { ...other, markerOffset: { x: -offset.y * direction, y: offset.x * direction } } : other)); return; } const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[event.key]; if (delta) { event.preventDefault(); onSelectProbe?.(probe.id); onChange(probes.map(other => other.id === probe.id ? { ...other, markerOffset: { x: Math.max(-200, Math.min(200, offset.x + delta[0])), y: Math.max(-200, Math.min(200, offset.y + delta[1])) } } : other)); } }}>
      <title>{probe.name} · Drag into clear space, or drop on a wire to reconnect. Arrow keys move the grip; R rotates it.</title>
      <circle r="18" fill="transparent"/>
      <path data-body d="M-12 0 L-6 -4 H9 Q12 -4 12 -1 V1 Q12 4 9 4 H-6 Z M9 -4 V4" fill="var(--probe-paper)" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <text x="0" y="19" fill="currentColor" textAnchor="middle" fontSize="10" fontWeight="600" fontFamily="system-ui,sans-serif">{probe.kind === 'current' ? 'I' : ''}{index + 1}</text>
    </g>
  </g>)}</svg>;
}
