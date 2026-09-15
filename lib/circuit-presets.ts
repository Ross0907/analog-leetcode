import {
  circuitDocumentSchema,
  type CircuitAnalysis,
  type CircuitComponent,
  type CircuitDocument,
  type CircuitProbe,
  type ComponentKind,
  type ConnectionPoint,
  type SchematicPoint,
} from "./circuit-document";

type ParametersFor<K extends ComponentKind> = Extract<
  CircuitComponent,
  { kind: K }
>["parameters"];

function placed<K extends ComponentKind>(
  kind: K,
  id: string,
  reference: string,
  x: number,
  y: number,
  parameters: ParametersFor<K>,
  rotation: 0 | 90 | 180 | 270 = 0,
): Extract<CircuitComponent, { kind: K }> {
  return {
    kind,
    id,
    reference,
    position: { x, y },
    rotation,
    parameters,
  } as Extract<CircuitComponent, { kind: K }>;
}

const pin = (componentId: string, pinId: string): ConnectionPoint => ({
  type: "pin",
  componentId,
  pinId,
});

const wire = (
  id: string,
  from: ConnectionPoint,
  to: ConnectionPoint,
  waypoints: SchematicPoint[] = [],
) => ({ id, from, to, waypoints });

const label = (
  id: string,
  name: string,
  target: ConnectionPoint,
  x: number,
  y: number,
) => ({ id, name, target, position: { x, y } });

function preset(input: {
  id: string;
  title: string;
  components: CircuitComponent[];
  wires: ReturnType<typeof wire>[];
  netLabels: ReturnType<typeof label>[];
  probes: CircuitProbe[];
  analyses: CircuitAnalysis[];
}): CircuitDocument {
  return circuitDocumentSchema.parse({
    version: 1,
    id: input.id,
    title: input.title,
    revision: 0,
    components: input.components,
    junctions: [],
    wires: input.wires,
    netLabels: input.netLabels,
    probes: input.probes,
    analyses: input.analyses,
    settings: { gridSize: 20, snapToGrid: true },
  });
}

const precisionVoltageDivider = preset({
  id: "preset-divider",
  title: "Precision voltage divider",
  components: [
    placed("ground", "gnd", "GND1", 0, 240, {}),
    placed("voltage-source", "v1", "V1", -240, 80, { dcV: 5 }),
    placed("resistor", "r1", "R1", -40, 20, { resistanceOhm: 10_000 }),
    placed("resistor", "r2", "R2", -40, 140, { resistanceOhm: 10_000 }),
  ],
  wires: [
    wire("w1", pin("v1", "positive"), pin("r1", "a")),
    wire("w2", pin("r1", "b"), pin("r2", "a")),
    wire("w3", pin("r2", "b"), pin("gnd", "gnd")),
    wire("w4", pin("v1", "negative"), pin("gnd", "gnd")),
  ],
  netLabels: [
    label("label-vin", "vin", pin("v1", "positive"), -180, 20),
    label("label-vout", "vout", pin("r1", "b"), 20, 90),
  ],
  probes: [
    {
      id: "probe-vout",
      label: "V(out)",
      quantity: "voltage",
      target: pin("r1", "b"),
    },
  ],
  analyses: [
    { id: "analysis-op", name: "Operating point", type: "operating-point" },
  ],
});

