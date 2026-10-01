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

test('generated-file quota counts empty files across compiler and runtime but excludes installed inputs', { timeout: 30_000 }, async () => {
  const bench = (count: number) => `module tb; integer i, f;
    initial begin
      for (i=0; i<${count}; i=i+1) begin
        f=$fopen($sformatf("empty-%0d.dat", i), "w");
        if (f==0) $fatal(1, "File creation failed before quota");
        $fclose(f);
      end
      $display("PASS empty files"); $finish;
    end endmodule`;
  // The compiler's out.vvp is one generated file; 127 empty runtime outputs
  // exactly fill the shared 128-file budget. /dev and source inputs do not.
  const allowed = await runHdl({ design: '', testbench: bench(127), language: '2012' });
  assert.equal(allowed.exitCode, 0, allowed.log);
  assert.match(allowed.log, /PASS empty files/);
  await assert.rejects(runHdl({ design: '', testbench: bench(128), language: '2012' }), /Generated file count exceeded 128/);
  process.exitCode = 0;
});

test('multiple files below the per-file cap cannot exceed the shared MEMFS byte budget', { timeout: 30_000 }, async () => {
  // Five 7-MiB files would total 35 MiB. The fifth is stopped before the
  // shared 32-MiB allocation budget is crossed; no unbounded stress loop.
  const testbench = `module tb; integer i, j, f; reg [65535:0] block;
    initial begin
      block={8192{8'h78}};
      for (i=0; i<5; i=i+1) begin
        f=$fopen($sformatf("part-%0d.dat", i), "w");
        for (j=0; j<896; j=j+1) $fwrite(f, "%0s", block);
        $fclose(f);
      end
      $finish;
    end endmodule`;
  await assert.rejects(runHdl({ design: '', testbench, language: '2012' }), /Generated files exceeded 32 MiB in total/);
  process.exitCode = 0;
});

test('rewriting a full bounded file reuses its allocation instead of spending the budget twice', { timeout: 30_000 }, async () => {
  const testbench = `module tb; integer i, j, f, seek_status; reg [65535:0] block;
    initial begin
      block={8192{8'h78}}; f=$fopen("reused.dat", "w+");
      for (i=0; i<5; i=i+1) begin
        seek_status=$fseek(f, 0, 0);
        if (seek_status!=0) $fatal(1, "Rewind failed");
        for (j=0; j<1024; j=j+1) $fwrite(f, "%0s", block);
      end
      $fclose(f); $display("PASS reused 8 MiB file"); $finish;
    end endmodule`;
  const result = await runHdl({ design: '', testbench, language: '2012' });
  assert.equal(result.exitCode, 0, result.log);
  assert.match(result.log, /PASS reused 8 MiB file/);
});
