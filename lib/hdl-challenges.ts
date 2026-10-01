export type HdlChallenge = {
  slug: string; title: string; level: 'Easy' | 'Medium' | 'Hard'; topic: string;
  description: string; specification: string[]; starter: string; solution: string;
  testbench: string; checks: number; analogLink?: string;
};

function bench(declarations: string, body: string) {
  return `\`timescale 1ns/1ps
module tb;
  ${declarations}
  integer checks=0;
  integer failures=0;
  task check;
    input condition;
    input [255:0] description;
    begin
      checks=checks+1;
      if (condition !== 1'b1) begin
        failures=failures+1;
        $display("FAIL: %0s at %0t", description, $time);
      end
    end
  endtask
  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0,tb);
    ${body}
    $display("ANACODE_RESULT checks=%0d failures=%0d",checks,failures);
    if(failures>0) $fatal(1,"Some checks failed");
    $finish;
  end
  initial begin #100000; $fatal(1,"Testbench timed out"); end
endmodule
`;
}

export const HDL_CHALLENGES: HdlChallenge[] = [
  {
    slug: 'word-multiplexer', title: '01. Route a data word', level: 'Easy', topic: 'Combinational logic',
    description: 'A sensor front end has four 8-bit channels. Route the selected word to a shared bus without storing any state.',
    specification: ['Module top_module: inputs a, b, c, d (8 bits) and sel (2 bits); output y (8 bits).', 'sel=0 selects a, 1 selects b, 2 selects c, and 3 selects d.', 'The output must respond to both selection changes and data changes.'],
    starter: 'module top_module(input [7:0] a,b,c,d, input [1:0] sel, output [7:0] y);\n  // Route the selected input to y.\nendmodule\n',
    solution: 'module top_module(input [7:0] a,b,c,d, input [1:0] sel, output [7:0] y);\n assign y = sel==0 ? a : sel==1 ? b : sel==2 ? c : d;\nendmodule\n',
    testbench: bench('reg [7:0] a,b,c,d; reg [1:0] sel; wire [7:0] y; integer i,j;\n  top_module dut(a,b,c,d,sel,y);', 'for(i=0;i<16;i=i+1) begin\n      a=i*17; b=255-a; c=i*11; d=i*7;\n      for(j=0;j<4;j=j+1) begin sel=j; #5; check(y===(j==0?a:j==1?b:j==2?c:d),"Selected word"); end\n    end'), checks: 64,
  },
  {
    slug: 'saturating-adder', title: '02. Add without wrapping', level: 'Easy', topic: 'Arithmetic',
    description: 'A digital gain stage adds two unsigned samples. Saturate at full scale instead of wrapping back to zero.',
    specification: ['Inputs a and b and output y are 8-bit unsigned words.', 'y=min(a+b,255). Keep the carry bit when computing the sum.', 'All 65,536 input combinations are checked.'],
    starter: 'module top_module(input [7:0] a,b, output [7:0] y);\n  // Preserve the carry and clamp to full scale.\nendmodule\n',
    solution: 'module top_module(input [7:0] a,b, output [7:0] y);\n wire [8:0] sum={1\'b0,a}+{1\'b0,b};\n assign y=sum[8] ? 8\'hff : sum[7:0];\nendmodule\n',
    testbench: bench('reg [7:0] a,b; wire [7:0] y; integer i,j,expected;\n  top_module dut(a,b,y);', 'for(i=0;i<256;i=i+1) for(j=0;j<256;j=j+1) begin\n      a=i; b=j; expected=(i+j>255)?255:i+j; #1;\n      check(y===expected[7:0],"Saturating sum");\n    end'), checks: 65536,
  },
  {
    slug: 'enabled-counter', title: '03. Count accepted samples', level: 'Medium', topic: 'Sequential logic',
    description: 'Count accepted conversions while allowing the acquisition stream to pause. Reset must take priority over enable.',
    specification: ['Inputs clk, reset, enable; output q is a 4-bit register.', 'On each rising clock edge: reset clears q; otherwise enable increments q modulo 16.', 'Hold q when enable is low. Reset is synchronous and active high.'],
    starter: 'module top_module(input clk,reset,enable, output reg [3:0] q);\n  // Add synchronous reset, enable and wraparound.\nendmodule\n',
    solution: 'module top_module(input clk,reset,enable, output reg [3:0] q);\n always @(posedge clk) if(reset) q<=0; else if(enable) q<=q+1\'b1;\nendmodule\n',
    testbench: bench('reg clk=0,reset=0,enable=0; wire [3:0] q; reg [3:0] expected=0; integer i;\n  top_module dut(clk,reset,enable,q);', 'for(i=0;i<64;i=i+1) begin\n      clk=0; reset=(i==0 || i==39); enable=(i%7!=3); #4;\n      if(reset) expected=0; else if(enable) expected=expected+1\'b1;\n      clk=1; #1; check(q===expected,"Counter edge"); #5;\n    end'), checks: 64,
  },
  {
    slug: 'flash-adc-encoder', title: '04. Encode a flash ADC', level: 'Medium', topic: 'Data converters',
    description: 'Seven comparators form a 3-bit flash ADC. Convert their thermometer word into a binary code and identify invalid bubble patterns.',
    specification: ['Input therm[6:0]; outputs code[2:0] and valid.', 'Valid words are 0000000, 0000001, 0000011, …, 1111111. Code is the number of low-order ones.', 'For any other word set valid=0 and code=0. All 128 patterns are checked.'],
    starter: 'module top_module(input [6:0] therm, output reg [2:0] code, output reg valid);\n  // Decode thermometer words; reject bubbles.\nendmodule\n',
    solution: 'module top_module(input [6:0] therm, output reg [2:0] code, output reg valid);\n integer i;\n always @* begin\n code=0; valid=0;\n for(i=0;i<8;i=i+1) if(therm==((1<<i)-1)) begin code=i; valid=1; end\n end\nendmodule\n',
    testbench: bench('reg [6:0] therm; wire [2:0] code; wire valid; integer i,j,expected; reg good;\n  top_module dut(therm,code,valid);', 'for(i=0;i<128;i=i+1) begin\n      therm=i; good=0; expected=0;\n      for(j=0;j<8;j=j+1) if(i==((1<<j)-1)) begin good=1; expected=j; end\n      #5; check(valid===good && code===expected[2:0],"Flash code and validity");\n    end'), checks: 128, analogLink: '/problems/flash-adc-thermometer',
  },
  {
    slug: 'pwm-dac', title: '05. Build a PWM DAC', level: 'Medium', topic: 'Data converters',
    description: 'Turn a 4-bit code into pulse-width modulation. An analog reconstruction filter can recover its average voltage.',
    specification: ['Inputs phase[3:0] and duty[3:0]; output pwm.', 'pwm is high exactly when phase < duty. There are 16 phase slots per period.', 'Code 0 gives 0% duty and code 15 gives 15/16 duty, not 100%.'],
    starter: 'module top_module(input [3:0] phase,duty, output pwm);\n  // Compare the phase accumulator with the DAC code.\nendmodule\n',
    solution: 'module top_module(input [3:0] phase,duty, output pwm);\n assign pwm=phase<duty;\nendmodule\n',
    testbench: bench('reg [3:0] phase,duty; wire pwm; integer i,j;\n  top_module dut(phase,duty,pwm);', 'for(i=0;i<16;i=i+1) begin duty=i;\n      for(j=0;j<16;j=j+1) begin phase=j; #5; check(pwm===(j<i),"PWM slot"); end\n    end'), checks: 256, analogLink: '/problems/wire-antialias-filter',
  },
  {
    slug: 'sar-controller', title: '06. Sequence a SAR conversion', level: 'Hard', topic: 'State machines',
    description: 'Control a 4-bit successive-approximation converter. Trial each DAC bit from most significant to least significant, retaining it when the comparator says the input is at least the trial voltage.',
    specification: ['Inputs clk, reset, start, cmp; outputs trial[3:0], busy, done.', 'Synchronous reset sets trial=0, busy=0, done=0. Idle start sets trial=8 and busy=1.', 'Each following rising edge accepts cmp for the current bit and sets the next trial bit. After four comparisons hold the final code, clear busy, and pulse done for one cycle.', 'Ignore start while busy; cmp=1 means keep the current bit. All 16 input codes are tested.'],
    starter: 'module top_module(input clk,reset,start,cmp, output reg [3:0] trial, output reg busy,done);\n  // Track the current bit and sequence four comparisons.\nendmodule\n',
    solution: 'module top_module(input clk,reset,start,cmp, output reg [3:0] trial, output reg busy,done);\n reg [3:0] mask; reg [3:0] accepted;\n always @(posedge clk) begin\n if(reset) begin trial<=0; busy<=0; done<=0; mask<=0; end\n else begin\n done<=0;\n if(!busy) begin if(start) begin trial<=8; mask<=8; busy<=1; end end\n else begin\n accepted=cmp ? trial : (trial & ~mask);\n if(mask==1) begin trial<=accepted; busy<=0; done<=1; end\n else begin mask<=mask>>1; trial<=accepted | (mask>>1); end\n end\n end\n end\nendmodule\n',
    testbench: bench('reg clk=0,reset=1,start=0,cmp=0; wire [3:0] trial; wire busy,done; integer code,bitno;\n  top_module dut(clk,reset,start,cmp,trial,busy,done);', 'clk=1; #1; check(trial===0 && busy===0 && done===0,"Reset"); clk=0; reset=0; #4;\n    for(code=0;code<16;code=code+1) begin\n      start=1; clk=1; #1; check(busy===1 && trial===8 && done===0,"Start conversion"); clk=0; start=0; #4;\n      for(bitno=0;bitno<4;bitno=bitno+1) begin\n        cmp=(code>=trial); clk=1; #1;\n        check(bitno==3 ? (busy===0 && done===1 && trial===code[3:0]) : (busy===1 && done===0),"SAR step");\n        clk=0; #4;\n      end\n      clk=1; #1; check(done===0 && trial===code[3:0],"Done pulse and held result"); clk=0; #4;\n    end'), checks: 97, analogLink: '/problems/sar-trial-residue',
  },
];

export function hdlCheckResult(log: string, exitCode: number, expectedChecks: number) {
  const result = /ANACODE_RESULT checks=(\d+) failures=(\d+)/g;
  const reports = [...log.matchAll(result)];
  const final = reports.at(-1);
  return { passed: exitCode === 0 && final?.[1] === String(expectedChecks) && final?.[2] === '0', checks: Number(final?.[1] ?? 0), failures: Number(final?.[2] ?? 0) };
}
