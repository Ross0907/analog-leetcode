"use client";
import { useSyncExternalStore } from 'react';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, parsePreferences, type WorkspacePreferences } from '../../lib/workspace-preferences';
let raw: string | null = null, cached = DEFAULT_PREFERENCES;
function snapshot() {
  try { const next = localStorage.getItem(PREFERENCES_KEY); if (next !== raw) { raw = next; cached = parsePreferences(JSON.parse(next || 'null')); } } catch { /* Private storage keeps defaults. */ }
  return cached;
}
function subscribe(callback: () => void) { window.addEventListener('storage', callback); window.addEventListener('anacode-preferences', callback); return () => { window.removeEventListener('storage', callback); window.removeEventListener('anacode-preferences', callback); }; }
export function savePreferences(value: WorkspacePreferences) { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(parsePreferences(value))); window.dispatchEvent(new Event('anacode-preferences')); }
export function useWorkspacePreferences() { return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFERENCES); }
