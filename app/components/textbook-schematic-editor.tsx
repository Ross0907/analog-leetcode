"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Cable,
  ChevronDown,
  CircleDot,
  Copy,
  Download,
  FolderOpen,
  Hand,
  Keyboard,
  MousePointer2,
  Play,
  Redo2,
  RotateCw,
  Save,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { parseEngineeringNumber } from "../../lib/engineering";
import { validateSimulatorProbes, SIMULATOR_NETLIST_LIMITS } from "../../lib/simulator-netlist-policy";
import { splitWireRoute } from "../../lib/schematic-wire-geometry";
import { generateSpiceDeckFromCircuitDocument } from "../../lib/circuit-spice";
import type {
  CircuitAnalysis as ElectricalAnalysis,
  CircuitComponent as ElectricalComponent,
  CircuitDocument as ElectricalCircuitDocument,
  ConnectionPoint as ElectricalEndpoint,
} from "../../lib/circuit-document";
import {
  SCHEMATIC_LIBRARY,
  SchematicGlyph,
  symbolPins,
  type SchematicKind,
} from "./schematic-symbol";
import { SchematicFlowCanvas } from "./schematic-flow-canvas";

type Rotation = 0 | 90 | 180 | 270;
type Point = { x: number; y: number };
export type SourceSetup = {
  mode: "dc" | "sine" | "pulse";
  amplitude: string;
  frequency: string;
  high: string;
  delay: string;
  rise: string;
  fall: string;
  width: string;
  period: string;
};
export type SchematicPart = {
  id: string;
  kind: SchematicKind;
  x: number;
  y: number;
  rotation: Rotation;
  value: string;
  label?: string;
  source?: SourceSetup;
  /** Mirrors asymmetric symbols vertically without changing electrical pin IDs. */
  mirrorY?: boolean;
};
export type Endpoint =
  | { type: "pin"; partId: string; pin: number }
  | { type: "junction"; junctionId: string };
type Part = SchematicPart;
type Wire = { id: string; from: Endpoint; to: Endpoint; waypoints: Point[] };
type Junction = { id: string; x: number; y: number; label?: string };
export type CircuitDocument = { parts: Part[]; wires: Wire[]; junctions: Junction[] };
export type Tool = "select" | "pan" | "wire" | SchematicKind;
export type Selection = { partIds: string[]; wireId: string | null; junctionId: string | null };
export type AnalysisSetup = {
  mode: "op" | "transient" | "ac" | "dc-sweep";
  transientStep: string;
  transientStop: string;
  acPoints: string;
  acStart: string;
  acStop: string;
  dcSource: string;
  dcStart: string;
  dcStop: string;
  dcStep: string;
};
type Clipboard = { parts: Part[]; wires: Wire[] };

const WORLD = { width: 1_600, height: 900 };
const GRID = 10;
const MAX_PARTS = 120;
const MAX_WIRES = 480;
const MAX_JUNCTIONS = 240;
const HISTORY_LIMIT = 80;
const EMPTY_SELECTION: Selection = { partIds: [], wireId: null, junctionId: null };
const subscribeToHydration = () => () => {};
const readClientReady = () => true;
const readServerNotReady = () => false;
const DEFAULT_ANALYSIS: AnalysisSetup = {
  mode: "op",
  transientStep: "10u",
  transientStop: "5m",
  acPoints: "40",
  acStart: "10",
  acStop: "100k",
  dcSource: "V1",
  dcStart: "0",
  dcStop: "5",
  dcStep: "10m",
};

const START_DOCUMENT: CircuitDocument = {
  parts: [
    { id: "V1", kind: "voltage", x: 230, y: 380, rotation: 90, value: "5" },
    { id: "GNDSRC", kind: "ground", x: 230, y: 520, rotation: 0, value: "" },
    { id: "R1", kind: "resistor", x: 560, y: 240, rotation: 90, value: "10k" },
    { id: "R2", kind: "resistor", x: 560, y: 440, rotation: 90, value: "10k" },
    { id: "GND1", kind: "ground", x: 560, y: 580, rotation: 0, value: "" },
    { id: "CH1", kind: "probe", x: 760, y: 340, rotation: 0, value: "", label: "VOUT" },
  ],
  wires: [
    wire("W1", pin("V1", 0), pin("R1", 0), [{ x: 230, y: 190 }]),
    wire("W2", pin("R1", 1), junctionEndpoint("JOUT")),
    wire("W3", junctionEndpoint("JOUT"), pin("R2", 0)),
    wire("W4", junctionEndpoint("JOUT"), pin("CH1", 0)),
    wire("W5", pin("R2", 1), pin("GND1", 0)),
    wire("W6", pin("V1", 1), pin("GNDSRC", 0)),
  ],
  junctions: [
    junction("JOUT", 560, 340, "out"),
  ],
};

export function createStarterSchematic(slug: string): CircuitDocument {
  // Preset waypoints are part of the authored schematic, not stale editor state.
  // They keep launch circuits on deliberate Manhattan corridors; erasing them
  // makes the obstacle router invent avoidable doglegs between otherwise fixed
  // textbook placements.
  return cloneDocument(PRESET_DOCUMENTS[slug] ?? START_DOCUMENT);
}

export function analysisForChallenge(slug: string): AnalysisSetup {
  const overrides: Record<string, Partial<AnalysisSetup>> = {
    "precision-voltage-divider": { mode: "op" },
    "rc-cutoff-1khz": { mode: "ac", acPoints: "30", acStart: "10", acStop: "100k" },
    "inverting-gain-stage": { mode: "op" },
    "bjt-bias-across-beta": { mode: "op" },
    "diode-rectifier-ripple": { mode: "transient", transientStep: "100u", transientStop: "100m" },
    "mosfet-gate-drive": { mode: "transient", transientStep: "1n", transientStop: "300n" },
    "sallen-key-q": { mode: "ac", acPoints: "40", acStart: "100", acStop: "100k" },
    "cmos-inverter-trip-point": { mode: "dc-sweep", dcSource: "VIN", dcStart: "0", dcStop: "1.8", dcStep: "10m" },
    "transimpedance-stability": { mode: "ac", acPoints: "50", acStart: "10", acStop: "10meg" },
  };
  return { ...DEFAULT_ANALYSIS, ...overrides[slug] };
}

