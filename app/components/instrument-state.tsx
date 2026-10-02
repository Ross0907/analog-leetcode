"use client";

import { createContext, use, useMemo, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export type TraceAppearance = { color?: string; width?: number };
type AppearanceState = [Record<string, TraceAppearance>, Dispatch<SetStateAction<Record<string, TraceAppearance>>>];
const AppearanceContext = createContext<AppearanceState | null>(null);

export function TraceAppearanceProvider({ children }: { children: ReactNode }) {
  const [appearances, setAppearances] = useState<Record<string, TraceAppearance>>({});
  const state = useMemo<AppearanceState>(() => [appearances, setAppearances], [appearances]);
  return <AppearanceContext value={state}>{children}</AppearanceContext>;
}

export function useTraceAppearance() {
  const shared = use(AppearanceContext);
  const [appearances, setAppearances] = useState<Record<string, TraceAppearance>>({});
  return shared ?? [appearances, setAppearances] as AppearanceState;
}

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
function readTheme(): 'light' | 'dark' { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
export function useInstrumentTheme(): 'light' | 'dark' { return useSyncExternalStore<'light' | 'dark'>(subscribeTheme, readTheme, () => 'light'); }
