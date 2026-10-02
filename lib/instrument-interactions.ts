export type PlotPoint = { x: number; y: number };
export type PlotBounds = { minimum: number; maximum: number };
export type PlotRectangle = { left: number; top: number; width: number; height: number };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

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
export function nearestPlotTrace(traces: readonly { id: string; points: readonly PlotPoint[] }[], point: PlotPoint, tolerance = 8) {
  let closest: string | null = null, distance = tolerance;
  for (const trace of traces) {
    for (let index = 0; index < trace.points.length; index++) {
      const a = trace.points[Math.max(0, index - 1)]!, b = trace.points[index]!;
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
      const candidate = distanceToSegment(point, a, b);
      if (candidate < distance) { distance = candidate; closest = trace.id; }
    }
  }
  return closest;
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