const PRESET_DOCUMENTS: Record<string, CircuitDocument> = {
  "precision-voltage-divider": START_DOCUMENT,
  "rc-cutoff-1khz": makeDocument(
    [
      part("V1", "voltage", 230, 380, 90, "1"),
      part("GNDSRC", "ground", 230, 520),
      part("R1", "resistor", 480, 240, 0, "15.9k"),
      part("C1", "capacitor", 680, 390, 90, "10n"),
      part("GND1", "ground", 680, 530),
      part("CH1", "probe", 840, 240, 0, "", "VOUT"),
    ],
    [
      wire("W1", pin("V1", 0), pin("R1", 0), [{ x: 230, y: 240 }]),
      wire("W2", pin("R1", 1), junctionEndpoint("JOUT")),
      wire("W3", junctionEndpoint("JOUT"), pin("C1", 0)),
      wire("W4", junctionEndpoint("JOUT"), pin("CH1", 0)),
      wire("W5", pin("C1", 1), pin("GND1", 0)),
      wire("W6", pin("V1", 1), pin("GNDSRC", 0)),
    ],
    [junction("JOUT", 680, 240, "out")],
  ),
  "inverting-gain-stage": makeDocument(
    [
      part("V1", "voltage", 220, 390, 90, "0.1"),
      part("GNDSRC", "ground", 220, 530),
      part("RIN", "resistor", 430, 300, 0, "10k"),
      part("RF", "resistor", 650, 160, 0, "100k"),
      { ...part("U1", "opamp", 720, 320), mirrorY: true },
      part("GND1", "ground", 668, 430),
      part("CH1", "probe", 900, 320, 0, "", "VOUT"),
    ],
    [
      wire("W1", pin("V1", 0), pin("RIN", 0), [{ x: 220, y: 300 }]),
      wire("W2", pin("V1", 1), pin("GNDSRC", 0)),
      wire("W3", pin("RIN", 1), junctionEndpoint("JSUM")),
      wire("W4", pin("RF", 0), junctionEndpoint("JSUM")),
      wire("W5", junctionEndpoint("JSUM"), pin("U1", 1)),
      wire("W6", pin("RF", 1), junctionEndpoint("JOUT"), [{ x: 800, y: 160 }]),
      wire("W7", pin("U1", 2), junctionEndpoint("JOUT")),
      wire("W8", junctionEndpoint("JOUT"), pin("CH1", 0)),
      wire("W9", pin("U1", 0), pin("GND1", 0)),
    ],
    [junction("JSUM", 600, 300, "sum"), junction("JOUT", 800, 320, "out")],
  ),
  "bjt-bias-across-beta": makeDocument(
    [
      part("VCC", "voltage", 180, 420, 90, "12"),
      part("GNDSRC", "ground", 180, 560),
      part("PWR1", "power", 180, 305, 0, "", "VCC"),
      part("PWR2", "power", 580, 145, 0, "", "VCC"),
      part("R1", "resistor", 430, 260, 90, "68k"),
      part("R2", "resistor", 430, 470, 90, "15k"),
      part("RC", "resistor", 754, 260, 90, "3.3k"),
      part("Q1", "npn", 720, 370),
      part("RE", "resistor", 754, 500, 90, "1k"),
      part("GND1", "ground", 754, 640),
      part("GNDBIAS", "ground", 430, 610),
      part("CH1", "probe", 900, 325, 0, "", "VC"),
    ],
    [
      wire("W1", pin("VCC", 0), pin("PWR1", 0)),
      wire("W2", pin("PWR2", 0), junctionEndpoint("JVCC")),
      wire("W3", junctionEndpoint("JVCC"), pin("R1", 0)),
      wire("W4", junctionEndpoint("JVCC"), pin("RC", 0)),
      wire("W5", pin("VCC", 1), pin("GNDSRC", 0)),
      wire("W6", pin("R1", 1), junctionEndpoint("JBASE")),
      wire("W7", pin("R2", 0), junctionEndpoint("JBASE")),
      wire("W8", junctionEndpoint("JBASE"), pin("Q1", 0)),
      wire("W9", pin("RC", 1), pin("Q1", 1)),
      wire("W10", pin("Q1", 1), pin("CH1", 0)),
      wire("W11", pin("Q1", 2), pin("RE", 0)),
      wire("W12", pin("R2", 1), pin("GNDBIAS", 0)),
      wire("W13", pin("RE", 1), pin("GND1", 0)),
    ],
    [
      junction("JVCC", 580, 210),
      junction("JBASE", 430, 370, "base"),
    ],
  ),
  "diode-rectifier-ripple": makeDocument(
    [
      part("VS", "voltage", 220, 420, 90, "0", undefined, { ...defaultSource(), mode: "sine", amplitude: "12", frequency: "50" }),
      part("GNDSRC", "ground", 220, 560),
      part("D1", "diode", 440, 280),
      part("C1", "capacitor-polarized", 650, 430, 90, "1000u"),
      part("RL", "resistor", 790, 430, 90, "100"),
      part("GND1", "ground", 650, 570),
      part("GNDLOAD", "ground", 790, 570),
      part("CH1", "probe", 930, 280, 0, "", "VOUT"),
    ],
    [
      wire("W1", pin("VS", 0), pin("D1", 0), [{ x: 220, y: 280 }]),
      wire("W2", pin("D1", 1), junctionEndpoint("JOUTC")),
      wire("W3", junctionEndpoint("JOUTC"), junctionEndpoint("JOUTR")),
      wire("W4", junctionEndpoint("JOUTC"), pin("C1", 0)),
      wire("W5", junctionEndpoint("JOUTR"), pin("RL", 0)),
      wire("W6", junctionEndpoint("JOUTR"), pin("CH1", 0)),
      wire("W7", pin("VS", 1), pin("GNDSRC", 0)),
      wire("W8", pin("C1", 1), pin("GND1", 0)),
      wire("W9", pin("RL", 1), pin("GNDLOAD", 0)),
    ],
    [
      junction("JOUTC", 650, 280, "out"),
      junction("JOUTR", 790, 280),
    ],
  ),
  "mosfet-gate-drive": makeDocument(
    [
      part("VG", "voltage", 230, 420, 90, "0", undefined, { ...defaultSource(), mode: "pulse", high: "10", rise: "2n", fall: "2n", width: "1u", period: "2u" }),
      part("GNDSRC", "ground", 230, 560),
      part("RG", "resistor", 480, 310, 0, "10"),
      part("CGS", "capacitor", 700, 450, 90, "2n"),
      part("GND1", "ground", 700, 590),
      part("CH1", "probe", 850, 310, 0, "", "GATE"),
    ],
    [
      wire("W1", pin("VG", 0), pin("RG", 0), [{ x: 230, y: 310 }]),
      wire("W2", pin("RG", 1), junctionEndpoint("JGATE")),
      wire("W3", junctionEndpoint("JGATE"), pin("CGS", 0), [{ x: 700, y: 310 }]),
      wire("W4", junctionEndpoint("JGATE"), pin("CH1", 0)),
      wire("W5", pin("VG", 1), pin("GNDSRC", 0)),
      wire("W6", pin("CGS", 1), pin("GND1", 0)),
    ],
    [junction("JGATE", 650, 310, "gate")],
  ),
  "sallen-key-q": makeDocument(
    [
      part("V1", "voltage", 190, 420, 90, "0"),
      part("GNDSRC", "ground", 190, 560),
      part("R1", "resistor", 390, 260, 0, "2.2k"),
      part("R2", "resistor", 570, 260, 0, "2.2k"),
      part("C1", "capacitor", 650, 130, 0, "20n"),
      part("C2", "capacitor", 690, 470, 90, "10n"),
      part("U1", "opamp", 790, 280),
      part("GND1", "ground", 690, 580),
      part("CH1", "probe", 960, 280, 0, "", "VOUT"),
    ],
    [
      wire("W1", pin("V1", 0), pin("R1", 0), [{ x: 190, y: 260 }]),
      wire("W2", pin("R1", 1), junctionEndpoint("JN1")),
      wire("W3", junctionEndpoint("JN1"), pin("R2", 0)),
      wire("W4", junctionEndpoint("JN1"), pin("C1", 0), [{ x: 480, y: 130 }]),
      wire("W5", pin("R2", 1), junctionEndpoint("JN2")),
      wire("W6", junctionEndpoint("JN2"), pin("U1", 0)),
      wire("W7", junctionEndpoint("JN2"), pin("C2", 0)),
      wire("W8", pin("U1", 2), junctionEndpoint("JOUT")),
      wire("W9", junctionEndpoint("JOUT"), pin("CH1", 0)),
      wire("W10", pin("C1", 1), junctionEndpoint("JOUT"), [{ x: 880, y: 130 }]),
      wire("W11", junctionEndpoint("JOUT"), pin("U1", 1), [{ x: 880, y: 300 }]),
      wire("W12", pin("V1", 1), pin("GNDSRC", 0)),
      wire("W13", pin("C2", 1), pin("GND1", 0)),
    ],
    [
      junction("JN1", 480, 260, "n1"),
      junction("JN2", 690, 260, "n2"),
      junction("JOUT", 880, 280, "out"),
    ],
  ),
  "cmos-inverter-trip-point": makeDocument(
    [
      part("VDD", "voltage", 220, 350, 90, "1.8"),
      part("GNDVDD", "ground", 220, 490),
      part("PWR1", "power", 220, 235, 0, "", "VDD"),
      part("PWR2", "power", 680, 150, 0, "", "VDD"),
      part("VIN", "voltage", 320, 600, 90, "0"),
      part("GNDVIN", "ground", 320, 740),
      { ...part("MP", "pmos", 650, 300, 0, "2u"), mirrorY: true },
      part("MN", "nmos", 650, 480, 0, "1u"),
      part("GND1", "ground", 680, 620),
      part("CH1", "probe", 860, 390, 0, "", "VOUT"),
    ],
    [
      wire("W1", pin("VDD", 0), pin("PWR1", 0)),
      wire("W2", pin("VDD", 1), pin("GNDVDD", 0)),
      wire("W3", pin("PWR2", 0), pin("MP", 2)),
      wire("W4", pin("VIN", 0), junctionEndpoint("JIN"), [{ x: 320, y: 390 }]),
      wire("W5", junctionEndpoint("JIN"), pin("MP", 0), [{ x: 550, y: 300 }]),
      wire("W6", junctionEndpoint("JIN"), pin("MN", 0), [{ x: 550, y: 480 }]),
      wire("W7", pin("MP", 1), junctionEndpoint("JOUT")),
      wire("W8", junctionEndpoint("JOUT"), pin("MN", 1)),
      wire("W9", junctionEndpoint("JOUT"), pin("CH1", 0)),
      wire("W10", pin("VIN", 1), pin("GNDVIN", 0)),
      wire("W11", pin("MN", 2), pin("GND1", 0)),
    ],
    [
      junction("JIN", 550, 390, "in"),
      junction("JOUT", 680, 390, "out"),
    ],
  ),
  "transimpedance-stability": makeDocument(
    [
      part("IIN", "current", 260, 420, 90, "0"),
      part("GNDSRC", "ground", 260, 560),
      part("RF", "resistor", 650, 180, 0, "100k"),
      part("CF", "capacitor", 650, 250, 0, "2p"),
      part("CD", "capacitor", 470, 470, 90, "50p"),
      { ...part("U1", "opamp", 720, 390), mirrorY: true },
      part("GNDCD", "ground", 470, 610),
      part("GND1", "ground", 668, 500),
      part("CH1", "probe", 900, 390, 0, "", "VOUT"),
    ],
    [
      wire("W1", pin("IIN", 0), junctionEndpoint("JCD")),
      wire("W2", pin("CD", 0), junctionEndpoint("JCD")),
      wire("W3", junctionEndpoint("JCD"), junctionEndpoint("JSUM")),
      wire("W4", junctionEndpoint("JSUM"), pin("U1", 1)),
      wire("W5", pin("RF", 0), junctionEndpoint("JFTOP")),
      wire("W6", pin("CF", 0), junctionEndpoint("JFMID")),
      wire("W7", junctionEndpoint("JFTOP"), junctionEndpoint("JFMID")),
      wire("W8", junctionEndpoint("JFMID"), junctionEndpoint("JSUM"), [{ x: 560, y: 370 }]),
      wire("W9", pin("RF", 1), junctionEndpoint("JOTOP")),
      wire("W10", pin("CF", 1), junctionEndpoint("JOMID")),
      wire("W11", junctionEndpoint("JOTOP"), junctionEndpoint("JOMID")),
      wire("W12", junctionEndpoint("JOMID"), junctionEndpoint("JOUT")),
      wire("W13", pin("U1", 2), junctionEndpoint("JOUT")),
      wire("W14", junctionEndpoint("JOUT"), pin("CH1", 0)),
      wire("W15", pin("IIN", 1), pin("GNDSRC", 0)),
      wire("W16", pin("CD", 1), pin("GNDCD", 0)),
      wire("W17", pin("U1", 0), pin("GND1", 0)),
    ],
    [
      junction("JCD", 470, 370),
      junction("JSUM", 620, 370, "sum"),
      junction("JFTOP", 560, 180),
      junction("JFMID", 560, 250),
      junction("JOTOP", 820, 180),
      junction("JOMID", 820, 250),
      junction("JOUT", 820, 390, "out"),
    ],
  ),
};

export type TextbookSchematicEditorProps = {
  onSimulate(netlist: string, probes: string[], circuitDocument: ElectricalCircuitDocument): void;
  initialDocument?: CircuitDocument;
  initialAnalysis?: Partial<AnalysisSetup>;
};

