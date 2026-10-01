import assert from 'node:assert/strict';
import test from 'node:test';
import { HDL_CHALLENGES, hdlCheckResult } from '../lib/hdl-challenges';
import { runHdl } from '../public/hdl/run-engine.js';

for (const challenge of HDL_CHALLENGES) {
  test(`Icarus executes every ${challenge.title} check and produces VCD`, { timeout: 30_000 }, async () => {
    const result=await runHdl({design:challenge.solution,testbench:challenge.testbench,language:'2012'});
    assert.equal(result.exitCode,0,result.log);
    assert.equal(hdlCheckResult(result.log,result.exitCode,challenge.checks).passed,true,result.log);
    assert.match(result.vcd??'',/\$version\s+Icarus Verilog/);
    assert.match(result.vcd??'',/\$scope module tb/);
  });
}
test('Real HDL checks reject compilable but wrong logic',async()=>{
  const challenge=HDL_CHALLENGES[0];
  const result=await runHdl({design:challenge.solution.replace('sel==0 ? a : sel==1 ? b : sel==2 ? c : d','a'),testbench:challenge.testbench,language:'2005'});
  assert.equal(hdlCheckResult(result.log,result.exitCode,challenge.checks).passed,false);
  assert.match(result.log,/FAIL: Selected word/);
  // Emscripten sets process.exitCode on expected nonzero exits in Node only.
  process.exitCode=0;
});
test('Icarus returns compile diagnostics with source filenames',async()=>{
  const result=await runHdl({design:'module top_module(input a output y); endmodule',testbench:'module tb; endmodule',language:'2005'});
  assert.notEqual(result.exitCode,0);
  assert.equal(result.vcd,null);
  assert.match(result.log,/design.v/);
  process.exitCode=0;
});
test('HDL rejects oversized source and unsupported language before compilation',async()=>{
  await assert.rejects(runHdl({design:'x'.repeat(131073),testbench:'',language:'2012'}),/128 KiB/);
  await assert.rejects(runHdl({design:'界'.repeat(50000),testbench:'',language:'2012'}),/128 KiB/);
  await assert.rejects(runHdl({design:'',testbench:'',language:'2099'}),/Choose/);
  assert.equal(hdlCheckResult('ANACODE_RESULT checks=1 failures=0',0,64).passed,false);
  assert.equal(hdlCheckResult('ANACODE_RESULT checks=64 failures=0',1,64).passed,false);
});
test('empty console lines count toward the actual output byte limit',async()=>{
  await assert.rejects(runHdl({design:'',testbench:'module tb; integer i; initial begin for(i=0;i<300000;i=i+1) $display(""); $finish; end endmodule',language:'2012'}),/Console output exceeded/);
  process.exitCode=0;
});
