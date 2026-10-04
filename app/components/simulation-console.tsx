"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { ScopeResult } from "./scope-result";
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
  prepareCircuit,
  onResult,
  hideWaveforms = false,
  requireSchematic = false,
  prepareGrading,
  compact = false,
  settingsSlot,
  invalidationKey,
  runRequest,
  runRequestSource,
  onRunningChange,
  onError,
  getCurrentInvalidationKey,
}: {
  initialNetlist: string;
  probe?: string | readonly string[];
  challengeSlug?: string;
  judge?: JudgeKind;
  circuitDocument?: CircuitDocument;
  autoRun?: boolean;
  prepareCircuit?: () => { document: CircuitDocument; deck: string; probes?: readonly string[]; invalidationKey?: string };
  prepareGrading?: () => CircuitDocument;
  onResult?: (payload: SimulationPayload | null, source?: 'schematic' | 'deck') => void;
  hideWaveforms?: boolean;
  requireSchematic?: boolean;
  compact?: boolean;
  settingsSlot?: ReactNode;
  invalidationKey?: string;
  runRequest?: number;
  runRequestSource?: 'schematic' | 'deck';
  onRunningChange?: (running: boolean) => void;
  onError?: (message: string | null) => void;
  getCurrentInvalidationKey?: () => string;
}) {
  const [netlist, setNetlist] = useState(initialNetlist);
  const [analysisSource, setAnalysisSource] = useState<"schematic" | "deck">(prepareCircuit ? "schematic" : "deck");
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
  const submissionSequenceRef = useRef(0);
  const previousInvalidationRef = useRef(invalidationKey);
  const previousRunRequestRef = useRef(runRequest);
  const preparedInvalidationRef = useRef<string | undefined>(undefined);
  const preparedGradeInvalidationRef = useRef<string | undefined>(undefined);

  useEffect(() => { onResult?.(simulation, analysisSource); }, [simulation, onResult, analysisSource]);
  useEffect(() => { onRunningChange?.(running); }, [running, onRunningChange]);
  useEffect(() => { onError?.(simError); }, [simError, onError]);

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
    preparedInvalidationRef.current = undefined;
    if (mountedRef.current) setRunning(false);
  }, [disposeWorker]);

  useEffect(() => {
    if (previousInvalidationRef.current === invalidationKey) return;
    previousInvalidationRef.current = invalidationKey;
    // Native analysis may finish during preparation. That render must not cancel
    // the run compiled from the newly analyzed connections.
    if (preparedGradeInvalidationRef.current !== invalidationKey) submissionSequenceRef.current++;
    const timer = setTimeout(() => {
      if (preparedInvalidationRef.current !== invalidationKey) { cancelSimulation(); setSimulation(null); setSimError(null); }
      if (preparedGradeInvalidationRef.current !== invalidationKey) { setGrade(null); setSubmitting(false); }
    }, 0);
    return () => clearTimeout(timer);
  }, [invalidationKey, cancelSimulation]);

  const runSimulation = useCallback((sourceOverride?: 'schematic' | 'deck') => {
    cancelSimulation();
    setRunning(true);
    setSimError(null);
    setSimulation(null);
    setGrade(null);
    const id = crypto.randomUUID();
    activeRunRef.current = id;
    const source = requireSchematic ? 'schematic' : sourceOverride ?? analysisSource;
    if (sourceOverride) setAnalysisSource(source);
    let probes: string[] = [];
    try { if (source === 'deck') probes = validateSimulatorProbes(probeText.split(/[\s,]+/).filter(Boolean)); }
    catch (error) {
      activeRunRef.current = null;
      setRunning(false);
      setSimError(error instanceof Error ? error.message : "Probe selection is invalid.");
      return;
    }
    let runNetlist = netlist;
    if (source === "schematic") {
      try {
        if (!prepareCircuit) throw new Error("Wire the circuit in the schematic before running it.");
        const prepared = prepareCircuit();
        preparedInvalidationRef.current = prepared.invalidationKey ?? invalidationKey;
        runNetlist = prepared.deck;
        probes = validateSimulatorProbes(prepared.probes ?? probeText.split(/[\s,]+/).filter(Boolean));
        setProbeText(probes.join(", "));
        setNetlist(runNetlist);
      } catch (cause) {
        preparedInvalidationRef.current = getCurrentInvalidationKey?.() ?? invalidationKey;
        activeRunRef.current = null; setRunning(false);
        setSimError(cause instanceof Error ? cause.message : "Check the schematic wiring before running.");
        return;
      }
    }
    const request = { type: "run", id, netlist: runNetlist, probes } satisfies SimulatorWorkerRequest;
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
  }, [cancelSimulation, dispatchRequest, netlist, prepareWorker, probeText, requireSchematic, prepareCircuit, analysisSource, invalidationKey, getCurrentInvalidationKey]);

  useEffect(() => {
    if (previousRunRequestRef.current === runRequest) return;
    // Apply the shared duration/depth and clear invalidated results before running.
    const timer = setTimeout(() => { previousRunRequestRef.current = runRequest; runSimulation(runRequestSource); }, 0);
    return () => clearTimeout(timer);
  }, [runRequest, runRequestSource, runSimulation]);

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
    const submissionSequence = ++submissionSequenceRef.current;
    let submittedDocument: CircuitDocument | undefined;
    try {
      submittedDocument = prepareGrading?.() ?? prepareCircuit?.().document ?? circuitDocument;
      preparedGradeInvalidationRef.current = getCurrentInvalidationKey?.() ?? invalidationKey;
    }
    catch (cause) {
      preparedGradeInvalidationRef.current = getCurrentInvalidationKey?.() ?? invalidationKey;
      setGrade({ passed: false, score: 0, summary: cause instanceof Error ? cause.message : "Check the circuit connections before submitting.", diagnostics: [], graderVersion: "client-validation", persisted: false });
      return;
    }
    if (!submittedDocument) {
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
          circuitDocument: submittedDocument,
        }),
      });
      const payload = await response.json() as GradeResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "The judge rejected this request.");
      if (submissionSequenceRef.current === submissionSequence) setGrade(payload);
    } catch (error) {
      if (submissionSequenceRef.current === submissionSequence) setGrade({
        passed: false,
        score: 0,
        summary: error instanceof Error ? error.message : "The judge is temporarily unavailable.",
        diagnostics: [],
        graderVersion: "unavailable",
        persisted: false,
      });
    } finally {
      if (submissionSequenceRef.current === submissionSequence) setSubmitting(false);
    }
  }

  return (
    <div className={`sim-console${compact ? ' sim-console-compact' : ''}`}>
      <div className="sim-toolbar">
        <div className="sim-mode"><span className="ready-dot" /> SPICE <small>AC · DC · transient</small></div>
        <div className="sim-actions">
          {prepareCircuit && !compact && <button type="button" className="button button-small" onClick={() => {
            try { const prepared = prepareCircuit(); cancelSimulation(); setAnalysisSource("schematic"); setNetlist(prepared.deck); if (prepared.probes) setProbeText(prepared.probes.join(", ")); setSimulation(null); setSimError(null); }
            catch (cause) { setSimError(cause instanceof Error ? cause.message : "Check the schematic before preparing analysis."); }
          }}>Use current schematic</button>}
          <button className="icon-button" type="button" onClick={() => { cancelSimulation(); submissionSequenceRef.current++; preparedGradeInvalidationRef.current = undefined; setSubmitting(false); setNetlist(initialNetlist); setProbeText(initialProbeText); setSimulation(null); setGrade(null); setSimError(null); }} aria-label="Reset simulation"><RotateCcw size={16} /></button>
          <button className="button button-small button-run" type="button" onClick={() => runSimulation()} disabled={running}>
            {running ? <><span className="spinner" /> Running</> : <><Play size={15} fill="currentColor" /> Run simulation</>}
          </button>
          {compact && challengeSlug && judge && <button className="button button-small button-submit" type="button" onClick={submitSolution} disabled={submitting}>{submitting ? 'Checking…' : <><Send size={14}/>Check fixed topology</>}</button>}
        </div>
      </div>

      <details className="analysis-controls" open={compact ? undefined : true}>
      <summary>Analysis, sources &amp; models</summary>
      {settingsSlot}
      {prepareCircuit && <div className="lab-mode-note"><label>Analysis source <select aria-label="SPICE analysis source" value={analysisSource} disabled={requireSchematic} onChange={(event) => { cancelSimulation(); setAnalysisSource(event.target.value as typeof analysisSource); setNetlist(initialNetlist); setProbeText(initialProbeText); setSimulation(null); setSimError(null); }}><option value="schematic">Current schematic</option><option value="deck">Separate reference / custom deck</option></select></label><p>{analysisSource === 'schematic' ? 'Each run reads the current connections and values, with the sources and device models selected above.' : 'This is a separate SPICE example or custom deck. Schematic edits are not reflected in this analysis.'}</p></div>}
      <label style={{ display: "grid", gap: 6, padding: "12px 16px", fontSize: 12 }}>
        Probe vectors
        <input aria-label="Probe vectors" value={probeText} readOnly={Boolean(prepareCircuit) && (requireSchematic || analysisSource === "schematic")} maxLength={2300} placeholder="vin, vout, I(V1)" onChange={(event) => { cancelSimulation(); setProbeText(event.currentTarget.value); }} style={{ width: "100%", padding: "9px 12px", color: "inherit", background: "transparent", border: "1px solid #59616d", borderRadius: 5 }} />
        <small>Up to 32 node names, V(node), or supported source currents I(source), separated by commas. Leave blank to plot all available vectors.</small>
      </label>
      </details>

      <div className="sim-output">
        {(!compact || simError || simulation) && <div className="results-pane scope-results-pane">
          <div className="pane-heading"><span>RESULTS</span>{simulation && <small><Clock3 size={12} /> {simulation.runtimeMs.toFixed(1)} ms</small>}</div>
          {simError ? (
            <div className="simulation-message error"><AlertTriangle size={24} /><strong>Simulation stopped</strong><p>{simError}</p></div>
          ) : simulation ? (
            <>
              {simulation.analysis === "dc" && !hideWaveforms ? (
                <div className="op-grid">
                  {simulation.operatingPoint.map((point) => <div key={point.name}><span>{point.name}</span><strong>{formatEngineering(point.value, point.unit ?? "V")}</strong></div>)}
                </div>
              ) : hideWaveforms ? null : <ScopeResult payload={simulation} />}
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
        </div>}

        <details className="advanced-netlist">
          <summary>
            <span className="advanced-netlist-title"><FileCode2 size={16} /><span><strong>Advanced · solver source</strong><small>The visual circuit remains the primary design surface.</small></span></span>
            <span className="advanced-netlist-size">{new TextEncoder().encode(netlist).byteLength.toLocaleString()} / 12,000 bytes</span>
          </summary>
          <div className="netlist-pane advanced-netlist-pane">
            <div className="pane-heading"><span>GENERATED SPICE</span><small>Optional expert editing</small></div>
            <div className="editor-wrap">
              <pre className="line-numbers" aria-hidden="true">{netlist.split("\n").map((_, index) => `${index + 1}\n`)}</pre>
              <textarea aria-label="Advanced SPICE source editor" readOnly={Boolean(prepareCircuit) && (requireSchematic || analysisSource === "schematic")} spellCheck={false} value={netlist} onChange={(event) => { cancelSimulation(); setNetlist(event.target.value); setSimulation(null); setSimError(null); setGrade(null); }} />
            </div>
            <div className="editor-policy"><ShieldCheck size={14} /> Advanced edits stay in this preview and never affect grading. Includes, files, control blocks, and shell directives are disabled.</div>
          </div>
        </details>
      </div>

      {challengeSlug && !compact && (
        <div className="submission-bar">
          <div>
            <strong>{judge ? "Check your circuit" : "Simulation practice"}</strong>
            <span>{judge ? "Check the connections and component values in your current schematic against this challenge." : "Explore its response and compare it with the learning objectives."}</span>
          </div>
          {judge && <button className="button button-submit" type="button" onClick={submitSolution} disabled={submitting}>
            {submitting ? <><span className="spinner dark" /> Checking</> : <><Send size={16} /> {judge ? "Check fixed topology" : "Practice only"}</>}
          </button>}
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

export { ScopeResult } from './scope-result';
