import { z } from "zod";

/**
 * The authored schematic contract. It contains electrical intent and drawing
 * geometry, but never simulator directives or arbitrary model text.
 */

export const CIRCUIT_DOCUMENT_VERSION = 1 as const;

export const CIRCUIT_LIMITS = Object.freeze({
  jsonBytes: 256 * 1024,
  components: 256,
  junctions: 512,
  wires: 1_024,
  wireWaypoints: 32,
  netLabels: 256,
  probes: 32,
  analyses: 8,
  acPoints: 200_000,
  transientPoints: 2_000_000,
  dcSweepPoints: 100_000,
});

const idPattern = /^[a-z][a-z0-9_-]{0,47}$/;
const pinIdPattern = /^[a-z][A-Za-z0-9_-]{0,47}$/;
const referencePattern = /^[A-Z][A-Z0-9_]{0,15}$/;
const netLabelPattern = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

const idSchema = z.string().min(1).max(48).regex(idPattern);
const pinIdSchema = z.string().min(1).max(48).regex(pinIdPattern);
const referenceSchema = z.string().min(1).max(16).regex(referencePattern);
const netLabelNameSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(netLabelPattern);
const finiteSchema = z.number().finite();
const positiveSchema = finiteSchema.positive();
const nonNegativeSchema = finiteSchema.nonnegative();

export const pointSchema = z
  .object({
    x: finiteSchema.min(-1_000_000).max(1_000_000),
    y: finiteSchema.min(-1_000_000).max(1_000_000),
  })
  .strict();

export type SchematicPoint = z.infer<typeof pointSchema>;

export type ComponentPinDefinition = Readonly<{
  id: string;
  label: string;
  required: boolean;
}>;

export type ComponentDefinition = Readonly<{
  displayName: string;
  category: "Sources" | "Passives" | "Semiconductors" | "Amplifiers" | "Power";
  referencePrefix: string;
  pins: readonly ComponentPinDefinition[];
}>;

export const COMPONENT_DEFINITIONS = {
  ground: {
    displayName: "Ground",
    category: "Power",
    referencePrefix: "GND",
    pins: [{ id: "gnd", label: "Ground", required: true }],
  },
  resistor: {
    displayName: "Resistor",
    category: "Passives",
    referencePrefix: "R",
    pins: [
      { id: "a", label: "A", required: true },
      { id: "b", label: "B", required: true },
    ],
  },
  capacitor: {
    displayName: "Capacitor",
    category: "Passives",
    referencePrefix: "C",
    pins: [
      { id: "a", label: "+", required: true },
      { id: "b", label: "−", required: true },
    ],
  },
  inductor: {
    displayName: "Inductor",
    category: "Passives",
    referencePrefix: "L",
    pins: [
      { id: "a", label: "A", required: true },
      { id: "b", label: "B", required: true },
    ],
  },
  "voltage-source": {
    displayName: "Voltage source",
    category: "Sources",
    referencePrefix: "V",
    pins: [
      { id: "positive", label: "+", required: true },
      { id: "negative", label: "−", required: true },
    ],
  },
  "current-source": {
    displayName: "Current source",
    category: "Sources",
    referencePrefix: "I",
    pins: [
      { id: "positive", label: "+", required: true },
      { id: "negative", label: "−", required: true },
    ],
  },
  diode: {
    displayName: "Diode",
    category: "Semiconductors",
    referencePrefix: "D",
    pins: [
      { id: "anode", label: "A", required: true },
      { id: "cathode", label: "K", required: true },
    ],
  },
  "bjt-npn": {
    displayName: "NPN transistor",
    category: "Semiconductors",
    referencePrefix: "Q",
    pins: [
      { id: "collector", label: "C", required: true },
      { id: "base", label: "B", required: true },
      { id: "emitter", label: "E", required: true },
    ],
  },
  "bjt-pnp": {
    displayName: "PNP transistor",
    category: "Semiconductors",
    referencePrefix: "Q",
    pins: [
      { id: "collector", label: "C", required: true },
      { id: "base", label: "B", required: true },
      { id: "emitter", label: "E", required: true },
    ],
  },
  "mosfet-nmos": {
    displayName: "N-channel MOSFET",
    category: "Semiconductors",
    referencePrefix: "M",
    pins: [
      { id: "drain", label: "D", required: true },
      { id: "gate", label: "G", required: true },
      { id: "source", label: "S", required: true },
      { id: "body", label: "B", required: true },
    ],
  },
  "mosfet-pmos": {
    displayName: "P-channel MOSFET",
    category: "Semiconductors",
    referencePrefix: "M",
    pins: [
      { id: "drain", label: "D", required: true },
      { id: "gate", label: "G", required: true },
      { id: "source", label: "S", required: true },
      { id: "body", label: "B", required: true },
    ],
  },
  vcvs: {
    displayName: "Voltage-controlled voltage source",
    category: "Sources",
    referencePrefix: "E",
    pins: [
      { id: "outputPositive", label: "OUT+", required: true },
      { id: "outputNegative", label: "OUT−", required: true },
      { id: "controlPositive", label: "IN+", required: true },
      { id: "controlNegative", label: "IN−", required: true },
    ],
  },
  "op-amp-ideal": {
    displayName: "Ideal operational amplifier",
    category: "Amplifiers",
    referencePrefix: "U",
    pins: [
      { id: "nonInverting", label: "+", required: true },
      { id: "inverting", label: "−", required: true },
      { id: "output", label: "OUT", required: true },
    ],
  },
} as const satisfies Record<string, ComponentDefinition>;

