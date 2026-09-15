import {
  CircuitDocumentError,
  compileCircuitDocument,
  type CircuitAnalysis,
  type CircuitIR,
  type CircuitIRComponent,
} from "./circuit-document";

/**
 * Trusted adapter from the bounded schematic contract to simulator input.
 * No user-authored string is ever copied into a directive, expression, model,
 * filename, or command. Keep this adapter internal to simulation workers and
 * judge services; the learning UI should deal only in CircuitDocument.
 */

const MODEL_DECKS = Object.freeze({
  "generic-silicon": {
    name: "AC_DIODE_GENERIC",
    line: ".model AC_DIODE_GENERIC D(IS=1e-14 N=1.05 RS=0.2 CJO=2e-12 TT=4e-9)",
  },
  rectifier: {
    name: "AC_DIODE_RECTIFIER",
    line: ".model AC_DIODE_RECTIFIER D(IS=1e-14 N=1.8 RS=0.04 CJO=35e-12 TT=2e-6 BV=100 IBV=5e-6)",
  },
  "generic-npn": {
    name: "AC_BJT_NPN",
    line: ".model AC_BJT_NPN NPN(IS=1e-15 BF=120 VAF=100 CJE=8e-12 CJC=4e-12 TF=0.4e-9 TR=20e-9)",
  },
  "generic-pnp": {
    name: "AC_BJT_PNP",
    line: ".model AC_BJT_PNP PNP(IS=1e-15 BF=100 VAF=80 CJE=10e-12 CJC=5e-12 TF=0.7e-9 TR=30e-9)",
  },
  "generic-nmos": {
    name: "N90",
    line: ".include modelcard.CMOS90",
  },
  "generic-pmos": {
    name: "P90",
    line: ".include modelcard.CMOS90",
  },
  "generic-nmos-90nm": {
    name: "N90",
    line: ".include modelcard.CMOS90",
  },
  "generic-pmos-90nm": {
    name: "P90",
    line: ".include modelcard.CMOS90",
  },
});

type ModelKey = keyof typeof MODEL_DECKS;

export type SpiceDeckTarget = "ngspice" | "browser-preview";

export type GeneratedSpiceDeck = Readonly<{
  deck: string;
  ir: CircuitIR;
  analysis: CircuitAnalysis;
  deviceNameByComponentId: Readonly<Record<string, string>>;
  probeExpressions: Readonly<Record<string, string>>;
  target: SpiceDeckTarget;
}>;

export type GenerateSpiceDeckOptions = Readonly<{
  analysisId?: string;
  target?: SpiceDeckTarget;
}>;

function spiceNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new CircuitDocumentError("Non-finite circuit value reached the deck generator.", [
      {
        severity: "error",
        code: "non-finite-deck-value",
        message: "Every simulator value must be finite.",
        path: "",
      },
    ]);
  }
  if (Object.is(value, -0) || value === 0) return "0";
  return value
    .toExponential(12)
    .replace(/\.0+(?=e)/, "")
    .replace(/(\.\d*?[1-9])0+(?=e)/, "$1")
    .replace(/e\+?(-?)0*(\d+)/, "e$1$2");
}

function node(component: CircuitIRComponent, pin: string): string {
  const value = component.nodes[pin];
  if (!value) {
    throw new CircuitDocumentError("Compiled circuit is missing a component node.", [
      {
        severity: "error",
        code: "missing-ir-node",
        message: `${component.reference}.${pin} has no normalized node.`,
        path: `components.${component.id}.nodes.${pin}`,
      },
    ]);
  }
  return value;
}