const rcLowPass = preset({
  id: "preset-rc-low-pass",
  title: "1 kHz RC low-pass",
  components: [
    placed("ground", "gnd", "GND1", 0, 220, {}),
    placed("voltage-source", "v1", "V1", -260, 80, {
      dcV: 0,
      ac: { magnitude: 1, phaseDeg: 0 },
    }),
    placed("resistor", "r1", "R1", -80, 20, { resistanceOhm: 15_900 }),
    placed("capacitor", "c1", "C1", 100, 100, { capacitanceF: 10e-9 }, 90),
  ],
  wires: [
    wire("w1", pin("v1", "positive"), pin("r1", "a")),
    wire("w2", pin("r1", "b"), pin("c1", "a")),
    wire("w3", pin("c1", "b"), pin("gnd", "gnd")),
    wire("w4", pin("v1", "negative"), pin("gnd", "gnd")),
  ],
  netLabels: [
    label("label-vin", "vin", pin("v1", "positive"), -190, 20),
    label("label-vout", "vout", pin("r1", "b"), 20, 20),
  ],
  probes: [
    {
      id: "probe-vout",
      label: "V(out)",
      quantity: "voltage",
      target: pin("r1", "b"),
    },
  ],
  analyses: [
    {
      id: "analysis-ac",
      name: "Frequency response",
      type: "ac-sweep",
      scale: "decade",
      points: 30,
      startHz: 10,
      stopHz: 100_000,
    },
  ],
});

const invertingAmplifier = preset({
  id: "preset-inverting-amplifier",
  title: "Inverting gain stage",
  components: [
    placed("ground", "gnd", "GND1", 0, 260, {}),
    placed("voltage-source", "vin", "V1", -300, 80, { dcV: 0.1 }),
    placed("resistor", "rin", "RIN", -140, 20, { resistanceOhm: 10_000 }),
    placed("resistor", "rf", "RF", 40, -100, { resistanceOhm: 100_000 }),
    placed("op-amp-ideal", "u1", "U1", 100, 60, { openLoopGain: 1e6 }),
  ],
  wires: [
    wire("w1", pin("vin", "positive"), pin("rin", "a")),
    wire("w2", pin("vin", "negative"), pin("gnd", "gnd")),
    wire("w3", pin("rin", "b"), pin("u1", "inverting")),
    wire("w4", pin("rf", "a"), pin("u1", "output")),
    wire("w5", pin("rf", "b"), pin("u1", "inverting")),
    wire("w6", pin("u1", "nonInverting"), pin("gnd", "gnd")),
  ],
  netLabels: [
    label("label-vin", "vin", pin("vin", "positive"), -240, 20),
    label("label-sum", "nsum", pin("u1", "inverting"), 20, 60),
    label("label-vout", "vout", pin("u1", "output"), 180, 60),
  ],
  probes: [
    {
      id: "probe-vout",
      label: "V(out)",
      quantity: "voltage",
      target: pin("u1", "output"),
    },
  ],
  analyses: [
    { id: "analysis-op", name: "Operating point", type: "operating-point" },
  ],
});

const bjtBias = preset({
  id: "preset-bjt-bias",
  title: "BJT bias across beta",
  components: [
    placed("ground", "gnd", "GND1", 0, 320, {}),
    placed("voltage-source", "vcc", "VCC", -300, 80, { dcV: 12 }),
    placed("resistor", "r1", "R1", -140, 20, { resistanceOhm: 68_000 }, 90),
    placed("resistor", "r2", "R2", -140, 180, { resistanceOhm: 15_000 }, 90),
    placed("resistor", "rc", "RC", 80, 20, { resistanceOhm: 3_300 }, 90),
    placed("resistor", "re", "RE", 80, 220, { resistanceOhm: 1_000 }, 90),
    placed("bjt-npn", "q1", "Q1", 40, 130, {
      model: "generic-npn",
      area: 1,
    }),
  ],
  wires: [
    wire("w1", pin("vcc", "positive"), pin("r1", "a")),
    wire("w2", pin("vcc", "positive"), pin("rc", "a")),
    wire("w3", pin("vcc", "negative"), pin("gnd", "gnd")),
    wire("w4", pin("r1", "b"), pin("r2", "a")),
    wire("w5", pin("r1", "b"), pin("q1", "base")),
    wire("w6", pin("r2", "b"), pin("gnd", "gnd")),
    wire("w7", pin("rc", "b"), pin("q1", "collector")),
    wire("w8", pin("q1", "emitter"), pin("re", "a")),
    wire("w9", pin("re", "b"), pin("gnd", "gnd")),
  ],
  netLabels: [
    label("label-vcc", "vcc", pin("vcc", "positive"), -220, 20),
    label("label-vb", "vb", pin("q1", "base"), -40, 130),
    label("label-vc", "vc", pin("q1", "collector"), 100, 100),
    label("label-ve", "ve", pin("q1", "emitter"), 100, 170),
  ],
  probes: [
    {
      id: "probe-vc",
      label: "V(C)",
      quantity: "voltage",
      target: pin("q1", "collector"),
    },
  ],
  analyses: [
    { id: "analysis-op", name: "Bias point", type: "operating-point" },
  ],
});

