"use client";

import { useMemo, useState } from "react";
import { Activity, Info, Network } from "lucide-react";
import type { JudgeKind } from "../../lib/challenges";
import type { CircuitDocument } from "../../lib/circuit-document";
import { SimulationConsole } from "./simulation-console";
import {
  TextbookSchematicEditor,
  analysisForChallenge,
  compileEditorCircuitDocument,
  createStarterSchematic,
} from "./textbook-schematic-editor";

export function ChallengeWorkbench({
  challengeSlug,
  starterNetlist,
  probe,
  judge,
}: {
  challengeSlug: string;
  starterNetlist: string;
  probe: string;
  judge: JudgeKind;
}) {
  const initialDocument = useMemo(() => createStarterSchematic(challengeSlug), [challengeSlug]);
  const initialAnalysis = useMemo(() => analysisForChallenge(challengeSlug), [challengeSlug]);
  const [mode, setMode] = useState<"schematic" | "instruments">("schematic");
  const [generatedNetlist, setGeneratedNetlist] = useState(starterNetlist);
  const [probes, setProbes] = useState<string[]>([probe]);
  const [circuitDocument, setCircuitDocument] = useState<CircuitDocument>(() => compileEditorCircuitDocument(initialDocument, initialAnalysis));
  const [runRevision, setRunRevision] = useState(0);

  return (
    <div className="challenge-circuit-workbench">
      <div className="lab-modebar challenge-modebar">
        <div className="segmented-control" role="tablist" aria-label="Challenge workspace">
          <button className={mode === "schematic" ? "active" : ""} onClick={() => setMode("schematic")} role="tab" aria-selected={mode === "schematic"}><Network size={16} /> Schematic</button>
          <button className={mode === "instruments" ? "active" : ""} onClick={() => setMode("instruments")} role="tab" aria-selected={mode === "instruments"}><Activity size={16} /> Instruments</button>
        </div>
        <div className="lab-mode-note"><Info size={14} /> Design visually; AnaCode generates the solver input.</div>
      </div>
      <div className="challenge-workbench-panel challenge-schematic-panel" hidden={mode !== "schematic"}>
        <TextbookSchematicEditor
          initialDocument={initialDocument}
          initialAnalysis={initialAnalysis}
          onSimulate={(netlist, nextProbes, nextCircuitDocument) => {
            setGeneratedNetlist(netlist);
            setProbes(nextProbes.length ? nextProbes : [probe]);
            setCircuitDocument(nextCircuitDocument);
            setRunRevision((revision) => revision + 1);
            setMode("instruments");
          }}
        />
      </div>
      <div className="challenge-workbench-panel challenge-instruments-panel" hidden={mode !== "instruments"}>
        <SimulationConsole
          key={`${runRevision}:${generatedNetlist}`}
          initialNetlist={generatedNetlist}
          probe={probes}
          challengeSlug={challengeSlug}
          judge={judge}
          circuitDocument={circuitDocument}
          autoRun={runRevision > 0}
        />
      </div>
    </div>
  );
}
