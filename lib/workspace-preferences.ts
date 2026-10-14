export const PREFERENCES_KEY = 'anacode.workspace.preferences.v1';
export const DEFAULT_PREFERENCES = { clickAction: 'reset' as 'reset' | 'cursor', fitKey: 'f', areaKey: 'z', centerKey: 'c', wheelMode: 'both' as 'both' | 'horizontal', compactDescription: true };
export type WorkspacePreferences = typeof DEFAULT_PREFERENCES;
export function parsePreferences(value: unknown): WorkspacePreferences {
  const p = value && typeof value === 'object' ? value as Partial<WorkspacePreferences> : {};
  const keys = [p.fitKey, p.areaKey, p.centerKey];
  const validKeys = keys.every(key => typeof key === 'string' && /^[a-z]$/.test(key)) && new Set(keys).size === 3;
  return { clickAction: p.clickAction === 'cursor' ? 'cursor' : 'reset', wheelMode: p.wheelMode === 'horizontal' ? 'horizontal' : 'both', compactDescription: p.compactDescription !== false,
    fitKey: validKeys ? p.fitKey! : 'f', areaKey: validKeys ? p.areaKey! : 'z', centerKey: validKeys ? p.centerKey! : 'c' };
}
