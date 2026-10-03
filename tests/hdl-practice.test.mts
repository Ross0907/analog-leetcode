import assert from 'node:assert/strict';
import test from 'node:test';
import { hdlDiagnostics, hdlFailureExamples, parseHdlProgress } from '../lib/hdl-practice';

test('test case examples retain actual Icarus check identity, time and outcome',()=>{
  assert.deepEqual(hdlFailureExamples('PASS: Selected word at 5000 (check 1)\nFAIL: Selected word at 15000 (check 3)\nANACODE_RESULT checks=64 failures=48'),[{passed:true,description:'Selected word',time:'5000',index:1},{passed:false,description:'Selected word',time:'15000',index:3}]);
  assert.equal(hdlFailureExamples('unstructured log').length,0);
  assert.deepEqual(hdlDiagnostics('/design.v:3: syntax error\n/tb.v:19: port mismatch'),[{file:'design',line:3,message:'syntax error'},{file:'testbench',line:19,message:'port mismatch'}]);
});
test('local HDL status rejects malformed storage instead of inventing progress',()=>{
  const entry={passed:true,checks:64,failures:0,submittedAt:'2026-10-03T00:00:00Z'};
  assert.deepEqual(parseHdlProgress(JSON.stringify({'word-multiplexer':entry})),{'word-multiplexer':entry});
  for(const value of ['not json','[]','x'.repeat(16385),JSON.stringify({'word-multiplexer':{...entry,checks:-1}}),JSON.stringify({'word-multiplexer':{...entry,failures:65}})]) assert.deepEqual(parseHdlProgress(value),{});
});
