# HDL workspace

`/hdl` is the Verilog and SystemVerilog practice track, reachable through **HDL Practice** in desktop/mobile navigation, the home page, and the practice-track switch above both problem libraries. Search, difficulty, topic and local pass-status filters help find an exercise. The six original exercises cover a word multiplexer, saturating adder, enabled counter, flash-ADC thermometer encoder, PWM DAC and a 4-bit SAR controller. The playground opens a working counter example.

## Execution and results

CodeMirror 6 edits `design.sv` and `tb.sv`. The selected generation is Verilog 2005 or SystemVerilog 2012; Icarus implements a subset of SystemVerilog, not a full commercial verification stack. UVM, classes and complete SVA support are not promised. The top-level testbench must be named `tb`, and its VCD dump filename must be `dump.vcd`.

The adapter drives Icarus's actual `ivlpp`, `ivl` and `vvp` stages through their in-memory filesystems. Each run uses a fresh module Web Worker. The UI can terminate it, including infinite delta-cycle loops, and applies a 20-second wall-clock deadline. Sources are capped at 128 KiB each, preprocessed code at 1 MiB, console output at 256 KiB, and each generated file at 8 MiB. A shared quota across all three stages limits generated files to 128 and their total high-water storage to 32 MiB; empty files count, and deleting or closing a file does not reset the budget. Each WASM module has a 256 MiB heap ceiling. Files and code never go to an external simulation service.

The compiler's statically linked system tasks produce the real VCD consumed by the unmodified VCDrom 1.6.0 viewer. The wrapper imports that data through VCDrom's own file input. It accepts messages only from its same-origin parent, applies a size cap, and has no analytics. The viewer has separate same-origin CSP; the application and login retain their nonce policy. CodeMirror styles carry the application's CSP nonce.

**Run** executes the user's edited testbench. **Submit** always uses the original provided testbench against the edited design, even if `tb.sv` has been changed. The read-only **Supplied tests** tab makes that contract inspectable. Each exercise checks its expected outputs and exits nonzero on failure. The result shows the final count, first passing examples and at most 20 failure details; this display limit never reduces the number of executed checks. Compiler diagnostics jump to the relevant source line. Each source editor keeps its undo history while switching tabs.

These are transparent **local practice checks**, not tamper-resistant or server-verified grading. The last completed submission is saved under `anacode-hdl-progress-v1` in browser storage and appears in the problem library. No HDL score is written to account progress. Analog server grading remains separate and authoritative for its supported topology contracts.

Exercises fill the window beneath a compact navigation bar. **Workspace layout** arranges the code and results as stacked panes, side-by-side panes, or full-height tabs. The description remains beside them on desktop; on mobile, **Description** opens it without pushing the editor off-screen. Drag the dividers to resize, or focus one and use arrow keys; Home/End select its smallest/largest size. Inside results, **Output layout** independently arranges console and waveforms as tabs, side-by-side panes or a stacked scroll view. Side-by-side panes adapt to a stacked arrangement below 600px so VCDrom's signal-name column leaves room for the actual waveforms. Changing layouts preserves the source, undo history and completed simulation.

Ctrl/Command+Enter runs; adding Shift submits a challenge. These shortcuts work with focus inside CodeMirror or the waveform viewer. **Shortcuts** in the viewer opens its own upstream keyboard/mouse reference in an opaque, bounded dialog; Close or Escape dismisses it. Editing source or changing the language invalidates earlier results and cancels a running worker.

VCD exports can be opened in other viewers. Project export includes both edited source files, a Windows launcher, and Makefile targets for Icarus simulation, Yosys synthesis and GTKWave. Yosys is a local OSS CAD Suite integration in this release, not an in-browser synthesis claim.

## Validation

`tests/hdl.test.mts` executes all six reference solutions in the bundled Icarus engine, including all 65,536 8-bit addition pairs. It also verifies wrong logic rejection (including every addition pair), bounded failure reporting, compile diagnostics, real VCD generation and input limits. `tests/hdl-practice.test.mts` covers diagnostic/result parsing and bounded progress restoration. Eight cases in `tests/e2e/hdl.spec.ts` exercise fixed submission despite a modified testbench, draft restore, editor undo, diagnostic links, genuine viewer import, repeat runs, mobile discovery/filtering, delayed hydration, keyboard/pointer resizing, all three workspace layouts, bounded help, focused-editor/iframe shortcuts, both supported language modes and interruption in Chromium. Worker/rendered-response tests check separation of the app and vendored tool CSP.

## Attribution

The exercise workflow references EDA Playground and HDLBits; their problem text and proprietary viewers are not copied. The source editor is CodeMirror (MIT), waveform viewer VCDrom (MIT), and simulation engine Icarus Verilog (GPL-2.0-or-later). Runtime adapters under `public/hdl/` retain GPL-compatible licensing. Exact runtime source/build details and hashes are provided with the deployed tools; see `/hdl/NOTICE.txt`.
