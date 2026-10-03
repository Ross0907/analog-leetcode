"use client";

import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export type TraceAppearance = { color?: string; width?: number; offset?: number };
export type CaptureRequest = { minimumSamples: number; fftLength: number; reason: string };
type TraceSelection = { selectedTraceId: string | null; selectTrace: (id: string | null) => void };
const SelectionContext = createContext<TraceSelection | null>(null);

export function TraceSelectionProvider({ children, selectedTraceId, onSelectTrace }: { children: ReactNode; selectedTraceId?: string | null; onSelectTrace?: (id: string | null) => void }) {
  const [localId, setLocalId] = useState<string | null>(null);
  const value = useMemo(() => ({ selectedTraceId: selectedTraceId === undefined ? localId : selectedTraceId, selectTrace: (id: string | null) => { setLocalId(id); onSelectTrace?.(id); } }), [localId, selectedTraceId, onSelectTrace]);
  return <SelectionContext value={value}>{children}</SelectionContext>;
}

export function useTraceSelection() {
  const shared = use(SelectionContext);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  return shared ?? { selectedTraceId, selectTrace: setSelectedTraceId };
}
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

type PresentationState = { maximizedId: string | null; setMaximized: (id: string | null) => void };
const PresentationContext = createContext<PresentationState | null>(null);

export function InstrumentPresentationProvider({ children, onMaximizedChange }: { children: ReactNode; onMaximizedChange?: (maximized: boolean) => void }) {
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  useEffect(() => () => onMaximizedChange?.(false), [onMaximizedChange]);
  const value = useMemo(() => ({ maximizedId, setMaximized: (id: string | null) => { setMaximizedId(id); onMaximizedChange?.(id !== null); } }), [maximizedId, onMaximizedChange]);
  return <PresentationContext value={value}>{children}</PresentationContext>;
}

export function useInstrumentPanel(id: string) {
  const shared = use(PresentationContext);
  const [localMaximized, setLocalMaximized] = useState(false);
  const maximized = shared ? shared.maximizedId === id : localMaximized;
  return {
    maximized,
    hidden: Boolean(shared?.maximizedId && shared.maximizedId !== id && !shared.maximizedId.startsWith(id + ':')),
    toggleMaximized: () => { if (shared) shared.setMaximized(maximized ? null : id); else setLocalMaximized(!maximized); },
    restore: () => { shared?.setMaximized(null); setLocalMaximized(false); },
  };
}

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
function readTheme(): 'light' | 'dark' { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
export function useInstrumentTheme(): 'light' | 'dark' { return useSyncExternalStore<'light' | 'dark'>(subscribeTheme, readTheme, () => 'light'); }
