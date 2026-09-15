/** Identity-based colors stay fixed when neighboring probes are removed. */
export function probeColor(id: string): string {
  const palette = ["#ffd33d", "#22c7df", "#f15b64", "#7ed957", "#ff9238", "#b48cff", "#f4a3df", "#3f8cff", "#9ee8b7", "#e8c1a0", "#a0b4f0", "#f1ef98"];
  let hash = 2166136261;
  for (const char of id.toLowerCase()) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return palette[(hash >>> 0) % palette.length]!;
}