export function TextbookSchematicEditor({ onSimulate, initialDocument = createStarterSchematic("default"), initialAnalysis }: TextbookSchematicEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<CircuitDocument[]>([]);
  const futureRef = useRef<CircuitDocument[]>([]);
  const clipboardRef = useRef<Clipboard | null>(null);
  const flowDragBeforeRef = useRef<CircuitDocument | null>(null);
  const flowDragPartIdsRef = useRef<Set<string> | null>(null);
  const wireDragBeforeRef = useRef<CircuitDocument | null>(null);
  const [document, setDocument] = useState(() => cloneDocument(initialDocument));
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<Selection>({ ...EMPTY_SELECTION, partIds: ["R1"] });
  const [analysis, setAnalysis] = useState<AnalysisSetup>({ ...DEFAULT_ANALYSIS, ...initialAnalysis });
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("Circuit loaded · click any pin to start a wire");
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
  const editorReady = useSyncExternalStore(subscribeToHydration, readClientReady, readServerNotReady);
  const selectedPart = selection.partIds.length === 1
    ? document.parts.find((part) => part.id === selection.partIds[0]) ?? null
    : null;
  const filteredLibrary = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? SCHEMATIC_LIBRARY.filter((entry) => `${entry.label} ${entry.category}`.toLowerCase().includes(normalized))
      : SCHEMATIC_LIBRARY;
  }, [query]);
  const libraryGroups = useMemo(() => {
    return filteredLibrary.reduce<Record<string, typeof filteredLibrary>>((groups, item) => {
      (groups[item.category] ??= []).push(item);
      return groups;
    }, {});
  }, [filteredLibrary]);

  const commit = useCallback((next: CircuitDocument, nextMessage?: string) => {
    historyRef.current = [...historyRef.current, cloneDocument(document)].slice(-HISTORY_LIMIT);
    futureRef.current = [];
    setDocument(next);
    if (nextMessage) setMessage(nextMessage);
    setHistoryAvailability({ canUndo: true, canRedo: false });
  }, [document]);

  const changeFlowSelection = useCallback((partIds: string[], wireId: string | null) => {
    setSelection((current) => {
      const sameParts = partIds.length === current.partIds.length && partIds.every((id) => current.partIds.includes(id));
      return sameParts && wireId === current.wireId && current.junctionId === null
        ? current
        : { partIds, wireId, junctionId: null };
    });
  }, []);

  function undo() {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(cloneDocument(document));
    setDocument(previous);
    setSelection(EMPTY_SELECTION);
    setMessage("Undid last edit");
    setHistoryAvailability({ canUndo: historyRef.current.length > 0, canRedo: true });
  }

  function redo() {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(cloneDocument(document));
    setDocument(next);
    setSelection(EMPTY_SELECTION);
    setMessage("Restored edit");
    setHistoryAvailability({ canUndo: true, canRedo: futureRef.current.length > 0 });
  }

  function placePart(kind: SchematicKind, position: Point) {
    if (document.parts.length >= MAX_PARTS) return setMessage(`Component limit reached (${MAX_PARTS}).`);
    const id = nextReference(document.parts, kind);
    const nextPart: Part = {
      id,
      kind,
      x: clamp(snap(position.x), 60, WORLD.width - 60),
      y: clamp(snap(position.y), 60, WORLD.height - 60),
      rotation: 0,
      value: defaultValue(kind),
      label: kind === "probe" ? id : kind === "power" ? "VCC" : undefined,
      source: isIndependentSource(kind) ? defaultSource() : undefined,
    };
    commit({ ...document, parts: [...document.parts, nextPart] }, `${id} placed · click one of its pins to start a wire`);
    setSelection({ partIds: [id], wireId: null, junctionId: null });
    setTool("select");
  }

  function connectEndpoints(from: Endpoint, to: Endpoint) {
    if (sameEndpoint(from, to)) return;
    if (document.wires.length >= MAX_WIRES) return setMessage(`Wire limit reached (${MAX_WIRES}).`);
    if (document.wires.some((candidate) => sameConnection(candidate, from, to))) return setMessage("Those endpoints are already connected.");
    const nextWire = wire(nextId("W", document.wires.map((item) => item.id)), from, to);
    commit({ ...document, wires: [...document.wires, nextWire] }, "Net connected · routing cleared the component bodies automatically");
    setSelection({ partIds: [], wireId: nextWire.id, junctionId: null });
    setTool("select");
  }

  function branchWire(from: Endpoint, wireId: string, position: Point, routePoints: Point[]) {
    const targetWire = document.wires.find((candidate) => candidate.id === wireId);
    if (!targetWire) return;
    if (sameEndpoint(from, targetWire.from) || sameEndpoint(from, targetWire.to)) return setMessage("That point is already part of this net.");
    const split = splitWireRoute(routePoints, position, GRID);
    if (!split) return setMessage("The wire route is updating. Try connecting again.");
    if (split.atStart || split.atEnd) return connectEndpoints(from, split.atStart ? targetWire.from : targetWire.to);
    if (split.beforeWaypoints.length > 40 || split.afterWaypoints.length > 40) return setMessage("This wire has too many bends to add a branch. Simplify its route first.");
    if (document.junctions.length >= MAX_JUNCTIONS || document.wires.length + 2 > MAX_WIRES) return setMessage("The safe circuit size limit was reached.");
    const junctionId = nextId("J", document.junctions.map((item) => item.id));
    const nextJunction = junction(junctionId, split.point.x, split.point.y);
    const endpoint = junctionEndpoint(junctionId);
    const ids = document.wires.filter((candidate) => candidate.id !== wireId).map((candidate) => candidate.id);
    const firstId = nextId("W", ids);
    ids.push(firstId);
    const secondId = nextId("W", ids);
    ids.push(secondId);
    const branchId = nextId("W", ids);
    const nextWires = [
      ...document.wires.filter((candidate) => candidate.id !== wireId),
      wire(firstId, targetWire.from, endpoint, split.beforeWaypoints),
      wire(secondId, endpoint, targetWire.to, split.afterWaypoints),
      wire(branchId, from, endpoint),
    ];
    commit({ ...document, junctions: [...document.junctions, nextJunction], wires: nextWires }, "Branch connected · junction created automatically");
    setSelection({ partIds: [], wireId: branchId, junctionId: null });
    setTool("select");
  }

  function moveFlowParts(parts: Array<{ id: string; x: number; y: number }>, phase: "start" | "move" | "stop") {
    if (!parts.length) return;
    if (phase === "start") {
      flowDragBeforeRef.current = cloneDocument(document);
      flowDragPartIdsRef.current = new Set(parts.map((part) => part.id));
      return;
    }
    const before = flowDragBeforeRef.current ?? document;
    const movingPartIds = flowDragPartIdsRef.current ?? new Set(parts.map((part) => part.id));
    const next = movePartsWithAttachedTopology(before, parts, movingPartIds);
    if (phase === "move") {
      setDocument(next);
      return;
    }
    flowDragBeforeRef.current = null;
    flowDragPartIdsRef.current = null;
    setDocument(next);
    if (before && !samePartPositions(before, next)) {
      historyRef.current = [...historyRef.current, before].slice(-HISTORY_LIMIT);
      futureRef.current = [];
      setHistoryAvailability({ canUndo: true, canRedo: false });
      setMessage(`${parts.length} component${parts.length === 1 ? "" : "s"} moved · connected wires rerouted`);
    }
  }

  function updateWirePoints(wireId: string, points: Point[], phase: "start" | "move" | "stop") {
    const bounded = points.slice(0, 40).map((point) => ({ x: clamp(point.x, 0, WORLD.width), y: clamp(point.y, 0, WORLD.height) }));
    const applyPoints = (current: CircuitDocument): CircuitDocument => ({
      ...current,
      wires: current.wires.map((candidate) => candidate.id === wireId ? { ...candidate, waypoints: bounded } : candidate),
    });
    if (phase === "start") {
      wireDragBeforeRef.current = cloneDocument(document);
      return;
    }
    if (phase === "move") {
      setDocument(applyPoints);
      return;
    }
    const before = wireDragBeforeRef.current;
    wireDragBeforeRef.current = null;
    const next = applyPoints(document);
    setDocument(next);
    const previousPoints = before?.wires.find((candidate) => candidate.id === wireId)?.waypoints ?? [];
    if (before && !samePoints(previousPoints, bounded)) {
      historyRef.current = [...historyRef.current, before].slice(-HISTORY_LIMIT);
      futureRef.current = [];
      setHistoryAvailability({ canUndo: true, canRedo: false });
      setMessage("Wire segment moved · endpoints stayed connected");
    }
  }

  function deleteWire(wireId: string) {
    const removed = document.wires.find((candidate) => candidate.id === wireId);
    if (!removed) return;
    const touchedJunctions = junctionIdsFromEndpoints(removed.from, removed.to);
    const next = cleanupTouchedAutomaticJunctions(
      { ...document, wires: document.wires.filter((candidate) => candidate.id !== wireId) },
      touchedJunctions,
    );
    commit(next, `${wireId} removed · automatic junctions cleaned`);
    setSelection(EMPTY_SELECTION);
  }

  function onEditorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const editing = target.matches("input, textarea, select, [contenteditable='true']") || target.isContentEditable;
    if (editing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      return event.shiftKey ? redo() : undo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); return redo(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); return copySelection(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") { event.preventDefault(); return pasteSelection(); }
    if (event.key === "Escape") {
      setTool("select");
      setMessage("Select mode");
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const shortcut = event.key.toLowerCase();
      if (shortcut === "v") { event.preventDefault(); setTool("select"); setMessage("Select mode"); return; }
      if (shortcut === "w") { event.preventDefault(); setTool("wire"); setMessage("Wire mode · click any pin, then another pin or wire"); return; }
      if (shortcut === "h") { event.preventDefault(); setTool("pan"); setMessage("Pan tool · drag the sheet"); return; }
    }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); return deleteSelection(); }
    if (event.key.toLowerCase() === "r") { event.preventDefault(); return rotateSelection(); }
    if (!selection.partIds.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const distance = event.shiftKey ? 50 : GRID;
    const dx = event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
    const dy = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
    const movingPartIds = new Set(selection.partIds);
    const reportedPositions = document.parts
      .filter((part) => movingPartIds.has(part.id))
      .map((part) => ({ id: part.id, x: part.x + dx, y: part.y + dy }));
    commit(movePartsWithAttachedTopology(document, reportedPositions, movingPartIds), "Selection moved · connected wires preserved");
  }

  function copySelection() {
    const parts = document.parts.filter((part) => selection.partIds.includes(part.id));
    if (!parts.length) return;
    clipboardRef.current = {
      parts: parts.map((part) => ({ ...part })),
      wires: document.wires.filter((wire) => endpointInParts(wire.from, selection.partIds) && endpointInParts(wire.to, selection.partIds)).map(cloneWire),
    };
    setMessage(`${parts.length} component${parts.length === 1 ? "" : "s"} copied`);
  }

  function pasteSelection() {
    const clipboard = clipboardRef.current;
    if (!clipboard || !clipboard.parts.length) return setMessage("Copy one or more components first.");
    if (document.parts.length + clipboard.parts.length > MAX_PARTS) return setMessage(`Paste would exceed the ${MAX_PARTS}-component limit.`);
    const mapping = new Map<string, string>();
    const occupied = [...document.parts];
    const parts = clipboard.parts.map((part) => {
      const id = nextReference(occupied, part.kind);
      const pasted = { ...part, id, x: clamp(part.x + 40, 50, WORLD.width - 50), y: clamp(part.y + 40, 50, WORLD.height - 50) };
      mapping.set(part.id, id);
      occupied.push(pasted);
      return pasted;
    });
    const wireIds = [...document.wires.map((item) => item.id)];
    const wires = clipboard.wires.map((wire) => {
      const id = nextId("W", wireIds);
      wireIds.push(id);
      return {
        ...cloneWire(wire), id,
        from: remapEndpoint(wire.from, mapping),
        to: remapEndpoint(wire.to, mapping),
        waypoints: wire.waypoints.map((point) => ({ x: point.x + 40, y: point.y + 40 })),
      };
    });
    commit({ ...document, parts: [...document.parts, ...parts], wires: [...document.wires, ...wires] }, "Selection duplicated");
    setSelection({ partIds: parts.map((part) => part.id), wireId: null, junctionId: null });
  }

  function rotateSelection() {
    if (!selection.partIds.length) return;
    commit({ ...document, parts: document.parts.map((part) => selection.partIds.includes(part.id) ? { ...part, rotation: ((part.rotation + 90) % 360) as Rotation } : part) }, "Selection rotated 90°");
  }

  function deleteSelection() {
    const partIds = new Set(selection.partIds);
    const wireId = selection.wireId;
    const junctionId = selection.junctionId;
    if (!partIds.size && !wireId && !junctionId) return;
    const retainedWires = document.wires.filter((wire) => wire.id !== wireId && !endpointMatchesSelection(wire.from, partIds, junctionId) && !endpointMatchesSelection(wire.to, partIds, junctionId));
    const retainedWireIds = new Set(retainedWires.map((wire) => wire.id));
    const touchedJunctions = new Set<string>();
    for (const wire of document.wires) {
      if (retainedWireIds.has(wire.id)) continue;
      for (const id of junctionIdsFromEndpoints(wire.from, wire.to)) touchedJunctions.add(id);
    }
    if (junctionId) touchedJunctions.add(junctionId);
    const next = cleanupTouchedAutomaticJunctions({
      parts: document.parts.filter((part) => !partIds.has(part.id)),
      junctions: document.junctions.filter((junction) => junction.id !== junctionId),
      wires: retainedWires,
    }, touchedJunctions);
    commit(next, touchedJunctions.size ? "Selection removed · automatic junctions cleaned" : "Selection removed");
    setSelection(EMPTY_SELECTION);
  }

  function updatePart(patch: Partial<Part>) {
    if (!selectedPart) return;
    commit({ ...document, parts: document.parts.map((part) => part.id === selectedPart.id ? { ...part, ...patch } : part) }, `${selectedPart.id} updated`);
  }

  function saveProject() {
    const project = { schema: "anacode.schematic", version: 1, document, analysis };
    downloadBlob("anacode-circuit.json", JSON.stringify(project, null, 2), "application/json");
    setMessage("AnaCode schematic project saved");
  }

  async function loadProject(file: File | undefined) {
    if (!file) return;
    if (file.size > 250_000) return setMessage("Project files are limited to 250 KB.");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const loaded = validateProject(parsed);
      commit(loaded.document, "AnaCode schematic project loaded");
      setAnalysis(loaded.analysis);
      setSelection(EMPTY_SELECTION);
      setTool("select");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project could not be loaded.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function runSimulation() {
    try {
      const compiled = compileCircuit(document, analysis);
      onSimulate(compiled.netlist, compiled.probes, compiled.circuitDocument);
      setMessage(`Simulation handoff ready · ${compiled.probes.length || 1} instrument channel${compiled.probes.length === 1 ? "" : "s"}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The circuit could not be prepared for simulation.");
    }
  }

  function exportAdvancedDeck() {
    try {
      const compiled = compileCircuit(document, analysis);
      downloadBlob("anacode-generated-deck.cir", compiled.netlist, "text/plain");
      setMessage("Generated simulator deck exported from the schematic");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The simulator deck could not be generated.");
    }
  }

  return (
    <div className="textbook-editor professional-schematic" data-editor-ready={editorReady ? "true" : "false"} aria-busy={!editorReady}>
      <div className="editor-commandbar">
        <div className="editor-tools" role="toolbar" aria-label="Schematic editing tools">
          <button aria-pressed={tool === "select"} className={tool === "select" ? "active" : ""} onClick={() => setTool("select")} title="Select and move (V)"><MousePointer2 size={16} /><span>Select</span><kbd>V</kbd></button>
          <button aria-pressed={tool === "wire"} className={tool === "wire" ? "active" : ""} onClick={() => { setTool("wire"); setMessage("Wire mode · click any pin, then another pin or wire"); }} title="Connect pins with an obstacle-routed wire (W)"><Cable size={16} /><span>Wire</span><kbd>W</kbd></button>
          <button aria-pressed={tool === "pan"} className={tool === "pan" ? "active" : ""} onClick={() => setTool("pan")} title="Pan the sheet (H)"><Hand size={16} /><span>Pan</span><kbd>H</kbd></button>
          <span className="toolbar-divider" />
          <button onClick={undo} disabled={!historyAvailability.canUndo} title="Undo (Ctrl+Z)"><Undo2 size={16} /><span>Undo</span></button>
          <button onClick={redo} disabled={!historyAvailability.canRedo} title="Redo (Ctrl+Y)"><Redo2 size={16} /><span>Redo</span></button>
          <button onClick={rotateSelection} disabled={!selection.partIds.length} title="Rotate selection (R)"><RotateCw size={16} /><kbd>R</kbd></button>
          <button onClick={copySelection} disabled={!selection.partIds.length} title="Copy selection (Ctrl+C)"><Copy size={16} /></button>
          <button onClick={deleteSelection} disabled={!selection.partIds.length && !selection.wireId && !selection.junctionId} title="Delete selection"><Trash2 size={16} /></button>
        </div>
        <div className="editor-export-actions">
          <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => void loadProject(event.target.files?.[0])} />
          <button onClick={() => fileInputRef.current?.click()} title="Open AnaCode schematic"><FolderOpen size={15} /><span>Open</span></button>
          <button onClick={saveProject} title="Save AnaCode schematic"><Save size={15} /><span>Save</span></button>
          <button className="simulate-draft" onClick={runSimulation}><Play size={15} fill="currentColor" /> Simulate circuit</button>
        </div>
      </div>

      <div className="editor-body schematic-workspace">
        <aside className="schematic-library" aria-label="Component library">
          <div className="library-heading"><strong>Components</strong><span>drag or click to place</span></div>
          <label className="library-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value.slice(0, 40))} placeholder="Search symbols" aria-label="Search components" /></label>
          <div className="library-groups">
            {Object.entries(libraryGroups).map(([category, items]) => (
              <section key={category}>
                <h3>{category}</h3>
                <div className="library-grid">
                  {items.map((item) => (
                    <button
                      type="button"
                      className={tool === item.kind ? "active" : ""}
                      key={item.kind}
                      draggable
                      onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-anacode-symbol", item.kind); }}
                      onClick={() => { setTool(item.kind); setMessage(`${item.label} selected · click the sheet to place`); }}
                      title={`Place ${item.label}`}
                    >
                      <SchematicGlyph kind={item.kind} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {!filteredLibrary.length && <p className="library-empty">No symbol matches that search.</p>}
          </div>
        </aside>

        <div className="schematic-paper" role="region" aria-label="Schematic drawing sheet">
          <SchematicFlowCanvas
            document={document}
            selection={selection}
            tool={tool}
            onPlacePart={placePart}
            onSelectionChange={changeFlowSelection}
            onMoveParts={moveFlowParts}
            onConnect={connectEndpoints}
            onBranchWire={branchWire}
            onWirePointsChange={updateWirePoints}
            onDeleteWire={deleteWire}
            onKeyDown={onEditorKeyDown}
            onMessage={setMessage}
          />
          <details className="schematic-shortcuts">
            <summary title="Keyboard and navigation shortcuts"><Keyboard size={14} /> Shortcuts</summary>
            <div>
              <span><kbd>V</kbd>Select</span><span><kbd>W</kbd>Wire</span><span><kbd>H</kbd>Pan</span><span><kbd>Pin</kbd>Start wire</span>
              <span><kbd>R</kbd>Rotate</span><span><kbd>Del</kbd>Delete</span><span><kbd>Esc</kbd>Cancel</span><span><kbd>Ctrl</kbd> + wheel zoom</span>
              <span><kbd>Wheel</kbd>Pan</span><span><kbd>Ctrl Z</kbd>Undo</span><span><kbd>Ctrl C/V</kbd>Copy / paste</span><span><kbd>Drag</kbd>Box select</span><span><kbd>Shift</kbd>Add selection</span>
            </div>
          </details>
          <p className="sr-only" id="schematic-keyboard-help">V selects, W enters wire mode, and H pans. Drag an empty area to box-select components, or hold Shift to add to the selection. Click any component pin to start or finish a wire; clicking an existing wire while connecting creates a junction automatically. Arrow keys move the selection, R rotates, Delete removes, Control C and V duplicate, and Control Z or Y undo and redo. Control or Command plus wheel zooms under the pointer; wheel pans the sheet.</p>
        </div>

        <aside className="schematic-inspector">
          <div className="inspector-heading"><CircleDot size={15} /> Properties</div>
          {selectedPart ? (
            <div className="inspector-form">
              <label>Reference<input value={selectedPart.id} readOnly /></label>
              {isIndependentSource(selectedPart.kind) && <label>Source waveform<select value={selectedPart.source?.mode ?? "dc"} onChange={(event) => updatePart({ source: { ...defaultSource(), ...selectedPart.source, mode: event.target.value as SourceSetup["mode"] } })}><option value="dc">DC</option><option value="sine">Sine</option><option value="pulse">Pulse</option></select></label>}
              {supportsValue(selectedPart.kind) && <label>{isIndependentSource(selectedPart.kind) ? selectedPart.source?.mode === "pulse" ? "Low level" : selectedPart.source?.mode === "sine" ? "Offset" : "DC value" : "Value"}<input value={selectedPart.value} onChange={(event) => updatePart({ value: event.target.value.slice(0, 32) })} /></label>}
              {isIndependentSource(selectedPart.kind) && selectedPart.source?.mode === "sine" && <div className="analysis-pair"><label>Amplitude<input value={selectedPart.source.amplitude} onChange={(event) => updatePart({ source: { ...selectedPart.source!, amplitude: event.target.value.slice(0, 16) } })} /></label><label>Frequency<input value={selectedPart.source.frequency} onChange={(event) => updatePart({ source: { ...selectedPart.source!, frequency: event.target.value.slice(0, 16) } })} /></label></div>}
              {isIndependentSource(selectedPart.kind) && selectedPart.source?.mode === "pulse" && <><label>High level<input value={selectedPart.source.high} onChange={(event) => updatePart({ source: { ...selectedPart.source!, high: event.target.value.slice(0, 16) } })} /></label><div className="analysis-pair"><label>Rise<input value={selectedPart.source.rise} onChange={(event) => updatePart({ source: { ...selectedPart.source!, rise: event.target.value.slice(0, 16) } })} /></label><label>Fall<input value={selectedPart.source.fall} onChange={(event) => updatePart({ source: { ...selectedPart.source!, fall: event.target.value.slice(0, 16) } })} /></label></div><div className="analysis-pair"><label>On time<input value={selectedPart.source.width} onChange={(event) => updatePart({ source: { ...selectedPart.source!, width: event.target.value.slice(0, 16) } })} /></label><label>Period<input value={selectedPart.source.period} onChange={(event) => updatePart({ source: { ...selectedPart.source!, period: event.target.value.slice(0, 16) } })} /></label></div></>}
              {selectedPart.kind === "probe" && <label>Channel label<input value={selectedPart.label ?? ""} onChange={(event) => updatePart({ label: sanitizeLabel(event.target.value) })} /></label>}
              {selectedPart.kind === "power" && <label>Global power net<input value={selectedPart.label ?? "VCC"} onChange={(event) => updatePart({ label: sanitizeLabel(event.target.value) || "VCC" })} /></label>}
              <label>Symbol<input value={labelForKind(selectedPart.kind)} readOnly /></label>
              <label>Orientation<input value={`${selectedPart.rotation}°`} readOnly /></label>
              <button onClick={rotateSelection}><RotateCw size={15} /> Rotate 90°</button>
              {(selectedPart.kind === "opamp" || selectedPart.kind === "comparator") && <button onClick={() => updatePart({ mirrorY: !selectedPart.mirrorY })}><Cable size={15} /> Swap + / − position</button>}
              <button className="danger" onClick={deleteSelection}><Trash2 size={15} /> Delete</button>
            </div>
          ) : selection.partIds.length > 1 ? (
            <div className="inspector-empty"><strong>{selection.partIds.length} components selected</strong><br />Move, rotate, copy, or delete them as a group.</div>
          ) : selection.wireId ? (
            <div className="inspector-form"><label>Connection<input value={selection.wireId} readOnly /></label><p className="wire-edit-tip">Drag any amber wire segment perpendicular to itself. Both endpoints stay attached and every move remains orthogonal.</p><button className="danger" onClick={deleteSelection}><Trash2 size={15} /> Delete wire</button></div>
          ) : <div className="inspector-empty">Select a symbol or wire to inspect it. Junction dots are generated automatically when a net branches.</div>}

          <div className="analysis-setup">
            <span>Instrument setup</span>
            <label>Analysis<select value={analysis.mode} onChange={(event) => setAnalysis({ ...analysis, mode: event.target.value as AnalysisSetup["mode"] })}><option value="op">DC operating point</option><option value="transient">Oscilloscope / transient</option><option value="ac">Bode / AC sweep</option><option value="dc-sweep">DC curve tracer</option></select></label>
            {analysis.mode === "transient" && <div className="analysis-pair"><label>Time step<input value={analysis.transientStep} onChange={(event) => setAnalysis({ ...analysis, transientStep: event.target.value.slice(0, 16) })} /></label><label>Stop time<input value={analysis.transientStop} onChange={(event) => setAnalysis({ ...analysis, transientStop: event.target.value.slice(0, 16) })} /></label></div>}
            {analysis.mode === "ac" && <><label>Points / decade<input value={analysis.acPoints} onChange={(event) => setAnalysis({ ...analysis, acPoints: event.target.value.replace(/\D/g, "").slice(0, 4) })} /></label><div className="analysis-pair"><label>Start<input value={analysis.acStart} onChange={(event) => setAnalysis({ ...analysis, acStart: event.target.value.slice(0, 16) })} /></label><label>Stop<input value={analysis.acStop} onChange={(event) => setAnalysis({ ...analysis, acStop: event.target.value.slice(0, 16) })} /></label></div></>}
            {analysis.mode === "dc-sweep" && <><label>Source reference<input value={analysis.dcSource} onChange={(event) => setAnalysis({ ...analysis, dcSource: event.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24) })} /></label><div className="analysis-pair"><label>Start<input value={analysis.dcStart} onChange={(event) => setAnalysis({ ...analysis, dcStart: event.target.value.slice(0, 16) })} /></label><label>Stop<input value={analysis.dcStop} onChange={(event) => setAnalysis({ ...analysis, dcStop: event.target.value.slice(0, 16) })} /></label></div><label>Step<input value={analysis.dcStep} onChange={(event) => setAnalysis({ ...analysis, dcStep: event.target.value.slice(0, 16) })} /></label></>}
          </div>

          <details className="advanced-interchange">
            <summary>Advanced interoperability <ChevronDown size={14} /></summary>
            <p>AnaCode generates the solver input from the drawing. Learners never need to write a netlist.</p>
            <button onClick={exportAdvancedDeck}><Download size={14} /> Export generated deck</button>
          </details>
        </aside>
      </div>
      <div className="editor-status"><span className={isWarning(message) ? "warn" : ""} aria-live="polite">{message}</span><span>{document.parts.length}/{MAX_PARTS} symbols · {document.wires.length}/{MAX_WIRES} wires · {document.parts.filter((part) => part.kind === "probe").length} probes</span></div>
    </div>
  );
}

function makeDocument(parts: Part[], wires: Wire[], junctions: Junction[] = []): CircuitDocument { return { parts, wires, junctions }; }
function part(id: string, kind: SchematicKind, x: number, y: number, rotation: Rotation = 0, value = "", label?: string, source?: SourceSetup): Part { return { id, kind, x, y, rotation, value, label, source }; }
function wire(id: string, from: Endpoint, to: Endpoint, waypoints: Point[] = []): Wire { return { id, from, to, waypoints }; }
function junctionEndpoint(junctionId: string): Endpoint { return { type: "junction", junctionId }; }
function junction(id: string, x: number, y: number, label?: string): Junction { return { id, x, y, label }; }

function pin(partId: string, pinIndex: number): Endpoint {
  return { type: "pin", partId, pin: pinIndex };
}

function compileCircuit(document: CircuitDocument, analysis: AnalysisSetup) {
  const electricalDocument = compileEditorCircuitDocument(document, analysis);
  const generated = generateSpiceDeckFromCircuitDocument(electricalDocument, { target: "browser-preview" });
  const probes = validateSimulatorProbes(generated.ir.probes.flatMap((probe) => probe.quantity === "voltage" ? [probe.node] : []));
  return { netlist: generated.deck, probes, circuitDocument: electricalDocument };
}

export function compileEditorCircuitDocument(document: CircuitDocument, analysis: AnalysisSetup): ElectricalCircuitDocument {
  const visualElectricalParts = document.parts.filter((part) => part.kind !== "probe" && part.kind !== "power");
  const unsupported = visualElectricalParts.filter((part) => !isSimulatedKind(part.kind));
  if (unsupported.length) throw new Error(`No trusted simulation model is configured for ${unsupported.slice(0, 3).map((part) => `${part.id} (${labelForKind(part.kind)})`).join(", ")}. It can remain in the diagram, but must be replaced before simulation.`);
  if (!visualElectricalParts.some((part) => part.kind !== "ground")) throw new Error("Place at least one electrical component before simulating.");

  // Ground is a global reference: several local ground symbols improve the
  // drawing without creating several physical components in the compiled IR.
  const firstGround = visualElectricalParts.find((part) => part.kind === "ground" && part.id.toUpperCase() === "GND1")
    ?? visualElectricalParts.find((part) => part.kind === "ground");
  const supportedParts = visualElectricalParts.filter((part) => part.kind !== "ground" || part === firstGround);
  const idByPart = new Map(supportedParts.map((part) => [part.id, `c-${part.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`]));
  if (firstGround) {
    const groundComponentId = idByPart.get(firstGround.id)!;
    for (const ground of visualElectricalParts.filter((part) => part.kind === "ground")) idByPart.set(ground.id, groundComponentId);
  }
  const junctionId = (id: string) => `junction-${id.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
  const components = supportedParts.map((part) => toElectricalComponent(part, idByPart.get(part.id)!, analysis));
  const probeTargets = new Map<string, Endpoint>();
  // Power ports are actual connection points in the drawing. Give every port
  // one virtual junction so probes and several wires can attach to that same
  // terminal, including wires between two power symbols.
  const powerParts = document.parts.filter((part) => part.kind === "power");
  const powerPortJunctions = powerParts.map((part, index) => ({
    id: `junction-power-port-${index + 1}`,
    position: { x: part.x, y: part.y },
  }));
  const powerJunctionByPart = new Map(powerParts.map((part, index) => [part.id, powerPortJunctions[index].id]));
  const electricalEndpoint = (endpoint: Endpoint): ElectricalEndpoint => {
    const powerJunction = endpoint.type === "pin" ? powerJunctionByPart.get(endpoint.partId) : undefined;
    return powerJunction
      ? { type: "junction", junctionId: powerJunction }
      : toElectricalEndpoint(endpoint, document, idByPart, junctionId);
  };
  const wires: ElectricalCircuitDocument["wires"][number][] = [];

  for (const [index, visualWire] of document.wires.entries()) {
    const fromPartId = visualWire.from.type === "pin" ? visualWire.from.partId : null;
    const toPartId = visualWire.to.type === "pin" ? visualWire.to.partId : null;
    const fromPart = fromPartId === null ? undefined : document.parts.find((part) => part.id === fromPartId);
    const toPart = toPartId === null ? undefined : document.parts.find((part) => part.id === toPartId);
    const fromProbe = fromPart?.kind === "probe";
    const toProbe = toPart?.kind === "probe";
    if (fromProbe || toProbe) {
      if (fromProbe && !toProbe) {
        const endpoint = visualWire.from;
        if (endpoint.type === "pin") probeTargets.set(endpoint.partId, visualWire.to);
      }
      if (toProbe && !fromProbe) {
        const endpoint = visualWire.to;
        if (endpoint.type === "pin") probeTargets.set(endpoint.partId, visualWire.from);
      }
      continue;
    }
    wires.push({
      id: `wire-${index + 1}`,
      from: electricalEndpoint(visualWire.from),
      to: electricalEndpoint(visualWire.to),
      waypoints: visualWire.waypoints,
    });
  }

  for (const part of supportedParts) {
    if (part.kind !== "nmos" && part.kind !== "pmos") continue;
    const componentId = idByPart.get(part.id)!;
    wires.push({
      id: `body-${componentId}`,
      from: { type: "pin", componentId, pinId: "body" },
      to: { type: "pin", componentId, pinId: "source" },
      waypoints: [],
    });
  }

  const probeParts = document.parts.filter((part) => part.kind === "probe");
  if (probeParts.length > SIMULATOR_NETLIST_LIMITS.probes) throw new Error(`Select at most ${SIMULATOR_NETLIST_LIMITS.probes} probes.`);
  const probes = probeParts.map((part, index) => {
    const target = probeTargets.get(part.id);
    if (!target) throw new Error(`${part.id} is not connected to a circuit node.`);
    return {
      id: `probe-${index + 1}`,
      label: part.label || part.id,
      quantity: "voltage" as const,
      target: electricalEndpoint(target),
    };
  });
  if (!probes.length) throw new Error("Place at least one voltage probe before simulating.");

  const netLabels: ElectricalCircuitDocument["netLabels"] = [...document.junctions.flatMap((junction, index) => junction.label ? [{
    id: `label-${index + 1}`,
    name: safeNode(junction.label),
    target: { type: "junction" as const, junctionId: junctionId(junction.id) },
    position: { x: junction.x + 10, y: junction.y - 10 },
  }] : []), ...powerParts.map((part, index) => ({
    id: `power-label-${index + 1}`,
    name: safeNode(part.label || "VCC"),
    target: { type: "junction" as const, junctionId: powerPortJunctions[index].id },
    position: powerPortJunctions[index].position,
  }))];

  return {
    version: 1,
    id: "editor-circuit",
    title: "AnaCode schematic",
    revision: 0,
    components,
    junctions: document.junctions.map((junction) => ({ id: junctionId(junction.id), position: { x: junction.x, y: junction.y } })).concat(powerPortJunctions),
    wires,
    netLabels,
    probes,
    analyses: [toElectricalAnalysis(analysis, supportedParts, idByPart)],
    settings: { gridSize: GRID, snapToGrid: true },
  };
}

function toElectricalComponent(part: Part, id: string, analysis: AnalysisSetup): ElectricalComponent {
  const base = { id, reference: electricalReference(part), position: { x: part.x, y: part.y }, rotation: part.rotation };
  if (part.kind === "ground") return { ...base, kind: "ground", parameters: {} };
  if (part.kind === "resistor") return { ...base, kind: "resistor", parameters: { resistanceOhm: requiredNumber(part.value, part.id, true) } };
  if (part.kind === "capacitor" || part.kind === "capacitor-polarized") return { ...base, kind: "capacitor", parameters: { capacitanceF: requiredNumber(part.value, part.id, true) } };
  if (part.kind === "inductor") return { ...base, kind: "inductor", parameters: { inductanceH: requiredNumber(part.value, part.id, true) } };
  if (part.kind === "voltage" || part.kind === "battery") return { ...base, kind: "voltage-source", parameters: sourceParameters(part, analysis, "voltage") };
  if (part.kind === "current") return { ...base, kind: "current-source", parameters: sourceParameters(part, analysis, "current") };
  if (part.kind === "diode") return { ...base, kind: "diode", parameters: { model: "generic-silicon", area: 1 } };
  if (part.kind === "npn") return { ...base, kind: "bjt-npn", parameters: { model: "generic-npn", area: 1 } };
  if (part.kind === "pnp") return { ...base, kind: "bjt-pnp", parameters: { model: "generic-pnp", area: 1 } };
  if (part.kind === "nmos") return { ...base, kind: "mosfet-nmos", parameters: { model: "generic-nmos-90nm", widthM: requiredNumber(part.value, part.id, true), lengthM: 90e-9, multiplier: 1 } };
  if (part.kind === "pmos") return { ...base, kind: "mosfet-pmos", parameters: { model: "generic-pmos-90nm", widthM: requiredNumber(part.value, part.id, true), lengthM: 90e-9, multiplier: 1 } };
  if (part.kind === "opamp") return { ...base, kind: "op-amp-ideal", parameters: { openLoopGain: 1e6 } };
  throw new Error(`${part.id} does not have a trusted electrical model.`);
}

type VoltageSourceParameters = Extract<ElectricalComponent, { kind: "voltage-source" }>["parameters"];
type CurrentSourceParameters = Extract<ElectricalComponent, { kind: "current-source" }>["parameters"];

function sourceParameters(part: Part, analysis: AnalysisSetup, quantity: "voltage"): VoltageSourceParameters;
function sourceParameters(part: Part, analysis: AnalysisSetup, quantity: "current"): CurrentSourceParameters;
function sourceParameters(part: Part, analysis: AnalysisSetup, quantity: "voltage" | "current"): VoltageSourceParameters | CurrentSourceParameters {
  const source = part.source ?? defaultSource();
  const dc = requiredNumber(part.value, `${part.id} DC value`);
  const ac = analysis.mode === "ac" ? { magnitude: 1, phaseDeg: 0 } : undefined;
  const transient = source.mode === "sine" ? {
    type: "sine" as const,
    offset: dc,
    amplitude: requiredNumber(source.amplitude, `${part.id} amplitude`, true),
    frequencyHz: requiredNumber(source.frequency, `${part.id} frequency`, true),
    delayS: 0,
    dampingPerS: 0,
    phaseDeg: 0,
  } : source.mode === "pulse" ? {
    type: "pulse" as const,
    low: dc,
    high: requiredNumber(source.high, `${part.id} high level`),
    delayS: requiredNumber(source.delay, `${part.id} delay`),
    riseS: requiredNumber(source.rise, `${part.id} rise time`, true),
    fallS: requiredNumber(source.fall, `${part.id} fall time`, true),
    widthS: requiredNumber(source.width, `${part.id} pulse width`, true),
    periodS: requiredNumber(source.period, `${part.id} period`, true),
  } : undefined;
  return quantity === "voltage" ? { dcV: dc, ac, transient } : { dcA: dc, ac, transient };
}

function toElectricalEndpoint(endpoint: Endpoint, document: CircuitDocument, idByPart: Map<string, string>, junctionId: (id: string) => string): ElectricalEndpoint {
  if (endpoint.type === "junction") return { type: "junction", junctionId: junctionId(endpoint.junctionId) };
  const part = document.parts.find((candidate) => candidate.id === endpoint.partId);
  const componentId = idByPart.get(endpoint.partId);
  if (!part || !componentId) throw new Error("A wire points to a missing or non-electrical symbol.");
  const pinsByKind: Partial<Record<SchematicKind, string[]>> = {
    ground: ["gnd"], resistor: ["a", "b"], capacitor: ["a", "b"], "capacitor-polarized": ["a", "b"], inductor: ["a", "b"],
    voltage: ["positive", "negative"], battery: ["positive", "negative"], current: ["positive", "negative"], diode: ["anode", "cathode"],
    npn: ["base", "collector", "emitter"], pnp: ["base", "collector", "emitter"], nmos: ["gate", "drain", "source"], pmos: ["gate", "drain", "source"],
    opamp: ["nonInverting", "inverting", "output"],
  };
  const pinId = pinsByKind[part.kind]?.[endpoint.pin];
  if (!pinId) throw new Error(`${part.id} pin ${endpoint.pin + 1} is not available to the trusted circuit compiler.`);
  return { type: "pin", componentId, pinId };
}

function toElectricalAnalysis(analysis: AnalysisSetup, parts: Part[], idByPart: Map<string, string>): ElectricalAnalysis {
  if (analysis.mode === "op") return { id: "analysis-main", name: "Operating point", type: "operating-point" };
  if (analysis.mode === "transient") return { id: "analysis-main", name: "Oscilloscope", type: "transient", stepS: requiredNumber(analysis.transientStep, "Transient step", true), stopS: requiredNumber(analysis.transientStop, "Transient stop", true), startS: 0 };
  if (analysis.mode === "ac") return { id: "analysis-main", name: "Frequency response", type: "ac-sweep", scale: "decade", points: requiredInteger(analysis.acPoints, "AC points per decade", 1_000), startHz: requiredNumber(analysis.acStart, "AC start", true), stopHz: requiredNumber(analysis.acStop, "AC stop", true) };
  const source = parts.find((part) => part.id.toLowerCase() === analysis.dcSource.toLowerCase() && isIndependentSource(part.kind));
  if (!source) throw new Error(`DC sweep source ${analysis.dcSource || "(empty)"} is not a voltage or current source in the schematic.`);
  return { id: "analysis-main", name: "DC curve", type: "dc-sweep", sourceComponentId: idByPart.get(source.id)!, start: requiredNumber(analysis.dcStart, "DC sweep start"), stop: requiredNumber(analysis.dcStop, "DC sweep stop"), step: requiredNumber(analysis.dcStep, "DC sweep step") };
}

function electricalReference(part: Part) {
  const reference = part.kind === "battery" ? `V${part.id}` : part.id;
  return reference.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 16);
}

function requiredNumber(value: string, label: string, positive = false) {
  const parsed = parseEngineeringNumber(value);
  if (parsed === null || (positive && parsed <= 0) || Math.abs(parsed) > 1e15) throw new Error(`${label} must be a valid${positive ? " positive" : ""} engineering value.`);
  return parsed;
}

function requiredInteger(value: string, label: string, maximum: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) throw new Error(`${label} must be an integer from 1 to ${maximum}.`);
  return parsed;
}

function isSimulatedKind(kind: SchematicKind) {
  return ["ground", "resistor", "capacitor", "capacitor-polarized", "inductor", "voltage", "battery", "current", "diode", "npn", "pnp", "nmos", "pmos", "opamp"].includes(kind);
}

function validateProject(value: unknown): { document: CircuitDocument; analysis: AnalysisSetup } {
  if (!value || typeof value !== "object") throw new Error("This is not an AnaCode schematic project.");
  const project = value as Record<string, unknown>;
  if (project.schema !== "anacode.schematic" || project.version !== 1 || !project.document || typeof project.document !== "object") throw new Error("Unsupported schematic project schema.");
  const raw = project.document as Record<string, unknown>;
  if (!Array.isArray(raw.parts) || !Array.isArray(raw.wires) || !Array.isArray(raw.junctions)) throw new Error("Schematic document is incomplete.");
  if (raw.parts.length > MAX_PARTS || raw.wires.length > MAX_WIRES || raw.junctions.length > MAX_JUNCTIONS) throw new Error("Schematic project exceeds safe editor limits.");
  const parts = raw.parts.map((item) => validatePart(item));
  const junctions = raw.junctions.map((item) => validateJunction(item));
  const partIds = new Set(parts.map((part) => part.id));
  const junctionIds = new Set(junctions.map((junction) => junction.id));
  if (partIds.size !== parts.length || junctionIds.size !== junctions.length) throw new Error("Schematic identifiers must be unique.");
  const wires = raw.wires.map((item) => validateWire(item, parts, junctionIds));
  if (new Set(wires.map((wire) => wire.id)).size !== wires.length) throw new Error("Wire identifiers must be unique.");
  const analysis = validateAnalysisObject(project.analysis);
  return { document: { parts, wires, junctions }, analysis };
}

function validatePart(value: unknown): Part {
  if (!value || typeof value !== "object") throw new Error("Invalid component record.");
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(item.id) || !isSchematicKind(item.kind) || typeof item.x !== "number" || typeof item.y !== "number" || ![0, 90, 180, 270].includes(Number(item.rotation)) || typeof item.value !== "string") throw new Error("Invalid component fields.");
  if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || item.x < 0 || item.x > WORLD.width || item.y < 0 || item.y > WORLD.height || item.value.length > 32) throw new Error("Component value or position is outside editor limits.");
  return { id: item.id, kind: item.kind, x: item.x, y: item.y, rotation: item.rotation as Rotation, value: item.value, label: typeof item.label === "string" ? sanitizeLabel(item.label) : undefined, source: validateSource(item.source), mirrorY: item.mirrorY === true };
}

function validateSource(value: unknown): SourceSetup | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error("Invalid source waveform settings.");
  const item = value as Record<string, unknown>;
  if (item.mode !== "dc" && item.mode !== "sine" && item.mode !== "pulse") throw new Error("Invalid source waveform mode.");
  const field = (name: keyof Omit<SourceSetup, "mode">, fallback: string) => boundedText(item[name], fallback);
  const defaults = defaultSource();
  return {
    mode: item.mode,
    amplitude: field("amplitude", defaults.amplitude),
    frequency: field("frequency", defaults.frequency),
    high: field("high", defaults.high),
    delay: field("delay", defaults.delay),
    rise: field("rise", defaults.rise),
    fall: field("fall", defaults.fall),
    width: field("width", defaults.width),
    period: field("period", defaults.period),
  };
}