const rectifierRipple = preset({
  id: "preset-rectifier-ripple",
  title: "Rectifier ripple budget",
  components: [
    placed("ground", "gnd", "GND1", 0, 260, {}),
    placed("voltage-source", "vs", "VS", -280, 80, {
      dcV: 0,
      transient: {
        type: "sine",
        offset: 0,
        amplitude: 12,
        frequencyHz: 50,
        delayS: 0,
        dampingPerS: 0,
        phaseDeg: 0,
      },
    }),
    placed("diode", "d1", "D1", -80, 20, {
      model: "rectifier",
      area: 1,
    }),
    placed("capacitor", "c1", "C1", 100, 100, { capacitanceF: 1_000e-6 }, 90),
    placed("resistor", "rl", "RL", 240, 100, { resistanceOhm: 100 }, 90),
  ],
  wires: [
    wire("w1", pin("vs", "positive"), pin("d1", "anode")),
    wire("w2", pin("d1", "cathode"), pin("c1", "a")),
    wire("w3", pin("d1", "cathode"), pin("rl", "a")),
    wire("w4", pin("c1", "b"), pin("gnd", "gnd")),
    wire("w5", pin("rl", "b"), pin("gnd", "gnd")),
    wire("w6", pin("vs", "negative"), pin("gnd", "gnd")),
  ],
  netLabels: [
    label("label-in", "rect_in", pin("vs", "positive"), -200, 20),
    label("label-out", "out", pin("d1", "cathode"), 20, 20),
  ],
  probes: [
    {
      id: "probe-out",
      label: "V(out)",
      quantity: "voltage",
      target: pin("d1", "cathode"),
    },
    {
      id: "probe-diode-current",
      label: "I(D1)",
      quantity: "current",
      componentId: "d1",
    },
  ],
  analyses: [
    {
      id: "analysis-tran",
      name: "Ripple transient",
      type: "transient",
      stepS: 100e-6,
      stopS: 100e-3,
      startS: 0,
    },
  ],
});

const mosfetGateDrive = preset({
  id: "preset-mosfet-gate-drive",
  title: "MOSFET gate-drive edge",
  components: [
    placed("ground", "gnd", "GND1", 0, 220, {}),
    placed("voltage-source", "vg", "VG", -260, 80, {
      dcV: 0,
      transient: {
        type: "pulse",
        low: 0,
        high: 10,
        delayS: 0,
        riseS: 2e-9,
        fallS: 2e-9,
        widthS: 1e-6,
        periodS: 2e-6,
      },
    }),
    placed("resistor", "rg", "RG", -60, 20, { resistanceOhm: 10 }),
    placed("capacitor", "cgs", "CGS", 120, 100, { capacitanceF: 2e-9 }, 90),
  ],
  wires: [
    wire("w1", pin("vg", "positive"), pin("rg", "a")),
    wire("w2", pin("rg", "b"), pin("cgs", "a")),
    wire("w3", pin("cgs", "b"), pin("gnd", "gnd")),
    wire("w4", pin("vg", "negative"), pin("gnd", "gnd")),
  ],
  netLabels: [
    label("label-driver", "driver", pin("vg", "positive"), -180, 20),
    label("label-gate", "gate", pin("rg", "b"), 30, 20),
  ],
  probes: [
    {
      id: "probe-gate",
      label: "V(G)",
      quantity: "voltage",
      target: pin("rg", "b"),
    },
    {
      id: "probe-drive-current",
      label: "I(RG)",
      quantity: "current",
      componentId: "rg",
    },
  ],
  analyses: [
    {
      id: "analysis-tran",
      name: "Gate edge",
      type: "transient",
      stepS: 1e-9,
      stopS: 300e-9,
      startS: 0,
      maxStepS: 1e-9,
    },
  ],
});

