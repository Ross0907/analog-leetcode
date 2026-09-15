"use client";

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- ARIA separators become interactive when they expose a value and keyboard controls. */

import { Children, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const STORAGE_KEY = "anacode-challenge-split";
const MIN_PERCENT = 22;
const MAX_PERCENT = 58;
const DEFAULT_PERCENT = 32;

export function ChallengeSplitWorkspace({ children }: { children: ReactNode }) {
  const panes = Children.toArray(children);
  const [problemPercent, setProblemPercent] = useState(DEFAULT_PERCENT);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | null>(null);
  const latestPercentRef = useRef(DEFAULT_PERCENT);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    if (!Number.isFinite(saved) || saved < MIN_PERCENT || saved > MAX_PERCENT) return;
    const timer = window.setTimeout(() => {
      latestPercentRef.current = saved;
      setProblemPercent(saved);
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
    window.localStorage.setItem(STORAGE_KEY, latestPercentRef.current.toFixed(2));
  }

  return (
    <div
      ref={containerRef}
      className="challenge-workspace"
      style={{ "--problem-pane-percent": `${problemPercent}%` } as CSSProperties}
    >
      {panes[0]}
      <div
        className="challenge-splitter"
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
          window.localStorage.setItem(STORAGE_KEY, String(DEFAULT_PERCENT));
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
          window.localStorage.setItem(STORAGE_KEY, String(next));
        }}
      >
        <span aria-hidden="true" />
      </div>
      {panes[1]}
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
