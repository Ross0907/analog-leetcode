# AnaCode product landscape

## Dated conclusion

This scan was refreshed on **2026-08-29**. It does not support a defensible claim that nobody has built anything similar. Analog/digital browser simulators, HDL exercise judges, guided circuit libraries, and classroom assignment systems already exist. Search cannot prove a universal negative, and new products can appear after the scan.

AnaCode should therefore describe itself as an **analog-first circuit challenge platform with server-verified schematic submissions**, not as the first or only electronics practice site.

## Adjacent products reviewed

| Product | Demonstrated overlap | Material distinction from AnaCode's current direction |
|---|---|---|
| [HDLBits](https://hdlbits.01xz.net/wiki/Main_Page) | Topic-organized digital circuit exercises with immediate simulation feedback and saved progress | The submitted artifact is Verilog, not a drawn analog schematic; its published scope is digital HDL practice. |
| [Open Circuits / Circuits Cloud](https://www.circuits-cloud.net/) | Browser analog/digital simulation, visual wiring, classroom challenge assignment, review, and grading | Its public description emphasizes a simulator and classroom workflow; AnaCode's differentiator is a public problem catalog with narrow server-authoritative topology/value judges and versioned verdicts. |
| [DigiSim Analog Lab](https://digisim.io/analog) | Browser schematic editor, Web Worker simulation, operating point/DC/AC/transient analyses, scope tools, and verified starter lessons | Its public product is a capable analog workbench and guided blueprint course. AnaCode centers specification-driven problems, submissions, hidden corners, and code-owned judge contracts. |
| [SPICE-Online](https://spice-online.com/) | Drag-and-drop analog schematic capture, in-browser SPICE, plots, and visible netlists | It is primarily a simulator/design assistant. AnaCode keeps netlists secondary and treats the canonical schematic graph as the submitted learning artifact. |
| [Analog Canvas](https://analog-canvas.tokenzhang.com/editor) | High-quality publication-style circuit drawing | It is used only as an aesthetic reference. AnaCode's original editor adds typed electrical compilation, bounded simulation, challenge state, and server grading; no Analog Canvas code is bundled. |

## Defensible product wedge

The current combination is meaningfully differentiated:

1. Learners solve a measurable engineering specification by editing a real schematic rather than writing SPICE or HDL.
2. The browser compiles the drawing into a strict, versioned electrical graph and generates the solver input.
3. Rich local instruments provide rapid feedback, including operating points, sweeps, oscilloscope views, and Bode magnitude/phase.
4. Supported submissions send the canonical graph to a server that recompiles it, rejects topology/stimulus tampering, and independently computes a versioned verdict.
5. Challenge content begins from a bounded declarative authoring contract that cannot upload executable graders or solver directives.

That wedge is a product thesis, not proof of market exclusivity. Before major positioning changes or fundraising/public-launch claims, repeat the scan, interview instructors and learners, and obtain trademark review for the selected name.
