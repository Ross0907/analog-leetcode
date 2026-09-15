export type Difficulty = "Foundation" | "Intermediate" | "Advanced" | "Expert";
export type Domain = "DC" | "AC" | "Semiconductors" | "Op-amps" | "Digital";
export type JudgeKind = "voltage-divider" | "rc-low-pass" | "inverting-amplifier" | null;

export type Challenge = {
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  domain: Domain;
  summary: string;
  objective: string;
  analysis: "Operating point" | "AC sweep" | "Transient" | "DC sweep";
  acceptance: number | null;
  attempts: number;
  xp: number;
  topics: string[];
  constraints: string[];
  starterNetlist: string;
  probe: string;
  judge: JudgeKind;
  available: boolean;
};

export const challenges: Challenge[] = [
  {
    id: 1,
    slug: "precision-voltage-divider",
    title: "Precision voltage divider",
    difficulty: "Foundation",
    domain: "DC",
    summary: "Choose an E24 divider that produces a precise 1:2 ratio without wasting current.",
    objective: "Produce 2.50 V nominal from 5 V. The hidden judge varies the supply and checks E24 compliance, ratio error, source current, and resistor power.",
    analysis: "Operating point",
    acceptance: null,
    attempts: 0,
    xp: 120,
    topics: ["KCL", "Ohm's law", "Tolerance"],
    constraints: ["E24 values; 1 kΩ ≤ R1, R2 ≤ 1 MΩ", "R1/R2 tolerance corners: ±0.1%", "Worst-case ratio error ≤ 0.5%", "Supply current ≤ 1 mA", "Resistor power ≤ 250 mW"],
    starterNetlist: `V1 vin 0 DC 5\nR1 vin vout 10k\nR2 vout 0 10k\n.op\n.end`,
    probe: "vout",
    judge: "voltage-divider",
    available: true,
  },
  {
    id: 2,
    slug: "rc-cutoff-1khz",
    title: "A clean 1 kHz low-pass",
    difficulty: "Foundation",
    domain: "AC",
    summary: "Tune a first-order RC filter to its target corner while respecting source loading.",
    objective: "Place the −3 dB corner at 1.00 kHz. Hidden checks cover component range, loading, and the AC response around cutoff.",
    analysis: "AC sweep",
    acceptance: null,
    attempts: 0,
    xp: 140,
    topics: ["Impedance", "Bode plots", "Corner frequency"],
    constraints: ["1 kΩ ≤ R1 ≤ 100 kΩ", "1 nF ≤ C1 ≤ 1 µF", "R/C tolerance corners: ±0.5%", "Worst-case corner error ≤ 2%"],
    starterNetlist: `V1 vin 0 AC 1\nR1 vin vout 15.9k\nC1 vout 0 10n\n.ac dec 30 10 100k\n.end`,
    probe: "vout",
    judge: "rc-low-pass",
    available: true,
  },
  {
    id: 3,
    slug: "inverting-gain-stage",
    title: "Inverting gain stage",
    difficulty: "Intermediate",
    domain: "Op-amps",
    summary: "Set a precise closed-loop gain while balancing noise gain and input impedance.",
    objective: "Design an inverting stage with a gain of −10 V/V and at least 8 kΩ input impedance.",
    analysis: "Operating point",
    acceptance: null,
    attempts: 0,
    xp: 180,
    topics: ["Negative feedback", "Virtual ground", "Noise gain"],
    constraints: ["8 kΩ ≤ RIN ≤ 100 kΩ", "RF ≤ 1 MΩ", "RIN/RF tolerance corners: ±0.1%", "Worst-case gain error ≤ 1%"],
    starterNetlist: `V1 vin 0 DC 0.1\nRIN vin nsum 10k\nRF vout nsum 100k\nEOP vout 0 0 nsum 1000000\n.op\n.end`,
    probe: "vout",
    judge: "inverting-amplifier",
    available: true,
  },
  {
    id: 4,
    slug: "bjt-bias-across-beta",
    title: "BJT bias across β",
    difficulty: "Intermediate",
    domain: "Semiconductors",
    summary: "Bias a common-emitter stage that stays in its intended region across transistor spread.",
    objective: "Keep VCE centered and collector current stable while β varies from 80 to 240.",
    analysis: "DC sweep",
    acceptance: null,
    attempts: 0,
    xp: 220,
    topics: ["Thevenin bias", "Active region", "Emitter degeneration"],
    constraints: ["4.0 V ≤ VCE ≤ 8.0 V", "1 mA ≤ IC ≤ 2.5 mA", "All resistor power < 100 mW"],
    starterNetlist: `VCC vcc 0 DC 12\nR1 vcc vb 68k\nR2 vb 0 15k\nRC vcc vc 3.3k\nRE ve 0 1k\nQ1 vc vb ve QNPN\n.model QNPN NPN(BF=120 VAF=100)\n.op\n.end`,
    probe: "vc",
    judge: null,
    available: true,
  },
  {
    id: 5,
    slug: "diode-rectifier-ripple",
    title: "Rectifier ripple budget",
    difficulty: "Intermediate",
    domain: "Semiconductors",
    summary: "Size a reservoir capacitor for ripple without hiding diode peak-current stress.",
    objective: "Hold ripple below 250 mV at the target load and keep diode surge current inside the stated envelope.",
    analysis: "Transient",
    acceptance: null,
    attempts: 0,
    xp: 240,
    topics: ["Diodes", "Charge balance", "Ripple"],
    constraints: ["C1 ≤ 2200 µF", "Ripple ≤ 250 mV", "Peak diode current ≤ 3 A"],
    starterNetlist: `VS in 0 SIN(0 12 50)\nD1 in out DMOD\nC1 out 0 1000u\nRL out 0 100\n.model DMOD D(IS=1e-14 N=1.8)\n.tran 100u 100m\n.end`,
    probe: "out",
    judge: null,
    available: true,
  },
  {
    id: 6,
    slug: "mosfet-gate-drive",
    title: "MOSFET gate-drive edge",
    difficulty: "Advanced",
    domain: "Semiconductors",
    summary: "Control switching time and ringing with a realistic gate charge and driver impedance.",
    objective: "Meet the rise-time window without exceeding peak driver current or gate overshoot.",
    analysis: "Transient",
    acceptance: null,
    attempts: 0,
    xp: 300,
    topics: ["Gate charge", "Switching loss", "Damping"],
    constraints: ["20 ns ≤ rise time ≤ 80 ns", "Peak gate current ≤ 1 A", "VGS overshoot ≤ 10%"],
    starterNetlist: `VG drv 0 PULSE(0 10 0 2n 2n 1u 2u)\nRG drv gate 10\nCGS gate 0 2n\n.tran 1n 300n\n.end`,
    probe: "gate",
    judge: null,
    available: true,
  },
  {
    id: 7,
    slug: "sallen-key-q",
    title: "Sallen–Key without surprise Q",
    difficulty: "Advanced",
    domain: "Op-amps",
    summary: "Synthesize a second-order response and survive component tolerance corners.",
    objective: "Meet a Butterworth response at 5 kHz across the supplied 1% R and 5% C corners.",
    analysis: "AC sweep",
    acceptance: null,
    attempts: 0,
    xp: 340,
    topics: ["Poles", "Quality factor", "Sensitivity"],
    constraints: ["fc error ≤ 3%", "Passband peaking ≤ 0.2 dB", "All values from E24/E12 series"],
    starterNetlist: `V1 in 0 AC 1\nR1 in n1 2.2k\nR2 n1 n2 2.2k\nC1 n1 out 20n\nC2 n2 0 10n\nE1 out 0 n2 out 1meg\n.ac dec 40 100 100k\n.end`,
    probe: "out",
    judge: null,
    available: true,
  },
  {
    id: 8,
    slug: "cmos-inverter-trip-point",
    title: "CMOS inverter trip point",
    difficulty: "Advanced",
    domain: "Digital",
    summary: "Size complementary devices for a centered switching point under process variation.",
    objective: "Center VM at half-supply while maintaining the required noise margins across corners.",
    analysis: "DC sweep",
    acceptance: null,
    attempts: 0,
    xp: 360,
    topics: ["CMOS", "Noise margin", "Device sizing"],
    constraints: ["|VM − VDD/2| ≤ 100 mV", "NMH, NML ≥ 1.5 V", "Total W ≤ 50 µm"],
    starterNetlist: `VDD vdd 0 DC 1.8\nVIN in 0 DC 0\nMP out in vdd vdd P90 W=2u L=90n\nMN out in 0 0 N90 W=1u L=90n\n.include modelcard.CMOS90\n.dc VIN 0 1.8 0.01\n.end`,
    probe: "out",
    judge: null,
    available: true,
  },
  {
    id: 9,
    slug: "transimpedance-stability",
    title: "Stable photodiode TIA",
    difficulty: "Expert",
    domain: "Op-amps",
    summary: "Compensate a transimpedance amplifier with sensor and input capacitance in the loop.",
    objective: "Maximize bandwidth while retaining at least 55° phase margin and limited output noise.",
    analysis: "AC sweep",
    acceptance: null,
    attempts: 0,
    xp: 480,
    topics: ["Loop gain", "Compensation", "Noise"],
    constraints: ["Phase margin ≥ 55°", "Peaking ≤ 1 dB", "Transimpedance = 100 kΩ ± 1%"],
    starterNetlist: `IIN nsum 0 AC 1u\nRF out nsum 100k\nCF out nsum 2p\nCD nsum 0 50p\nEOP out 0 0 nsum 100000\n.ac dec 50 10 10meg\n.end`,
    probe: "out",
    judge: null,
    available: true,
  },
];

export function getChallenge(slug: string) {
  return challenges.find((challenge) => challenge.slug === slug);
}

export const liveChallenges = challenges.filter((challenge) => challenge.available);
