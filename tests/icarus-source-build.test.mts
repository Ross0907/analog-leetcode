import assert from 'node:assert/strict';
import test from 'node:test';
import { runHdl } from '../public/hdl/run-engine.js';

test('static Icarus VPI registration preserves real system-function types and math', async () => {
  const result = await runHdl({ language: '2012', design: 'module top_module; endmodule', testbench: `
module tb;
  real wave;
  integer size;
  reg [63:0] bits;
  initial begin
    $dumpfile("dump.vcd"); $dumpvars(0, tb);
    wave = $sin(1.5707963267948966);
    size = $clog2(17);
    bits = $realtobits(1.0);
    #1;
    if (wave < 0.999999 || wave > 1.000001 || size != 5 || bits !== 64'h3ff0000000000000) begin
      $display("FAIL: VPI type or math registration wave=%f size=%d bits=%h", wave, size, bits); $fatal(1);
    end
    $display("PASS: real math and 64-bit system functions");
    $finish;
  end
endmodule` });
  assert.equal(result.exitCode, 0, result.log);
  assert.match(result.log, /PASS: real math and 64-bit system functions/);
  assert.doesNotMatch(result.log, /dynamic linking|Failed to open|Unsupported external VPI/);
  assert.match(result.vcd ?? '', /\$version\s+Icarus Verilog/);
});
