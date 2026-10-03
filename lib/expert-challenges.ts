import type { Challenge } from './challenges';
import { STANDARD_SPICE_MODELS } from './spice-model-library';
import { stimulusPoints } from './native-stimulus';

const native = (body: string, step = 1e-7) => `$ 1 ${step} 10.2 50 5 50\n${body}\n`;
const defaults = { difficulty: 'Expert', acceptance: null, attempts: 0, available: true, judge: null, starterMode: 'connected' } as const;
const ladder = `R 128 256 64 256 0 0 40 5 0 0 .5
R 288 256 224 256 0 0 40 5 0 0 .5
R 448 256 384 256 0 0 40 5 0 0 .5
r 128 128 288 128 0 10000
r 288 128 448 128 0 10000
r 128 128 128 256 0 20000
r 288 128 288 256 0 20000
r 448 128 448 256 0 20000
r 448 128 608 128 0 20000
g 608 128 608 160 0
207 128 128 64 128 0 dac
207 128 256 128 320 0 b2
207 288 256 288 320 0 b1
207 448 256 448 320 0 b0`;
const ladderDevices = 'RB2 dac b2 20k\nR1 dac n1 10k\nRB1 n1 b1 20k\nR2 n1 n0 10k\nRB0 n0 b0 20k\nRT n0 0 20k';
const densitySource = {type:'bitstream',bits:'11101000',bitPeriodS:.0002,low:0,high:5,riseS:1e-6,repeat:true} as const;
const densityPwl = stimulusPoints(densitySource,.04).map(point=>`${point.timeS.toExponential(9)} ${point.value}`).join(' ');