function validateJunction(value: unknown): Junction {
  if (!value || typeof value !== "object") throw new Error("Invalid junction record.");
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !/^J[A-Za-z0-9_]{0,23}$/.test(item.id) || typeof item.x !== "number" || typeof item.y !== "number" || !Number.isFinite(item.x) || !Number.isFinite(item.y) || item.x < 0 || item.x > WORLD.width || item.y < 0 || item.y > WORLD.height) throw new Error("Invalid junction fields.");
  return { id: item.id, x: item.x, y: item.y, label: typeof item.label === "string" ? sanitizeLabel(item.label) : undefined };
}

function validateWire(value: unknown, parts: Part[], junctionIds: Set<string>): Wire {
  if (!value || typeof value !== "object") throw new Error("Invalid wire record.");
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !/^W[A-Za-z0-9_]{0,23}$/.test(item.id) || !Array.isArray(item.waypoints) || item.waypoints.length > 40) throw new Error("Invalid wire fields.");
  const validateEndpoint = (raw: unknown): Endpoint => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid wire endpoint.");
    const endpoint = raw as Record<string, unknown>;
    if (endpoint.type === "junction" && typeof endpoint.junctionId === "string" && junctionIds.has(endpoint.junctionId)) return { type: "junction", junctionId: endpoint.junctionId };
    if (endpoint.type === "pin" && typeof endpoint.partId === "string" && Number.isInteger(endpoint.pin)) {
      const part = parts.find((candidate) => candidate.id === endpoint.partId);
      if (part && Number(endpoint.pin) >= 0 && Number(endpoint.pin) < symbolPins(part.kind).length) return { type: "pin", partId: endpoint.partId, pin: Number(endpoint.pin) };
    }
    throw new Error("Wire endpoint does not exist.");
  };
  const waypoints = item.waypoints.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid wire waypoint.");
    const point = raw as Record<string, unknown>;
    if (typeof point.x !== "number" || typeof point.y !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > WORLD.width || point.y < 0 || point.y > WORLD.height) throw new Error("Wire waypoint is outside the sheet.");
    return { x: point.x, y: point.y };
  });
  return { id: item.id, from: validateEndpoint(item.from), to: validateEndpoint(item.to), waypoints };
}

