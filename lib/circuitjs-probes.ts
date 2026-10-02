import { supportsCircuitJsCurrent, type CircuitJsApi, type CircuitJsElement, type CircuitJsProbe } from './circuitjs';
import type { SimulationPayload } from './simulator-contract';

export const isProbeWire = (element: CircuitJsElement) => ['WireElm', 'RoutedWireElm'].includes(element.getType());

export function probePayloadAppearance(payload: SimulationPayload, probes: CircuitJsProbe[]): SimulationPayload {
  const traces = payload.traces.map(trace => { const probe = probes.find(probe => probe.id === trace.id); return probe ? { ...trace, name: probe.name, color: probe.color } : trace; });
  return { ...payload, traces, operatingPoint: payload.operatingPoint.map(point => {
    const index = payload.traces.findIndex(trace => trace.name === point.name && trace.unit === point.unit);
    return index >= 0 ? { ...point, name: traces[index].name } : point;
  }) };
}
const wirePath = (element: CircuitJsElement) => element.getWirePath?.() ?? [{ x: element.getPostX(0), y: element.getPostY(0) }, { x: element.getPostX(1), y: element.getPostY(1) }];

function pathPoint(element: CircuitJsElement, fraction: number) {
  const points = wirePath(element);
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  let distance = lengths.reduce((sum, length) => sum + length, 0) * fraction;
  for (let index = 0; index < lengths.length; index++) {
    if (distance <= lengths[index] && lengths[index] > 0) { const t = distance / lengths[index]; return { x: points[index].x + (points[index + 1].x - points[index].x) * t, y: points[index].y + (points[index + 1].y - points[index].y) * t }; }
    distance -= lengths[index];
  }
  return points.at(-1)!;
}

export function probePosition(probe: CircuitJsProbe) {
  const element = probe.element;
  const fraction = isProbeWire(element) && Number.isFinite(probe.anchorFraction) ? Math.max(0, Math.min(1, probe.anchorFraction!)) : null;
  return fraction === null ? { x: element.getPostX(probe.post), y: element.getPostY(probe.post) } : pathPoint(element, fraction);
}

export function probeAttachment(element: CircuitJsElement, post: number, x?: number, y?: number, pathFraction?: number | null) {
  if (!isProbeWire(element) || x === undefined || y === undefined) return { element, post };
  if (pathFraction !== undefined && pathFraction !== null && Number.isFinite(pathFraction)) return { element, post: 0, anchorFraction: Math.max(0, Math.min(1, pathFraction)) };
  const dx = element.getPostX(1) - element.getPostX(0), dy = element.getPostY(1) - element.getPostY(0);
  const length2 = dx * dx + dy * dy;
  return { element, post: 0, anchorFraction: length2 ? Math.max(0, Math.min(1, ((x - element.getPostX(0)) * dx + (y - element.getPostY(0)) * dy) / length2)) : 0 };
}

/** Put automatic voltage tips on a real wire of the same solved net, clear of component bodies. */
export function clearProbeAttachment(elements: CircuitJsElement[], element: CircuitJsElement, post: number) {
  const id = element.getNodeId(post), x = element.getPostX(post), y = element.getPostY(post);
  const wires = elements.filter(candidate => isProbeWire(candidate) && candidate.getPostCount() === 2 && candidate.getNodeId(0) === id);
  let best: CircuitJsElement | undefined, score = Infinity;
  for (const wire of wires) {
    const length = Math.hypot(wire.getPostX(1) - wire.getPostX(0), wire.getPostY(1) - wire.getPostY(0));
    if (length < 24) continue;
    const distance = Math.hypot((wire.getPostX(0) + wire.getPostX(1)) / 2 - x, (wire.getPostY(0) + wire.getPostY(1)) / 2 - y);
    const candidateScore = distance - Math.min(length, 120) / 3;
    if (candidateScore < score) { best = wire; score = candidateScore; }
  }
  return best ? { element: best, post: 0, anchorFraction: .5 } : { element, post };
}

export function probeNodeName(api: CircuitJsApi, element: CircuitJsElement, post: number) {
  const id = element.getNodeId(post);
  if (id === 0) return '0';
  const label = api.getElements().find(candidate => candidate.getType() === 'LabeledNodeElm' && candidate.getNodeId(0) === id)?.getLabelName();
  return label || `node ${id}`;
}

/** Read a native branch only when the click is on that component, independent of prior hover state. */
export function currentProbeElementAt(api: CircuitJsApi, x: number, y: number) {
  let closest: CircuitJsElement | null = null, distance = 14;
  for (const element of api.getElements().filter(supportsCircuitJsCurrent)) {
    const ax = api.screenX(element.getPostX(0)), ay = api.screenY(element.getPostY(0));
    const dx = api.screenX(element.getPostX(1)) - ax, dy = api.screenY(element.getPostY(1)) - ay;
    const length2 = dx * dx + dy * dy;
    const fraction = length2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2)) : 0;
    const candidate = Math.hypot(x - ax - fraction * dx, y - ay - fraction * dy);
    if (candidate < distance) { closest = element; distance = candidate; }
  }
  return closest;
}
