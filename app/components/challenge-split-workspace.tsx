"use client";

/* eslint-disable jsx-a11y-x/no-noninteractive-element-interactions, jsx-a11y-x/no-noninteractive-tabindex -- ARIA separators become interactive when they expose a value and keyboard controls. */

import { Children, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

const STORAGE_KEY = "anacode-challenge-split";
const MIN_PERCENT = 22;
const MAX_PERCENT = 58;
const DEFAULT_PERCENT = 32;
type ProblemMode = "expanded" | "compact" | "collapsed";
const subscribeHydration = () => () => {};

export function ChallengeSplitWorkspace({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  // The layout intentionally normalizes its fixed problem/workspace child slots.
  // eslint-disable-next-line @eslint-react/no-children-to-array
  const panes = Children.toArray(children);
  const [problemPercent, setProblemPercent] = useState(DEFAULT_PERCENT);
  const [problemMode, setProblemMode] = useState<ProblemMode>("expanded");
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | null>(null);
  const latestPercentRef = useRef(DEFAULT_PERCENT);

  useEffect(() => {
    let saved = DEFAULT_PERCENT;
    let mode: ProblemMode = "expanded";
    try {
      const width = Number(window.localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(width) && width >= MIN_PERCENT && width <= MAX_PERCENT) saved = width;
      const preference = window.localStorage.getItem(`${STORAGE_KEY}-mode`);
      if (preference === "compact" || preference === "collapsed") mode = preference;
    } catch { /* Private browser sessions can disable storage. */ }
    const timer = window.setTimeout(() => {
      latestPercentRef.current = saved;
      setProblemPercent(saved);
      setProblemMode(mode);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function updateFromClientX(clientX: number) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const next = clamp(((clientX - bounds.left) / bounds.width) * 100, MIN_PERCENT, MAX_PERCENT);
    latestPercentRef.current = next;
    setProblemPercent(next);
  }

  function finishResize(pointerId: number) {
    if (draggingRef.current !== pointerId) return;
    draggingRef.current = null;
    persist(STORAGE_KEY, latestPercentRef.current.toFixed(2));
  }

  return (
    <>
    <div className="problem-pane-controls" role="group" aria-label="Problem description size">
      <span>Problem</span>
      {(["expanded", "compact", "collapsed"] as const).map((mode) => (
        <button key={mode} type="button" disabled={!hydrated} aria-pressed={problemMode === mode}
          aria-controls="problem-description-pane" onClick={() => {
            setProblemMode(mode);
            persist(`${STORAGE_KEY}-mode`, mode);
          }}>{mode === "expanded" ? "Expand description" : mode === "compact" ? "Compact description" : "Hide description"}</button>
      ))}
    </div>
    <div
      ref={containerRef}
      className="challenge-workspace"
      data-problem-mode={problemMode}
      style={{ "--problem-pane-percent": `${problemPercent}%` } as CSSProperties}
    >
      <div id="problem-description-pane" className="problem-pane-container" hidden={problemMode === "collapsed"}>{panes[0]}</div>
      <div
        className="challenge-splitter"
        hidden={problemMode === "collapsed"}
        role="separator"
        tabIndex={0}
        aria-label="Resize problem and schematic panes"
        aria-orientation="vertical"
        aria-valuemin={MIN_PERCENT}
        aria-valuemax={MAX_PERCENT}
        aria-valuenow={Math.round(problemPercent)}
        onDoubleClick={() => {
          setProblemPercent(DEFAULT_PERCENT);
          latestPercentRef.current = DEFAULT_PERCENT;
          persist(STORAGE_KEY, String(DEFAULT_PERCENT));
        }}
        onPointerDown={(event) => {
          draggingRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromClientX(event.clientX);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current === event.pointerId) updateFromClientX(event.clientX);
        }}
        onPointerUp={(event) => finishResize(event.pointerId)}
        onPointerCancel={(event) => finishResize(event.pointerId)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home") return;
          event.preventDefault();
          const next = event.key === "Home"
            ? DEFAULT_PERCENT
            : clamp(problemPercent + (event.key === "ArrowLeft" ? -2 : 2), MIN_PERCENT, MAX_PERCENT);
          latestPercentRef.current = next;
          setProblemPercent(next);
          persist(STORAGE_KEY, String(next));
        }}
      >
        <span aria-hidden="true" />
      </div>
      {panes[1]}
    </div>
    </>
  );
}

function persist(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* Resizing still works without storage. */ }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