function validateAnalysisObject(value: unknown): AnalysisSetup {
  if (!value || typeof value !== "object") return DEFAULT_ANALYSIS;
  const item = value as Record<string, unknown>;
  const mode = item.mode === "transient" || item.mode === "ac" || item.mode === "dc-sweep" ? item.mode : "op";
  return {
    mode,
    transientStep: boundedText(item.transientStep, DEFAULT_ANALYSIS.transientStep),
    transientStop: boundedText(item.transientStop, DEFAULT_ANALYSIS.transientStop),
    acPoints: boundedText(item.acPoints, DEFAULT_ANALYSIS.acPoints),
    acStart: boundedText(item.acStart, DEFAULT_ANALYSIS.acStart),
    acStop: boundedText(item.acStop, DEFAULT_ANALYSIS.acStop),
    dcSource: boundedText(item.dcSource, DEFAULT_ANALYSIS.dcSource),
    dcStart: boundedText(item.dcStart, DEFAULT_ANALYSIS.dcStart),
    dcStop: boundedText(item.dcStop, DEFAULT_ANALYSIS.dcStop),
    dcStep: boundedText(item.dcStep, DEFAULT_ANALYSIS.dcStep),
  };
}

function boundedText(value: unknown, fallback: string) { return typeof value === "string" && value.length <= 16 ? value : fallback; }

