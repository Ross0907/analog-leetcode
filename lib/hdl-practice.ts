export const HDL_PROGRESS_KEY = 'anacode-hdl-progress-v1';
export type HdlPracticeRecord = { passed: boolean; checks: number; failures: number; submittedAt: string };

export function parseHdlProgress(raw: string | null): Record<string, HdlPracticeRecord> {
  try {
    if (!raw || raw.length > 16384) return {};
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([slug, value]) => /^[a-z][a-z0-9-]{0,63}$/.test(slug) && value && typeof value === 'object' && typeof value.passed === 'boolean' && Number.isInteger(value.checks) && value.checks >= 0 && value.checks <= 1_000_000 && Number.isInteger(value.failures) && value.failures >= 0 && value.failures <= value.checks && typeof value.submittedAt === 'string' && Number.isFinite(Date.parse(value.submittedAt))).slice(0,100));
  } catch { return {}; }
}

/** Display only: local HDL practice never contributes to server-verified scores. */
export function saveHdlPractice(slug: string, record: HdlPracticeRecord) {
  try {
    const progress = parseHdlProgress(localStorage.getItem(HDL_PROGRESS_KEY));
    progress[slug] = record;
    localStorage.setItem(HDL_PROGRESS_KEY, JSON.stringify(progress));
    window.dispatchEvent(new Event('anacode-hdl-progress'));
  } catch { /* Simulation remains available when browser storage is disabled. */ }
}

export function hdlFailureExamples(log: string) {
  return log.split(/\r?\n/).flatMap(line => {
    const match = /^(PASS|FAIL): (.*?) at (\d+)(?: \(check (\d+)\))?$/.exec(line);
    return match ? [{ passed: match[1] === 'PASS', description: match[2], time: match[3], index: match[4] ? Number(match[4]) : undefined }] : [];
  }).slice(0,24);
}

export function hdlDiagnostics(log: string) {
  return log.split(/\r?\n/).flatMap(line => {
    const match = /(?:^|\/)(design|tb)\.v:(\d+):\s*(.*)/.exec(line);
    return match ? [{ file: match[1] === 'tb' ? 'testbench' as const : 'design' as const, line: Number(match[2]), message: match[3] }] : [];
  }).slice(0,30);
}
