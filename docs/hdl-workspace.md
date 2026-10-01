# HDL workspace

`/hdl` is a separate coding practice track. The six original exercises cover a word multiplexer, saturating adder, enabled counter, flash-ADC thermometer encoder, PWM DAC and a 4-bit SAR controller. The playground opens a working counter example.

## Execution and results

CodeMirror 6 edits `design.sv` and `tb.sv`. The selected generation is Verilog 2005 or SystemVerilog 2012; Icarus implements a subset of SystemVerilog, not a full commercial verification stack. UVM, classes and complete SVA support are not promised. The top-level testbench must be named `tb`, and its VCD dump filename must be `dump.vcd`.

The adapter drives Icarus's actual `ivlpp`, `ivl` and `vvp` stages through their in-memory filesystems. Each run uses a fresh module Web Worker. The UI can terminate it, including infinite delta-cycle loops, and applies a 20-second wall-clock deadline. Sources are capped at 128 KiB each, preprocessed code at 1 MiB, console output at 256 KiB, and each generated file at 8 MiB. Files and code never go to an external simulation service.

The compiler's statically linked system tasks produce the real VCD consumed by the unmodified VCDrom 1.6.0 viewer. The wrapper imports that data through VCDrom's own file input. It accepts messages only from its same-origin parent, applies a size cap, and has no analytics. The viewer has separate same-origin CSP; the application and login retain their nonce policy. CodeMirror styles carry the application's CSP nonce.

Run executes the user's edited testbench. Check solution always uses the original provided testbench against the edited design; each exercise checks its own expected outputs and exits nonzero on failure. These are transparent **local practice checks**, not tamper-resistant or server-verified grading. No HDL score is written to account progress. Analog server grading remains separate and authoritative for its supported topology contracts.

The UI presents console and waveform tabs, a side-by-side layout and a stacked scroll layout. VCD exports can be opened in other viewers. Project export includes both source files, a Windows launcher, and Makefile targets for Icarus simulation, Yosys synthesis and GTKWave. Yosys is a local OSS CAD Suite integration in this release, not an in-browser synthesis claim.

## Validation

`tests/hdl.test.mts` executes all six reference solutions in the bundled Icarus engine, including all 65,536 8-bit addition pairs. It also verifies wrong logic rejection, compile diagnostics, real VCD generation and input limits. `tests/e2e/hdl.spec.ts` exercises the editor, fixed checks, draft restore, viewer import, repeat runs, layouts and interruption in Chromium. Worker/rendered-response tests check separation of the app and vendored tool CSP.

## Attribution

The exercise workflow references EDA Playground and HDLBits; their problem text and proprietary viewers are not copied. The source editor is CodeMirror (MIT), waveform viewer VCDrom (MIT), and simulation engine Icarus Verilog (GPL-2.0-or-later). Runtime adapters under `public/hdl/` retain GPL-compatible licensing. Exact runtime source/build details and hashes are provided with the deployed tools; see `/hdl/NOTICE.txt`.