/**
 * React Flow reports one absolute position for every node in a group drag. We
 * reduce those positions to one clamped grid translation so the selection
 * cannot shear apart at the sheet boundary. Junctions are not selectable
 * objects; a junction subgraph follows the drag only when every component pin
 * attached to that subgraph is part of the moving selection. This is the same
 * ownership rule users expect from a schematic block move.
 */
function movePartsWithAttachedTopology(
  base: CircuitDocument,
  reportedPositions: Array<{ id: string; x: number; y: number }>,
  requestedPartIds: Set<string>,
): CircuitDocument {
  const movingParts = base.parts.filter((part) => requestedPartIds.has(part.id));
  const reference = reportedPositions.find((position) => requestedPartIds.has(position.id));
  const referencePart = reference ? base.parts.find((part) => part.id === reference.id) : null;
  if (!movingParts.length || !reference || !referencePart) return base;

  const minimumX = Math.min(...movingParts.map((part) => part.x));
  const maximumX = Math.max(...movingParts.map((part) => part.x));
  const minimumY = Math.min(...movingParts.map((part) => part.y));
  const maximumY = Math.max(...movingParts.map((part) => part.y));
  const dx = clamp(snap(reference.x) - referencePart.x, 60 - minimumX, WORLD.width - 60 - maximumX);
  const dy = clamp(snap(reference.y) - referencePart.y, 60 - minimumY, WORLD.height - 60 - maximumY);
  if (!dx && !dy) return base;

  const movingPartIds = new Set(movingParts.map((part) => part.id));
  const movingJunctionIds = junctionSubgraphsOwnedByParts(base, movingPartIds);
  const endpointMoves = (endpoint: Endpoint) => endpoint.type === "pin"
    ? movingPartIds.has(endpoint.partId)
    : movingJunctionIds.has(endpoint.junctionId);
  const translate = (point: Point) => ({
    x: clamp(point.x + dx, 0, WORLD.width),
    y: clamp(point.y + dy, 0, WORLD.height),
  });

  return {
    parts: base.parts.map((part) => movingPartIds.has(part.id)
      ? { ...part, x: part.x + dx, y: part.y + dy }
      : part),
    junctions: base.junctions.map((item) => movingJunctionIds.has(item.id)
      ? { ...item, ...translate(item) }
      : item),
    wires: base.wires.map((item) => endpointMoves(item.from) && endpointMoves(item.to)
      ? { ...item, waypoints: item.waypoints.map(translate) }
      : item),
  };
}

