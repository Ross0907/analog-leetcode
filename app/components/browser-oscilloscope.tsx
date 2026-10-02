"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Activity, Download, Eye, EyeOff, Layers, Maximize2, Minimize2, RotateCcw, SlidersHorizontal, Zap } from "lucide-react";
import { crossings, interpolateWaveform, measureWaveform } from "../../lib/waveform-analysis";
import { probeColor } from "../../lib/probe-colors";
import { rectangleView, nearestPlotTrace, instrumentTraceColor, fitTimeWindow, stackedTraceOffsets, type PlotPoint, type TimeWindowMode } from "../../lib/instrument-interactions";
import { useInstrumentTheme, useTraceAppearance, useInstrumentPanel } from "./instrument-state";
import { TraceContextMenu } from "./trace-context-menu";
import { exportInstrumentPng } from "./instrument-export";

export type OscilloscopeDomain = "time" | "frequency" | "sweep";
export type OscilloscopeCoupling = "DC" | "AC";
export type OscilloscopeTriggerEdge = "rising" | "falling";
export type OscilloscopeScale = number | "auto";

export interface OscilloscopeTrace {
  /** Stable channel identifier. */
  id: string;
  /** Human-readable channel name, for example V(out). */
  name: string;
  values: ArrayLike<number>;
  /** Hex color. Invalid values fall back to the channel palette. */
  color?: string;
  lineWidth?: number;
  displayOffset?: number;
  unit?: string;
  initiallyVisible?: boolean;
  initialCoupling?: OscilloscopeCoupling;
}

export interface OscilloscopeTrigger {
  channelId: string;
  level: number;
  edge: OscilloscopeTriggerEdge;
}

export interface OscilloscopeCursorReadout {
  cursorA: number;
  cursorB: number;
  deltaX: number;
  reciprocalDeltaX: number | null;
}

export interface BrowserOscilloscopeProps {
  x: ArrayLike<number>;
  traces: readonly OscilloscopeTrace[];
  domain?: OscilloscopeDomain;
  /** Defaults to linear for time data and logarithmic for frequency data. */
  xScale?: "linear" | "log";
  xLabel?: string;
  xUnit?: string;
  yLabel?: string;
  yUnit?: string;
  title?: string;
  height?: number;
  className?: string;
  initialXPerDivision?: OscilloscopeScale;
  initialYPerDivision?: OscilloscopeScale;
  initialTrigger?: Partial<OscilloscopeTrigger>;
  initialCursors?: readonly [number, number];
  maxDevicePixelRatio?: number;
  maxChannels?: number;
  maxSamples?: number;
  instrumentId?: string;
  recordDuration?: number;
  onAutoSet?: () => void;
  onTriggerChange?: (trigger: OscilloscopeTrigger) => void;
  onCursorsChange?: (cursors: OscilloscopeCursorReadout) => void;
}

type Point = { x: number; transformedX: number; y: number };

type PreparedTrace = {
  id: string;
  name: string;
  unit: string;
  color: string;
  lineWidth: number;
  displayOffset: number;
  coupling: OscilloscopeCoupling;
  points: Point[];
  measurements: TraceMeasurements;
};

type TraceMeasurements = {
  minimum: number | null;
  maximum: number | null;
  peakToPeak: number | null;
  mean: number | null;
  rms: number | null;
  frequency: number | null;
  peakAt: number | null;
  dutyCycle: number | null;
};

type PlotRect = { left: number; top: number; width: number; height: number };

const CHANNEL_COLORS = ["#ffd33d", "#22c7df", "#f15b64", "#7ed957", "#ff9238", "#b48cff", "#f4f4f5", "#3f8cff"];
const HORIZONTAL_DIVISIONS = 10;
const VERTICAL_DIVISIONS = 8;

/**
 * A solver-agnostic oscilloscope display. It never evaluates circuit input and
 * accepts only numeric samples, so it can be shared by browser previews and
 * authoritative simulation results.
 */