export type ComponentKind = keyof typeof COMPONENT_DEFINITIONS;

const placementSchema = z
  .object({
    position: pointSchema,
    rotation: z.union([
      z.literal(0),
      z.literal(90),
      z.literal(180),
      z.literal(270),
    ]),
    mirrorX: z.boolean().optional(),
  })
  .strict();

const baseComponentShape = {
  id: idSchema,
  reference: referenceSchema,
  position: placementSchema.shape.position,
  rotation: placementSchema.shape.rotation,
  mirrorX: placementSchema.shape.mirrorX,
};

const sourceAcSchema = z
  .object({
    magnitude: nonNegativeSchema.max(1_000_000),
    phaseDeg: finiteSchema.min(-360_000).max(360_000).default(0),
  })
  .strict();

const sineWaveSchema = z
  .object({
    type: z.literal("sine"),
    offset: finiteSchema.min(-1_000_000).max(1_000_000),
    amplitude: nonNegativeSchema.max(1_000_000),
    frequencyHz: positiveSchema.max(1e15),
    delayS: nonNegativeSchema.max(1e9).default(0),
    dampingPerS: nonNegativeSchema.max(1e15).default(0),
    phaseDeg: finiteSchema.min(-360_000).max(360_000).default(0),
  })
  .strict();

const pulseWaveSchema = z
  .object({
    type: z.literal("pulse"),
    low: finiteSchema.min(-1_000_000).max(1_000_000),
    high: finiteSchema.min(-1_000_000).max(1_000_000),
    delayS: nonNegativeSchema.max(1e9).default(0),
    riseS: positiveSchema.max(1e9),
    fallS: positiveSchema.max(1e9),
    widthS: positiveSchema.max(1e9),
    periodS: positiveSchema.max(1e9),
  })
  .strict();

const transientWaveSchema = z.discriminatedUnion("type", [
  sineWaveSchema,
  pulseWaveSchema,
]);

const voltageSourceParametersSchema = z
  .object({
    dcV: finiteSchema.min(-1_000_000).max(1_000_000).default(0),
    ac: sourceAcSchema.optional(),
    transient: transientWaveSchema.optional(),
  })
  .strict();

const currentSourceParametersSchema = z
  .object({
    dcA: finiteSchema.min(-1_000_000).max(1_000_000).default(0),
    ac: sourceAcSchema.optional(),
    transient: transientWaveSchema.optional(),
  })
  .strict();

const componentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("ground"),
      parameters: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("resistor"),
      parameters: z
        .object({
          resistanceOhm: positiveSchema.min(1e-6).max(1e15),
          tolerancePct: nonNegativeSchema.max(100).optional(),
          powerRatingW: positiveSchema.max(1e9).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("capacitor"),
      parameters: z
        .object({
          capacitanceF: positiveSchema.min(1e-18).max(1e6),
          initialVoltageV: finiteSchema.min(-1e6).max(1e6).optional(),
          tolerancePct: nonNegativeSchema.max(100).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("inductor"),
      parameters: z
        .object({
          inductanceH: positiveSchema.min(1e-15).max(1e6),
          initialCurrentA: finiteSchema.min(-1e6).max(1e6).optional(),
          tolerancePct: nonNegativeSchema.max(100).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("voltage-source"),
      parameters: voltageSourceParametersSchema,
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("current-source"),
      parameters: currentSourceParametersSchema,
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("diode"),
      parameters: z
        .object({
          model: z.enum(["generic-silicon", "rectifier"]),
          area: positiveSchema.max(1e6).default(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("bjt-npn"),
      parameters: z
        .object({
          model: z.enum(["generic-npn"]),
          area: positiveSchema.max(1e6).default(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("bjt-pnp"),
      parameters: z
        .object({
          model: z.enum(["generic-pnp"]),
          area: positiveSchema.max(1e6).default(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("mosfet-nmos"),
      parameters: z
        .object({
          model: z.enum(["generic-nmos", "generic-nmos-90nm"]),
          widthM: positiveSchema.min(1e-9).max(1),
          lengthM: positiveSchema.min(1e-9).max(1),
          multiplier: positiveSchema.max(1e6).default(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("mosfet-pmos"),
      parameters: z
        .object({
          model: z.enum(["generic-pmos", "generic-pmos-90nm"]),
          widthM: positiveSchema.min(1e-9).max(1),
          lengthM: positiveSchema.min(1e-9).max(1),
          multiplier: positiveSchema.max(1e6).default(1),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("vcvs"),
      parameters: z
        .object({ gain: finiteSchema.min(-1e12).max(1e12) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...baseComponentShape,
      kind: z.literal("op-amp-ideal"),
      parameters: z
        .object({
          openLoopGain: positiveSchema.min(1).max(1e12).default(1e6),
        })
        .strict(),
    })
    .strict(),
]);

export const circuitComponentSchema = componentSchema;
export type CircuitComponent = z.infer<typeof circuitComponentSchema>;

export const connectionPointSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("pin"),
      componentId: idSchema,
      pinId: pinIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("junction"),
      junctionId: idSchema,
    })
    .strict(),
]);

export type ConnectionPoint = z.infer<typeof connectionPointSchema>;

const junctionSchema = z
  .object({ id: idSchema, position: pointSchema })
  .strict();

const wireSchema = z
  .object({
    id: idSchema,
    from: connectionPointSchema,
    to: connectionPointSchema,
    waypoints: z.array(pointSchema).max(CIRCUIT_LIMITS.wireWaypoints).default([]),
  })
  .strict();

const netLabelSchema = z
  .object({
    id: idSchema,
    name: netLabelNameSchema,
    target: connectionPointSchema,
    position: pointSchema,
  })
  .strict();

const probeSchema = z.discriminatedUnion("quantity", [
  z
    .object({
      id: idSchema,
      label: z.string().trim().min(1).max(48),
      quantity: z.literal("voltage"),
      target: connectionPointSchema,
    })
    .strict(),
  z
    .object({
      id: idSchema,
      label: z.string().trim().min(1).max(48),
      quantity: z.literal("differential-voltage"),
      positive: connectionPointSchema,
      negative: connectionPointSchema,
    })
    .strict(),
  z
    .object({
      id: idSchema,
      label: z.string().trim().min(1).max(48),
      quantity: z.literal("current"),
      componentId: idSchema,
    })
    .strict(),
]);

const analysisSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: idSchema,
      name: z.string().trim().min(1).max(48),
      type: z.literal("operating-point"),
    })
    .strict(),
  z
    .object({
      id: idSchema,
      name: z.string().trim().min(1).max(48),
      type: z.literal("ac-sweep"),
      scale: z.enum(["decade", "octave", "linear"]),
      points: z.number().int().min(1).max(10_000),
      startHz: positiveSchema.max(1e15),
      stopHz: positiveSchema.max(1e15),
    })
    .strict(),
  z
    .object({
      id: idSchema,
      name: z.string().trim().min(1).max(48),
      type: z.literal("transient"),
      stepS: positiveSchema.max(1e9),
      stopS: positiveSchema.max(1e9),
      startS: nonNegativeSchema.max(1e9).default(0),
      maxStepS: positiveSchema.max(1e9).optional(),
    })
    .strict(),
  z
    .object({
      id: idSchema,
      name: z.string().trim().min(1).max(48),
      type: z.literal("dc-sweep"),
      sourceComponentId: idSchema,
      start: finiteSchema.min(-1e6).max(1e6),
      stop: finiteSchema.min(-1e6).max(1e6),
      step: finiteSchema.min(-1e6).max(1e6),
    })
    .strict(),
]);

export type CircuitAnalysis = z.infer<typeof analysisSchema>;
export type CircuitProbe = z.infer<typeof probeSchema>;

export const circuitDocumentSchema = z
  .object({
    version: z.literal(CIRCUIT_DOCUMENT_VERSION),
    id: idSchema,
    title: z.string().trim().min(1).max(96),
    revision: z.number().int().nonnegative().max(1_000_000_000),
    components: z.array(componentSchema).max(CIRCUIT_LIMITS.components),
    junctions: z.array(junctionSchema).max(CIRCUIT_LIMITS.junctions),
    wires: z.array(wireSchema).max(CIRCUIT_LIMITS.wires),
    netLabels: z.array(netLabelSchema).max(CIRCUIT_LIMITS.netLabels),
    probes: z.array(probeSchema).max(CIRCUIT_LIMITS.probes),
    analyses: z.array(analysisSchema).max(CIRCUIT_LIMITS.analyses),
    settings: z
      .object({
        gridSize: positiveSchema.min(1).max(100),
        snapToGrid: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type CircuitDocument = z.infer<typeof circuitDocumentSchema>;

export type CircuitValidationMode = "draft" | "simulation";

export type CircuitDiagnostic = Readonly<{
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string;
}>;

export type CircuitValidationResult =
  | Readonly<{
      ok: true;
      document: CircuitDocument;
      diagnostics: readonly CircuitDiagnostic[];
    }>
  | Readonly<{
      ok: false;
      document?: CircuitDocument;
      diagnostics: readonly CircuitDiagnostic[];
    }>;

export type CircuitNet = Readonly<{
  id: string;
  name: string;
  isGround: boolean;
  labels: readonly string[];
  members: readonly string[];
}>;

export type CircuitIRComponent = CircuitComponent &
  Readonly<{ nodes: Readonly<Record<string, string>> }>;

export type CircuitIRProbe =
  | Readonly<{
      id: string;
      label: string;
      quantity: "voltage";
      node: string;
    }>
  | Readonly<{
      id: string;
      label: string;
      quantity: "differential-voltage";
      positiveNode: string;
      negativeNode: string;
    }>
  | Readonly<{
      id: string;
      label: string;
      quantity: "current";
      componentId: string;
    }>;

/** Normalized electrical truth; drawing coordinates have deliberately gone. */
export type CircuitIR = Readonly<{
  version: 1;
  sourceDocumentId: string;
  sourceRevision: number;
  title: string;
  components: readonly CircuitIRComponent[];
  nets: readonly CircuitNet[];
  probes: readonly CircuitIRProbe[];
  analyses: readonly CircuitAnalysis[];
}>;

export class CircuitDocumentError extends Error {
  readonly diagnostics: readonly CircuitDiagnostic[];

  constructor(message: string, diagnostics: readonly CircuitDiagnostic[]) {
    super(message);
    this.name = "CircuitDocumentError";
    this.diagnostics = diagnostics;
  }
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  add(key: string) {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    const current = this.parent.get(key);
    if (!current) throw new Error(`Unknown connectivity key: ${key}`);
    if (current === key) return key;
    const root = this.find(current);
    this.parent.set(key, root);
    return root;
  }

  union(a: string, b: string) {
    this.add(a);
    this.add(b);
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      const [first, second] = [rootA, rootB].sort();
      this.parent.set(second!, first!);
    }
  }

  keys() {
    return [...this.parent.keys()];
  }
}

export function connectionPointKey(point: ConnectionPoint): string {
  return point.type === "pin"
    ? `pin:${point.componentId}:${point.pinId}`
    : `junction:${point.junctionId}`;
}

function diagnostic(
  severity: CircuitDiagnostic["severity"],
  code: string,
  message: string,
  path: string,
): CircuitDiagnostic {
  return { severity, code, message, path };
}

function validateReferencePrefix(component: CircuitComponent): boolean {
  if (component.kind === "ground") return component.reference.startsWith("GND");
  return component.reference.startsWith(
    COMPONENT_DEFINITIONS[component.kind].referencePrefix,
  );
}

function pointExists(
  point: ConnectionPoint,
  components: ReadonlyMap<string, CircuitComponent>,
  junctions: ReadonlySet<string>,
): { exists: boolean; message?: string } {
  if (point.type === "junction") {
    return junctions.has(point.junctionId)
      ? { exists: true }
      : { exists: false, message: `Unknown junction '${point.junctionId}'.` };
  }

  const component = components.get(point.componentId);
  if (!component) {
    return {
      exists: false,
      message: `Unknown component '${point.componentId}'.`,
    };
  }
  const validPin = COMPONENT_DEFINITIONS[component.kind].pins.some(
    (pin) => pin.id === point.pinId,
  );
  return validPin
    ? { exists: true }
    : {
        exists: false,
        message: `Component '${point.componentId}' has no pin '${point.pinId}'.`,
      };
}

function buildConnectivity(document: CircuitDocument): UnionFind {
  const connectivity = new UnionFind();
  for (const component of document.components) {
    for (const pin of COMPONENT_DEFINITIONS[component.kind].pins) {
      connectivity.add(
        connectionPointKey({
          type: "pin",
          componentId: component.id,
          pinId: pin.id,
        }),
      );
    }
  }
  for (const junction of document.junctions) {
    connectivity.add(
      connectionPointKey({ type: "junction", junctionId: junction.id }),
    );
  }
  for (const wire of document.wires) {
    connectivity.union(connectionPointKey(wire.from), connectionPointKey(wire.to));
  }

  const groundKeys = document.components
    .filter((component) => component.kind === "ground")
    .map((component) =>
      connectionPointKey({
        type: "pin" as const,
        componentId: component.id,
        pinId: "gnd",
      }),
    );
  for (let index = 1; index < groundKeys.length; index += 1) {
    connectivity.union(groundKeys[0]!, groundKeys[index]!);
  }

  const firstLabelTarget = new Map<string, string>();
  for (const label of document.netLabels) {
    const canonicalName = label.name.toLowerCase();
    const target = connectionPointKey(label.target);
    const first = firstLabelTarget.get(canonicalName);
    if (first) connectivity.union(first, target);
    else firstLabelTarget.set(canonicalName, target);
  }
  return connectivity;
}

function semanticDiagnostics(
  document: CircuitDocument,
  mode: CircuitValidationMode,
): CircuitDiagnostic[] {
  const diagnostics: CircuitDiagnostic[] = [];
  const components = new Map<string, CircuitComponent>();
  const junctions = new Set<string>();
  const globallyUsedIds = new Map<string, string>();

  const recordId = (id: string, path: string) => {
    const existing = globallyUsedIds.get(id);
    if (existing) {
      diagnostics.push(
        diagnostic(
          "error",
          "duplicate-id",
          `ID '${id}' is already used at ${existing}.`,
          path,
        ),
      );
    } else {
      globallyUsedIds.set(id, path);
    }
  };

  const references = new Map<string, string>();
  document.components.forEach((component, index) => {
    const path = `components.${index}`;
    recordId(component.id, `${path}.id`);
    if (components.has(component.id)) {
      diagnostics.push(
        diagnostic(
          "error",
          "duplicate-component-id",
          `Component ID '${component.id}' is duplicated.`,
          `${path}.id`,
        ),
      );
    } else {
      components.set(component.id, component);
    }

    const canonicalReference = component.reference.toUpperCase();
    const previous = references.get(canonicalReference);
    if (previous) {
      diagnostics.push(
        diagnostic(
          "error",
          "duplicate-reference",
          `Reference '${component.reference}' is already used by '${previous}'.`,
          `${path}.reference`,
        ),
      );
    } else {
      references.set(canonicalReference, component.id);
    }
    if (!validateReferencePrefix(component)) {
      diagnostics.push(
        diagnostic(
          "error",
          "invalid-reference-prefix",
          `Reference '${component.reference}' must use the ${COMPONENT_DEFINITIONS[component.kind].referencePrefix} prefix for ${component.kind}.`,
          `${path}.reference`,
        ),
      );
    }

    const transient =
      component.kind === "voltage-source" || component.kind === "current-source"
        ? component.parameters.transient
        : undefined;
    if (
      transient?.type === "pulse" &&
      transient.periodS < transient.riseS + transient.widthS + transient.fallS
    ) {
      diagnostics.push(
        diagnostic(
          "error",
          "invalid-pulse-period",
          "Pulse period must include its rise, high-width, and fall intervals.",
          `${path}.parameters.transient.periodS`,
        ),
      );
    }
  });

  document.junctions.forEach((junction, index) => {
    recordId(junction.id, `junctions.${index}.id`);
    junctions.add(junction.id);
  });

  const connectionCount = new Map<string, number>();
  document.wires.forEach((wire, index) => {
    recordId(wire.id, `wires.${index}.id`);
    const from = pointExists(wire.from, components, junctions);
    const to = pointExists(wire.to, components, junctions);
    if (!from.exists) {
      diagnostics.push(
        diagnostic("error", "unknown-wire-endpoint", from.message!, `wires.${index}.from`),
      );
    }
    if (!to.exists) {
      diagnostics.push(
        diagnostic("error", "unknown-wire-endpoint", to.message!, `wires.${index}.to`),
      );
    }
    if (from.exists && to.exists) {
      const fromKey = connectionPointKey(wire.from);
      const toKey = connectionPointKey(wire.to);
      if (fromKey === toKey) {
        diagnostics.push(
          diagnostic(
            "error",
            "self-wire",
            "A wire must connect two distinct electrical points.",
            `wires.${index}`,
          ),
        );
      }
      connectionCount.set(fromKey, (connectionCount.get(fromKey) ?? 0) + 1);
      connectionCount.set(toKey, (connectionCount.get(toKey) ?? 0) + 1);
    }
  });

  document.netLabels.forEach((label, index) => {
    recordId(label.id, `netLabels.${index}.id`);
    const target = pointExists(label.target, components, junctions);
    if (!target.exists) {
      diagnostics.push(
        diagnostic(
          "error",
          "unknown-label-target",
          target.message!,
          `netLabels.${index}.target`,
        ),
      );
    }
  });

  document.probes.forEach((probe, index) => {
    recordId(probe.id, `probes.${index}.id`);
    if (probe.quantity === "current") {
      if (!components.has(probe.componentId)) {
        diagnostics.push(
          diagnostic(
            "error",
            "unknown-probe-component",
            `Unknown component '${probe.componentId}'.`,
            `probes.${index}.componentId`,
          ),
        );
      }
      return;
    }
    const points =
      probe.quantity === "voltage"
        ? [{ point: probe.target, suffix: "target" }]
        : [
            { point: probe.positive, suffix: "positive" },
            { point: probe.negative, suffix: "negative" },
          ];
    for (const { point, suffix } of points) {
      const result = pointExists(point, components, junctions);
      if (!result.exists) {
        diagnostics.push(
          diagnostic(
            "error",
            "unknown-probe-target",
            result.message!,
            `probes.${index}.${suffix}`,
          ),
        );
      }
    }
  });

  document.analyses.forEach((analysis, index) => {
    recordId(analysis.id, `analyses.${index}.id`);
    if (analysis.type === "ac-sweep") {
      if (analysis.stopHz <= analysis.startHz) {
        diagnostics.push(
          diagnostic(
            "error",
            "invalid-ac-range",
            "AC stop frequency must be greater than the start frequency.",
            `analyses.${index}.stopHz`,
          ),
        );
      }
      const spans =
        analysis.scale === "decade"
          ? Math.log10(analysis.stopHz / analysis.startHz)
          : analysis.scale === "octave"
            ? Math.log2(analysis.stopHz / analysis.startHz)
            : 1;
      const estimatedPoints =
        analysis.scale === "linear"
          ? analysis.points
          : Math.ceil(Math.max(0, spans) * analysis.points) + 1;
      if (estimatedPoints > CIRCUIT_LIMITS.acPoints) {
        diagnostics.push(
          diagnostic(
            "error",
            "too-many-ac-points",
            `AC sweep would produce about ${estimatedPoints.toLocaleString()} points; the limit is ${CIRCUIT_LIMITS.acPoints.toLocaleString()}.`,
            `analyses.${index}`,
          ),
        );
      }
    }
    if (analysis.type === "transient") {
      if (analysis.startS >= analysis.stopS) {
        diagnostics.push(
          diagnostic(
            "error",
            "invalid-transient-range",
            "Transient start time must be less than stop time.",
            `analyses.${index}.startS`,
          ),
        );
      }
      if (analysis.maxStepS !== undefined && analysis.maxStepS < analysis.stepS) {
        diagnostics.push(
          diagnostic(
            "warning",
            "max-step-below-print-step",
            "Maximum timestep is below the requested output step.",
            `analyses.${index}.maxStepS`,
          ),
        );
      }
      const points = Math.ceil((analysis.stopS - analysis.startS) / analysis.stepS);
      if (points > CIRCUIT_LIMITS.transientPoints) {
        diagnostics.push(
          diagnostic(
            "error",
            "too-many-transient-points",
            `Transient analysis requests about ${points.toLocaleString()} points; the limit is ${CIRCUIT_LIMITS.transientPoints.toLocaleString()}.`,
            `analyses.${index}`,
          ),
        );
      }
    }
    if (analysis.type === "dc-sweep") {
      const source = components.get(analysis.sourceComponentId);
      if (
        !source ||
        (source.kind !== "voltage-source" && source.kind !== "current-source")
      ) {
        diagnostics.push(
          diagnostic(
            "error",
            "invalid-dc-source",
            "A DC sweep must reference a voltage or current source.",
            `analyses.${index}.sourceComponentId`,
          ),
        );
      }
      const span = analysis.stop - analysis.start;
      if (analysis.step === 0 || Math.sign(span) !== Math.sign(analysis.step)) {
        diagnostics.push(
          diagnostic(
            "error",
            "invalid-dc-step",
            "DC step must be non-zero and move from start toward stop.",
            `analyses.${index}.step`,
          ),
        );
      } else {
        const points = Math.floor(Math.abs(span / analysis.step)) + 1;
        if (points > CIRCUIT_LIMITS.dcSweepPoints) {
          diagnostics.push(
            diagnostic(
              "error",
              "too-many-dc-points",
              `DC sweep requests ${points.toLocaleString()} points; the limit is ${CIRCUIT_LIMITS.dcSweepPoints.toLocaleString()}.`,
              `analyses.${index}`,
            ),
          );
        }
      }
    }
  });

  for (const [index, component] of document.components.entries()) {
    for (const pin of COMPONENT_DEFINITIONS[component.kind].pins) {
      if (!pin.required) continue;
      const key = connectionPointKey({
        type: "pin",
        componentId: component.id,
        pinId: pin.id,
      });
      if (!connectionCount.has(key)) {
        diagnostics.push(
          diagnostic(
            mode === "simulation" ? "error" : "warning",
            "unconnected-required-pin",
            `${component.reference}.${pin.label} is not connected.`,
            `components.${index}`,
          ),
        );
      }
    }
  }

  if (mode === "simulation") {
    if (!document.components.some((component) => component.kind === "ground")) {
      diagnostics.push(
        diagnostic(
          "error",
          "missing-ground",
          "A simulation-ready circuit requires a ground reference.",
          "components",
        ),
      );
    }
    if (document.analyses.length === 0) {
      diagnostics.push(
        diagnostic(
          "error",
          "missing-analysis",
          "Select at least one analysis before simulation.",
          "analyses",
        ),
      );
    }
    if (document.probes.length === 0) {
      diagnostics.push(
        diagnostic(
          "error",
          "missing-probe",
          "Place at least one probe before simulation.",
          "probes",
        ),
      );
    }
  }

  if (diagnostics.some((item) => item.code === "unknown-wire-endpoint")) {
    return diagnostics;
  }

  const connectivity = buildConnectivity(document);
  const labelsByRoot = new Map<string, Set<string>>();
  for (const label of document.netLabels) {
    const root = connectivity.find(connectionPointKey(label.target));
    const labels = labelsByRoot.get(root) ?? new Set<string>();
    labels.add(label.name);
    labelsByRoot.set(root, labels);
  }
  for (const labels of labelsByRoot.values()) {
    const canonical = new Set([...labels].map((label) => label.toLowerCase()));
    if (canonical.size > 1) {
      diagnostics.push(
        diagnostic(
          "error",
          "conflicting-net-labels",
          `Electrically joined net has conflicting labels: ${[...labels].join(", ")}.`,
          "netLabels",
        ),
      );
    }
  }

  return diagnostics;
}

export function validateCircuitDocument(
  input: unknown,
  mode: CircuitValidationMode = "draft",
): CircuitValidationResult {
  const parsed = circuitDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const diagnostics = parsed.error.issues.map((issue) =>
      diagnostic(
        "error",
        "invalid-document-shape",
        issue.message,
        issue.path.join("."),
      ),
    );
    return { ok: false, diagnostics };
  }
  const diagnostics = semanticDiagnostics(parsed.data, mode);
  return diagnostics.some((item) => item.severity === "error")
    ? { ok: false, document: parsed.data, diagnostics }
    : { ok: true, document: parsed.data, diagnostics };
}

export function parseCircuitDocumentJson(
  json: string,
  mode: CircuitValidationMode = "draft",
): CircuitDocument {
  const byteLength = new TextEncoder().encode(json).byteLength;
  if (byteLength > CIRCUIT_LIMITS.jsonBytes) {
    throw new CircuitDocumentError("Circuit document is too large.", [
      diagnostic(
        "error",
        "document-too-large",
        `Circuit JSON is ${byteLength.toLocaleString()} bytes; the limit is ${CIRCUIT_LIMITS.jsonBytes.toLocaleString()}.`,
        "",
      ),
    ]);
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(json) as unknown;
  } catch {
    throw new CircuitDocumentError("Circuit document is not valid JSON.", [
      diagnostic("error", "invalid-json", "The document is not valid JSON.", ""),
    ]);
  }
  const validation = validateCircuitDocument(decoded, mode);
  if (!validation.ok) {
    throw new CircuitDocumentError("Circuit document failed validation.", validation.diagnostics);
  }
  return validation.document;
}

function buildNets(document: CircuitDocument): {
  nets: CircuitNet[];
  nodeByConnection: Map<string, string>;
} {
  const connectivity = buildConnectivity(document);
  const membersByRoot = new Map<string, string[]>();
  for (const key of connectivity.keys()) {
    const root = connectivity.find(key);
    const members = membersByRoot.get(root) ?? [];
    members.push(key);
    membersByRoot.set(root, members);
  }

  const labelsByRoot = new Map<string, Set<string>>();
  for (const label of document.netLabels) {
    const root = connectivity.find(connectionPointKey(label.target));
    const labels = labelsByRoot.get(root) ?? new Set<string>();
    labels.add(label.name);
    labelsByRoot.set(root, labels);
  }

  const groundRoots = new Set(
    document.components
      .filter((component) => component.kind === "ground")
      .map((component) =>
        connectivity.find(
          connectionPointKey({
            type: "pin",
            componentId: component.id,
            pinId: "gnd",
          }),
        ),
      ),
  );

  const orderedRoots = [...membersByRoot.keys()].sort((a, b) => {
    const aGround = groundRoots.has(a);
    const bGround = groundRoots.has(b);
    if (aGround !== bGround) return aGround ? -1 : 1;
    const aLabel = [...(labelsByRoot.get(a) ?? [])].sort()[0] ?? "";
    const bLabel = [...(labelsByRoot.get(b) ?? [])].sort()[0] ?? "";
    return aLabel.localeCompare(bLabel) || a.localeCompare(b);
  });

  let anonymousIndex = 1;
  const usedNames = new Set<string>(["0"]);
  const nets: CircuitNet[] = [];
  const nodeByRoot = new Map<string, string>();
  for (const [index, root] of orderedRoots.entries()) {
    const isGround = groundRoots.has(root);
    const labels = [...(labelsByRoot.get(root) ?? [])].sort();
    let name = "0";
    if (!isGround) {
      const preferred = labels[0];
      if (preferred && !usedNames.has(preferred.toLowerCase())) {
        name = preferred;
      } else {
        do {
          name = `n${String(anonymousIndex).padStart(3, "0")}`;
          anonymousIndex += 1;
        } while (usedNames.has(name.toLowerCase()));
      }
      usedNames.add(name.toLowerCase());
    }
    nodeByRoot.set(root, name);
    nets.push({
      id: `net-${String(index).padStart(3, "0")}`,
      name,
      isGround,
      labels,
      members: [...membersByRoot.get(root)!].sort(),
    });
  }

  const nodeByConnection = new Map<string, string>();
  for (const key of connectivity.keys()) {
    nodeByConnection.set(key, nodeByRoot.get(connectivity.find(key))!);
  }
  return { nets, nodeByConnection };
}

export function compileCircuitDocument(
  input: unknown,
  mode: CircuitValidationMode = "simulation",
): CircuitIR {
  const validation = validateCircuitDocument(input, mode);
  if (!validation.ok) {
    throw new CircuitDocumentError("Circuit document cannot be compiled.", validation.diagnostics);
  }

  const document = validation.document;
  const { nets, nodeByConnection } = buildNets(document);
  const components: CircuitIRComponent[] = document.components.map((component) => {
    const nodes: Record<string, string> = {};
    for (const pin of COMPONENT_DEFINITIONS[component.kind].pins) {
      const key = connectionPointKey({
        type: "pin",
        componentId: component.id,
        pinId: pin.id,
      });
      nodes[pin.id] = nodeByConnection.get(key)!;
    }
    return { ...component, nodes };
  });

  const probes: CircuitIRProbe[] = document.probes.map((probe) => {
    if (probe.quantity === "current") {
      return {
        id: probe.id,
        label: probe.label,
        quantity: probe.quantity,
        componentId: probe.componentId,
      };
    }
    if (probe.quantity === "voltage") {
      return {
        id: probe.id,
        label: probe.label,
        quantity: probe.quantity,
        node: nodeByConnection.get(connectionPointKey(probe.target))!,
      };
    }
    return {
      id: probe.id,
      label: probe.label,
      quantity: probe.quantity,
      positiveNode: nodeByConnection.get(connectionPointKey(probe.positive))!,
      negativeNode: nodeByConnection.get(connectionPointKey(probe.negative))!,
    };
  });

  return {
    version: 1,
    sourceDocumentId: document.id,
    sourceRevision: document.revision,
    title: document.title,
    components,
    nets,
    probes,
    analyses: document.analyses,
  };
}
