import type { Challenge } from "./challenges";
import { PARTS_ONLY_STARTERS } from "./circuitjs-starters";

// Authored textbook circuits use upstream CircuitJS elements and standard SPICE
// devices. The block descriptions explain signal flow; they never solve circuits.
const native = (body: string, step = ".000001") => `$ 1 ${step} 10.2 50 5 50\n${body.trim()}\n`;
const ladder = `r 192 128 352 128 0 10000
r 352 128 512 128 0 10000
r 192 128 192 288 0 20000
r 352 128 352 288 0 20000
r 512 128 512 288 0 20000
R 192 288 128 288 0 0 40 5 0 0 .5
R 352 288 288 288 0 0 40 0 0 0 .5
R 512 288 448 288 0 0 40 5 0 0 .5
w 512 128 656 128 0
r 656 128 656 288 0 20000
g 656 288 656 320 0
207 192 288 192 352 0 b2
207 352 288 352 352 0 b1
207 512 288 512 352 0 b0`;
const ladderDeck = `V2 b2 0 5
V1 b1 0 0
V0 b0 0 5
RB2 dac b2 20k
R1 dac n1 10k
RB1 n1 b1 20k
R2 n1 n0 10k
RB0 n0 b0 20k
RT n0 0 20k`;
const defaults = { acceptance: null, attempts: 0, available: true, judge: null, starterMode: "connected" } as const;

