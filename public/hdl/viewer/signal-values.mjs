// MIT. Display formatting only; samples come from VCDrom's upstream VCD parser.
export const RADICES=['binary','hex','octal','unsigned','signed','ascii'];
// Upstream ONML interpolates strings into SVG innerHTML without escaping them.
export function escapeSvgText(value){return String(value).replace(/[&<>]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[character]);}
export function sampleAt(wave,time){
  if(!wave?.length||time<wave[0][0])return null;
  let lo=0,hi=wave.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(wave[mid][0]<=time)lo=mid+1;else hi=mid;}
  return wave[Math.max(0,lo-1)];
}
export function bitSample(value){
  if(value===0||value===1)return [BigInt(value),0n];
  // Upstream vcd-stream's scalar command ordering: 0,1,x,X,z,Z,u,U,w,W,l,L,h,H,-.
  if(value===4||value===5)return [1n,1n];
  if(value===10||value===11)return [0n,0n];
  if(value===12||value===13)return [1n,0n];
  return [0n,1n];
}
export function vectorSample(chang,sample){
  if(!sample)return null;
  return chang.kind==='bit'?bitSample(sample[1]):[BigInt(sample[1]??0),BigInt(sample[2]??0)];
}
export function formatValue(value,mask,width,radix='hex'){
  const size=Number(width);
  if(!Number.isSafeInteger(size)||size<1||size>65536)return 'Unsupported bus width';
  const limit=(1n<<BigInt(size))-1n,v=BigInt(value??0)&limit,m=BigInt(mask??0)&limit;
  if(radix==='signed'||radix==='unsigned'){
    if(m)return (v&m)===m&&m===limit?'Z':'X';
    return (radix==='signed'&&v&(1n<<BigInt(size-1))?v-(1n<<BigInt(size)):v).toString();
  }
  if(radix==='ascii'){
    let text='';
    for(let shift=Math.ceil(size/8)*8-8;shift>=0;shift-=8){
      const byte=Number(v>>BigInt(shift)&255n),unknown=m>>BigInt(shift)&255n;
      text+=unknown?'?':byte===34?'\\"':byte===92?'\\\\':byte>=32&&byte<=126?String.fromCharCode(byte):'\\x'+byte.toString(16).padStart(2,'0');
      if(text.length>=256){text+='…';break;}
    }
    return '"'+text+'"';
  }
  const group=radix==='binary'?1:radix==='octal'?3:4,base=1<<group;
  let text='';
  for(let shift=Math.ceil(size/group)*group-group;shift>=0;shift-=group){
    const bits=Math.min(group,size-shift),groupMask=(1n<<BigInt(bits))-1n,a=v>>BigInt(shift)&groupMask,b=m>>BigInt(shift)&groupMask;
    text+=b?b===groupMask&&a===groupMask?'z':'x':a.toString(base);
    if(text.length>=256){text+='…';break;}
  }
  return text;
}
export function numericValue(value,mask,width,signed=false){
  if(mask)return null;
  const bits=Number(width);
  if(!Number.isSafeInteger(bits)||bits<1||bits>65536)return null;
  const v=BigInt(value)&((1n<<BigInt(bits))-1n);
  const number=Number(signed&&v&(1n<<BigInt(bits-1))?v-(1n<<BigInt(bits)):v);
  return Number.isFinite(number)?number:null;
}
/** Return a native VCD time coordinate; input is seconds unless a time unit is supplied. */
export function parseCursorTime(input,tgcd,exponent,end){
  const match=String(input).trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([munpfµμ]?)s?$/i);
  if(!match)return null;
  const unitExponent=({m:-3,u:-6,'µ':-6,'μ':-6,n:-9,p:-12,f:-15})[match[2].toLowerCase()]??0;
  // Combine powers before multiplying so exact event times such as 50 ns do
  // not land one ULP outside the record through separate seconds conversions.
  const time=Number(match[1])*10**(unitExponent-exponent)/tgcd;
  return Number.isFinite(time)&&time>=0&&time<=end?time:null;
}
export function timeText(time,tgcd,exponent,precision=6){
  const seconds=Math.max(0,time)*tgcd*10**exponent;
  if(seconds===0)return '0 '+([['s',0],['ms',-3],['µs',-6],['ns',-9],['ps',-12],['fs',-15]].find(([,power])=>exponent>=power)?.[0]??'fs');
  for(const [unit,scale] of [['s',1],['ms',1e-3],['µs',1e-6],['ns',1e-9],['ps',1e-12],['fs',1e-15]])if(seconds>=scale||unit==='fs')return Number((seconds/scale).toPrecision(precision))+' '+unit;
  return '0 s';
}