function waveformText(
  waveform:
    | Extract<
        Extract<CircuitIRComponent, { kind: "voltage-source" }>["parameters"],
        { transient?: unknown }
      >["transient"]
    | Extract<
        Extract<CircuitIRComponent, { kind: "current-source" }>["parameters"],
        { transient?: unknown }
      >["transient"],
): string {
  if (!waveform) return "";
  if (waveform.type === "sine") {
    return ` SIN(${spiceNumber(waveform.offset)} ${spiceNumber(waveform.amplitude)} ${spiceNumber(waveform.frequencyHz)} ${spiceNumber(waveform.delayS)} ${spiceNumber(waveform.dampingPerS)} ${spiceNumber(waveform.phaseDeg)})`;
  }
  return ` PULSE(${spiceNumber(waveform.low)} ${spiceNumber(waveform.high)} ${spiceNumber(waveform.delayS)} ${spiceNumber(waveform.riseS)} ${spiceNumber(waveform.fallS)} ${spiceNumber(waveform.widthS)} ${spiceNumber(waveform.periodS)})`;
}

function sourceAcText(ac: { magnitude: number; phaseDeg: number } | undefined) {
  return ac
    ? ` AC ${spiceNumber(ac.magnitude)} ${spiceNumber(ac.phaseDeg)}`
    : "";
}

function deviceName(component: CircuitIRComponent): string | null {
  if (component.kind === "ground") return null;
  return component.kind === "op-amp-ideal"
    ? `E_${component.reference}`
    : component.reference;
}

function renderComponent(
  component: CircuitIRComponent,
  models: Set<ModelKey>,
): string | null {
  switch (component.kind) {
    case "ground":
      return null;
    case "resistor":
      return `${component.reference} ${node(component, "a")} ${node(component, "b")} ${spiceNumber(component.parameters.resistanceOhm)}`;
    case "capacitor": {
      const initial =
        component.parameters.initialVoltageV === undefined
          ? ""
          : ` IC=${spiceNumber(component.parameters.initialVoltageV)}`;
      return `${component.reference} ${node(component, "a")} ${node(component, "b")} ${spiceNumber(component.parameters.capacitanceF)}${initial}`;
    }
    case "inductor": {
      const initial =
        component.parameters.initialCurrentA === undefined
          ? ""
          : ` IC=${spiceNumber(component.parameters.initialCurrentA)}`;
      return `${component.reference} ${node(component, "a")} ${node(component, "b")} ${spiceNumber(component.parameters.inductanceH)}${initial}`;
    }
    case "voltage-source":
      return `${component.reference} ${node(component, "positive")} ${node(component, "negative")} DC ${spiceNumber(component.parameters.dcV)}${sourceAcText(component.parameters.ac)}${waveformText(component.parameters.transient)}`;
    case "current-source":
      return `${component.reference} ${node(component, "positive")} ${node(component, "negative")} DC ${spiceNumber(component.parameters.dcA)}${sourceAcText(component.parameters.ac)}${waveformText(component.parameters.transient)}`;
    case "diode": {
      models.add(component.parameters.model);
      const model = MODEL_DECKS[component.parameters.model].name;
      return `${component.reference} ${node(component, "anode")} ${node(component, "cathode")} ${model} AREA=${spiceNumber(component.parameters.area)}`;
    }
    case "bjt-npn":
    case "bjt-pnp": {
      models.add(component.parameters.model);
      const model = MODEL_DECKS[component.parameters.model].name;
      return `${component.reference} ${node(component, "collector")} ${node(component, "base")} ${node(component, "emitter")} ${model} AREA=${spiceNumber(component.parameters.area)}`;
    }
    case "mosfet-nmos":
    case "mosfet-pmos": {
      models.add(component.parameters.model);
      const model = MODEL_DECKS[component.parameters.model].name;
      return `${component.reference} ${node(component, "drain")} ${node(component, "gate")} ${node(component, "source")} ${node(component, "body")} ${model} W=${spiceNumber(component.parameters.widthM)} L=${spiceNumber(component.parameters.lengthM)} M=${spiceNumber(component.parameters.multiplier)}`;
    }
    case "vcvs":
      return `${component.reference} ${node(component, "outputPositive")} ${node(component, "outputNegative")} ${node(component, "controlPositive")} ${node(component, "controlNegative")} ${spiceNumber(component.parameters.gain)}`;
    case "op-amp-ideal":
      return `E_${component.reference} ${node(component, "output")} 0 ${node(component, "nonInverting")} ${node(component, "inverting")} ${spiceNumber(component.parameters.openLoopGain)}`;
  }
}

