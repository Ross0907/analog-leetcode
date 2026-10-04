export type HsvColor = { h: number; s: number; v: number };
const clamp = (value: number, limit: number) => Math.max(0, Math.min(limit, value));
export function normalizeHexColor(value: string): string | null {
  const match = value.trim().match(/^#?([\da-f]{6}|[\da-f]{3})$/i);
  if (!match) return null;
  const hex = match[1]!.toLowerCase();
  return '#' + (hex.length === 3 ? [...hex].map(digit => digit + digit).join('') : hex);
}
export function hexToHsv(value: string): HsvColor {
  const hex = normalizeHexColor(value) ?? '#000000';
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r!, g!, b!), min = Math.min(r!, g!, b!), delta = max - min;
  const h = delta === 0 ? 0 : max === r ? ((g! - b!) / delta + 6) % 6 : max === g ? (b! - r!) / delta + 2 : (r! - g!) / delta + 4;
  return { h: h * 60, s: max ? delta / max * 100 : 0, v: max * 100 };
}
export function hsvToHex({ h, s, v }: HsvColor): string {
  const hue = ((h % 360) + 360) % 360 / 60, saturation = clamp(s, 100) / 100, value = clamp(v, 100) / 100;
  const c = value * saturation, x = c * (1 - Math.abs(hue % 2 - 1)), m = value - c;
  const rgb = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
  return '#' + rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('');
}
