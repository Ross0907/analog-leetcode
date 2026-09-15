"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock3, Cpu, FileCode2, Play, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import type { JudgeKind } from "../../lib/challenges";
import type { CircuitDocument } from "../../lib/circuit-document";
import { formatEngineering } from "../../lib/engineering";
import {
  SIMULATOR_RUN_TIMEOUT_MS,
  SIMULATOR_WORKER_INITIALIZATION_TIMEOUT_MS,
  SIMULATOR_WORKER_PROTOCOL_VERSION,
  type SimulationPayload,
  type SimulatorWorkerMessage,
  type SimulatorWorkerRequest,
} from "../../lib/simulator-contract";
import { BrowserOscilloscope, type OscilloscopeDomain } from "./browser-oscilloscope";
import { SpectrumAnalyzer } from "./spectrum-analyzer";
import { validateSimulatorProbes } from "../../lib/simulator-netlist-policy";

type GradeResponse = {
  passed: boolean;
  score: number;
  summary: string;
  diagnostics: Array<{ label: string; value: string; passed: boolean }>;
  graderVersion: string;
  persisted: boolean;
};

type SimulatorWorkerSession = {
  worker: Worker;
  phase: "initializing" | "ready" | "running";
  pendingRequest: SimulatorWorkerRequest | null;
  runId: string | null;
  initializationTimeout: ReturnType<typeof setTimeout> | null;
  runTimeout: ReturnType<typeof setTimeout> | null;
  armInitializationTimeout: () => void;
};