const sallenKey = preset({
  id: "preset-sallen-key",
  title: "Sallen-Key low-pass",
  components: [
    placed("ground", "gnd", "GND1", 0, 300, {}),
    placed("voltage-source", "v1", "V1", -320, 100, {
      dcV: 0,
      ac: { magnitude: 1, phaseDeg: 0 },
    }),
    placed("resistor", "r1", "R1", -170, 20, { resistanceOhm: 2_200 }),
    placed("resistor", "r2", "R2", -20, 20, { resistanceOhm: 2_200 }),
    placed("capacitor", "c1", "C1", -90, 130, { capacitanceF: 20e-9 }, 90),
    placed("capacitor", "c2", "C2", 170, 150, { capacitanceF: 10e-9 }, 90),
    placed("op-amp-ideal", "u1", "U1", 140, 50, { openLoopGain: 1e6 }),
  ],
  wires: [
    wire("w1", pin("v1", "positive"), pin("r1", "a")),
    wire("w2", pin("v1", "negative"), pin("gnd", "gnd")),
    wire("w3", pin("r1", "b"), pin("r2", "a")),
    wire("w4", pin("r1", "b"), pin("c1", "a")),
    wire("w5", pin("c1", "b"), pin("u1", "output")),
    wire("w6", pin("r2", "b"), pin("u1", "nonInverting")),
    wire("w7", pin("r2", "b"), pin("c2", "a")),
    wire("w8", pin("u1", "inverting"), pin("u1", "output")),
    wire("w9", pin("c2", "b"), pin("gnd", "gnd")),
  ],
  netLabels: [
    label("label-in", "in", pin("v1", "positive"), -250, 20),
    label("label-n1", "filter_n1", pin("r1", "b"), -90, 20),
    label("label-out", "out", pin("u1", "output"), 240, 50),
  ],
  probes: [
    {
      id: "probe-out",
      label: "V(out)",
      quantity: "voltage",
      target: pin("u1", "output"),
    },
  ],
  analyses: [
    {
      id: "analysis-ac",
      name: "Filter response",
      type: "ac-sweep",
      scale: "decade",
      points: 40,
      startHz: 100,
      stopHz: 100_000,
    },
  ],
});

const cmosInverter = preset({
  id: "preset-cmos-inverter",
  title: "CMOS inverter transfer",
  components: [
    placed("ground", "gnd", "GND1", 0, 300, {}),
    placed("voltage-source", "vdd", "VDD", -300, 80, { dcV: 1.8 }),
    placed("voltage-source", "vin", "VIN", -300, 200, { dcV: 0 }),
    placed("mosfet-pmos", "mp", "MP", 40, 60, {
      model: "generic-pmos-90nm",
      widthM: 2e-6,
      lengthM: 90e-9,
      multiplier: 1,
    }),
    placed("mosfet-nmos", "mn", "MN", 40, 190, {
      model: "generic-nmos-90nm",
      widthM: 1e-6,
      lengthM: 90e-9,
      multiplier: 1,
    }),
  ],
  wires: [
    wire("w1", pin("vdd", "positive"), pin("mp", "source")),
    wire("w2", pin("vdd", "positive"), pin("mp", "body")),
    wire("w3", pin("vdd", "negative"), pin("gnd", "gnd")),
    wire("w4", pin("vin", "positive"), pin("mp", "gate")),
    wire("w5", pin("vin", "positive"), pin("mn", "gate")),
    wire("w6", pin("vin", "negative"), pin("gnd", "gnd")),
    wire("w7", pin("mp", "drain"), pin("mn", "drain")),
    wire("w8", pin("mn", "source"), pin("gnd", "gnd")),
    wire("w9", pin("mn", "body"), pin("gnd", "gnd")),
  ],
  netLabels: [
    label("label-vdd", "vdd", pin("vdd", "positive"), -220, 20),
    label("label-in", "in", pin("vin", "positive"), -160, 170),
    label("label-out", "out", pin("mp", "drain"), 120, 130),
  ],
  probes: [
    {
      id: "probe-out",
      label: "V(out)",
      quantity: "voltage",
      target: pin("mp", "drain"),
    },
  ],
  analyses: [
    {
      id: "analysis-dc",
      name: "Transfer curve",
      type: "dc-sweep",
      sourceComponentId: "vin",
      start: 0,
      stop: 1.8,
      step: 0.01,
    },
  ],
});

