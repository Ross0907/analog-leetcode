/** The cursor hotspot is the actual probe tip, independent of canvas zoom. */
export function probeCursor(kind: 'voltage' | 'current') {
  const color = kind === 'current' ? '#38bdf8' : '#fbbf24';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><path d="M2 37L16 23" stroke="#171a20" stroke-width="4"/><path d="M2 37L16 23M14 21L26 7Q29 4 32 7L34 9Q37 12 34 15L21 28Z M27 7L34 13" fill="${color}" fill-opacity=".15" stroke="${color}" stroke-width="2" stroke-linejoin="round"/><text x="29" y="35" font-family="sans-serif" font-size="10" font-weight="bold" fill="${color}">${kind === 'current' ? 'I' : 'V'}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 37, crosshair`;
}
