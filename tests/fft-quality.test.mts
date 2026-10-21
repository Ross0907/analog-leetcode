import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticFftCapture,detectSpectrumPeaks } from '../lib/fft-quality';
import { computeSpectrum } from '../lib/waveform-analysis';

test('automatic FFT plans one maximum-depth coherent record inside time and memory limits',()=>{
 const x=Array.from({length:8192},(_,i)=>i*.005/8192),values=x.map(t=>2*Math.sin(2*Math.PI*1000*t));
 const request=automaticFftCapture(x,[{id:'v',name:'V(out)',unit:'V',quantity:'voltage',values}])!;
 assert.equal(request.fftLength,131072);assert(request.recordDuration>.5);assert(request.recordDuration+request.settleDuration<=10);assert(Math.abs(request.recordDuration*1000-Math.round(request.recordDuration*1000))<.01);
 const startup=automaticFftCapture(x,[{id:'v',name:'V(out)',unit:'V',quantity:'voltage',values:values.map((v,i)=>v+4*Math.exp(-x[i]/.0001))}])!;
 assert(startup.settleDuration>.019);assert(Math.abs(startup.recordDuration*1000-Math.round(startup.recordDuration*1000))<.01);
 const bounded=automaticFftCapture(x,[{id:'v',name:'V(out)',unit:'V',quantity:'voltage',values}],1.999)!;assert(bounded.recordDuration+bounded.settleDuration<=1.999);assert.equal(bounded.fftLength,131072);
 const many=automaticFftCapture(x,Array.from({length:32},(_,i)=>({id:String(i),name:String(i),unit:'V',quantity:'voltage' as const,values})))!;
 assert.equal(many.fftLength,32768);assert((many.fftLength*33)<=2097152);
});
test('FFT peak finder reports measured tone frequencies and amplitudes without promoting window skirts',()=>{
 const n=16384,dt=1/16384,x=Array.from({length:n},(_,i)=>i*dt),v=x.map(t=>2*Math.sin(2*Math.PI*100*t)+.5*Math.sin(2*Math.PI*350*t));
 const s=computeSpectrum(x,v,{length:n,window:'blackman-harris',removeDc:true}),peaks=detectSpectrumPeaks(s.frequencies,s.amplitudes);
 assert.equal(peaks[0].frequency,100);assert.equal(peaks[1].frequency,350);assert(Math.abs(peaks[0].amplitude-2)<.001);assert(Math.abs(peaks[1].amplitude-.5)<.001);assert.equal(peaks.length,2);
 assert.deepEqual(detectSpectrumPeaks([0,1,2],[0,0,0]),[]);
 assert.equal(detectSpectrumPeaks([0,1,2],[0,.1,1])[0].frequency,2);
});
