"use client";

import { useEffect, useRef, type RefObject } from 'react';
import type { CircuitJsApi, CircuitJsProbe } from '../../lib/circuitjs';
import styles from './circuitjs-workbench.module.css';

/** Screen transforms update without re-rendering the editor or instruments. */
export function SchematicProbeOverlay({ api, frame, probes }: { api: RefObject<CircuitJsApi | null>; frame: RefObject<HTMLIFrameElement | null>; probes: CircuitJsProbe[] }) {
  const groupsRef = useRef(new Map<string, SVGGElement>());
  useEffect(() => {
    let request = 0;
    const position = () => {
      const native = api.current;
      const canvas = frame.current?.contentDocument?.querySelector('canvas');
      if (native && canvas && frame.current?.offsetWidth) {
        const rect = canvas.getBoundingClientRect();
        const scale = Math.abs(native.screenX(16) - native.screenX(0)) / 16;
        for (const probe of probes) {
          const group = groupsRef.current.get(probe.id);
          if (!group) continue;
          group.setAttribute('transform', `translate(${rect.left + native.screenX(probe.element.getPostX(probe.post))} ${rect.top + native.screenY(probe.element.getPostY(probe.post))}) scale(${scale})`);
        }
      }
      request = requestAnimationFrame(position);
    };
    request = requestAnimationFrame(position);
    return () => cancelAnimationFrame(request);
  }, [api, frame, probes]);
  return <svg className={styles.markers} aria-hidden="true">{probes.map((probe, index) => probe.enabled && <g key={probe.id} ref={element => { if (element) groupsRef.current.set(probe.id, element); else groupsRef.current.delete(probe.id); }} color={probe.color}>
    <title>{probe.name}</title>
    <path d="M0 0 L8 -8 M6 -12 L12 -6 M8 -11 L19 -22 Q21 -24 23 -22 L25 -20 Q27 -18 25 -16 L14 -5 Z M23 -22 L28 -27 L32 -27" fill="var(--probe-paper)" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="29" y="-15" fill="currentColor" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif">{probe.kind === 'current' ? 'I' : 'P'}{index + 1}</text>
  </g>)}</svg>;
}