const transimpedanceAmplifier = preset({
  id: "preset-transimpedance",
  title: "Photodiode transimpedance amplifier",
  components: [
    placed("ground", "gnd", "GND1", 0, 260, {}),
    placed("current-source", "iin", "IIN", -260, 100, {
      dcA: 0,
      ac: { magnitude: 1e-6, phaseDeg: 0 },
    }),
    placed("resistor", "rf", "RF", -10, -80, { resistanceOhm: 100_000 }),
    placed("capacitor", "cf", "CF", -10, -140, { capacitanceF: 2e-12 }),
    placed("capacitor", "cd", "CD", -120, 140, { capacitanceF: 50e-12 }, 90),
    placed("op-amp-ideal", "u1", "U1", 120, 70, { openLoopGain: 100_000 }),
  ],
  wires: [
    wire("w1", pin("iin", "positive"), pin("rf", "b")),
    wire("w2", pin("iin", "positive"), pin("cf", "b")),
    wire("w3", pin("iin", "positive"), pin("cd", "a")),
    wire("w4", pin("iin", "positive"), pin("u1", "inverting")),
    wire("w5", pin("iin", "negative"), pin("gnd", "gnd")),
    wire("w6", pin("cd", "b"), pin("gnd", "gnd")),
    wire("w7", pin("rf", "a"), pin("u1", "output")),
    wire("w8", pin("cf", "a"), pin("u1", "output")),
    wire("w9", pin("u1", "nonInverting"), pin("gnd", "gnd")),
  ],
  netLabels: [
    label("label-sum", "nsum", pin("u1", "inverting"), 20, 70),
    label("label-out", "out", pin("u1", "output"), 210, 70),
  ],
  probes: [
    {
      id: "probe-out",
      label: "V(out)",
      quantity: "voltage",
      target: pin("u1", "output"),
    },
  ],
  analyses: [
    {
      id: "analysis-ac",
      name: "Transimpedance response",
      type: "ac-sweep",
      scale: "decade",
      points: 50,
      startHz: 10,
      stopHz: 10_000_000,
    },
  ],
});

export const circuitPresets = Object.freeze({
  "precision-voltage-divider": precisionVoltageDivider,
  "rc-cutoff-1khz": rcLowPass,
  "inverting-gain-stage": invertingAmplifier,
  "bjt-bias-across-beta": bjtBias,
  "diode-rectifier-ripple": rectifierRipple,
  "mosfet-gate-drive": mosfetGateDrive,
  "sallen-key-q": sallenKey,
  "cmos-inverter-trip-point": cmosInverter,
  "transimpedance-stability": transimpedanceAmplifier,
} satisfies Record<string, CircuitDocument>);

export type CircuitPresetSlug = keyof typeof circuitPresets;

/** Returns a newly parsed copy so editor mutations cannot alter the templates. */
export function createCircuitPreset(slug: CircuitPresetSlug): CircuitDocument {
  return circuitDocumentSchema.parse(circuitPresets[slug]);
}
