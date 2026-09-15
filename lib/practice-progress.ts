export const PRACTICE_PROGRESS_KEY = "anacode-practice-solved-v1";
export function readPracticeProgress(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(PRACTICE_PROGRESS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((slug): slug is string => typeof slug === "string" && /^[a-z0-9-]{1,80}$/.test(slug)).slice(0, 500) : [];
  } catch { return []; }
}
export function markPracticeSolved(slug: string) {
  try {
    window.localStorage.setItem(PRACTICE_PROGRESS_KEY, JSON.stringify([...new Set([...readPracticeProgress(), slug])]));
    window.dispatchEvent(new Event("anacode-progress"));
  } catch { /* Answers can still be checked when browser storage is disabled. */ }
}