export const converterChallenges: Challenge[] = [
  {
    ...defaults, id: 25, slug: "r2r-dac-code", title: "Three bits, two resistor values", difficulty: "Intermediate", domain: "Digital", xp: 170,
    reusableBlock: { name: 'R2R3', ports: ['b2','b1','b0','dac'], description: 'Select the six ladder resistors, ground and four external labels; leave all three bit sources outside your selection. Reuse the saved ladder in the timed DAC and SAR exercises.' },
    summary: "Turn binary 101 into a voltage with a three-bit R–2R ladder.",
    objective: "With a 5 V reference, the MSB and LSB are high and the middle bit is low. Find the unloaded DAC output and explain why full scale is below the reference.",
    analysis: "Operating point", topics: ["R–2R DAC", "Binary weights", "Reference loading"],
    constraints: ["R = 10 kΩ, 2R = 20 kΩ; matched ideal resistors", "Ideal 0 V / 5 V bit drivers; no output load", "LSB = Vref/8; the largest three-bit code is 7"],
    starterNetlist: `${ladderDeck}\n.op\n.end`, nativeCircuit: native(`${ladder}\n207 192 128 96 128 0 dac`), probe: "dac", recommendedProbes: ["dac", "b2", "b1", "b0"],
    solution: { quantity: "DAC output for 101", value: 3.125, unit: "V", tolerance: .001, explanation: "Code 101₂ is 5. VDAC = 5 V × (1/2 + 0/4 + 1/8) = 3.125 V. One LSB is 0.625 V; code 111 reaches 4.375 V, one LSB below the reference.", verification: { kind: "op", node: "dac" } },
    blocks: { title: "From a binary word to an analog level", stages: [{ name: "3-bit word", detail: "b2 b1 b0 = 101" }, { name: "Bit drivers", detail: "Select 0 V or Vref for each branch" }, { name: "R–2R ladder", detail: "Weight branches by 1/2, 1/4, 1/8" }, { name: "DAC output", detail: "High-impedance voltage measurement" }], connections: [{ from: 0, to: 1, signal: "Three digital controls" }, { from: 1, to: 2, signal: "Reference-switched branches" }, { from: 2, to: 3, signal: "Analog voltage" }] },
  },
  {
    ...defaults, id: 26, slug: "sar-trial-residue", title: "Follow a SAR conversion", difficulty: "Advanced", domain: "Digital", xp: 220,
    summary: "Use DAC trial voltages to resolve a three-bit ADC code, then measure its residue.",
    objective: "Hold Vin = 3.20 V. Try 100, then 110, then 101 against a 5 V, three-bit DAC. Keep a trial bit when VDAC ≤ Vin. Find the final analog residue Vin − VDAC.",
    analysis: "Operating point", topics: ["SAR ADC", "Binary search", "Quantization error"],
    constraints: ["The circuit shows the final 101 trial; edit the three bit sources to test earlier trials", "Ideal held input and matched unloaded R–2R ladder", "The difference block has unity gain; this lesson does not model clocked SAR logic or comparator delay"],
    starterNetlist: `${ladderDeck}\nVIN vin 0 3.2\nERES residue 0 vin dac 1\n.op\n.end`,
    nativeCircuit: native(`${ladder}\n207 192 128 96 128 0 dac\nR 192 448 128 448 0 0 40 3.2 0 0 .5\nw 192 448 320 448 0\n207 192 448 192 512 0 vin\n207 320 416 240 416 0 dac\na 320 432 448 432 8 15 -15 1000000 0 0 1\n207 448 432 544 432 0 residue`), probe: "residue", recommendedProbes: ["vin", "dac", "residue"],
    solution: { quantity: "Final quantization residue", value: .075, unit: "V", tolerance: .001, explanation: "100 gives 2.5 V: keep the MSB. 110 gives 3.75 V: clear the middle bit. 101 gives 3.125 V: keep the LSB. The result is code 5 and residue 3.2 − 3.125 = 0.075 V, less than one 0.625 V LSB. This uses a floor quantizer, not rounding to the nearest code.", verification: { kind: "op", node: "residue" } },
    blocks: { title: "SAR decision loop", stages: [{ name: "Sample / hold", detail: "Keep Vin constant throughout conversion" }, { name: "Comparator", detail: "Compare held Vin with trial VDAC" }, { name: "SAR register", detail: "Keep or clear one bit, MSB first" }, { name: "DAC", detail: "Convert the next trial word to a voltage" }], connections: [{ from: 0, to: 1, signal: "Held input" }, { from: 1, to: 2, signal: "One comparison decision" }, { from: 2, to: 3, signal: "Trial code" }, { from: 3, to: 1, signal: "Feedback: trial VDAC" }] },
  },
  {
    ...defaults, id: 27, slug: "flash-adc-thermometer", title: "Read a flash ADC thermometer", difficulty: "Advanced", domain: "Digital", xp: 220,
    summary: "Build the bridge from three comparator decisions to a two-bit conversion.",
    objective: "A four-section reference ladder spans 0–4 V. Compare a 2.2 V input with its 1 V, 2 V, and 3 V taps. Read t1, t2, t3 and find the unsigned two-bit output code.",
    analysis: "Operating point", topics: ["Flash ADC", "Thermometer code", "Comparator thresholds"],
    constraints: ["Equal 10 kΩ ladder sections; comparator inputs draw no current", "Comparator outputs are 0 V or 5 V; input is away from all thresholds", "CircuitJS shows the comparator bank; SPICE's code node is the ideal encoder count, in volts per code", "No comparator offset, propagation delay, metastability, or bubble correction modeled"],
    starterNetlist: `VREF ref 0 4\nVIN vin 0 2.2\nR3 ref ref3 10k\nR2 ref3 ref2 10k\nR1 ref2 ref1 10k\nR0 ref1 0 10k\nB1 t1 0 V=5*(tanh(10000*(V(vin)-V(ref1)))+1)/2\nB2 t2 0 V=5*(tanh(10000*(V(vin)-V(ref2)))+1)/2\nB3 t3 0 V=5*(tanh(10000*(V(vin)-V(ref3)))+1)/2\nBCODE code 0 V=(V(t1)+V(t2)+V(t3))/5\n.op\n.end`,
    nativeCircuit: native(`R 128 96 64 96 0 0 40 4 0 0 .5\nr 128 96 128 176 0 10000\nr 128 176 128 256 0 10000\nr 128 256 128 336 0 10000\nr 128 336 128 416 0 10000\ng 128 416 128 448 0\n207 128 176 192 176 0 ref3\n207 128 256 192 256 0 ref2\n207 128 336 192 336 0 ref1\nR 128 496 64 496 0 0 40 2.2 0 0 .5\n207 128 496 192 496 0 vin\na 352 176 480 176 8 5 0 1000000 0 0 100000\n207 352 160 272 160 0 ref3\n207 352 192 272 192 0 vin\n207 480 176 560 176 0 t3\na 352 304 480 304 8 5 0 1000000 0 0 100000\n207 352 288 272 288 0 ref2\n207 352 320 272 320 0 vin\n207 480 304 560 304 0 t2\na 352 432 480 432 8 5 0 1000000 0 0 100000\n207 352 416 272 416 0 ref1\n207 352 448 272 448 0 vin\n207 480 432 560 432 0 t1`), probe: "code", recommendedProbes: ["vin", "t1", "t2", "t3"],
    solution: { quantity: "Unsigned output code", value: 2, unit: "code", tolerance: .001, explanation: "Vin exceeds 1 V and 2 V, but not 3 V. In ascending threshold order (t1,t2,t3), the thermometer word is (1,1,0). Two thresholds are crossed, so the encoded result is decimal 2, binary 10. The quantization interval is [2 V,3 V).", verification: { kind: "op", node: "code" } },
    blocks: { title: "Parallel conversion", stages: [{ name: "Reference ladder", detail: "Generate 1 V, 2 V, 3 V thresholds" }, { name: "Comparator bank", detail: "Compare Vin against all taps at once" }, { name: "Thermometer word", detail: "t1, t2, t3 describe crossed thresholds" }, { name: "Encoder", detail: "Map the valid word to binary 00–11" }], connections: [{ from: 0, to: 1, signal: "Three reference taps" }, { from: 1, to: 2, signal: "Three parallel decisions" }, { from: 2, to: 3, signal: "Valid thermometer code" }] },
  },
  {
    ...defaults, id: 28, slug: "adc-comparator-polarity", title: "Which side of the threshold?", difficulty: "Foundation", domain: "Op-amps", xp: 120,
    reusableBlock: { name: 'Comparator5V', ports: ['vin','ref','out'], description: 'Select the comparator, its wires and three labels, leaving both test sources outside. Reuse the 0–5 V decision block in SAR and flash exercises.' },
    summary: "Read comparator polarity before interpreting an ADC decision.",
    objective: "Apply 2.6 V to the non-inverting input and a 2.5 V reference to the inverting input. Find the output of an ideal comparator with 0 V and 5 V output levels.",
    analysis: "Operating point", topics: ["Comparator", "Input polarity", "Decision threshold"],
    constraints: ["Ideal functional comparator; no hysteresis or delay", "CircuitJS uses a high-gain native op-amp with 0–5 V output limits"],
    starterNetlist: "VIN vin 0 2.6\nVREF ref 0 2.5\nB1 out 0 V=5*(tanh(10000*(V(vin)-V(ref)))+1)/2\n.op\n.end",
    nativeCircuit: native("R 176 192 112 192 0 0 40 2.5 0 0 .5\nw 176 192 320 192 0\n207 176 192 176 128 0 ref\nR 176 224 112 224 0 0 40 2.6 0 0 .5\nw 176 224 320 224 0\n207 176 224 176 288 0 vin\na 320 208 448 208 8 5 0 1000000 0 0 100000\n207 448 208 544 208 0 out"), probe: "out", recommendedProbes: ["vin", "ref", "out"],
    solution: { quantity: "Comparator output", value: 5, unit: "V", tolerance: .001, explanation: "V+ − V− = 2.6 − 2.5 = +0.1 V, so the output saturates high at 5 V. Swapping the inputs reverses the decision. An ideal comparison at exactly zero difference is not a reliable real-device prediction.", verification: { kind: "op", node: "out" } },
  },
  {
    ...defaults, id: 29, slug: "adc-acquisition-settling", title: "Give the ADC time to acquire", difficulty: "Advanced", domain: "AC", xp: 200,
    summary: "Translate source resistance and sampling capacitance into a settling requirement.",
    objective: "A 0 → 3.3 V step charges a 100 pF sampling capacitor through 1 kΩ. Find the remaining voltage error after 1 µs and compare it with half an LSB of an ideal 12-bit, 3.3 V ADC.",
    analysis: "Transient", topics: ["Acquisition time", "RC settling", "ADC resolution"],
    constraints: ["Initially discharged capacitor; inspect the first rising edge after Reset", "Sampling switch is represented by the total 1 kΩ source resistance", "Ignore leakage, charge injection, and driver bandwidth; half LSB = 3.3/8192 V"],
    starterNetlist: "VIN vin 0 PULSE(0 3.3 0 1p 1p 10u 20u)\nR1 vin out 1k\nC1 out 0 100p\n.tran 1n 2u\n.end",
    nativeCircuit: native("v 96 320 96 128 0 2 50000 1.65 1.65 0 .5\ng 96 320 96 352 0\nr 96 128 320 128 0 1000\nc 320 128 320 320 0 1e-10 0\ng 320 320 320 352 0\n207 96 128 96 64 0 vin\n207 320 128 416 128 0 out", ".000000001"), probe: "out", recommendedProbes: ["vin", "out"],
    solution: { quantity: "Remaining settling error at 1 µs", value: 3.3*Math.exp(-10), unit: "V", tolerance: .005, explanation: "τ = RC = 100 ns. After 1 µs = 10τ, the residual is 3.3e⁻¹⁰ = 149.82 µV. Half an LSB is 402.83 µV, so the ideal RC meets that settling limit. The minimum ideal acquisition time is τ ln(8192) ≈ 901 ns.", verification: { kind: "transient", node: "out", at: 1e-6, scale: -1, offset: 3.3 } },
    blocks: { title: "Acquisition before conversion", stages: [{ name: "Analog driver", detail: "Input step, with source resistance" }, { name: "Sampling switch", detail: "Closed during acquisition" }, { name: "Hold capacitor", detail: "Must settle to the required accuracy" }, { name: "ADC core", detail: "Converts after the switch opens" }], connections: [{ from: 0, to: 1, signal: "Analog input" }, { from: 1, to: 2, signal: "Charging current" }, { from: 2, to: 3, signal: "Held voltage" }] },
  },
  {
    ...defaults, id: 30, slug: "sample-hold-droop", title: "What changes during hold?", difficulty: "Advanced", domain: "AC", xp: 200,
    summary: "Measure how leakage reduces a held sample while the input switch is open.",
    objective: "Track a 2 V input for 1 ms, then open the sampling switch. A 10 nF hold capacitor drives 1 MΩ. Find its voltage 100 µs into the hold interval, at t = 1.1 ms.",
    analysis: "Transient", topics: ["Sample and hold", "Leakage", "Exponential decay"],
    constraints: ["Switch Ron = 10 Ω, Roff = 10 GΩ, threshold = 2.5 V; clock is high for the first 1 ms", "Hold capacitor starts settled through the closed switch", "Ignore charge injection and dielectric absorption; finite switch resistance is included"],
    starterNetlist: "VIN vin 0 2\nVCLK clk 0 PULSE(5 0 1m 1n 1n 1m 2m)\nS1 vin out clk 0 HOLD\nCH out 0 10n\nRL out 0 1meg\n.model HOLD SW(RON=10 ROFF=1e10 VT=2.5 VH=0)\n.tran 1u 1.5m 0 1u\n.end",
    nativeCircuit: native("R 128 192 64 192 0 0 40 2 0 0 .5\nw 128 192 192 192 0\n207 128 192 128 128 0 vin\n159 192 192 352 192 0 10 1e10 2.5\nR 272 336 208 336 0 2 500 2.5 2.5 0 .5\nw 272 336 272 208 0\n207 272 336 272 400 0 clk\nc 352 192 352 336 0 1e-8 2\ng 352 336 352 368 0\nw 352 192 480 192 0\nr 480 192 480 336 0 1000000\ng 480 336 480 368 0\n207 480 192 576 192 0 out", ".0000001"), probe: "out", recommendedProbes: ["vin", "clk", "out"],
    solution: { quantity: "Held voltage at 1.1 ms", value: 2*Math.exp(-.01), unit: "V", tolerance: .001, explanation: "The hold time constant is 1 MΩ × 10 nF = 10 ms. In 100 µs the ideal held voltage drops to 2e⁻⁰·⁰¹ = 1.98010 V: about 19.9 mV of droop. The finite on-state loading changes this result by only about 20 µV.", verification: { kind: "transient", node: "out", at: .0011 } },
    blocks: { title: "Track, then hold", stages: [{ name: "Input", detail: "2 V source" }, { name: "Clocked switch", detail: "Track while high; isolate while low" }, { name: "Hold capacitor", detail: "Store charge" }, { name: "Load / ADC", detail: "Leakage draws charge during hold" }], connections: [{ from: 0, to: 1, signal: "Analog input" }, { from: 1, to: 2, signal: "Track path" }, { from: 2, to: 3, signal: "Held sample" }] },
  },
];