export const expertChallenges: Challenge[] = [
  {
    ...defaults, id: 33, slug: 'pipeline-residue-block', title: 'Design a reusable pipeline residue stage', domain: 'Op-amps', xp: 500,
    summary: 'Build and verify a subtract-and-amplify block, then save it for a pipelined converter.',
    objective: 'Make residue = 2 × (vin − dac). With vin=0.875 V and dac=0.5 V, tune the feedback network for 0.750 V. Check the result, select the amplifier, four resistors and three external labels, then save Residue2x. Leave the two test sources outside your block.',
    analysis: 'Operating point', topics: ['Pipeline ADC','Residue gain','Difference amplifier','Reusable blocks'],
    prerequisites: ['inverting-gain-stage','sar-trial-residue'], reusableBlock: {name:'Residue2x',ports:['vin','dac','residue'],description:'A gain-of-two residue amplifier with the DAC subtraction inside the saved circuit.'},
    constraints: ['Keep input resistors 10 kΩ and the non-inverting divider resistor 20 kΩ.', 'Tune RF from its 19 kΩ starter value.', 'Ideal bounded op-amp; this block has no settling-time or offset guarantee.'],
    nativeCircuit: native('a 352 224 512 224 8 15 -15 1000000 0 0 1000000\nR 128 208 64 208 0 0 40 .5 0 0 .5\nr 128 208 352 208 0 10000\nR 128 240 64 240 0 0 40 .875 0 0 .5\nr 128 240 352 240 0 10000\nr 352 240 352 368 0 20000\ng 352 368 352 400 0\nw 352 208 352 112 0\nr 352 112 512 112 0 19000\nw 512 112 512 224 0\n207 128 208 128 144 0 dac\n207 128 240 128 304 0 vin\n207 512 224 592 224 0 residue'),
    starterNetlist: 'VIN vin 0 .875\nVDAC dac 0 .5\nRI dac minus 10k\nRF residue minus 19k\nRP vin plus 10k\nRG plus 0 20k\nE1 residue 0 plus minus 1meg\n.op\n.end', probe:'residue',recommendedProbes:['vin','dac','residue'], analysisDefaults:{type:'operating-point'},
    designChecks:[{id:'residue',label:'Gain-of-two residue at this trial',node:'residue',analysis:'dc',kind:'sample',min:.749,max:.751,unit:'V'}],
  },
  {
    ...defaults,id:34,slug:'r2r-dac-settling-budget',title:'Give a DAC enough time to settle',domain:'Digital',xp:490,
    summary:'Drive a physical R–2R network with synchronized PWL bit sources and measure its loaded settling.',
    objective:'The three bit drivers jump from 000 to 111 after 1 µs. Reduce the load capacitor until the DAC output is within 5 mV of 4.375 V at 8.001 µs. Inspect all bit edges and the analog output; explain how the ladder’s 10 kΩ Thevenin resistance sets the time constant.',
    analysis:'Transient',topics:['R–2R DAC','Settling error','PWL stimulus','Thevenin resistance'],prerequisites:['r2r-dac-code','adc-acquisition-settling'],recommendedBlocks:['R2R3'],
    constraints:['R=10 kΩ, 2R=20 kΩ; drivers remain 0–5 V.', 'The supplied 220 pF load is intentionally too slow; choose 10–220 pF.', 'An unloaded ladder has 10 kΩ output resistance; any buffer must be included in the circuit.'],
    nativeCircuit:native(`${ladder}\nc 128 128 128 16 0 2.2e-10 0\ng 128 16 96 16 0`,1e-9),
    starterNetlist:`VB2 b2 0 PWL(0 0 1u 0 1.001u 5)\nVB1 b1 0 PWL(0 0 1u 0 1.001u 5)\nVB0 b0 0 PWL(0 0 1u 0 1.001u 5)\n${ladderDevices}\nCL dac 0 220p\n.tran 10n 12u\n.end`,probe:'dac',recommendedProbes:['dac','b2','b1','b0'],preferredInstrument:'scope',
    analysisDefaults:{type:'transient',duration:12e-6,samples:1200,sourceOverrides:Object.fromEntries([0,1,2].map(index=>[index,{type:'pwl' as const,points:[{timeS:0,value:0},{timeS:1e-6,value:0},{timeS:1.001e-6,value:5}]}]))},
    designChecks:[{id:'settled',label:'Final-code settling at 8.001 µs',node:'dac',analysis:'transient',kind:'sample',at:8.001e-6,min:4.370,max:4.380,unit:'V'}],
  },
  {
    ...defaults,id:35,slug:'sar-conversion-sequence',title:'Wire the SAR comparator decision path',domain:'Digital',xp:540,
    summary:'Replay real 100 → 110 → 101 DAC trials and verify the comparator decisions in time.',
    objective:'The PWL sources apply three trial codes to a resistor DAC while vin stays at 3.20 V. Wire the native comparator so its high output means “keep this trial”. Verify the high–low–high decision sequence, then save the comparator and ladder as reusable blocks for the next converter.',
    analysis:'Transient',topics:['SAR ADC','Trial timing','Comparator polarity','Mixed signal probing'],prerequisites:['r2r-dac-code','adc-comparator-polarity','sar-trial-residue'],recommendedBlocks:['R2R3','Comparator5V'],
    constraints:['Trials change at 1, 11 and 21 µs; inspect decisions after each trial settles.', 'The comparator begins with its inputs reversed. Fix the two input labels/wires.', 'Stimulus replays the trial register; this circuit does not implement a clocked SAR controller.'],
    nativeCircuit:native(`${ladder}\nR 160 432 96 432 0 0 40 3.2 0 0 .5\n207 160 432 160 496 0 vin\na 352 432 480 432 8 5 0 1000000 0 0 100000\n207 352 416 272 416 0 vin\n207 352 448 272 448 0 dac\n207 480 432 560 432 0 decision`,1e-9),
    starterNetlist:`VB2 b2 0 PWL(0 0 1u 0 1.001u 5)\nVB1 b1 0 PWL(0 0 11u 0 11.001u 5 21u 5 21.001u 0)\nVB0 b0 0 PWL(0 0 21u 0 21.001u 5)\n${ladderDevices}\nVIN vin 0 3.2\nBDEC decision 0 V=max(0,min(5,100000*(V(dac)-V(vin))))\n.tran 20n 30u\n.end`,probe:'decision',recommendedProbes:['vin','dac','decision','b2','b1','b0'],preferredInstrument:'logic',
    analysisDefaults:{type:'transient',duration:30e-6,samples:1500,sourceOverrides:{0:{type:'pwl',points:[{timeS:0,value:0},{timeS:1e-6,value:0},{timeS:1.001e-6,value:5}]},1:{type:'pwl',points:[{timeS:0,value:0},{timeS:11e-6,value:0},{timeS:11.001e-6,value:5},{timeS:21e-6,value:5},{timeS:21.001e-6,value:0}]},2:{type:'pwl',points:[{timeS:0,value:0},{timeS:21e-6,value:0},{timeS:21.001e-6,value:5}]}}},
    designChecks:[{id:'msb',label:'Keep 100',node:'decision',analysis:'transient',kind:'sample',at:5e-6,min:4.9,max:5.1,unit:'V'},{id:'middle',label:'Clear 110 middle bit',node:'decision',analysis:'transient',kind:'sample',at:15e-6,min:-.1,max:.1,unit:'V'},{id:'lsb',label:'Keep 101',node:'decision',analysis:'transient',kind:'sample',at:25e-6,min:4.9,max:5.1,unit:'V'},{id:'dac',label:'Final trial level',node:'dac',analysis:'transient',kind:'sample',at:25e-6,min:3.12,max:3.13,unit:'V'}],
  },
  {
    ...defaults,id:36,slug:'delta-sigma-output-filter',title:'Reconstruct a one-bit density stream',domain:'Digital',xp:510,
    summary:'Convert a repeated bit-density word into an analog level and trade ripple against settling.',
    objective:'A 11101000 stream contains four ones per eight bits at 5 V logic levels. With R=10 kΩ, choose the capacitor to keep output ripple below 0.22 Vpp during 32–40 ms while its time-weighted mean remains within 0.10 V of 2.50 V. Show both the digital input and filtered output.',
    analysis:'Transient',topics:['Delta-sigma DAC','Pulse density','Reconstruction filter','Ripple budget'],prerequisites:['wire-antialias-filter','rc-cutoff-1khz'],recommendedBlocks:['AntiAliasRC'],
    constraints:['This is a reconstruction stage driven by a deterministic density sequence, not a noise-shaped modulator.', 'Bit period = 200 µs; rise/fall time = 1 µs; R=10 kΩ.', 'Start with C=220 nF and choose 220 nF–1 µF; verify both ripple and settling.'],
    nativeCircuit:native('v 128 320 128 128 0 2 5000 2.5 2.5 0 .5\nr 128 128 352 128 0 10000\nc 352 128 352 320 0 2.2e-7 0\ng 128 320 128 352 0\ng 352 320 352 352 0\n207 128 128 128 64 0 bits\n207 352 128 432 128 0 out',1e-6),
    starterNetlist:`VB bits 0 PWL(${densityPwl})\nR1 bits out 10k\nC1 out 0 220n\n.tran 20u 40m\n.end`,probe:'out',recommendedProbes:['bits','out'],preferredInstrument:'scope',
    analysisDefaults:{type:'transient',duration:.04,samples:2000,sourceOverrides:{0:densitySource}},
    designChecks:[{id:'mean',label:'Reconstructed mean over five words',node:'out',analysis:'transient',kind:'mean',from:.032,to:.04,min:2.4,max:2.6,unit:'V'},{id:'ripple',label:'Output ripple',node:'out',analysis:'transient',kind:'peak-to-peak',from:.032,to:.04,min:0,max:.22,unit:'Vpp'}],
  },
  {
    ...defaults,id:37,slug:'lm741-tia-compensation',title:'Compensate a real LM741 photodiode amplifier',domain:'Op-amps',xp:570,
    summary:'Replace an ideal amplifier with TI’s LM741 macro-model and budget real closed-loop bandwidth.',
    objective:'With RF=100 kΩ, CD=50 pF and ±15 V rails, choose CF so transimpedance is 95–105 kΩ at 1 kHz and less than 30 kΩ at 100 kHz. Start from 2 pF, compare 10 pF and 100 pF, then explain the noise/bandwidth tradeoff before saving the feedback block.',
    analysis:'AC sweep',topics:['Transimpedance','LM741','Feedback compensation','Input capacitance'],prerequisites:['transimpedance-stability','inverting-gain-stage'],
    constraints:['Use the explicit LM741 SPICE model and a 1 µA AC input current.', 'Keep RF=100 kΩ and CD=50 pF; vary only CF from 2–100 pF.', 'Magnitude checks describe closed-loop response; they do not measure loop phase margin.'],
    nativeCircuit:native('a 352 224 512 224 8 15 -15 1000000 0 0 100000\ni 176 208 176 368 0 1e-6\ng 176 368 176 400 0\nw 176 208 256 208 0\nw 256 208 352 208 0\ng 352 240 352 272 0\nc 256 208 256 368 0 5e-11 0\ng 256 368 256 400 0\nw 352 208 352 96 0\nr 352 96 512 96 0 100000\nw 512 96 512 160 0\nw 512 160 512 224 0\nw 352 208 352 160 0\nc 352 160 512 160 0 2e-12 0\n207 352 208 304 208 0 nsum\n207 512 224 592 224 0 out'),
    starterNetlist:`IP nsum 0 DC 0 AC 1u\nRF out nsum 100k\nCF out nsum 2p\nCD nsum 0 50p\nVP vp 0 15\nVN vn 0 -15\nX1 0 nsum vp vn out LM741\n${STANDARD_SPICE_MODELS.lm741.line}\n.ac dec 40 10 1meg\n.end`,probe:'out',recommendedProbes:['out','nsum'],analysisDefaults:{type:'ac-sweep',startHz:10,stopHz:1e6,acPoints:40,acScale:'decade',acSource:1,acMagnitude:1e-6,models:{0:'lm741'}},
    designChecks:[{id:'gain',label:'Low-frequency transimpedance',node:'out',analysis:'ac',kind:'sample',at:1000,min:95000,max:105000,scale:1e6,unit:'Ω'},{id:'bandwidth',label:'100 kHz transimpedance',node:'out',analysis:'ac',kind:'sample',at:100000,min:0,max:30000,scale:1e6,unit:'Ω'}],
  },
  {
    ...defaults,id:38,slug:'flash-adc-threshold-calibration',title:'Calibrate a flash ADC threshold',domain:'Digital',xp:520,
    summary:'Locate a comparator threshold error with programmed inputs and remove its offset.',
    objective:'A three-comparator flash front end uses ideal 1, 2 and 3 V ladder taps. The middle comparator has an explicit 20 mV reference-path offset. Apply the 1.99 V and 2.01 V PWL plateaus, trim that offset so the middle decision brackets 2 V, and verify neighboring comparators stay correct.',
    analysis:'Transient',topics:['Flash ADC','Offset calibration','Thermometer code','PWL test vectors'],prerequisites:['flash-adc-thermometer','adc-comparator-polarity'],recommendedBlocks:['Comparator5V'],
    constraints:['Keep all four ladder resistors at 10 kΩ and the reference at 4 V.', 'Trim the explicit VOFF source; input and reference ladder must remain unchanged.', 'An ideal comparator bank is used to isolate static offset. Delay and metastability are outside this check.'],
    nativeCircuit:native('R 96 496 32 496 0 0 40 1.99 0 0 .5\n207 96 496 176 496 0 vin\nR 128 96 64 96 0 0 40 4 0 0 .5\nr 128 96 128 176 0 10000\nr 128 176 128 256 0 10000\nr 128 256 128 336 0 10000\nr 128 336 128 416 0 10000\ng 128 416 128 448 0\n207 128 176 192 176 0 ref3\n207 128 256 192 256 0 ref2\n207 128 336 192 336 0 ref1\na 384 160 512 160 8 5 0 1000000 0 0 100000\n207 384 144 304 144 0 ref3\n207 384 176 304 176 0 vin\n207 512 160 592 160 0 t3\na 384 304 512 304 8 5 0 1000000 0 0 100000\nv 240 288 384 288 0 0 40 .02 0 0 .5\n207 240 288 240 240 0 ref2\n207 384 320 304 320 0 vin\n207 512 304 592 304 0 t2\na 384 448 512 448 8 5 0 1000000 0 0 100000\n207 384 432 304 432 0 ref1\n207 384 464 304 464 0 vin\n207 512 448 592 448 0 t1',1e-7),
    starterNetlist:'VIN vin 0 PWL(0 1.99 1m 1.99 1.001m 2.01 2m 2.01)\nVREF ref 0 4\nR3 ref ref3 10k\nR2 ref3 ref2 10k\nR1 ref2 ref1 10k\nR0 ref1 0 10k\nVOFF ref2c ref2 .02\nB1 t1 0 V=max(0,min(5,100000*(V(vin)-V(ref1))))\nB2 t2 0 V=max(0,min(5,100000*(V(vin)-V(ref2c))))\nB3 t3 0 V=max(0,min(5,100000*(V(vin)-V(ref3))))\n.tran 1u 2m\n.end',
    probe:'t2',recommendedProbes:['vin','t1','t2','t3'],preferredInstrument:'logic',analysisDefaults:{type:'transient',duration:.002,samples:2000,sourceOverrides:{0:{type:'pwl',points:[{timeS:0,value:1.99},{timeS:.001,value:1.99},{timeS:.001001,value:2.01},{timeS:.002,value:2.01}]}}},
    designChecks:[{id:'below',label:'Middle threshold rejects 1.99 V',node:'t2',analysis:'transient',kind:'sample',at:.0005,min:-.1,max:.1,unit:'V'},{id:'above',label:'Middle threshold accepts 2.01 V',node:'t2',analysis:'transient',kind:'sample',at:.0015,min:4.9,max:5.1,unit:'V'},{id:'lower',label:'Lower comparator remains high',node:'t1',analysis:'transient',kind:'sample',at:.0015,min:4.9,max:5.1,unit:'V'},{id:'upper',label:'Upper comparator remains low',node:'t3',analysis:'transient',kind:'sample',at:.0015,min:-.1,max:.1,unit:'V'}],
  },
];
