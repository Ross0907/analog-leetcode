import type { RefObject } from 'react';

export type InstrumentLegend = { name: string; color?: string; detail?: string };
type Plot = { element: HTMLCanvasElement | SVGSVGElement; label?: string };

async function svgImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(svg.clientWidth || 1000));
  clone.setAttribute('height', String(svg.clientHeight || 46));
  clone.style.color = getComputedStyle(svg).color;
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url;
    await image.decode(); return image;
  } finally { URL.revokeObjectURL(url); }
}

/** Exports only the selected instrument's rendered plots and real readouts, without document screenshots. */
export async function exportInstrumentPng({ title, theme, plots = [], legend = [], notes = [] }: {
  title: string; theme: 'light' | 'dark'; plots?: Plot[]; legend?: InstrumentLegend[]; notes?: string[];
}) {
  const width = Math.max(0, ...plots.map(plot => plot.element.clientWidth)) || 640;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const headerHeight = 56 + notes.length * 20 + legend.length * 22;
  const plotHeights = plots.map(plot => Math.max(plot.element instanceof SVGSVGElement ? 46 : 1, plot.element.clientHeight));
  const height = headerHeight + plotHeights.reduce((sum, item) => sum + item, 0) + plots.length * 26 + 16;
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d'); if (!context) throw new Error('PNG export is unavailable in this browser.');
  context.scale(scale, scale);
  const ink = theme === 'light' ? '#172033' : '#e5edf8';
  context.fillStyle = theme === 'light' ? '#ffffff' : '#101419'; context.fillRect(0, 0, width, height);
  context.fillStyle = ink; context.font = '600 18px system-ui'; context.fillText(title, 18, 28);
  let y = 52;
  context.font = '12px system-ui';
  for (const note of notes) { context.fillStyle = ink; context.fillText(note, 18, y, width - 36); y += 20; }
  for (const item of legend) {
    context.fillStyle = item.color ?? ink; context.fillRect(18, y - 8, 14, 3);
    context.fillStyle = ink; context.fillText(item.name + (item.detail ? ' · ' + item.detail : ''), 42, y, width - 60); y += 22;
  }
  y = headerHeight;
  // Snapshot every lane before awaiting SVG rasterization, so a live update
  // cannot mix different acquisitions in one exported instrument.
  const sources = await Promise.all(plots.map(plot => {
    if (plot.element instanceof SVGSVGElement) return svgImage(plot.element);
    const snapshot = document.createElement('canvas'); snapshot.width = plot.element.width; snapshot.height = plot.element.height;
    snapshot.getContext('2d')?.drawImage(plot.element, 0, 0);
    return snapshot;
  }));
  for (const [index, plot] of plots.entries()) {
    if (plot.label) { context.fillStyle = ink; context.fillText(plot.label, 18, y + 14); }
    y += 26;
    context.drawImage(sources[index]!, 0, y, width, plotHeights[index]!); y += plotHeights[index]!;
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to export this instrument.')), 'image/png'));
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function instrumentPlots(ref: RefObject<HTMLElement | null>): Plot[] {
  return [...(ref.current?.querySelectorAll<HTMLCanvasElement | SVGSVGElement>('canvas, svg[role="img"]') ?? [])].map(element => ({ element, label: element instanceof SVGSVGElement ? element.getAttribute('aria-label') ?? undefined : undefined }));
}