function junctionSubgraphsOwnedByParts(document: CircuitDocument, movingPartIds: Set<string>) {
  const junctionIds = new Set(document.junctions.map((item) => item.id));
  const neighbours = new Map<string, Set<string>>();
  const terminalParts = new Map<string, Set<string>>();
  for (const id of junctionIds) {
    neighbours.set(id, new Set());
    terminalParts.set(id, new Set());
  }
  for (const item of document.wires) {
    if (item.from.type === "junction" && item.to.type === "junction") {
      neighbours.get(item.from.junctionId)?.add(item.to.junctionId);
      neighbours.get(item.to.junctionId)?.add(item.from.junctionId);
    } else if (item.from.type === "junction" && item.to.type === "pin") {
      terminalParts.get(item.from.junctionId)?.add(item.to.partId);
    } else if (item.from.type === "pin" && item.to.type === "junction") {
      terminalParts.get(item.to.junctionId)?.add(item.from.partId);
    }
  }

  const owned = new Set<string>();
  const visited = new Set<string>();
  for (const start of junctionIds) {
    if (visited.has(start)) continue;
    const component = new Set<string>();
    const attachedParts = new Set<string>();
    const pending = [start];
    while (pending.length) {
      const id = pending.pop()!;
      if (component.has(id)) continue;
      component.add(id);
      visited.add(id);
      for (const partId of terminalParts.get(id) ?? []) attachedParts.add(partId);
      for (const neighbour of neighbours.get(id) ?? []) if (!component.has(neighbour)) pending.push(neighbour);
    }
    if (attachedParts.size && [...attachedParts].every((partId) => movingPartIds.has(partId))) {
      for (const id of component) owned.add(id);
    }
  }
  return owned;
}