export const wiringChallenges: Challenge[] = [
  {
    id: 31, slug: "wire-adc-reference", title: "Wire an ADC midpoint reference", difficulty: "Foundation", domain: "DC", xp: 160,
    summary: "The parts are supplied separately. Build the divider, establish ground, and probe its midpoint.",
    objective: "Connect the supplied 5 V source and two 10 kΩ resistors to produce 2.50 V at vout. Wire both ground symbols and place the output label on the resistor junction before checking.",
    analysis: "Operating point", acceptance: null, attempts: 0, topics: ["Connectivity", "Reference voltage", "Ground nodes"],
    constraints: ["Keep the 5 V DC source; use exactly two E24 resistors", "1 kΩ ≤ each resistor ≤ 1 MΩ; tolerance corners ±0.1%", "Worst-case ratio error ≤ 0.5%, supply current ≤ 1 mA, resistor power ≤ 250 mW", "A ground symbol is an electrical connection: separate symbols share the same reference"],
    // This is an analysis template, not a submission or a completed student circuit.
    // The workspace derives the graded document from the learner's native wiring.
    starterNetlist: "V1 vin 0 DC 5\nR1 vin vout 10k\nR2 vout 0 10k\n.op\n.end", probe: "vout", judge: "voltage-divider", available: true,
    nativeCircuit: PARTS_ONLY_STARTERS["wire-adc-reference"], starterMode: "parts-only", recommendedProbes: ["vout"],
    wiringInstructions: ["Connect source + to one end of the upper resistor.", "Join the remaining resistor terminals to make a series pair; this midpoint is vout.", "Connect source − and the lower resistor's free end to ground symbols.", "Move or wire the supplied vout label onto the midpoint. Select that node for the scope, then check your circuit."],
  },
  {
    id: 32, slug: "wire-antialias-filter", title: "Wire the ADC input filter", difficulty: "Foundation", domain: "AC", xp: 180,
    reusableBlock: { name: 'AntiAliasRC', ports: ['vin','vout'], description: 'After wiring and checking the filter, add a vin label and save only the resistor, capacitor, ground and two labels. Leave the test source outside.' },
    summary: "Connect an unconnected source, resistor, and capacitor into a 1 kHz input filter.",
    objective: "Wire a passive low-pass filter with a corner near 1 kHz. The output must be the junction of the series resistor and the capacitor to ground. Probe it before checking your design.",
    analysis: "AC sweep", acceptance: null, attempts: 0, topics: ["Anti-alias filter", "Connectivity", "Probe placement"],
    constraints: ["Use an ideal 1 V sine source; the frequency sweep uses a 1 V AC stimulus", "Exactly one series resistor and one shunt capacitor", "1 kΩ ≤ R ≤ 100 kΩ; 1 nF ≤ C ≤ 1 µF", "Worst-case cutoff error ≤ 2% with ±0.5% R/C tolerance", "This one-pole stage is a foundation exercise; real anti-alias requirements also depend on sampling rate and stopband attenuation"],
    starterNetlist: "V1 vin 0 AC 1\nR1 vin vout 15.9k\nC1 vout 0 10n\n.ac dec 30 10 100k\n.end", probe: "vout", judge: "rc-low-pass", available: true,
    nativeCircuit: PARTS_ONLY_STARTERS["wire-antialias-filter"], starterMode: "parts-only", recommendedProbes: ["vout"],
    wiringInstructions: ["Connect source + to the resistor's left terminal.", "Join the resistor's other terminal to one capacitor terminal: this is the output node.", "Connect the capacitor's remaining terminal and source − to ground symbols.", "Attach vout to the R–C junction and select it for measurement. Check the wiring and cutoff; a high-pass connection will fail."],
  },
];
