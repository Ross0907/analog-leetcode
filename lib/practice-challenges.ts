import type { Challenge } from "./challenges";

export type PracticeSolution = {
  quantity: string; value: number; unit: string; tolerance: number; explanation: string;
  verification: { kind: "op" | "transient" | "ac"; node: string; at?: number; scale?: number; offset?: number };
};

// These strings are documents in CircuitJS's native format, not a new editor or solver.
const native = (body: string) => `$ 1 .000001 10.2 50 5 50\n${body.trim()}\n`;
const supply = "v 96 320 96 128 0 0 40 5 0 0 .5\ng 96 320 96 352 0";
const sine = "v 96 320 96 128 0 1 1000 1 0 0 .5\ng 96 320 96 352 0";
const pulse = "v 96 320 96 128 0 2 50 2.5 2.5 0 .5\ng 96 320 96 352 0";
const opamp = "a 320 208 448 208 0 15 -15 100000\nO 448 208 512 208 0";
type Input = Pick<Challenge, "slug" | "title" | "difficulty" | "domain" | "objective" | "topics" | "starterNetlist" | "nativeCircuit"> & { solution: PracticeSolution; analysis?: Challenge["analysis"]; assumptions: string[] };
const problems: Input[] = [
  {
    slug: "loaded-divider", title: "A voltmeter that loads the divider", difficulty: "Foundation", domain: "DC",
    objective: "A 5 V source drives a 10 kΩ / 10 kΩ divider. Add a 10 kΩ load across the lower resistor. Find the loaded output voltage.",
    topics: ["Loading", "Parallel resistance", "Measurement"], assumptions: ["All three resistors are exactly 10 kΩ"],
    starterNetlist: "V1 vin 0 5\nR1 vin out 10k\nR2 out 0 10k\nRL out 0 10k\n.op\n.end",
    nativeCircuit: native(`${supply}\nr 96 128 288 128 0 10000\nr 288 128 288 320 0 10000\nw 288 128 432 128 0\nr 432 128 432 320 0 10000\nw 96 320 288 320 0\nw 288 320 432 320 0\nO 432 128 496 128 0`),
    solution: { quantity: "Loaded output", value: 5/3, unit: "V", tolerance: .01, explanation: "The lower leg becomes 10 kΩ ∥ 10 kΩ = 5 kΩ. Vout = 5 × 5/(10 + 5) = 1.6667 V. The unloaded value of 2.5 V would be incorrect.", verification: { kind: "op", node: "out" } },
  },
  {
    slug: "current-divider", title: "Follow the branch current", difficulty: "Foundation", domain: "DC",
    objective: "A 6 mA source feeds 1 kΩ and 2 kΩ in parallel. Find the current from the shared node to ground through the 2 kΩ branch.",
    topics: ["KCL", "Current division"], assumptions: ["Source injects 6 mA into the node"],
    starterNetlist: "I1 0 out 6m\nR1 out 0 1k\nR2 out 0 2k\n.op\n.end",
    nativeCircuit: native("i 96 320 96 128 0 .006\ng 96 320 96 352 0\nw 96 128 288 128 0\nr 288 128 288 320 0 1000\nw 288 128 432 128 0\nr 432 128 432 320 0 2000\nw 96 320 288 320 0\nw 288 320 432 320 0\nO 432 128 496 128 0"),
    solution: { quantity: "2 kΩ branch current", value: .002, unit: "A", tolerance: .01, explanation: "The node voltage is 6 mA × (1 kΩ ∥ 2 kΩ) = 4 V. The 2 kΩ branch carries 2 mA and the 1 kΩ branch carries 4 mA.", verification: { kind: "op", node: "out", scale: 1/2000 } },
  },
  {
    slug: "thevenin-load", title: "Load a Thevenin source", difficulty: "Foundation", domain: "DC",
    objective: "A Thevenin source has 12 V open-circuit voltage and 4 kΩ resistance. Find the terminal voltage when it drives a 2 kΩ load.",
    topics: ["Thevenin equivalent", "Source resistance"], assumptions: ["Ideal linear source model"],
    starterNetlist: "V1 vin 0 12\nRS vin out 4k\nRL out 0 2k\n.op\n.end",
    nativeCircuit: native(`${supply.replace("40 5 0", "40 12 0")}\nr 96 128 320 128 0 4000\nr 320 128 320 320 0 2000\nw 96 320 320 320 0\nO 320 128 416 128 0`),
    solution: { quantity: "Terminal voltage", value: 4, unit: "V", tolerance: .01, explanation: "The current is 12/(4000 + 2000) = 2 mA. The load voltage is 2 mA × 2 kΩ = 4 V.", verification: { kind: "op", node: "out" } },
  },
  {
    slug: "rc-charge-one-tau", title: "One time constant after a step", difficulty: "Foundation", domain: "DC", analysis: "Transient",
    objective: "A 0 → 5 V step drives 10 kΩ in series with an initially discharged 100 nF capacitor. Find its voltage 1 ms after the first rising edge.",
    topics: ["RC charging", "Initial conditions", "Time constant"], assumptions: ["Use Reset before recording the first charging edge"],
    starterNetlist: "V1 vin 0 PULSE(0 5 0 1n 1n 10m 20m)\nR1 vin out 10k\nC1 out 0 100n\n.tran 5u 5m\n.end",
    nativeCircuit: native(`${pulse}\nr 96 128 320 128 0 10000\nc 320 128 320 320 0 .0000001 0\nw 96 320 320 320 0\nO 320 128 416 128 0`),
    solution: { quantity: "Capacitor voltage at 1 ms", value: 5*(1-Math.exp(-1)), unit: "V", tolerance: .01, explanation: "τ = RC = 1 ms. Vc(t) = 5(1 − exp(−t/τ)); at one time constant Vc = 3.1606 V, or 63.2% of its final voltage.", verification: { kind: "transient", node: "out", at: .001 } },
  },
  {
    slug: "rl-current-rise", title: "Inductor current cannot jump", difficulty: "Foundation", domain: "DC", analysis: "Transient",
    objective: "A 0 → 5 V step drives 100 Ω in series with 100 mH. Initially the current is zero. Find the current 1 ms after the first rising edge.",
    topics: ["RL transient", "Inductor continuity", "KVL"], assumptions: ["Ideal inductor with zero winding resistance", "Use Reset before capture"],
    starterNetlist: "V1 vin 0 PULSE(0 5 0 1n 1n 10m 20m)\nR1 vin out 100\nL1 out 0 100m\n.tran 5u 5m\n.end",
    nativeCircuit: native(`${pulse}\nr 96 128 320 128 0 100\nl 320 128 320 320 0 .1 0\nw 96 320 320 320 0\nO 320 128 416 128 0`),
    solution: { quantity: "Inductor current at 1 ms", value: .05*(1-Math.exp(-1)), unit: "A", tolerance: .01, explanation: "τ = L/R = 1 ms and I∞ = 50 mA. I(τ) = 50(1 − e⁻¹) = 31.606 mA. Equivalently measure VL and use I = (5 − VL)/100.", verification: { kind: "transient", node: "out", at: .001, scale: -.01, offset: .05 } },
  },
  {
    slug: "rc-high-pass", title: "The other side of the capacitor", difficulty: "Foundation", domain: "AC", analysis: "AC sweep",
    objective: "A series 10 nF capacitor feeds a 10 kΩ resistor to ground. Find |Vout/Vin| at 1 kHz with the output across the resistor.",
    topics: ["High-pass filter", "Impedance", "Bode plots"], assumptions: ["1 V AC source"],
    starterNetlist: "V1 vin 0 AC 1\nC1 vin out 10n\nR1 out 0 10k\n.ac dec 50 10 100k\n.end",
    nativeCircuit: native(`${sine}\nc 96 128 320 128 0 .00000001 0\nr 320 128 320 320 0 10000\nw 96 320 320 320 0\nO 320 128 416 128 0`),
    solution: { quantity: "Gain magnitude at 1 kHz", value: (2*Math.PI*.1)/Math.sqrt(1+(2*Math.PI*.1)**2), unit: "V/V", tolerance: .01, explanation: "H(jω) = jωRC/(1 + jωRC). Since ωRC = 0.628319, |H| = 0.532018, approximately −5.48 dB. The output approaches unity at high frequency.", verification: { kind: "ac", node: "out", at: 1000 } },
  },
  {
    slug: "noninverting-feedback", title: "Feedback without inversion", difficulty: "Intermediate", domain: "Op-amps",
    objective: "Apply +0.25 V to a non-inverting amplifier. Its feedback resistor is 30 kΩ and resistor to ground is 10 kΩ. Find Vout.",
    topics: ["Negative feedback", "Non-inverting amplifier"], assumptions: ["Open-loop gain 100000; ideal-gain answer accepted", "Native schematic output limits ±15 V"],
    starterNetlist: "V1 vin 0 .25\nRF out neg 30k\nRG neg 0 10k\nEOP out 0 vin neg 100000\n.op\n.end",
    nativeCircuit: native(`${opamp}\nR 192 224 128 224 0 0 40 .25 0 0 .5\nw 192 224 320 224 0\nw 320 192 320 128 0\nr 320 128 448 128 0 30000\nw 448 128 448 208 0\nr 192 128 320 128 0 10000\ng 192 128 192 160 0`),
    solution: { quantity: "Output voltage", value: 1, unit: "V", tolerance: .001, explanation: "Vout = (1 + RF/RG)Vin = 4 × 0.25 = 1 V. Finite open-loop gain gives approximately 0.99996 V.", verification: { kind: "op", node: "out" } },
  },
  {
    slug: "weighted-summing", title: "Mix two signals with weights", difficulty: "Intermediate", domain: "Op-amps",
    objective: "Feed 0.1 V through 10 kΩ and 0.2 V through 20 kΩ into an inverting summer with 100 kΩ feedback. Find Vout.",
    topics: ["Summing amplifier", "Virtual ground", "Weighted signals"], assumptions: ["Non-inverting input grounded", "Open-loop gain 100000"],
    starterNetlist: "V1 a 0 .1\nV2 b 0 .2\nR1 a neg 10k\nR2 b neg 20k\nRF out neg 100k\nEOP out 0 0 neg 100000\n.op\n.end",
    nativeCircuit: native(`${opamp}\ng 320 224 320 272 0\nw 320 192 272 192 0\nw 272 192 272 128 0\nr 272 128 448 128 0 100000\nw 448 128 448 208 0\nr 128 192 272 192 0 10000\nw 272 192 272 304 0\nr 128 304 272 304 0 20000\nR 128 192 80 192 0 0 40 .1 0 0 .5\nR 128 304 80 304 0 0 40 .2 0 0 .5`),
    solution: { quantity: "Output voltage", value: -2, unit: "V", tolerance: .001, explanation: "Each input contributes 10 µA. Vout = −RF(V1/R1 + V2/R2) = −100 kΩ × 20 µA = −2 V. Keep the sign in your answer.", verification: { kind: "op", node: "out" } },
  },
  {
    slug: "difference-amplifier", title: "Reject a shared voltage", difficulty: "Intermediate", domain: "Op-amps",
    objective: "A unity-gain difference amplifier has four matched 10 kΩ resistors. V1 = 1.0 V feeds its inverting resistor; V2 = 1.3 V feeds its non-inverting divider. Find Vout.",
    topics: ["Difference amplifier", "Common-mode rejection", "Resistor matching"], assumptions: ["All resistor ratios exactly matched", "Open-loop gain 100000"],
    starterNetlist: "V1 a 0 1\nV2 b 0 1.3\nR1 a neg 10k\nRF out neg 10k\nR2 b pos 10k\nRG pos 0 10k\nEOP out 0 pos neg 100000\n.op\n.end",
    nativeCircuit: native(`${opamp}\nw 320 192 320 128 0\nr 320 128 448 128 0 10000\nw 448 128 448 208 0\nr 176 128 320 128 0 10000\nR 176 128 128 128 0 0 40 1 0 0 .5\nr 176 224 320 224 0 10000\nR 176 224 128 224 0 0 40 1.3 0 0 .5\nr 320 224 320 352 0 10000\ng 320 352 320 384 0`),
    solution: { quantity: "Differential output", value: .3, unit: "V", tolerance: .001, explanation: "V+ = V2/2 = 0.65 V. KCL gives Vout ≈ 2V+ − V1 = V2 − V1 = 0.3 V. Both resistor ratios must match to reject a shared voltage.", verification: { kind: "op", node: "out" } },
  },
  {
    slug: "practical-integrator", title: "Give the integrator a DC path", difficulty: "Intermediate", domain: "Op-amps", analysis: "AC sweep",
    objective: "Use 10 kΩ input resistance and feedback 1 MΩ in parallel with 100 nF. Find the linear gain magnitude at 100 Hz.",
    topics: ["Integrator", "DC feedback", "Pole"], assumptions: ["1 V AC source", "Open-loop gain 100000"],
    starterNetlist: "V1 vin 0 AC 1\nRIN vin neg 10k\nRF out neg 1meg\nCF out neg 100n\nEOP out 0 0 neg 100000\n.ac dec 50 1 100k\n.end",
    nativeCircuit: native(`${opamp}\ng 320 224 320 272 0\nR 128 192 80 192 0 1 100 1 0 0 .5\nr 128 192 272 192 0 10000\nw 272 192 320 192 0\nw 272 192 272 128 0\nc 272 128 448 128 0 .0000001 0\nw 448 128 448 208 0\nw 272 128 272 64 0\nr 272 64 448 64 0 1000000\nw 448 64 448 128 0`),
    solution: { quantity: "Gain magnitude at 100 Hz", value: 100/Math.sqrt(1+(2*Math.PI*100*.1)**2), unit: "V/V", tolerance: .005, explanation: "Zf = RF/(1 + jωRFCF). Thus |H| = (RF/RIN)/√(1 + (ωRFCF)²) = 1.59135 V/V. The resistor sets finite DC gain, and above 1.59 Hz the stage approximates an integrator.", verification: { kind: "ac", node: "out", at: 100 } },
  },
  {
    slug: "capacitive-divider", title: "Divide AC with capacitors", difficulty: "Intermediate", domain: "AC", analysis: "AC sweep",
    objective: "Put 10 nF and 20 nF in series across an AC source. Find the 1 kHz voltage ratio across the 20 nF capacitor.",
    topics: ["Capacitive impedance", "Charge conservation"], assumptions: ["1 V AC source", "A 1 GΩ output bleed establishes the DC reference"],
    starterNetlist: "V1 vin 0 AC 1\nC1 vin out 10n\nC2 out 0 20n\nRB out 0 1g\n.ac dec 50 10 100k\n.end",
    nativeCircuit: native(`${sine}\nc 96 128 320 128 0 .00000001 0\nc 320 128 320 320 0 .00000002 0\nw 96 320 320 320 0\nw 320 128 448 128 0\nr 448 128 448 320 0 1000000000\nw 320 320 448 320 0\nO 448 128 512 128 0`),
    solution: { quantity: "Capacitive division ratio", value: 1/3, unit: "V/V", tolerance: .001, explanation: "The capacitors carry equal AC charge. Since V = Q/C, Vout/Vin = C1/(C1 + C2) = 10/30 = 1/3. The bleed resistor's effect is negligible at 1 kHz.", verification: { kind: "ac", node: "out", at: 1000 } },
  },
  {
    slug: "passive-two-bit-dac", title: "A passive two-bit DAC", difficulty: "Intermediate", domain: "Digital",
    objective: "For code 10, the MSB is 5 V through 10 kΩ and the LSB is 0 V through 20 kΩ. Both feed a 10 kΩ load to ground. Find Vout.",
    topics: ["DAC", "Weighted conductance", "Output loading"], assumptions: ["Ideal bit sources", "Include the output load"],
    starterNetlist: "V1 msb 0 5\nV2 lsb 0 0\nR1 msb out 10k\nR2 lsb out 20k\nRL out 0 10k\n.op\n.end",
    nativeCircuit: native("R 128 128 80 128 0 0 40 5 0 0 .5\nR 128 224 80 224 0 0 40 0 0 0 .5\nr 128 128 320 128 0 10000\nr 128 224 320 224 0 20000\nw 320 128 320 224 0\nr 320 224 320 352 0 10000\ng 320 352 320 384 0\nO 320 224 448 224 0"),
    solution: { quantity: "Output for code 10", value: 2, unit: "V", tolerance: .01, explanation: "KCL gives (5 − Vout)/10k − Vout/20k = Vout/10k. Therefore Vout = (5/10k)/(1/10k + 1/20k + 1/10k) = 2 V.", verification: { kind: "op", node: "out" } },
  },
  {
    slug: "resistor-power-budget", title: "Check a resistor's power rating", difficulty: "Foundation", domain: "DC",
    objective: "A 1 kΩ resistor is connected across 5 V. Find its dissipated power and compare it with its 125 mW rating.",
    topics: ["Power", "Ohm's law", "Component rating"], assumptions: ["Ignore temperature coefficient"],
    starterNetlist: "V1 out 0 5\nR1 out 0 1k\n.op\n.end",
    nativeCircuit: native(`${supply}\nw 96 128 320 128 0\nr 320 128 320 320 0 1000\nw 96 320 320 320 0\nO 320 128 416 128 0`),
    solution: { quantity: "Dissipated power", value: .025, unit: "W", tolerance: .01, explanation: "P = V²/R = 25/1000 = 25 mW, which is 20% of the 125 mW rating. Real circuits also need temperature derating.", verification: { kind: "op", node: "out", scale: .005 } },
  },
  {
    slug: "rl-low-pass", title: "An inductor makes a low-pass", difficulty: "Intermediate", domain: "AC", analysis: "AC sweep",
    objective: "A series 100 mH inductor drives 1 kΩ to ground. Find the load voltage amplitude for a 1 V, 1 kHz input.",
    topics: ["RL filter", "Inductive reactance", "Frequency response"], assumptions: ["Ideal inductor with no winding resistance"],
    starterNetlist: "V1 vin 0 AC 1\nL1 vin out 100m\nR1 out 0 1k\n.ac dec 50 10 100k\n.end",
    nativeCircuit: native(`${sine}\nl 96 128 320 128 0 .1 0\nr 320 128 320 320 0 1000\nw 96 320 320 320 0\nO 320 128 416 128 0`),
    solution: { quantity: "Load amplitude at 1 kHz", value: 1/Math.sqrt(1+(2*Math.PI*.1)**2), unit: "V", tolerance: .01, explanation: "H(jω) = R/(R + jωL). Here ωL/R = 0.628319 and |H| = 0.846733. Its corner is R/(2πL) = 1591.55 Hz.", verification: { kind: "ac", node: "out", at: 1000 } },
  },
  {
    slug: "buffer-isolation", title: "Buffer a weak sensor", difficulty: "Intermediate", domain: "Op-amps",
    objective: "A 1.2 V sensor with 100 kΩ source resistance drives a voltage follower, which drives a 1 kΩ load. Find the load voltage.",
    topics: ["Buffer", "Input impedance", "Loading"], assumptions: ["Open-loop gain 100000 and infinite input resistance", "The educational model has no output current limit"],
    starterNetlist: "V1 sensor 0 1.2\nRS sensor vin 100k\nEOP out 0 vin out 100000\nRL out 0 1k\n.op\n.end",
    nativeCircuit: native(`${opamp}\nR 96 224 48 224 0 0 40 1.2 0 0 .5\nr 96 224 256 224 0 100000\nw 256 224 320 224 0\nw 320 192 320 128 0\nw 320 128 448 128 0\nw 448 128 448 208 0\nr 448 208 448 352 0 1000\ng 448 352 448 384 0`),
    solution: { quantity: "Buffered load voltage", value: 1.2, unit: "V", tolerance: .001, explanation: "The input draws no current in this model, so the 100 kΩ source resistor has no voltage drop. Feedback gives Vout ≈ 1.2 V. Without a buffer the load would pull the voltage down to 11.88 mV.", verification: { kind: "op", node: "out" } },
  },
];
export const practiceChallenges: Challenge[] = problems.map(({ assumptions, ...problem }, index) => ({
  ...problem, id: index + 10, summary: problem.objective, analysis: problem.analysis ?? "Operating point",
  constraints: [...assumptions, `Answer in ${problem.solution.unit}; engineering suffixes are accepted`],
  acceptance: null, attempts: 0, xp: problem.difficulty === "Foundation" ? 120 : 200, probe: "out", judge: null, available: true,
}));
