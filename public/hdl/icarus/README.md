# Source-built Icarus Verilog for AnaCode

Icarus Verilog 14.0 (devel), Stephen Williams and contributors, is built from
https://github.com/steveicarus/iverilog/tree/c7530dbcc186de2f21eacde14fd28061b885924c.
The compiler, preprocessor and runtime are GPL-2.0-or-later; see LICENSE.
The local GPL patch statically links the upstream vvp code generator and the
system, Verilog-2005 math, SystemVerilog-2009 and Verilog-A math registration
tables. Compiler registration retains upstream system-function return types.
External VPI modules, VHDL and synthesis targets are not part of this port.

Complete original source, exact patch and build/install scripts are in source/.
The input manifest pins source SHA-256 and the Emscripten container digest.
Emscripten and linked system-library notices accompany those sources. Rebuild
using the repository workflow or the commands in docs/icarus-source-build.md.
The JavaScript wrapper is an Emscripten build output; the sole packaging edit
normalizes each adjacent WASM filename. No third-party prebuilt WASM is used.
