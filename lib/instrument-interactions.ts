import { inspectFftSampling } from './fft-sampling';
export type PlotPoint = { x: number; y: number };
export type PlotBounds = { minimum: number; maximum: number };
export type PlotRectangle = { left: number; top: number; width: number; height: number };
export type TimeWindowMode = 'samples' | 'elapsed' | 'requested';

/** Empty parts of a requested time window remain empty; this only chooses axis bounds. */
export function fitTimeWindow(bounds: PlotBounds, mode: TimeWindowMode, requestedDuration?: number): PlotBounds {
  if (mode === 'samples') return bounds;
  const maximum = mode === 'requested' && Number.isFinite(requestedDuration) && requestedDuration! > 0 ? requestedDuration! : bounds.maximum;
  return { minimum: Math.min(0, bounds.minimum), maximum: Math.max(maximum, Number.EPSILON) };
}

/** Display offsets separate channels; the source arrays and physical measurements never change. */
export function stackedTraceOffsets(traces: readonly { id: string; minimum: number; maximum: number }[]): Record<string, number> {
  const valid = traces.filter(trace => Number.isFinite(trace.minimum) && Number.isFinite(trace.maximum));
  const span = Math.max(1e-12, ...valid.map(trace => Math.max(trace.maximum - trace.minimum, Math.max(Math.abs(trace.minimum), Math.abs(trace.maximum)) * 0.1)));
  return Object.fromEntries(valid.map((trace, index) => [trace.id, ((valid.length - 1) / 2 - index) * span * 1.35 - (trace.minimum + trace.maximum) / 2]));
}

export function availableFftLength(time: readonly number[], maximum = 131072) {
  return Math.min(2 ** Math.floor(Math.log2(Math.max(1, maximum))), inspectFftSampling(time).supportedLength);
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

/** Plain wheel and Shift-only wheel remain scrolling gestures. */
export function instrumentWheelGesture(event: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; deltaY: number; deltaMode?: number }, pagePixels = 800) {
  if ((!event.ctrlKey && !event.altKey) || !Number.isFinite(event.deltaY) || event.deltaY === 0) return null;
  const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pagePixels : 1);
  return { factor: Math.exp(clamp(pixels, -600, 600) * 0.002), x: event.ctrlKey, y: event.altKey || (event.ctrlKey && !event.shiftKey) };
}

/** Bounds may be logarithmic coordinates. The cursor's axis value stays fixed until a record edge is reached. */
export function zoomPlotBounds(bounds: PlotBounds, fraction: number, factor: number, limits?: PlotBounds): PlotBounds {
  const span = bounds.maximum - bounds.minimum;
  if (!(span > 0) || !Number.isFinite(span) || !(factor > 0) || !Number.isFinite(factor)) return bounds;
  const minSpan = Math.max(Number.EPSILON * Math.max(1, Math.abs(bounds.minimum), Math.abs(bounds.maximum)) * 8, (limits ? limits.maximum - limits.minimum : span) * 1e-9);
  const maxSpan = limits ? limits.maximum - limits.minimum : 1e18;
  if (!(maxSpan >= minSpan)) return bounds;
  const nextSpan = clamp(span * factor, minSpan, maxSpan), ratio = clamp(fraction, 0, 1);
  const anchor = bounds.minimum + ratio * span;
  let minimum = anchor - ratio * nextSpan;
  if (limits) minimum = clamp(minimum, limits.minimum, limits.maximum - nextSpan);
  return { minimum, maximum: minimum + nextSpan };
}

/** xBounds are already transformed for logarithmic axes; interpolation stays in screen space. */
export function rectangleView(start: PlotPoint, end: PlotPoint, plot: PlotRectangle, xBounds: PlotBounds, yBounds: PlotBounds, minimumPixels = 6) {
  if (!(plot.width > 0 && plot.height > 0)) return null;
  const left = clamp(Math.min(start.x, end.x), plot.left, plot.left + plot.width);
  const right = clamp(Math.max(start.x, end.x), plot.left, plot.left + plot.width);
  const top = clamp(Math.min(start.y, end.y), plot.top, plot.top + plot.height);
  const bottom = clamp(Math.max(start.y, end.y), plot.top, plot.top + plot.height);
  if (right - left < minimumPixels || bottom - top < minimumPixels) return null;
  const x = (pixel: number) => xBounds.minimum + (pixel - plot.left) / plot.width * (xBounds.maximum - xBounds.minimum);
  const y = (pixel: number) => yBounds.maximum - (pixel - plot.top) / plot.height * (yBounds.maximum - yBounds.minimum);
  return { x: { minimum: x(left), maximum: x(right) }, y: { minimum: y(bottom), maximum: y(top) } };
}

export function distanceToSegment(point: PlotPoint, a: PlotPoint, b: PlotPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Hit test only the displayed polylines, within a bounded pixel tolerance. */
export function nearestPlotTrace(traces: readonly { id: string; points: readonly PlotPoint[]; strokeWidth?: number }[], point: PlotPoint, tolerance = 8) {
  let closest: string | null = null, distance = tolerance;
  let painted: string | null = null;
  for (const trace of traces) {
    let traceDistance = Infinity;
    for (let index = 0; index < trace.points.length; index++) {
      const a = trace.points[Math.max(0, index - 1)]!, b = trace.points[index]!;
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
      const candidate = distanceToSegment(point, a, b);
      traceDistance = Math.min(traceDistance, candidate);
      if (candidate < distance) { distance = candidate; closest = trace.id; }
    }
    // Later traces paint over earlier ones. A click within a visible stroke
    // must select that stroke even if an obscured centerline is nearer.
    if (trace.strokeWidth && traceDistance <= Math.min(tolerance, trace.strokeWidth / 2 + 0.5)) painted = trace.id;
  }
  return painted ?? closest;
}

/** A theme-only contrast adjustment preserves hue and the stored user color. */
export function instrumentTraceColor(color: string, theme: 'light' | 'dark') {
  if (!/^#[0-9a-f]{6}$/i.test(color) || theme === 'dark') return color;
  let rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const luminance = () => rgb.reduce((sum, channel, index) => {
    const value = channel / 255;
    return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!;
  }, 0);
  while (luminance() > 0.22) rgb = rgb.map((channel) => Math.floor(channel * 0.92));
  return '#' + rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('');
}
