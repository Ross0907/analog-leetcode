/** Identity-based colors stay fixed when neighboring probes are removed. */
export function probeColor(id: string): string {
  const palette = ["#ffd33d", "#22c7df", "#f15b64", "#7ed957", "#ff9238", "#b48cff", "#f4a3df", "#3f8cff", "#9ee8b7", "#e8c1a0", "#a0b4f0", "#f1ef98"];
  let hash = 2166136261;
  for (const char of id.toLowerCase()) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return palette[(hash >>> 0) % palette.length]!;
}

export const TRACE_PALETTE = ['#ffd33d','#22c7df','#f15b64','#7ed957','#ff9238','#b48cff','#f4a3df','#3f8cff','#9ee8b7','#e8c1a0','#a0b4f0','#f1ef98'];
export function distinctTraceColors(keys: readonly string[], preferred: Record<string,string> = {}) {
  const reserved = Object.values(preferred);
  const result: Record<string,string> = {}, used = new Set(reserved.map(color=>color.toLowerCase()));
  // Native probes and instruments use different palettes. Reserve nearby shades
  // too, so amber #fbbf24 does not receive an almost identical #ffd33d neighbor.
  const separatedFromProbes = (color:string) => reserved.every(other => {
    if (!/^#[0-9a-f]{6}$/i.test(other)) return true;
    return Math.hypot(...[1,3,5].map(offset => parseInt(color.slice(offset,offset+2),16)-parseInt(other.slice(offset,offset+2),16))) >= 90;
  });
  for(const key of new Set(keys)) {
    if(preferred[key]) { result[key]=preferred[key]; continue; }
    const color=TRACE_PALETTE.find(color=>!used.has(color.toLowerCase()) && separatedFromProbes(color)) ?? '#' + [0,2,4].map((offset)=>Math.round(155+80*Math.cos((Object.keys(result).length*2.39996)+offset)).toString(16).padStart(2,'0')).join('');
    result[key]=color; used.add(color.toLowerCase());
  }
  return result;
}
