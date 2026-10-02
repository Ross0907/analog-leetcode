/** Presentation for repository-authored native CircuitJS starter documents only.
 * Rails become ordinary, vertically drawn VoltageElm sources with a ground
 * return. Native named nets retain their actual connectivity. Student files are
 * never rewritten and floating two-terminal sources are never grounded here.
 */
export function textbookLessonSources(circuit: string): string {
  const lines = circuit.trim().split(/\r?\n/);
  const records = lines.map(line => line.trim().split(/\s+/));
  const rails = records.flatMap((fields, index) => fields[0] === 'R' ? [{ fields, index }] : []);
  if (!rails.length) return circuit;
  const coordinates = records.filter(fields => !fields[0].startsWith('$') && fields.length >= 6).map(fields => ({ x: Number(fields[1]), y: Number(fields[2]) })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  const left = Math.min(...coordinates.map(point => point.x)) - 160;
  const top = Math.min(...coordinates.map(point => point.y));
  const usedNames = new Set(records.filter(fields => fields[0] === '207').map(fields => fields[6]));
  const added: string[] = [];
  rails.forEach(({ fields, index }, order) => {
    const [oldX, oldY] = fields.slice(1, 3).map(Number);
    const existing = records.find(candidate => candidate[0] === '207' && Number(candidate[1]) === oldX && Number(candidate[2]) === oldY);
    let name = existing?.[6];
    if (!name) { let suffix = order + 1; while (usedNames.has(`source${suffix}`)) suffix++; name = `source${suffix}`; usedNames.add(name); }
    const x = left - (order % 2) * 144, y = top + Math.floor(order / 2) * 192;
    // A rail's post is its positive terminal. A native voltage source's
    // second post is positive, so the first post goes below it to ground.
    lines[index] = ['v', x, y + 128, x, y, fields[5], ...fields.slice(6)].join(' ');
    added.push(`g ${x} ${y + 128} ${x} ${y + 160} 0`, `207 ${x} ${y} ${x} ${y - 48} 0 ${name}`);
    if (!existing) added.push(`207 ${oldX} ${oldY} ${oldX - 48} ${oldY} 0 ${name}`);
  });
  return [...lines, ...added, ''].join('\n');
}