/**
 * Junctions are derived topology, never user-owned symbols. Editing can lower
 * the degree of a touched junction: degree zero is removed, degree one is a
 * dangling wire and is pruned, and an unlabelled degree-two junction is
 * collapsed back into one continuous wire. Only touched junctions (and any
 * neighbours affected by that cleanup) are considered, so authored routing
 * elsewhere on the sheet remains unchanged.
 */
function cleanupTouchedAutomaticJunctions(document: CircuitDocument, touched: Iterable<string>): CircuitDocument {
  let wires = document.wires.map(cloneWire);
  let junctions = document.junctions.map((item) => ({ ...item }));
  const pending = new Set(touched);

  while (pending.size) {
    const junctionId = pending.values().next().value as string;
    pending.delete(junctionId);
    const item = junctions.find((candidate) => candidate.id === junctionId);
    if (!item) continue;
    const incidents = wires.filter((candidate) => endpointUsesJunction(candidate.from, junctionId) || endpointUsesJunction(candidate.to, junctionId));
    const degree = incidents.reduce((count, candidate) => count
      + Number(endpointUsesJunction(candidate.from, junctionId))
      + Number(endpointUsesJunction(candidate.to, junctionId)), 0);

    if (degree === 0) {
      junctions = junctions.filter((candidate) => candidate.id !== junctionId);
      continue;
    }

    if (degree === 1) {
      const dangling = incidents[0];
      wires = wires.filter((candidate) => candidate.id !== dangling.id);
      junctions = junctions.filter((candidate) => candidate.id !== junctionId);
      for (const neighbour of junctionIdsFromEndpoints(dangling.from, dangling.to)) if (neighbour !== junctionId) pending.add(neighbour);
      continue;
    }

    if (degree !== 2 || item.label || incidents.length !== 2) continue;
    const [first, second] = incidents;
    const firstLeg = wireLegFromJunction(first, junctionId);
    const secondLeg = wireLegFromJunction(second, junctionId);
    wires = wires.filter((candidate) => candidate.id !== first.id && candidate.id !== second.id);
    junctions = junctions.filter((candidate) => candidate.id !== junctionId);
    if (!firstLeg || !secondLeg || sameEndpoint(firstLeg.endpoint, secondLeg.endpoint)) continue;

    for (const neighbour of junctionIdsFromEndpoints(firstLeg.endpoint, secondLeg.endpoint)) pending.add(neighbour);
    if (wires.some((candidate) => sameConnection(candidate, firstLeg.endpoint, secondLeg.endpoint))) continue;
    const waypoints = dedupeWaypoints([
      ...firstLeg.points.toReversed(),
      { x: item.x, y: item.y },
      ...secondLeg.points,
    ]).slice(0, 40);
    wires.push({ id: first.id, from: firstLeg.endpoint, to: secondLeg.endpoint, waypoints });
  }

  return { parts: document.parts, wires, junctions };
}

function wireLegFromJunction(item: Wire, junctionId: string): { endpoint: Endpoint; points: Point[] } | null {
  if (endpointUsesJunction(item.from, junctionId)) return { endpoint: item.to, points: item.waypoints.map((point) => ({ ...point })) };
  if (endpointUsesJunction(item.to, junctionId)) return { endpoint: item.from, points: item.waypoints.toReversed().map((point) => ({ ...point })) };
  return null;
}

function endpointUsesJunction(endpoint: Endpoint, junctionId: string) {
  return endpoint.type === "junction" && endpoint.junctionId === junctionId;
}

function junctionIdsFromEndpoints(...endpoints: Endpoint[]) {
  return new Set(endpoints.flatMap((endpoint) => endpoint.type === "junction" ? [endpoint.junctionId] : []));
}

function dedupeWaypoints(points: Point[]) {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}

function cloneDocument(document: CircuitDocument): CircuitDocument {
  return {
    parts: document.parts.map((part) => ({ ...part })),
    wires: document.wires.map(cloneWire),
    junctions: document.junctions.map((junction) => ({ ...junction })),
  };
}

function cloneWire(wire: Wire): Wire { return { ...wire, from: { ...wire.from }, to: { ...wire.to }, waypoints: wire.waypoints.map((point) => ({ ...point })) }; }
function remapEndpoint(endpoint: Endpoint, mapping: Map<string, string>): Endpoint { return endpoint.type === "junction" ? endpoint : { ...endpoint, partId: mapping.get(endpoint.partId) ?? endpoint.partId }; }
function endpointInParts(endpoint: Endpoint, ids: string[]) { return endpoint.type === "pin" && ids.includes(endpoint.partId); }
function endpointMatchesSelection(endpoint: Endpoint, partIds: Set<string>, junctionId: string | null) { return endpoint.type === "pin" ? partIds.has(endpoint.partId) : endpoint.junctionId === junctionId; }
function sameEndpoint(a: Endpoint, b: Endpoint) { return a.type === b.type && (a.type === "pin" && b.type === "pin" ? a.partId === b.partId && a.pin === b.pin : a.type === "junction" && b.type === "junction" && a.junctionId === b.junctionId); }
function sameConnection(wire: Wire, a: Endpoint, b: Endpoint) { return (sameEndpoint(wire.from, a) && sameEndpoint(wire.to, b)) || (sameEndpoint(wire.from, b) && sameEndpoint(wire.to, a)); }

function defaultValue(kind: SchematicKind) {
  if (kind === "resistor" || kind === "potentiometer") return "10k";
  if (kind === "capacitor" || kind === "capacitor-polarized") return "10n";
  if (kind === "inductor" || kind === "transformer") return "1m";
  if (kind === "voltage" || kind === "battery") return "5";
  if (kind === "current") return "1m";
  if (kind === "nmos" || kind === "pmos") return "1u";
  if (kind === "switch") return "open";
  return "";
}

function defaultSource(): SourceSetup {
  return { mode: "dc", amplitude: "1", frequency: "1k", high: "5", delay: "0", rise: "1u", fall: "1u", width: "500u", period: "1m" };
}

function isIndependentSource(kind: SchematicKind) { return kind === "voltage" || kind === "current" || kind === "battery"; }
function supportsValue(kind: SchematicKind) { return !["ground", "power", "probe", "diode", "zener", "led", "npn", "pnp", "opamp", "comparator", "logic-not", "logic-and", "logic-or", "crystal"].includes(kind); }

function nextReference(parts: Part[], kind: SchematicKind) {
  const prefixes: Partial<Record<SchematicKind, string>> = {
    resistor: "R", potentiometer: "RV", capacitor: "C", "capacitor-polarized": "CP", inductor: "L", transformer: "T",
    diode: "D", zener: "DZ", led: "LED", voltage: "V", current: "I", battery: "BAT", ground: "GND", power: "PWR", opamp: "U",
    comparator: "CMP", npn: "Q", pnp: "Q", nmos: "M", pmos: "M", switch: "SW", crystal: "Y", probe: "CH",
    "logic-not": "U", "logic-and": "U", "logic-or": "U",
  };
  return nextId(prefixes[kind] ?? "X", parts.map((part) => part.id));
}

function nextId(prefix: string, occupied: string[]) { let index = 1; while (occupied.includes(`${prefix}${index}`)) index += 1; return `${prefix}${index}`; }
function labelForKind(kind: SchematicKind) { return SCHEMATIC_LIBRARY.find((item) => item.kind === kind)?.label ?? kind; }
function isSchematicKind(value: unknown): value is SchematicKind { return typeof value === "string" && SCHEMATIC_LIBRARY.some((item) => item.kind === value); }
function sanitizeLabel(value: string) { return value.replace(/[^A-Za-z0-9_+-]/g, "").slice(0, 24); }
function safeNode(value: string) { const normalized = value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 24); return normalized && !/^0+$/.test(normalized) ? normalized : "net"; }

function downloadBlob(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function snap(value: number) { return Math.round(value / GRID) * GRID; }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
function samePartPositions(a: CircuitDocument, b: CircuitDocument) {
  return a.parts.length === b.parts.length && a.parts.every((part) => {
    const next = b.parts.find((candidate) => candidate.id === part.id);
    return next?.x === part.x && next.y === part.y;
  });
}
function samePoints(a: Point[], b: Point[]) {
  return a.length === b.length && a.every((point, index) => point.x === b[index].x && point.y === b[index].y);
}
function isWarning(message: string) { return /invalid|could not|limit|missing|unsupported|shorted|not configured|connect|exceed/i.test(message); }