export function BrowserOscilloscope({
  x,
  traces,
  domain = "time",
  xScale,
  xLabel,
  xUnit,
  yLabel = "Amplitude",
  yUnit = "V",
  title = "Oscilloscope",
  height = 410,
  className,
  initialXPerDivision = "auto",
  initialYPerDivision = "auto",
  initialTrigger,
  initialCursors = [0.25, 0.75],
  maxDevicePixelRatio = 2,
  maxChannels = 32,
  maxSamples = 250_000,
  onTriggerChange,
  onCursorsChange,
  instrumentId,
  recordDuration,
  onAutoSet,
}: BrowserOscilloscopeProps) {
  const controlId = useId();
  const theme = useInstrumentTheme();
  const panel = useInstrumentPanel(instrumentId ?? controlId);
  const [timeWindow, setTimeWindow] = useState<TimeWindowMode>('elapsed');
  const [exportError, setExportError] = useState<string | null>(null);
  const [appearances, setAppearances] = useTraceAppearance();
  const [traceMenu, setTraceMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const closeTraceMenu = useCallback(() => setTraceMenu(null), []);
  const [selection, setSelection] = useState<{ start: PlotPoint; end: PlotPoint } | null>(null);
  const selectionRef = useRef<{ start: PlotPoint; end: PlotPoint; xView: { minimum: number; maximum: number }; yBounds: { minimum: number; maximum: number } } | null>(null);
  const [yCenter, setYCenter] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const plotRectRef = useRef<PlotRect | null>(null);
  const draggingCursorRef = useRef<"a" | "b" | null>(null);
  const panningRef = useRef<{ clientX: number; center: number } | null>(null);
  const [xCenter, setXCenter] = useState<number | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [viewportWidth, setViewportWidth] = useState(760);
  const [xPerDivision, setXPerDivision] = useState<number | null>(() => toScaleState(initialXPerDivision));
  const [yPerDivision, setYPerDivision] = useState<number | null>(() => toScaleState(initialYPerDivision));
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(traces.map((trace) => [trace.id, trace.initiallyVisible !== false])),
  );
  const [couplings, setCouplings] = useState<Record<string, OscilloscopeCoupling>>(() =>
    Object.fromEntries(traces.map((trace) => [trace.id, trace.initialCoupling ?? "DC"])),
  );
  const [triggerChannel, setTriggerChannel] = useState(initialTrigger?.channelId ?? traces[0]?.id ?? "");
  const [triggerLevel, setTriggerLevel] = useState<number | null>(
    Number.isFinite(initialTrigger?.level) ? Number(initialTrigger?.level) : null,
  );
  const [triggerEdge, setTriggerEdge] = useState<OscilloscopeTriggerEdge>(initialTrigger?.edge ?? "rising");
  const [cursorA, setCursorA] = useState(() => clamp(initialCursors[0], 0, 1));
  const [cursorB, setCursorB] = useState(() => clamp(initialCursors[1], 0, 1));
  const [yCursorA, setYCursorA] = useState(0.25);
  const [yCursorB, setYCursorB] = useState(0.75);

  const effectiveXScale = xScale ?? (domain === "frequency" ? "log" : "linear");
  const effectiveXUnit = xUnit ?? (domain === "time" ? "s" : domain === "frequency" ? "Hz" : "");
  const effectiveXLabel = xLabel ?? (domain === "time" ? "Time" : domain === "frequency" ? "Frequency" : "Sweep");
  const channelLimit = clamp(Math.trunc(maxChannels), 1, 32);
  const sampleLimit = clamp(Math.trunc(maxSamples), 1_000, 1_000_000);
  const boundedHeight = clamp(panel.maximized ? 540 : height, 260, 720);
  const activeTraces = useMemo(() => traces.length > channelLimit ? [] : traces.filter((trace) => !removed.has(trace.id)).map((trace) => ({ ...trace, name: names[trace.id] ?? trace.name, color: instrumentTraceColor(safeColor(appearances[trace.id]?.color ?? trace.color, probeColor(trace.id)), theme), lineWidth: appearances[trace.id]?.width ?? trace.lineWidth ?? 1.7, displayOffset: appearances[trace.id]?.offset ?? trace.displayOffset ?? 0 })), [channelLimit, traces, removed, names, appearances, theme]);
  const resolvedVisibility = useMemo(
    () => Object.fromEntries(activeTraces.map((trace) => [trace.id, visibility[trace.id] ?? trace.initiallyVisible !== false])),
    [activeTraces, visibility],
  );
  const resolvedCouplings = useMemo(
    () => Object.fromEntries(activeTraces.map((trace) => [trace.id, couplings[trace.id] ?? trace.initialCoupling ?? "DC"])),
    [activeTraces, couplings],
  );

  const xBounds = useMemo(
    () => {
      const bounds = findDomainBounds(x, effectiveXScale, sampleLimit);
      if (domain !== 'time' || effectiveXScale !== 'linear') return bounds;
      const view = fitTimeWindow({ minimum: bounds.minimum, maximum: bounds.maximum }, timeWindow, recordDuration);
      return { minimum: view.minimum, maximum: view.maximum, transformedMin: view.minimum, transformedMax: view.maximum };
    },
    [x, domain, effectiveXScale, sampleLimit, timeWindow, recordDuration],
  );
  const fullTransformedSpan = Math.max(xBounds.transformedMax - xBounds.transformedMin, Number.EPSILON);
  const xView = useMemo(() => {
    const requestedSpan = xPerDivision === null ? fullTransformedSpan : xPerDivision * HORIZONTAL_DIVISIONS;
    const span = clamp(requestedSpan, fullTransformedSpan * 1e-9, fullTransformedSpan);
    const center = clamp(xCenter ?? (xBounds.transformedMin + xBounds.transformedMax) / 2, xBounds.transformedMin + span / 2, xBounds.transformedMax - span / 2);
    return { minimum: center - span / 2, maximum: center + span / 2 };
  }, [fullTransformedSpan, xBounds.transformedMax, xBounds.transformedMin, xPerDivision, xCenter]);

  const preparedTraces = useMemo(
    () => prepareTraces({
      traces: activeTraces,
      x,
      xScale: effectiveXScale,
      xView,
      visibility: resolvedVisibility,
      couplings: resolvedCouplings,
      fallbackUnit: yUnit,
      sampleLimit,
      domain,
    }),
    [activeTraces, domain, effectiveXScale, resolvedCouplings, resolvedVisibility, sampleLimit, x, xView, yUnit],
  );

  const yBounds = useMemo(() => {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const trace of preparedTraces) {
      if (trace.measurements.minimum !== null) minimum = Math.min(minimum, trace.measurements.minimum + trace.displayOffset);
      if (trace.measurements.maximum !== null) maximum = Math.max(maximum, trace.measurements.maximum + trace.displayOffset);
    }
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return { minimum: -1, maximum: 1 };
    const rawSpan = Math.max(maximum - minimum, Math.max(Math.abs(minimum), Math.abs(maximum), 1) * 1e-9);
    if (yPerDivision !== null) {
      const center = yCenter ?? (minimum + maximum) / 2;
      const span = yPerDivision * VERTICAL_DIVISIONS;
      return { minimum: center - span / 2, maximum: center + span / 2 };
    }
    const padding = rawSpan * 0.1;
    return { minimum: minimum - padding, maximum: maximum + padding };
  }, [preparedTraces, yPerDivision, yCenter]);

  const effectiveTriggerChannel = activeTraces.some((trace) => trace.id === triggerChannel)
    ? triggerChannel
    : activeTraces[0]?.id ?? "";
  const automaticTriggerLevel = useMemo(() => {
    const target = preparedTraces.find((trace) => trace.id === effectiveTriggerChannel);
    return target?.measurements.mean ?? (yBounds.minimum + yBounds.maximum) / 2;
  }, [effectiveTriggerChannel, preparedTraces, yBounds.maximum, yBounds.minimum]);
  const effectiveTriggerLevel = triggerLevel ?? automaticTriggerLevel;
  const triggerDisplayOffset = preparedTraces.find(trace => trace.id === effectiveTriggerChannel)?.displayOffset ?? 0;
  const triggerColor = preparedTraces.find((trace) => trace.id === effectiveTriggerChannel)?.color
    ?? activeTraces.find((trace) => trace.id === effectiveTriggerChannel)?.color
    ?? CHANNEL_COLORS[0];

  const cursorReadout = useMemo(() => {
    const a = inverseTransformX(xView.minimum + cursorA * (xView.maximum - xView.minimum), effectiveXScale);
    const b = inverseTransformX(xView.minimum + cursorB * (xView.maximum - xView.minimum), effectiveXScale);
    const delta = Math.abs(b - a);
    return {
      cursorA: a,
      cursorB: b,
      deltaX: delta,
      reciprocalDeltaX: domain === "time" && delta > 0 ? 1 / delta : null,
    } satisfies OscilloscopeCursorReadout;
  }, [cursorA, cursorB, domain, effectiveXScale, xView.maximum, xView.minimum]);

  const xScaleOptions = useMemo(
    () => [...new Set([...buildScaleOptions(fullTransformedSpan / HORIZONTAL_DIVISIONS), ...(xPerDivision ? [xPerDivision] : [])])].sort((a, b) => a - b),
    [fullTransformedSpan, xPerDivision],
  );
  const automaticYPerDivision = (yBounds.maximum - yBounds.minimum) / VERTICAL_DIVISIONS;
  const yScaleOptions = useMemo(
    () => [...new Set([...buildScaleOptions(automaticYPerDivision), ...(yPerDivision ? [yPerDivision] : [])])].sort((a, b) => a - b),
    [automaticYPerDivision, yPerDivision],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = () => {
      const measuredWidth = viewport.getBoundingClientRect().width;
      // A hidden tab has no measurable width. Keep its last valid acquisition
      // size until ResizeObserver sees the visible viewport again.
      if (measuredWidth <= 0) return;
      const nextWidth = Math.max(1, Math.floor(measuredWidth));
      setViewportWidth((current) => current === nextWidth ? current : nextWidth);
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onCursorsChange?.(cursorReadout);
  }, [cursorReadout, onCursorsChange]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = clamp(window.devicePixelRatio || 1, 1, clamp(maxDevicePixelRatio, 1, 3));
    const measuredWidth = viewportRef.current?.getBoundingClientRect().width ?? 0;
    const width = measuredWidth > 0 ? Math.max(1, Math.floor(measuredWidth)) : viewportWidth;
    const canvasHeight = boundedHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(canvasHeight * dpr));
    // The layout stays responsive independently of the backing bitmap. A
    // deferred resize must never leave a narrow canvas in a full-width panel.
    canvas.style.width = "100%";
    canvas.style.height = `${canvasHeight}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const plot = makePlotRect(width, canvasHeight);
    plotRectRef.current = plot;
    drawOscilloscope({
      context,
      width,
      height: canvasHeight,
      plot,
      traces: preparedTraces,
      xView,
      yBounds,
      xScale: effectiveXScale,
      xUnit: effectiveXUnit,
      yUnit,
      cursorA,
      cursorB,
      triggerLevel: effectiveTriggerLevel + triggerDisplayOffset,
      triggerColor: safeColor(triggerColor, CHANNEL_COLORS[0]),
      triggerEdge,
      theme,
      showTrigger: domain === "time",
    });
    context.save();
    context.strokeStyle = theme === "dark" ? "#9aa7b7" : "#718096";
    context.setLineDash([2, 6]);
    for (const position of [yCursorA, yCursorB]) {
      const y = plot.top + (1 - position) * plot.height;
      context.beginPath(); context.moveTo(plot.left, y); context.lineTo(plot.left + plot.width, y); context.stroke();
    }
    context.restore();
  }, [
    boundedHeight,
    theme,
    domain,
    cursorA,
    cursorB,
    effectiveTriggerLevel,
    triggerDisplayOffset,
    effectiveXScale,
    effectiveXUnit,
    maxDevicePixelRatio,
    preparedTraces,
    triggerColor,
    triggerEdge,
    viewportWidth,
    xView,
    yBounds,
    yUnit,
    yCursorA,
    yCursorB,
  ]);

  function updateTrigger(next: Partial<OscilloscopeTrigger>) {
    const resolved: OscilloscopeTrigger = {
      channelId: next.channelId ?? effectiveTriggerChannel,
      level: next.level ?? effectiveTriggerLevel,
      edge: next.edge ?? triggerEdge,
    };
    if (next.channelId !== undefined) setTriggerChannel(next.channelId);
    if (next.level !== undefined) setTriggerLevel(next.level);
    if (next.edge !== undefined) setTriggerEdge(next.edge);
    onTriggerChange?.(resolved);
  }

  function resetView() {
    setXPerDivision(null);
    setXCenter(null);
    setYPerDivision(null);
    setYCenter(null);
    setSelection(null); selectionRef.current = null;
    setTriggerLevel(null);
    setCursorA(0.25);
    setCursorB(0.75);
    setYCursorA(0.25);
    setYCursorB(0.75);
  }

  function updateCursorFromPointer(event: ReactPointerEvent<HTMLCanvasElement>, cursor: "a" | "b") {
    const canvas = canvasRef.current;
    const plot = plotRectRef.current;
    if (!canvas || !plot) return;
    const bounds = canvas.getBoundingClientRect();
    const canvasX = event.clientX - bounds.left;
    const normalized = clamp((canvasX - plot.left) / plot.width, 0, 1);
    if (cursor === "a") setCursorA(normalized);
    else setCursorB(normalized);
  }

  function canvasPoint(event: { clientX: number; clientY: number }) {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current, plot = plotRectRef.current;
    if (!canvas || !plot || event.button === 2) return;
    const point = canvasPoint(event);
    if (point.x < plot.left || point.x > plot.left + plot.width || point.y < plot.top || point.y > plot.top + plot.height) return;
    event.preventDefault(); closeTraceMenu(); canvas.setPointerCapture(event.pointerId);
    if (event.button === 1 || event.shiftKey) {
      panningRef.current = { clientX: event.clientX, center: (xView.minimum + xView.maximum) / 2 };
    } else if (event.altKey) {
      const normalized = (point.x - plot.left) / plot.width;
      const cursor = Math.abs(normalized - cursorA) <= Math.abs(normalized - cursorB) ? "a" : "b";
      draggingCursorRef.current = cursor; updateCursorFromPointer(event, cursor);
    } else {
      selectionRef.current = { start: point, end: point, xView, yBounds };
      setSelection({ start: point, end: point });
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (panningRef.current && plotRectRef.current) {
      setXCenter(panningRef.current.center - (event.clientX - panningRef.current.clientX) / plotRectRef.current.width * (xView.maximum - xView.minimum));
    } else if (draggingCursorRef.current) updateCursorFromPointer(event, draggingCursorRef.current);
    else if (selectionRef.current && plotRectRef.current) {
      const point = canvasPoint(event), plot = plotRectRef.current;
      const end = { x: clamp(point.x, plot.left, plot.left + plot.width), y: clamp(point.y, plot.top, plot.top + plot.height) };
      selectionRef.current.end = end; setSelection({ start: selectionRef.current.start, end });
    }
  }

  function stopDragging(event: ReactPointerEvent<HTMLCanvasElement>) {
    const selected = selectionRef.current;
    if (selected && plotRectRef.current && event.type !== 'pointercancel') {
      const view = rectangleView(selected.start, selected.end, plotRectRef.current, selected.xView, selected.yBounds);
      if (view) {
        setXCenter((view.x.minimum + view.x.maximum) / 2); setXPerDivision((view.x.maximum - view.x.minimum) / HORIZONTAL_DIVISIONS);
        setYCenter((view.y.minimum + view.y.maximum) / 2); setYPerDivision((view.y.maximum - view.y.minimum) / VERTICAL_DIVISIONS);
      } else if (Math.hypot(selected.end.x - selected.start.x, selected.end.y - selected.start.y) < 6) {
        const normalized = (selected.start.x - plotRectRef.current.left) / plotRectRef.current.width;
        updateCursorFromPointer(event, Math.abs(normalized - cursorA) <= Math.abs(normalized - cursorB) ? 'a' : 'b');
      }
    }
    selectionRef.current = null; setSelection(null);
    panningRef.current = null; draggingCursorRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function openTraceMenu(event: ReactMouseEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const plot = plotRectRef.current; if (!plot) return;
    const point = canvasPoint(event);
    if (point.x < plot.left || point.x > plot.left + plot.width || point.y < plot.top || point.y > plot.top + plot.height) { closeTraceMenu(); return; }
    const lines = preparedTraces.map((trace) => ({ id: trace.id, points: decimateMinMax(trace.points, Math.max(160, Math.floor(plot.width * 2))).map((sample) => ({
      x: plot.left + (sample.transformedX - xView.minimum) / (xView.maximum - xView.minimum) * plot.width, y: mapY(sample.y + trace.displayOffset, plot, yBounds),
    })) }));
    const target = nearestPlotTrace(lines, point, 9);
    setTraceMenu(target ? { id: target, x: event.clientX, y: event.clientY } : null);
  }

  function handleCanvasKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (event.key === "Escape") { selectionRef.current = null; setSelection(null); closeTraceMenu(); return; }
    if (event.key.toLowerCase() === "r") { resetView(); return; }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const amount = event.shiftKey ? 0.01 : 0.002;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (event.altKey) setCursorB((current) => clamp(current + direction * amount, 0, 1));
    else setCursorA((current) => clamp(current + direction * amount, 0, 1));
  }

  function stackTraces() {
    const offsets = stackedTraceOffsets(preparedTraces.flatMap(trace => trace.measurements.minimum === null || trace.measurements.maximum === null ? [] : [{ id: trace.id, minimum: trace.measurements.minimum, maximum: trace.measurements.maximum }]));
    setAppearances(current => ({ ...current, ...Object.fromEntries(Object.entries(offsets).map(([id, offset]) => [id, { ...current[id], offset }])) }));
    setYPerDivision(null); setYCenter(null);
  }
  async function savePng() {
    if (!canvasRef.current) return;
    setExportError(null);
    try { await exportInstrumentPng({ title, theme, plots: [{ element: canvasRef.current }],
      legend: preparedTraces.map(trace => ({ name: trace.name, color: trace.color, detail: trace.displayOffset ? 'Display offset ' + formatQuantity(trace.displayOffset, trace.unit) + '; measurements unshifted' : undefined })),
      notes: [effectiveXLabel + ' · ' + yLabel + ' · ' + totalSamples.toLocaleString() + (domain === 'time' ? ' measured samples' : ' plotted points')],
    }); } catch (error) { setExportError(error instanceof Error ? error.message : 'PNG export failed.'); }
  }
  const hasOffsets = activeTraces.some(trace => trace.displayOffset !== 0);
  const menuTrace = activeTraces.find((trace) => trace.id === traceMenu?.id);
  const visibleCount = preparedTraces.length;
  const totalSamples = Math.min(x.length, sampleLimit);
  const scopeSummary = `${title}. ${yLabel} against ${effectiveXLabel}. ${visibleCount} visible ${visibleCount === 1 ? "channel" : "channels"}; ${totalSamples.toLocaleString()} samples. Cursor delta ${formatQuantity(cursorReadout.deltaX, effectiveXUnit)}.`;

  return (
    <section className={["anacode-scope", className].filter(Boolean).join(" ")} style={styles.scope} aria-label={title} hidden={panel.hidden} data-instrument-maximized={panel.maximized} data-display-offsets={hasOffsets} data-theme={theme} data-x-min={inverseTransformX(xView.minimum, effectiveXScale)} data-x-max={inverseTransformX(xView.maximum, effectiveXScale)} data-y-min={yBounds.minimum} data-y-max={yBounds.maximum}>
      <header className="anacode-scope__toolbar" style={styles.toolbar}>
        <div style={styles.titleGroup}>
          <span style={styles.titleIcon} aria-hidden="true"><Activity size={17} /></span>
          <div>
            <strong style={styles.title}>{title}</strong>
            <span style={styles.subtitle}>{effectiveXLabel} domain · {yLabel} · {totalSamples.toLocaleString()} samples</span>
          </div>
        </div>
        <div className="anacode-scope__controls" style={styles.controls}>
          <button type="button" onClick={() => { resetView(); onAutoSet?.(); }} style={styles.iconButton}>Auto set</button>
          {activeTraces.length > 1 && <button type="button" onClick={stackTraces} style={styles.iconButton} title="Separate traces with display offsets" aria-label="Stack traces"><Layers size={15}/></button>}
          <button type="button" onClick={panel.toggleMaximized} style={styles.iconButton} title={panel.maximized ? 'Restore instrument' : 'Maximize instrument'} aria-label={panel.maximized ? 'Restore instrument' : 'Maximize instrument'}>{panel.maximized ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</button>
          <button type="button" onClick={() => void savePng()} style={styles.iconButton} title="Save instrument PNG" aria-label="Save instrument PNG"><Download size={15}/></button>
        </div>
      </header>

      <div className="anacode-scope__channel-rack" style={styles.channelRack} aria-label="Oscilloscope channels">
        {activeTraces.map((trace) => {
          const isVisible = resolvedVisibility[trace.id] ?? true;
          const color = safeColor(trace.color, probeColor(trace.id));
          return (
            <div className="anacode-scope__channel" style={{ ...styles.channel, borderColor: `${color}80` }} key={trace.id}>
              <button
                type="button"
                aria-pressed={isVisible}
                aria-label={`${isVisible ? "Hide" : "Show"} ${trace.name}`}
                onClick={() => setVisibility((current) => ({ ...current, [trace.id]: !isVisible }))}
                onContextMenu={(event) => { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setTraceMenu({ id: trace.id, x: event.clientX || bounds.left, y: event.clientY || bounds.bottom }); }}
                onKeyDown={(event) => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setTraceMenu({ id: trace.id, x: bounds.left, y: bounds.bottom }); } }}
                title="Right-click or Shift+F10 for trace settings"
                style={{ ...styles.channelButton, color }}
              >
                {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>{trace.name}{trace.displayOffset !== 0 && <small style={{ marginLeft: 5 }}>↕ {formatQuantity(trace.displayOffset ?? 0, trace.unit ?? yUnit)}</small>}</span>
              </button>

            </div>
          );
        })}
        {removed.size > 0 && <button type="button" style={styles.iconButton} onClick={() => setRemoved(new Set())}>Restore removed traces</button>}
        {traces.length > channelLimit && <span role="alert" style={styles.limitNote}>This capture exceeds {channelLimit} channels. Remove probes and capture again.</span>}
      </div>

      <div className="anacode-scope__viewport" ref={viewportRef} style={{ ...styles.viewport, height: boundedHeight }}>
        <canvas
          ref={canvasRef}
          className="anacode-scope__canvas"
          style={styles.canvas}
          role="img"
          aria-label={scopeSummary}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onContextMenu={openTraceMenu}
          onDoubleClick={resetView}
          onKeyDown={handleCanvasKeyDown}
        />
        {selection && <div aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', left: Math.min(selection.start.x, selection.end.x), top: Math.min(selection.start.y, selection.end.y), width: Math.abs(selection.end.x - selection.start.x), height: Math.abs(selection.end.y - selection.start.y), border: '1px solid var(--blue)', background: 'color-mix(in srgb, var(--blue) 12%, transparent)' }}/>}
      </div>
      {hasOffsets && <p style={styles.interactionHint}>Display offsets separate traces. The readout table uses actual values; axis cursors use display coordinates. <button type="button" style={styles.iconButton} onClick={() => { setAppearances(current => ({ ...current, ...Object.fromEntries(activeTraces.map(trace => [trace.id, { ...current[trace.id], offset: 0 }])) })); setYPerDivision(null); setYCenter(null); }}>Clear offsets</button></p>}
      {exportError && <p role="alert" style={styles.interactionHint}>{exportError}</p>}
      <p style={styles.interactionHint}>Drag a rectangle to zoom · Shift-drag to pan · Alt-drag cursors · Right-click a trace to style · Double-click to reset</p>
      <details className="anacode-scope__details"><summary style={styles.detailsSummary}>Measurements, cursors{domain === 'time' ? ' & trigger' : ''}</summary>
      <div style={{ ...styles.controls, padding: "10px 12px" }}>
          <button type="button" style={styles.iconButton} onClick={() => setXPerDivision((xView.maximum - xView.minimum) / 20)} aria-label="Zoom in waveform">Zoom +</button>
          <button type="button" style={styles.iconButton} onClick={() => setXPerDivision((xView.maximum - xView.minimum) / 5)} aria-label="Zoom out waveform">Zoom −</button>
          <button type="button" onClick={resetView} style={styles.iconButton} aria-label="Reset oscilloscope view">
            <RotateCcw size={15} /> Reset
          </button>
          {domain === 'time' && <label style={styles.compactLabel}>Time window<select aria-label="Time window" style={styles.select} value={timeWindow} onChange={event => { setTimeWindow(event.target.value as TimeWindowMode); setXPerDivision(null); setXCenter(null); }}><option value="elapsed">0 → latest sample</option><option value="samples">Fit samples</option>{recordDuration !== undefined && recordDuration > 0 && <option value="requested">0 → requested duration</option>}</select></label>}
          <label style={styles.compactLabel} htmlFor={`${controlId}-x-scale`}>
            <span>{effectiveXScale === "log" ? "Decades/div" : `${effectiveXLabel}/div`}</span>
            <select
              id={`${controlId}-x-scale`}
              value={xPerDivision ?? "auto"}
              onChange={(event) => setXPerDivision(readScale(event.currentTarget.value))}
              style={styles.select}
            >
              <option value="auto">Auto</option>
              {xScaleOptions.map((value) => (
                <option value={value} key={value}>
                  {effectiveXScale === "log" ? `${formatPlain(value)} dec` : formatQuantity(value, effectiveXUnit)}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.compactLabel} htmlFor={`${controlId}-y-scale`}>
            <span>{yUnit}/div</span>
            <select
              id={`${controlId}-y-scale`}
              value={yPerDivision ?? "auto"}
              onChange={(event) => { setYPerDivision(readScale(event.currentTarget.value)); setYCenter(null); }}
              style={styles.select}
            >
              <option value="auto">Auto</option>
              {yScaleOptions.map((value) => <option value={value} key={value}>{formatQuantity(value, yUnit)}</option>)}
            </select>
          </label>
      </div>
      {domain === "time" && <div className="anacode-scope__trigger" style={styles.triggerBar}>
        <span style={styles.triggerHeading}><Zap size={14} aria-hidden="true" /> Trigger</span>
        <label style={styles.inlineLabel} htmlFor={`${controlId}-trigger-channel`}>
          Source
          <select
            id={`${controlId}-trigger-channel`}
            value={effectiveTriggerChannel}
            onChange={(event) => updateTrigger({ channelId: event.currentTarget.value })}
            style={styles.select}
          >
            {activeTraces.map((trace) => <option value={trace.id} key={trace.id}>{trace.name}</option>)}
          </select>
        </label>
        <label style={styles.inlineLabel} htmlFor={`${controlId}-trigger-level`}>
          Level
          <input
            id={`${controlId}-trigger-level`}
            type="number"
            value={formatEditable(effectiveTriggerLevel)}
            step="any"
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value)) updateTrigger({ level: value });
            }}
            style={styles.numberInput}
          />
          <span>{yUnit}</span>
        </label>
        <button
          type="button"
          onClick={() => updateTrigger({ edge: triggerEdge === "rising" ? "falling" : "rising" })}
          style={styles.edgeButton}
          aria-label={`Trigger edge: ${triggerEdge}. Activate to use ${triggerEdge === "rising" ? "falling" : "rising"} edge.`}
        >
          <TriggerEdgeIcon edge={triggerEdge} /> {triggerEdge}
        </button>
        <span style={styles.triggerStatus} aria-live="polite">
          <i style={{ ...styles.statusDot, background: safeColor(triggerColor, CHANNEL_COLORS[0]) }} />
          Captured edge marker
        </span>
        <button type="button" style={styles.iconButton} onClick={() => {
          const source = activeTraces.find((trace) => trace.id === effectiveTriggerChannel);
          if (!source) return;
          let points = Array.from({ length: Math.min(x.length, source.values.length) }, (_, i) => ({ x: Number(x[i]), y: Number(source.values[i]) }));
          if (resolvedCouplings[source.id] === "AC") {
            const mean = measureWaveform(points).mean ?? 0;
            points = points.map((point) => ({ ...point, y: point.y - mean }));
          }
          const edge = crossings(points, effectiveTriggerLevel, triggerEdge)[0];
          if (edge !== undefined) { setXCenter(edge); setXPerDivision(fullTransformedSpan / 40); }
        }}>Find first edge</button>
      </div>}

      <label style={{ ...styles.inlineLabel, padding: "8px 12px" }}>Horizontal position
        <input aria-label="Waveform horizontal position" type="range" min="0" max="1000" value={Math.round((((xView.minimum + xView.maximum) / 2) - xBounds.transformedMin) / fullTransformedSpan * 1000)} onChange={(event) => setXCenter(xBounds.transformedMin + Number(event.currentTarget.value) / 1000 * fullTransformedSpan)} style={styles.range} />
        <small>Shift-drag to pan · Alt-drag to move cursors</small>
      </label>


      <div className="anacode-scope__cursor-panel" style={styles.cursorPanel}>
        <div style={styles.cursorHeading}><SlidersHorizontal size={15} aria-hidden="true" /><strong>{domain === "time" ? "Time" : domain === "frequency" ? "Frequency" : "Sweep"} cursors</strong></div>
        <label style={styles.cursorControl} htmlFor={`${controlId}-cursor-a`}>
          <span style={{ ...styles.cursorBadge, background: "#e4e4e7", color: "#111214" }}>A</span>
          <input
            id={`${controlId}-cursor-a`}
            type="range"
            min="0"
            max="1000"
            value={Math.round(cursorA * 1000)}
            onChange={(event) => setCursorA(Number(event.currentTarget.value) / 1000)}
            style={styles.range}
          />
          <output htmlFor={`${controlId}-cursor-a`} style={styles.cursorOutput}>{formatQuantity(cursorReadout.cursorA, effectiveXUnit)}</output>
        </label>
        <label style={styles.cursorControl} htmlFor={`${controlId}-cursor-b`}>
          <span style={{ ...styles.cursorBadge, background: "#22c7df", color: "#081012" }}>B</span>
          <input
            id={`${controlId}-cursor-b`}
            type="range"
            min="0"
            max="1000"
            value={Math.round(cursorB * 1000)}
            onChange={(event) => setCursorB(Number(event.currentTarget.value) / 1000)}
            style={styles.range}
          />
          <output htmlFor={`${controlId}-cursor-b`} style={styles.cursorOutput}>{formatQuantity(cursorReadout.cursorB, effectiveXUnit)}</output>
        </label>
        <div style={styles.deltaReadout} aria-live="polite">
          <span>Δ{effectiveXLabel.toLowerCase()}</span>
          <strong>{formatQuantity(cursorReadout.deltaX, effectiveXUnit)}</strong>
          {cursorReadout.reciprocalDeltaX !== null && <small>1/Δt {formatQuantity(cursorReadout.reciprocalDeltaX, "Hz")}</small>}
        </div>
      </div>

      <div style={styles.cursorPanel}>
        <strong style={styles.cursorHeading}>{hasOffsets ? 'Display-axis cursors' : 'Amplitude cursors'}</strong>
        <label style={styles.cursorControl}>Y A<input aria-label="Amplitude cursor A" type="range" min="0" max="1000" value={Math.round(yCursorA * 1000)} onChange={(event) => setYCursorA(Number(event.currentTarget.value) / 1000)} style={styles.range} /><output style={styles.cursorOutput}>{formatQuantity(yBounds.minimum + yCursorA * (yBounds.maximum - yBounds.minimum), yUnit)}</output></label>
        <label style={styles.cursorControl}>Y B<input aria-label="Amplitude cursor B" type="range" min="0" max="1000" value={Math.round(yCursorB * 1000)} onChange={(event) => setYCursorB(Number(event.currentTarget.value) / 1000)} style={styles.range} /><output style={styles.cursorOutput}>{formatQuantity(yBounds.minimum + yCursorB * (yBounds.maximum - yBounds.minimum), yUnit)}</output></label>
        <output style={styles.deltaReadout}>Δ{yUnit}: {formatQuantity((yCursorB - yCursorA) * (yBounds.maximum - yBounds.minimum), yUnit)}</output>
      </div>

      <div className="anacode-scope__measurements" style={styles.measurementWrap}>
        <table style={styles.table}>
          <caption style={styles.caption}>Measurements over the visible acquisition window</caption>
          <thead>
            <tr>
              <th scope="col" style={styles.tableHeading}>Channel</th>
              <th scope="col" style={styles.tableHeading}>{domain === "time" ? "Peak–peak" : "Span"}</th>
              {domain === "time" && <><th scope="col" style={styles.tableHeading}>RMS</th><th scope="col" style={styles.tableHeading}>Mean</th></>}
              <th scope="col" style={styles.tableHeading}>Min</th>
              <th scope="col" style={styles.tableHeading}>Max</th>
              <th scope="col" style={styles.tableHeading}>B − A</th>
              {domain === "time" && <th scope="col" style={styles.tableHeading}>Duty @ midpoint</th>}
              <th scope="col" style={styles.tableHeading}>{domain === "time" ? "Freq. estimate" : "Peak at"}</th>
            </tr>
          </thead>
          <tbody>
            {preparedTraces.map((trace) => (
              <tr key={trace.id}>
                <th scope="row" style={styles.rowHeading}>
                  <i style={{ ...styles.channelSwatch, background: trace.color }} />
                  {trace.name} {domain === "time" && <small style={styles.couplingText}>{trace.coupling}</small>}
                </th>
                <MeasurementCell value={trace.measurements.peakToPeak} unit={trace.unit} />
                {domain === "time" && <><MeasurementCell value={trace.measurements.rms} unit={trace.unit} /><MeasurementCell value={trace.measurements.mean} unit={trace.unit} /></>}
                <MeasurementCell value={trace.measurements.minimum} unit={trace.unit} />
                <MeasurementCell value={trace.measurements.maximum} unit={trace.unit} />
                <MeasurementCell value={(() => { const a = interpolateWaveform(trace.points, cursorReadout.cursorA); const b = interpolateWaveform(trace.points, cursorReadout.cursorB); return a === null || b === null ? null : b - a; })()} unit={trace.unit} />
                {domain === "time" && <MeasurementCell value={trace.measurements.dutyCycle} unit="%" />}
                <MeasurementCell
                  value={domain === "time" ? trace.measurements.frequency : trace.measurements.peakAt}
                  unit={domain === "time" ? "Hz" : effectiveXUnit}
                />
              </tr>
            ))}
            {preparedTraces.length === 0 && (
              <tr><td colSpan={9} style={styles.emptyCell}>Enable a channel with finite samples to inspect measurements.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </details>
      {traceMenu && menuTrace && <TraceContextMenu name={menuTrace.name} x={traceMenu.x} y={traceMenu.y} color={safeColor(appearances[menuTrace.id]?.color ?? traces.find((trace) => trace.id === menuTrace.id)?.color, probeColor(menuTrace.id))} width={menuTrace.lineWidth ?? 1.7} onClose={closeTraceMenu}
        onChange={(appearance) => setAppearances((current) => ({ ...current, [menuTrace.id]: { ...current[menuTrace.id], ...appearance } }))}>
        <label>Trace name<input aria-label={'Rename ' + menuTrace.name} value={menuTrace.name} maxLength={48} onChange={(event) => { const name = event.currentTarget.value; setNames((current) => ({ ...current, [menuTrace.id]: name })); }}/></label>
        <label>Display offset ({menuTrace.unit ?? yUnit})<input aria-label="Trace display offset" type="number" step="any" value={menuTrace.displayOffset ?? 0} onChange={event => { const offset = Number(event.target.value); if (Number.isFinite(offset) && Math.abs(offset) <= 1e12) { setAppearances(current => ({ ...current, [menuTrace.id]: { ...current[menuTrace.id], offset } })); setYPerDivision(null); setYCenter(null); } }}/></label>
        <small>Moves the displayed line only. Measurements keep their original values.</small>
        {domain === 'time' && <label>Coupling<select aria-label={menuTrace.name + ' input coupling'} value={resolvedCouplings[menuTrace.id] ?? 'DC'} onChange={(event) => { const coupling = event.target.value as OscilloscopeCoupling; setCouplings((current) => ({ ...current, [menuTrace.id]: coupling })); }}><option value="DC">DC</option><option value="AC">AC</option></select></label>}
        <button type="button" aria-label={'Remove ' + menuTrace.name} onClick={() => { setRemoved((current) => new Set([...current, menuTrace.id])); closeTraceMenu(); }}>Remove trace</button>
      </TraceContextMenu>}
      <p style={styles.srOnly} aria-live="polite">{scopeSummary}</p>
    </section>
  );
}

function MeasurementCell({ value, unit }: { value: number | null; unit: string }) {
  return <td style={styles.tableCell}>{value === null ? "—" : formatQuantity(value, unit)}</td>;
}

function TriggerEdgeIcon({ edge }: { edge: OscilloscopeTriggerEdge }) {
  return (
    <svg width="17" height="13" viewBox="0 0 17 13" aria-hidden="true">
      {edge === "rising"
        ? <path d="M1 11h6V2h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        : <path d="M1 2h8v9h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />}
    </svg>
  );
}

function prepareTraces({
  traces,
  x,
  xScale,
  xView,
  visibility,
  couplings,
  fallbackUnit,
  sampleLimit,
  domain,
}: {
  traces: readonly OscilloscopeTrace[];
  x: ArrayLike<number>;
  xScale: "linear" | "log";
  xView: { minimum: number; maximum: number };
  visibility: Record<string, boolean>;
  couplings: Record<string, OscilloscopeCoupling>;
  fallbackUnit: string;
  sampleLimit: number;
  domain: OscilloscopeDomain;
}): PreparedTrace[] {
  return traces.flatMap((trace) => {
    if (!visibility[trace.id]) return [];
    const length = Math.min(x.length, trace.values.length);
    const stride = Math.max(1, Math.ceil(length / sampleLimit));
    const rawPoints: Point[] = [];
    let sum = 0;
    for (let index = 0; index < length; index += stride) {
      const sourceX = Number(x[index]);
      const sourceY = Number(trace.values[index]);
      if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY) || (xScale === "log" && sourceX <= 0)) continue;
      const transformedX = transformX(sourceX, xScale);
      if (transformedX < xView.minimum || transformedX > xView.maximum) continue;
      rawPoints.push({ x: sourceX, transformedX, y: sourceY });
      sum += sourceY;
    }
    const coupling = couplings[trace.id] ?? trace.initialCoupling ?? "DC";
    const capturedMean = (domain === "time" ? measureWaveform(rawPoints).mean : rawPoints.length > 0 ? sum / rawPoints.length : 0) ?? 0;
    const points = coupling === "AC"
      ? rawPoints.map((point) => ({ ...point, y: point.y - capturedMean }))
      : rawPoints;
    const measurements = measureTrace(points, domain);
    return [{
      id: trace.id,
      name: trace.name,
      unit: trace.unit ?? fallbackUnit,
      color: safeColor(trace.color, probeColor(trace.id)),
      lineWidth: clamp(trace.lineWidth ?? 1.7, 1, 5),
      displayOffset: Number.isFinite(trace.displayOffset) ? trace.displayOffset! : 0,
      coupling,
      points,
      measurements,
    }];
  });
}

function measureTrace(points: readonly Point[], domain: OscilloscopeDomain): TraceMeasurements {
  if (domain === "time") return { ...measureWaveform(points), peakAt: null };
  if (points.length === 0) return { minimum: null, maximum: null, peakToPeak: null, mean: null, rms: null, frequency: null, peakAt: null, dutyCycle: null };
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let peakAt = points[0]?.x ?? null;
  let sum = 0;
  let sumSquares = 0;
  for (const point of points) {
    minimum = Math.min(minimum, point.y);
    if (point.y > maximum) {
      maximum = point.y;
      peakAt = point.x;
    }
    sum += point.y;
    sumSquares += point.y * point.y;
  }
  const mean = sum / points.length;
  return {
    minimum,
    maximum,
    peakToPeak: maximum - minimum,
    mean,
    rms: Math.sqrt(sumSquares / points.length),
    frequency: null,
    dutyCycle: null,
    peakAt,
  };
}

function findDomainBounds(x: ArrayLike<number>, scale: "linear" | "log", sampleLimit: number) {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  const stride = Math.max(1, Math.ceil(x.length / sampleLimit));
  for (let index = 0; index < x.length; index += stride) {
    const value = Number(x[index]);
    if (!Number.isFinite(value) || (scale === "log" && value <= 0)) continue;
    const transformed = transformX(value, scale);
    minimum = Math.min(minimum, transformed);
    maximum = Math.max(maximum, transformed);
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    minimum = scale === "log" ? 0 : 0;
    maximum = scale === "log" ? 1 : 1;
  }
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * 0.05, 0.5);
    minimum -= padding;
    maximum += padding;
  }
  return {
    transformedMin: minimum,
    transformedMax: maximum,
    minimum: inverseTransformX(minimum, scale),
    maximum: inverseTransformX(maximum, scale),
  };
}

function drawOscilloscope({
  context,
  width,
  height,
  plot,
  traces,
  xView,
  yBounds,
  xScale,
  xUnit,
  yUnit,
  cursorA,
  cursorB,
  triggerLevel,
  triggerColor,
  triggerEdge,
  theme,
  showTrigger,
}: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  plot: PlotRect;
  traces: readonly PreparedTrace[];
  xView: { minimum: number; maximum: number };
  yBounds: { minimum: number; maximum: number };
  xScale: "linear" | "log";
  xUnit: string;
  yUnit: string;
  cursorA: number;
  cursorB: number;
  triggerLevel: number;
  triggerColor: string;
  triggerEdge: OscilloscopeTriggerEdge;
  theme: "light" | "dark";
  showTrigger: boolean;
}) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = theme === "dark" ? "#101419" : "#f7f9fc";
  context.fillRect(0, 0, width, height);
  context.fillStyle = theme === "dark" ? "#090d12" : "#ffffff";
  context.fillRect(plot.left, plot.top, plot.width, plot.height);

  drawGrid(context, plot, theme);
  drawAxes(context, plot, xView, yBounds, xScale, xUnit, yUnit, theme);
  drawZeroReference(context, plot, yBounds, theme);

  context.save();
  context.beginPath();
  context.rect(plot.left, plot.top, plot.width, plot.height);
  context.clip();
  for (const trace of traces) drawTrace(context, trace, plot, xView, yBounds);
  if (showTrigger) drawTrigger(context, plot, yBounds, triggerLevel, triggerColor, triggerEdge);
  drawCursor(context, plot, cursorA, "A", theme === "dark" ? "#e4e4e7" : "#475569", theme);
  drawCursor(context, plot, cursorB, "B", theme === "dark" ? "#22c7df" : "#0369a1", theme);
  context.restore();

  context.strokeStyle = theme === "dark" ? "#435163" : "#bdc9d8";
  context.lineWidth = 1;
  context.strokeRect(plot.left + 0.5, plot.top + 0.5, plot.width - 1, plot.height - 1);
}

function drawGrid(context: CanvasRenderingContext2D, plot: PlotRect, theme: "light" | "dark") {
  context.save();
  for (let division = 0; division <= HORIZONTAL_DIVISIONS; division += 1) {
    const x = plot.left + (division / HORIZONTAL_DIVISIONS) * plot.width;
    for (let minor = 1; minor < 5 && division < HORIZONTAL_DIVISIONS; minor += 1) {
      const minorX = x + (minor / 5) * (plot.width / HORIZONTAL_DIVISIONS);
      context.strokeStyle = theme === "dark" ? "#121b24" : "#f0f3f7";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(minorX, plot.top);
      context.lineTo(minorX, plot.top + plot.height);
      context.stroke();
    }
    context.strokeStyle = theme === "dark" ? (division === HORIZONTAL_DIVISIONS / 2 ? "#344452" : "#26333f") : (division === HORIZONTAL_DIVISIONS / 2 ? "#c5cfdc" : "#e0e6ee");
    context.beginPath();
    context.moveTo(x, plot.top);
    context.lineTo(x, plot.top + plot.height);
    context.stroke();
  }
  for (let division = 0; division <= VERTICAL_DIVISIONS; division += 1) {
    const y = plot.top + (division / VERTICAL_DIVISIONS) * plot.height;
    for (let minor = 1; minor < 5 && division < VERTICAL_DIVISIONS; minor += 1) {
      const minorY = y + (minor / 5) * (plot.height / VERTICAL_DIVISIONS);
      context.strokeStyle = theme === "dark" ? "#121b24" : "#f0f3f7";
      context.beginPath();
      context.moveTo(plot.left, minorY);
      context.lineTo(plot.left + plot.width, minorY);
      context.stroke();
    }
    context.strokeStyle = theme === "dark" ? (division === VERTICAL_DIVISIONS / 2 ? "#344452" : "#26333f") : (division === VERTICAL_DIVISIONS / 2 ? "#c5cfdc" : "#e0e6ee");
    context.beginPath();
    context.moveTo(plot.left, y);
    context.lineTo(plot.left + plot.width, y);
    context.stroke();
  }
  context.restore();
}

function drawAxes(
  context: CanvasRenderingContext2D,
  plot: PlotRect,
  xView: { minimum: number; maximum: number },
  yBounds: { minimum: number; maximum: number },
  xScale: "linear" | "log",
  xUnit: string,
  yUnit: string,
  theme: "light" | "dark",
) {
  context.save();
  context.fillStyle = theme === "dark" ? "#a8b7c8" : "#526175";
  context.font = "11px ui-monospace, SFMono-Regular, Consolas, monospace";
  context.textBaseline = "middle";
  for (let division = 0; division <= VERTICAL_DIVISIONS; division += 2) {
    const ratio = division / VERTICAL_DIVISIONS;
    const y = plot.top + ratio * plot.height;
    const value = yBounds.maximum - ratio * (yBounds.maximum - yBounds.minimum);
    context.textAlign = "right";
    context.fillText(formatQuantity(value, yUnit), plot.left - 9, y);
  }
  context.textBaseline = "top";
  for (let division = 0; division <= HORIZONTAL_DIVISIONS; division += 2) {
    const ratio = division / HORIZONTAL_DIVISIONS;
    const transformed = xView.minimum + ratio * (xView.maximum - xView.minimum);
    const value = inverseTransformX(transformed, xScale);
    context.textAlign = division === 0 ? "left" : division === HORIZONTAL_DIVISIONS ? "right" : "center";
    context.fillText(formatQuantity(value, xUnit), plot.left + ratio * plot.width, plot.top + plot.height + 10);
  }
  context.restore();
}

function drawZeroReference(context: CanvasRenderingContext2D, plot: PlotRect, yBounds: { minimum: number; maximum: number }, theme: "light" | "dark") {
  if (0 < yBounds.minimum || 0 > yBounds.maximum) return;
  const y = mapY(0, plot, yBounds);
  context.save();
  context.strokeStyle = theme === "dark" ? "#5b6c7d" : "#91a1b5";
  context.lineWidth = 1;
  context.setLineDash([2, 5]);
  context.beginPath();
  context.moveTo(plot.left, y);
  context.lineTo(plot.left + plot.width, y);
  context.stroke();
  context.restore();
}

function drawTrace(
  context: CanvasRenderingContext2D,
  trace: PreparedTrace,
  plot: PlotRect,
  xView: { minimum: number; maximum: number },
  yBounds: { minimum: number; maximum: number },
) {
  if (trace.points.length === 0) return;
  const points = decimateMinMax(trace.points, Math.max(160, Math.floor(plot.width * 2)));
  context.save();
  context.strokeStyle = trace.color;
  context.lineWidth = trace.lineWidth;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.shadowBlur = 0;
  context.beginPath();
  points.forEach((point, index) => {
    const drawX = plot.left + ((point.transformedX - xView.minimum) / (xView.maximum - xView.minimum)) * plot.width;
    const drawY = mapY(point.y + trace.displayOffset, plot, yBounds);
    if (index === 0) context.moveTo(drawX, drawY);
    else context.lineTo(drawX, drawY);
  });
  context.stroke();
  context.restore();
}

function drawTrigger(
  context: CanvasRenderingContext2D,
  plot: PlotRect,
  yBounds: { minimum: number; maximum: number },
  level: number,
  color: string,
  edge: OscilloscopeTriggerEdge,
) {
  const rawY = mapY(level, plot, yBounds);
  const y = clamp(rawY, plot.top + 1, plot.top + plot.height - 1);
  context.save();
  context.strokeStyle = `${color}b8`;
  context.lineWidth = 1;
  context.setLineDash([7, 5]);
  context.beginPath();
  context.moveTo(plot.left, y);
  context.lineTo(plot.left + plot.width, y);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(plot.left, y);
  context.lineTo(plot.left + 9, y - 6);
  context.lineTo(plot.left + 9, y + 6);
  context.closePath();
  context.fill();
  context.font = "bold 10px ui-monospace, monospace";
  context.textAlign = "left";
  context.textBaseline = "bottom";
  context.fillText(edge === "rising" ? "T↑" : "T↓", plot.left + 12, y - 3);
  context.restore();
}

function drawCursor(context: CanvasRenderingContext2D, plot: PlotRect, position: number, label: string, color: string, theme: 'light' | 'dark') {
  const x = plot.left + position * plot.width;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(x, plot.top);
  context.lineTo(x, plot.top + plot.height);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x - 6, plot.top);
  context.lineTo(x + 6, plot.top);
  context.lineTo(x, plot.top + 8);
  context.closePath();
  context.fill();
  context.fillStyle = theme === 'light' ? '#ffffff' : '#070908';
  context.font = "bold 9px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillText(label, x, plot.top + 1);
  context.restore();
}

function decimateMinMax(points: readonly Point[], target: number): Point[] {
  if (points.length <= target) return [...points];
  const bucketSize = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(target / 2))));
  const result: Point[] = [];
  for (let start = 0; start < points.length; start += bucketSize) {
    const end = Math.min(points.length, start + bucketSize);
    let minimumIndex = start;
    let maximumIndex = start;
    for (let index = start + 1; index < end; index += 1) {
      if ((points[index]?.y ?? 0) < (points[minimumIndex]?.y ?? 0)) minimumIndex = index;
      if ((points[index]?.y ?? 0) > (points[maximumIndex]?.y ?? 0)) maximumIndex = index;
    }
    const first = Math.min(minimumIndex, maximumIndex);
    const second = Math.max(minimumIndex, maximumIndex);
    const firstPoint = points[first];
    const secondPoint = points[second];
    if (firstPoint) result.push(firstPoint);
    if (second !== first && secondPoint) result.push(secondPoint);
  }
  return result;
}

function makePlotRect(width: number, height: number): PlotRect {
  const left = width < 520 ? 58 : 72;
  const right = width < 520 ? 12 : 22;
  const top = 18;
  const bottom = 42;
  return { left, top, width: Math.max(1, width - left - right), height: Math.max(1, height - top - bottom) };
}

function mapY(value: number, plot: PlotRect, bounds: { minimum: number; maximum: number }) {
  return plot.top + ((bounds.maximum - value) / Math.max(bounds.maximum - bounds.minimum, Number.EPSILON)) * plot.height;
}

function transformX(value: number, scale: "linear" | "log") {
  return scale === "log" ? Math.log10(value) : value;
}

function inverseTransformX(value: number, scale: "linear" | "log") {
  return scale === "log" ? 10 ** value : value;
}

function buildScaleOptions(centralValue: number): number[] {
  if (!Number.isFinite(centralValue) || centralValue <= 0) return [0.1, 0.2, 0.5, 1, 2, 5];
  const exponent = Math.floor(Math.log10(centralValue));
  const values = new Set<number>();
  for (let offset = -2; offset <= 2; offset += 1) {
    const magnitude = 10 ** (exponent + offset);
    for (const factor of [1, 2, 5]) values.add(Number((factor * magnitude).toPrecision(12)));
  }
  return [...values].sort((a, b) => a - b);
}

function toScaleState(scale: OscilloscopeScale): number | null {
  return scale === "auto" || !Number.isFinite(scale) || scale <= 0 ? null : scale;
}

function readScale(value: string): number | null {
  if (value === "auto") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function safeColor(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function formatQuantity(value: number, unit: string) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return `0 ${unit}`.trim();
  const absolute = Math.abs(value);
  const prefixes = [
    { threshold: 1e12, scale: 1e12, symbol: "T" },
    { threshold: 1e9, scale: 1e9, symbol: "G" },
    { threshold: 1e6, scale: 1e6, symbol: "M" },
    { threshold: 1e3, scale: 1e3, symbol: "k" },
    { threshold: 1, scale: 1, symbol: "" },
    { threshold: 1e-3, scale: 1e-3, symbol: "m" },
    { threshold: 1e-6, scale: 1e-6, symbol: "µ" },
    { threshold: 1e-9, scale: 1e-9, symbol: "n" },
    { threshold: 1e-12, scale: 1e-12, symbol: "p" },
  ];
  const selected = prefixes.find((prefix) => absolute >= prefix.threshold) ?? { scale: 1e-15, symbol: "f" };
  const scaled = value / selected.scale;
  const decimals = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  return `${Number(scaled.toFixed(decimals))} ${selected.symbol}${unit}`.trim();
}

function formatEditable(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Math.abs(value) >= 1e-4 && Math.abs(value) < 1e6 ? String(Number(value.toPrecision(6))) : value.toExponential(5);
}

function formatPlain(value: number) {
  return Number(value.toPrecision(3)).toString();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

const styles: Record<string, CSSProperties> = {
  scope: {
    overflow: "hidden",
    colorScheme: "inherit",
    border: "1px solid var(--line-strong)",
    borderRadius: 7,
    background: "var(--surface)",
    color: "var(--ink)",
    boxShadow: "var(--shadow-sm)",
    fontFamily: "var(--font-sans, Inter, ui-sans-serif, system-ui, sans-serif)",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
    padding: "8px",
    borderBottom: "1px solid var(--line)",
    background: "var(--surface-soft)",
  },
  titleGroup: { display: "flex", alignItems: "center", gap: 7 },
  titleIcon: { display: "grid", placeItems: "center", width: 24, height: 24, color: "var(--amber-dark)", border: "1px solid var(--line-strong)", borderRadius: 5, background: "var(--surface)" },
  title: { display: "block", fontSize: 12, lineHeight: 1.2, letterSpacing: "0.01em" },
  subtitle: { display: "block", marginTop: 2, color: "var(--muted)", fontSize: 9 },
  controls: { display: "flex", alignItems: "end", gap: 6, flexWrap: "wrap" },
  compactLabel: { display: "grid", gap: 3, color: "var(--muted)", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" },
  select: { minHeight: 30, padding: "4px 25px 4px 8px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: 4, background: "var(--surface)", font: "inherit", fontSize: 11 },
  iconButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 27, padding: "4px 7px", color: "var(--ink-soft)", border: "1px solid var(--line-strong)", borderRadius: 4, background: "var(--surface-soft)", cursor: "pointer", font: "inherit", fontSize: 11 },
  channelRack: { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", padding: "6px 8px", borderBottom: "1px solid var(--line)", background: "var(--surface)" },
  channel: { display: "inline-flex", alignItems: "center", gap: 2, minHeight: 25, border: "1px solid", borderRadius: 4, background: "var(--surface)" },
  channelButton: { display: "inline-flex", alignItems: "center", gap: 5, minHeight: 25, padding: "3px 6px", border: 0, background: "transparent", cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 750 },
  couplingSelect: { minHeight: 23, marginRight: 3, padding: "2px 3px", color: "var(--ink-soft)", border: "1px solid var(--line-strong)", borderRadius: 3, background: "var(--surface-soft)", font: "inherit", fontSize: 9, fontWeight: 750 },
  limitNote: { color: "var(--muted)", fontSize: 10 },
  triggerBar: { display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", minHeight: 40, padding: "6px 12px", borderBottom: "1px solid var(--line)", background: "var(--surface-soft)", color: "var(--ink-soft)", fontSize: 10 },
  triggerHeading: { display: "inline-flex", alignItems: "center", gap: 5, color: "var(--amber-dark)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" },
  inlineLabel: { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 650 },
  numberInput: { width: 82, minHeight: 28, padding: "4px 7px", color: "var(--ink)", border: "1px solid var(--line-strong)", borderRadius: 4, background: "var(--surface)", font: "11px ui-monospace, monospace" },
  edgeButton: { display: "inline-flex", alignItems: "center", gap: 5, minHeight: 28, padding: "4px 8px", color: "var(--ink-soft)", border: "1px solid var(--line-strong)", borderRadius: 4, background: "var(--surface-soft)", cursor: "pointer", font: "inherit", fontSize: 10, textTransform: "capitalize" },
  triggerStatus: { display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", color: "var(--muted)" },
  statusDot: { display: "inline-block", width: 7, height: 7, borderRadius: "50%" },
  viewport: { position: "relative", width: "100%", minWidth: 0, background: "var(--surface)", touchAction: "none" },
  canvas: { display: "block", width: "100%", maxWidth: "100%", cursor: "crosshair", outlineOffset: -3 },
  cursorPanel: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: "var(--surface-soft)" },
  cursorHeading: { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink-soft)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" },
  cursorControl: { display: "grid", gridTemplateColumns: "22px minmax(80px, 1fr) 82px", alignItems: "center", gap: 7, minWidth: 0 },
  cursorBadge: { display: "grid", placeItems: "center", width: 20, height: 20, borderRadius: 4, font: "bold 10px ui-monospace, monospace" },
  range: { width: "100%", accentColor: "#22c7df" },
  cursorOutput: { color: "var(--ink)", font: "11px ui-monospace, monospace", textAlign: "right", whiteSpace: "nowrap" },
  deltaReadout: { display: "grid", gridTemplateColumns: "auto auto", alignItems: "baseline", columnGap: 7, minWidth: 135, padding: "6px 9px", border: "1px solid var(--line-strong)", borderRadius: 4, background: "var(--surface)", fontSize: 10 },
  measurementWrap: { overflowX: "auto", background: "var(--surface)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  caption: { padding: "9px 12px 4px", color: "var(--muted)", textAlign: "left", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 750 },
  tableHeading: { padding: "7px 12px", color: "var(--muted)", borderBottom: "1px solid var(--line)", textAlign: "right", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" },
  rowHeading: { padding: "8px 12px", color: "var(--ink)", borderBottom: "1px solid var(--line)", textAlign: "left", fontWeight: 700, whiteSpace: "nowrap" },
  tableCell: { padding: "8px 12px", color: "var(--ink-soft)", borderBottom: "1px solid var(--line)", textAlign: "right", font: "11px ui-monospace, monospace", whiteSpace: "nowrap" },
  channelSwatch: { display: "inline-block", width: 8, height: 8, marginRight: 7, borderRadius: "50%" },
  couplingText: { marginLeft: 5, color: "var(--muted)", fontSize: 9 },
  emptyCell: { padding: 18, color: "var(--muted)", textAlign: "center" },
  couplingTextInfo: { color: "var(--muted)" },
  interactionHint: { margin: 0, padding: "7px 12px", color: "var(--muted)", fontSize: 10, lineHeight: 1.5 },
  detailsSummary: { padding: "9px 12px", cursor: "pointer", color: "var(--ink-soft)", borderTop: "1px solid var(--line)", background: "var(--surface-soft)", fontSize: 11, fontWeight: 650 },
  srOnly: { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 },
};