export function SimulationConsole({
  initialNetlist,
  probe,
  challengeSlug,
  judge,
  circuitDocument,
  autoRun = false,
}: {
  initialNetlist: string;
  probe?: string | readonly string[];
  challengeSlug?: string;
  judge?: JudgeKind;
  circuitDocument?: CircuitDocument;
  autoRun?: boolean;
}) {
  const [netlist, setNetlist] = useState(initialNetlist);
  const initialProbeText = typeof probe === "string" ? probe : probe?.join(", ") ?? "";
  const [probeText, setProbeText] = useState(initialProbeText);
  const [simulation, setSimulation] = useState<SimulationPayload | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [grade, setGrade] = useState<GradeResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const workerSessionRef = useRef<SimulatorWorkerSession | null>(null);
  const activeRunRef = useRef<string | null>(null);
  const autoRunStartedRef = useRef(false);
  const mountedRef = useRef(false);
  const prepareWorkerRef = useRef<() => SimulatorWorkerSession | null>(() => null);

  const disposeWorker = useCallback((session = workerSessionRef.current) => {
    if (!session) return;
    if (session.initializationTimeout) clearTimeout(session.initializationTimeout);
    if (session.runTimeout) clearTimeout(session.runTimeout);
    session.initializationTimeout = null;
    session.runTimeout = null;
    session.worker.onmessage = null;
    session.worker.onmessageerror = null;
    session.worker.onerror = null;
    session.worker.terminate();
    if (workerSessionRef.current === session) workerSessionRef.current = null;
  }, []);

  const finishWithError = useCallback((session: SimulatorWorkerSession, runId: string, message: string) => {
    disposeWorker(session);
    if (!mountedRef.current || activeRunRef.current !== runId) return;
    activeRunRef.current = null;
    setRunning(false);
    setSimError(message);
  }, [disposeWorker]);

  const dispatchRequest = useCallback((session: SimulatorWorkerSession, request: SimulatorWorkerRequest) => {
    if (workerSessionRef.current !== session || session.phase !== "ready" || activeRunRef.current !== request.id) return;
    session.phase = "running";
    session.pendingRequest = null;
    session.runId = request.id;
    try {
      session.worker.postMessage(request);
      session.runTimeout = setTimeout(() => {
        finishWithError(session, request.id, "Preview stopped after 4 seconds. Reduce the sweep size or simplify the circuit.");
      }, SIMULATOR_RUN_TIMEOUT_MS);
    } catch {
      finishWithError(session, request.id, "The simulator worker could not accept this circuit. Try reloading the page.");
    }
  }, [finishWithError]);

  const prepareWorker = useCallback(() => {
    if (!mountedRef.current) return null;
    const existing = workerSessionRef.current;
    if (existing) return existing;

    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/spice.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return null;
    }

    const session: SimulatorWorkerSession = {
      worker,
      phase: "initializing",
      pendingRequest: null,
      runId: null,
      initializationTimeout: null,
      runTimeout: null,
      armInitializationTimeout: () => undefined,
    };
    workerSessionRef.current = session;

    session.armInitializationTimeout = () => {
      if (session.initializationTimeout) clearTimeout(session.initializationTimeout);
      session.initializationTimeout = setTimeout(() => {
        if (workerSessionRef.current !== session || session.phase !== "initializing") return;
        const pendingId = session.pendingRequest?.id;
        if (pendingId) {
          finishWithError(session, pendingId, "The simulator engine did not finish loading. Check the connection and try again.");
        } else {
          disposeWorker(session);
        }
      }, SIMULATOR_WORKER_INITIALIZATION_TIMEOUT_MS);
    };

    worker.onmessage = (event: MessageEvent<SimulatorWorkerMessage>) => {
      if (workerSessionRef.current !== session) return;
      const message = event.data;
      if (message.type === "ready") {
        if (session.phase !== "initializing") return;
        if ((message as { protocolVersion: number }).protocolVersion !== SIMULATOR_WORKER_PROTOCOL_VERSION) {
          const pendingId = session.pendingRequest?.id;
          if (pendingId) finishWithError(session, pendingId, "The simulator engine is incompatible with this page. Reload to update it.");
          else disposeWorker(session);
          return;
        }
        if (session.initializationTimeout) clearTimeout(session.initializationTimeout);
        session.initializationTimeout = null;
        session.phase = "ready";
        const pendingRequest = session.pendingRequest;
        if (pendingRequest) dispatchRequest(session, pendingRequest);
        return;
      }
      if (message.type === "initialization-error") {
        const pendingId = session.pendingRequest?.id;
        if (pendingId) finishWithError(session, pendingId, "The simulator engine could not initialize. Try reloading this page.");
        else disposeWorker(session);
        return;
      }
      if (message.type !== "result" || session.phase !== "running" || message.id !== session.runId || activeRunRef.current !== message.id) return;
      const runId = message.id;
      disposeWorker(session);
      if (!mountedRef.current || activeRunRef.current !== runId) return;
      activeRunRef.current = null;
      setRunning(false);
      if (message.ok) setSimulation(message.payload);
      else setSimError(message.error);
      queueMicrotask(() => {
        if (mountedRef.current && !workerSessionRef.current) prepareWorkerRef.current();
      });
    };

    const handleWorkerFailure = () => {
      if (workerSessionRef.current !== session) return;
      const runId = session.pendingRequest?.id ?? session.runId;
      if (runId) finishWithError(session, runId, "The simulator worker could not start. Try reloading this page.");
      else disposeWorker(session);
    };
    worker.onerror = handleWorkerFailure;
    worker.onmessageerror = handleWorkerFailure;
    session.armInitializationTimeout();
    return session;
  }, [dispatchRequest, disposeWorker, finishWithError]);

  const cancelSimulation = useCallback(() => {
    if (activeRunRef.current) disposeWorker();
    activeRunRef.current = null;
    if (mountedRef.current) setRunning(false);
  }, [disposeWorker]);

  const runSimulation = useCallback(() => {
    cancelSimulation();
    setRunning(true);
    setSimError(null);
    setSimulation(null);
    setGrade(null);
    const id = crypto.randomUUID();
    activeRunRef.current = id;
    let probes: string[];
    try { probes = validateSimulatorProbes(probeText.split(/[\s,]+/).filter(Boolean)); }
    catch (error) {
      activeRunRef.current = null;
      setRunning(false);
      setSimError(error instanceof Error ? error.message : "Probe selection is invalid.");
      return;
    }
    const request = { type: "run", id, netlist, probes } satisfies SimulatorWorkerRequest;
    const session = prepareWorker();
    if (!session) {
      activeRunRef.current = null;
      setRunning(false);
      setSimError("The simulator worker could not start. Try reloading this page.");
      return;
    }
    if (session.phase === "initializing") {
      session.pendingRequest = request;
      session.armInitializationTimeout();
    } else if (session.phase === "ready") {
      dispatchRequest(session, request);
    }
  }, [cancelSimulation, dispatchRequest, netlist, prepareWorker, probeText]);

  useEffect(() => {
    prepareWorkerRef.current = prepareWorker;
  }, [prepareWorker]);

  useEffect(() => {
    mountedRef.current = true;
    prepareWorkerRef.current();
    return () => {
      mountedRef.current = false;
      activeRunRef.current = null;
      autoRunStartedRef.current = false;
      disposeWorker();
    };
  }, [disposeWorker]);

  useEffect(() => {
    if (autoRun && !autoRunStartedRef.current) {
      autoRunStartedRef.current = true;
      runSimulation();
    }
  }, [autoRun, runSimulation]);

  async function submitSolution() {
    if (!challengeSlug || !judge) return;
    if (!circuitDocument) {
      setGrade({
        passed: false,
        score: 0,
        summary: "Return to the schematic and prepare the circuit before running the fixed-topology check.",
        diagnostics: [],
        graderVersion: "client-validation",
        persisted: false,
      });
      return;
    }
    setSubmitting(true);
    setGrade(null);
    try {
      const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          problemSlug: challengeSlug,
          problemVersion: 1,
          idempotencyKey: crypto.randomUUID(),
          circuitDocument,
        }),
      });
      const payload = await response.json() as GradeResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "The judge rejected this request.");
      setGrade(payload);
    } catch (error) {
      setGrade({
        passed: false,
        score: 0,
        summary: error instanceof Error ? error.message : "The judge is temporarily unavailable.",
        diagnostics: [],
        graderVersion: "unavailable",
        persisted: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sim-console">
      <div className="sim-toolbar">
        <div className="sim-mode"><span className="ready-dot" /> Circuit engine <small>ngspice · isolated WebAssembly worker</small></div>
        <div className="sim-actions">
          <button className="icon-button" type="button" onClick={() => { cancelSimulation(); setNetlist(initialNetlist); setProbeText(initialProbeText); setSimulation(null); setGrade(null); setSimError(null); }} aria-label="Reset simulation"><RotateCcw size={16} /></button>
          <button className="button button-small button-run" type="button" onClick={runSimulation} disabled={running}>
            {running ? <><span className="spinner" /> Running</> : <><Play size={15} fill="currentColor" /> Run simulation</>}
          </button>
        </div>
      </div>

      <label style={{ display: "grid", gap: 6, padding: "12px 16px", fontSize: 12 }}>
        Probe vectors
        <input aria-label="Probe vectors" value={probeText} maxLength={2300} placeholder="vin, vout, I(V1)" onChange={(event) => { cancelSimulation(); setProbeText(event.currentTarget.value); }} style={{ width: "100%", padding: "9px 12px", color: "inherit", background: "transparent", border: "1px solid #59616d", borderRadius: 5 }} />
        <small>Up to 32 node names, V(node), or supported source currents I(source), separated by commas. Leave blank to plot all available vectors.</small>
      </label>

      <div className="sim-output">
        <div className="results-pane scope-results-pane">
          <div className="pane-heading"><span>RESULTS</span>{simulation && <small><Clock3 size={12} /> {simulation.runtimeMs.toFixed(1)} ms</small>}</div>
          {simError ? (
            <div className="simulation-message error"><AlertTriangle size={24} /><strong>Simulation stopped</strong><p>{simError}</p></div>
          ) : simulation ? (
            <>
              {simulation.analysis === "dc" ? (
                <div className="op-grid">
                  {simulation.operatingPoint.map((point) => <div key={point.name}><span>{point.name}</span><strong>{formatEngineering(point.value, point.unit ?? "V")}</strong></div>)}
                </div>
              ) : <ScopeResult payload={simulation} />}
              {simulation.warnings.length > 0 && (
                <ul className="simulation-warnings" aria-label="Simulation warnings">
                  {/* Warning rows belong to one immutable result and may repeat. */}
                  {/* eslint-disable-next-line @eslint-react/no-array-index-key */}
                  {simulation.warnings.map((warning, index) => <li key={`${index}-${warning}`}><AlertTriangle size={13} />{warning}</li>)}
                </ul>
              )}
              <div className="result-footer">
                <span><Cpu size={13} /> {simulation.analysis.toUpperCase()}</span>
                <span>{simulation.traces.length} {simulation.traces.length === 1 ? "trace" : "traces"}</span>
                <span>{simulation.x.length.toLocaleString()} points</span>
              </div>
            </>
          ) : (
            <div className="simulation-message"><div className="empty-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div><strong>Ready to measure</strong><p>Run the circuit to inspect its operating point, response, and waveforms.</p></div>
          )}
        </div>

        <details className="advanced-netlist">
          <summary>
            <span className="advanced-netlist-title"><FileCode2 size={16} /><span><strong>Advanced · solver source</strong><small>The visual circuit remains the primary design surface.</small></span></span>
            <span className="advanced-netlist-size">{new TextEncoder().encode(netlist).byteLength.toLocaleString()} / 12,000 bytes</span>
          </summary>
          <div className="netlist-pane advanced-netlist-pane">
            <div className="pane-heading"><span>GENERATED SPICE</span><small>Optional expert editing</small></div>
            <div className="editor-wrap">
              <pre className="line-numbers" aria-hidden="true">{netlist.split("\n").map((_, index) => `${index + 1}\n`)}</pre>
              <textarea aria-label="Advanced SPICE source editor" spellCheck={false} value={netlist} onChange={(event) => { cancelSimulation(); setNetlist(event.target.value); setSimulation(null); setSimError(null); setGrade(null); }} />
            </div>
            <div className="editor-policy"><ShieldCheck size={14} /> Advanced edits stay in this preview and never affect grading. Includes, files, control blocks, and shell directives are disabled.</div>
          </div>
        </details>
      </div>

      {challengeSlug && (
        <div className="submission-bar">
          <div>
            <strong>{judge ? "Ready for the fixed-topology design check?" : "Simulation practice challenge"}</strong>
            <span>{judge ? "The complete, bounded CircuitDocument is submitted; the server recompiles it and verifies connectivity and values without trusting solver text." : "Automated checks for this topology are still being validated."}</span>
          </div>
          <button className="button button-submit" type="button" onClick={submitSolution} disabled={!judge || submitting}>
            {submitting ? <><span className="spinner dark" /> Checking</> : <><Send size={16} /> {judge ? "Check fixed topology" : "Practice only"}</>}
          </button>
        </div>
      )}

      {grade && (
        <div className={grade.passed ? "grade-card passed" : "grade-card failed"} aria-live="polite">
          <div className="grade-mark">{grade.passed ? <Check size={24} /> : <X size={24} />}</div>
          <div className="grade-summary">
            <span>{grade.passed ? "Fixed-topology check passed" : "Fixed-topology check failed"}</span>
            <strong>{grade.summary}</strong>
            <small>{grade.persisted ? "Result saved" : "Practice result · sign in to save"} · {grade.graderVersion}</small>
          </div>
          <div className="grade-diagnostics">
            {grade.diagnostics.map((diagnostic) => (
              <span key={diagnostic.label} className={diagnostic.passed ? "ok" : "not-ok"}>
                {diagnostic.passed ? <Check size={13} /> : <X size={13} />} {diagnostic.label} <b>{diagnostic.value}</b>
              </span>
            ))}
          </div>
          <div className="grade-score"><strong>{grade.score}</strong><span>/ 100</span></div>
        </div>
      )}
    </div>
  );
}

export function ScopeResult({ payload }: { payload: SimulationPayload }) {
  if (payload.analysis === "ac") {
    const magnitude = payload.traces.filter((trace) => trace.quantity === "magnitude");
    const phase = payload.traces.filter((trace) => trace.quantity === "phase");
    return (
      <div className="scope-host bode-analyzer-stack">
        <BrowserOscilloscope
          key={`magnitude:${magnitude.map((trace) => trace.id).join("|")}`}
          x={payload.x}
          traces={magnitude}
          domain="frequency"
          xScale="log"
          xLabel={payload.xLabel}
          xUnit={payload.xUnit}
          yLabel="Magnitude"
          yUnit="dB"
          title="Bode magnitude"
          height={270}
        />
        <BrowserOscilloscope
          key={`phase:${phase.map((trace) => trace.id).join("|")}`}
          x={payload.x}
          traces={phase}
          domain="frequency"
          xScale="log"
          xLabel={payload.xLabel}
          xUnit={payload.xUnit}
          yLabel="Phase"
          yUnit="°"
          title="Bode phase"
          height={270}
        />
      </div>
    );
  }
  const domain: OscilloscopeDomain = payload.analysis === "dc-sweep" ? "sweep" : "time";
  const title = payload.analysis === "dc-sweep" ? "Curve tracer" : "Oscilloscope";
  const groups = [...new Set(payload.traces.map((trace) => trace.unit))].map((unit) => ({ unit, traces: payload.traces.filter((trace) => trace.unit === unit) }));
  return (
    <div className="scope-host">
      {groups.map((group) => <BrowserOscilloscope
        key={`${payload.analysis}:${group.unit}:${group.traces.map((trace) => trace.id).join("|")}`}
        x={payload.x}
        traces={group.traces}
        domain={domain}
        xScale="linear"
        xLabel={payload.xLabel}
        xUnit={payload.xUnit}
        yLabel={group.unit === "A" ? "Current" : payload.yLabel}
        yUnit={group.unit}
        title={`${title}${groups.length > 1 ? ` · ${group.unit === "A" ? "Current" : "Voltage"}` : ""}`}
        height={360}
      />)}
      {payload.analysis === "transient" && <SpectrumAnalyzer time={payload.x} traces={payload.traces} />}
    </div>
  );
}