function analysisLine(
  analysis: CircuitAnalysis,
  deviceNameByComponentId: Readonly<Record<string, string>>,
): string {
  switch (analysis.type) {
    case "operating-point":
      return ".op";
    case "ac-sweep": {
      const scale =
        analysis.scale === "decade"
          ? "dec"
          : analysis.scale === "octave"
            ? "oct"
            : "lin";
      return `.ac ${scale} ${analysis.points} ${spiceNumber(analysis.startHz)} ${spiceNumber(analysis.stopHz)}`;
    }
    case "transient": {
      const maxStep =
        analysis.maxStepS === undefined
          ? ""
          : ` ${spiceNumber(analysis.maxStepS)}`;
      return `.tran ${spiceNumber(analysis.stepS)} ${spiceNumber(analysis.stopS)} ${spiceNumber(analysis.startS)}${maxStep}`;
    }
    case "dc-sweep": {
      const source = deviceNameByComponentId[analysis.sourceComponentId];
      if (!source) {
        throw new CircuitDocumentError("DC sweep source was not compiled.", [
          {
            severity: "error",
            code: "missing-dc-device-name",
            message: `Source '${analysis.sourceComponentId}' has no simulator device name.`,
            path: `analyses.${analysis.id}.sourceComponentId`,
          },
        ]);
      }
      return `.dc ${source} ${spiceNumber(analysis.start)} ${spiceNumber(analysis.stop)} ${spiceNumber(analysis.step)}`;
    }
  }
}

/**
 * Compiles a schematic document and emits exactly one analysis deck. The first
 * configured analysis is selected unless analysisId is supplied.
 */
export function generateSpiceDeckFromCircuitDocument(
  input: unknown,
  options: GenerateSpiceDeckOptions = {},
): GeneratedSpiceDeck {
  const ir = compileCircuitDocument(input, "simulation");
  const analysis = options.analysisId
    ? ir.analyses.find((candidate) => candidate.id === options.analysisId)
    : ir.analyses[0];
  if (!analysis) {
    throw new CircuitDocumentError("Requested analysis does not exist.", [
      {
        severity: "error",
        code: "unknown-analysis",
        message: options.analysisId
          ? `Analysis '${options.analysisId}' does not exist.`
          : "The circuit has no analysis.",
        path: "analyses",
      },
    ]);
  }

  const models = new Set<ModelKey>();
  const deviceLines: string[] = [];
  const deviceNameByComponentId: Record<string, string> = {};
  for (const component of ir.components) {
    const name = deviceName(component);
    if (name) deviceNameByComponentId[component.id] = name;
    const line = renderComponent(component, models);
    if (line) deviceLines.push(line);
  }

  const modelLines = [...new Set([...models]
    .sort()
    .map((model) => MODEL_DECKS[model].line))];
  const probeExpressions: Record<string, string> = {};
  for (const probe of ir.probes) {
    if (probe.quantity === "voltage") {
      probeExpressions[probe.id] = `V(${probe.node})`;
    } else if (probe.quantity === "differential-voltage") {
      probeExpressions[probe.id] = `V(${probe.positiveNode},${probe.negativeNode})`;
    } else {
      const name = deviceNameByComponentId[probe.componentId];
      if (!name) {
        throw new CircuitDocumentError("Current probe target was not compiled.", [
          {
            severity: "error",
            code: "missing-current-probe-device",
            message: `Current probe target '${probe.componentId}' has no simulator device.`,
            path: `probes.${probe.id}`,
          },
        ]);
      }
      probeExpressions[probe.id] = `I(${name})`;
    }
  }

  const deck = [
    // ngspice's circuit-file reader is ASCII-oriented. Keep generated decks
    // ASCII-only so a typographic character cannot stall the WASM front end.
    "* AnaCode generated circuit - structural input only",
    ...deviceLines,
    ...modelLines,
    analysisLine(analysis, deviceNameByComponentId),
    ".end",
  ].join("\n");

  return {
    deck,
    ir,
    analysis,
    deviceNameByComponentId,
    probeExpressions,
    target: options.target ?? "browser-preview",
  };
}
