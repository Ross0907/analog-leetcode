export type WirePoint = { x: number; y: number };

/** Split the visible Manhattan route, preserving both halves exactly. */
export function splitWireRoute(points: readonly WirePoint[], cursor: WirePoint, grid = 10) {
  if (points.length < 2 || points.length > 512 || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return null;
  let nearest: { index: number; point: WirePoint; distance: number } | null = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
    if (a.x !== b.x && a.y !== b.y) return null;
    if (a.x === b.x && a.y === b.y) continue;
    const horizontal = a.y === b.y;
    const start = horizontal ? a.x : a.y;
    const end = horizontal ? b.x : b.y;
    const raw = horizontal ? cursor.x : cursor.y;
    const bounded = Math.max(Math.min(start, end), Math.min(Math.max(start, end), raw));
    const projected = horizontal ? { x: bounded, y: a.y } : { x: a.x, y: bounded };
    const distance = Math.hypot(projected.x - cursor.x, projected.y - cursor.y);
    if (!nearest || distance < nearest.distance) {
      // Snap only along the segment. Its fixed axis can be an off-grid pin
      // coordinate; rounding that axis would move the junction off its wire.
      const snapped = Math.max(Math.min(start, end), Math.min(Math.max(start, end), Math.round(bounded / grid) * grid));
      nearest = { index, point: horizontal ? { x: snapped, y: a.y } : { x: a.x, y: snapped }, distance };
    }
  }
  if (!nearest) return null;
  const { point, index } = nearest;
  const equal = (a: WirePoint, b: WirePoint) => a.x === b.x && a.y === b.y;
  const dedupe = (items: WirePoint[]) => items.filter((item, i) => i === 0 || !equal(item, items[i - 1]));
  const before = dedupe([...points.slice(0, index + 1), point]);
  const after = dedupe([point, ...points.slice(index + 1)]);
  return {
    point,
    atStart: equal(point, points[0]),
    atEnd: equal(point, points[points.length - 1]),
    beforeWaypoints: before.slice(1, -1),
    afterWaypoints: after.slice(1, -1),
  };
}
