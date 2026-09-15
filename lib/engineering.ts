const SUFFIXES: Record<string, number> = {
  t: 1e12,
  g: 1e9,
  meg: 1e6,
  k: 1e3,
  m: 1e-3,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
};

export function parseEngineeringNumber(input: string): number | null {
  const match = input.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(meg|[tgkmunpf])?$/i);
  if (!match) return null;
  const base = Number(match[1]);
  const multiplier = match[2] ? SUFFIXES[match[2].toLowerCase()] : 1;
  const value = base * multiplier;
  return Number.isFinite(value) ? value : null;
}

export function formatEngineering(value: number, unit = ""): string {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  const ranges: Array<[number, string]> = [
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
  ];
  const [scale, prefix] = ranges.find(([candidate]) => absolute >= candidate) ?? [1e-15, "f"];
  const scaled = value / scale;
  return `${Number(scaled.toPrecision(4))} ${prefix}${unit}`.trim();
}

export function extractComponentValue(netlist: string, component: string): number | null {
  const escaped = component.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = netlist.match(new RegExp(`^\\s*${escaped}\\s+\\S+\\s+\\S+\\s+([^\\s;]+)`, "im"));
  return match ? parseEngineeringNumber(match[1]) : null;
}
