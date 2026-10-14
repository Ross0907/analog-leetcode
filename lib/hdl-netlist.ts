export type NetlistPort = { direction: 'input'|'output'|'inout'; bits: (number|string)[] };
export type YosysModule = { ports: Record<string,NetlistPort>; cells: Record<string,{type:string;port_directions:Record<string,NetlistPort['direction']>;connections:Record<string,(number|string)[]>}>; netnames: Record<string,{bits:(number|string)[]}> };
export type YosysNetlist = { modules: Record<string,YosysModule> };
export function netlistGraph(module: YosysModule) {
  const nodes: {id:string;type:string;position:{x:number;y:number};data:{label:string;kind:string;inputs:string[];outputs:string[]}}[]=[];
  const pins: {id:string;name:string;direction:NetlistPort['direction'];bits:(number|string)[]}[]=[];
  for(const [name,port] of Object.entries(module.ports)) {
    const id='port:'+name, output=port.direction==='input';
    nodes.push({id,type:'cell',position:{x:0,y:0},data:{label:name,kind:port.direction+' ['+port.bits.length+']',inputs:output?[]:[name],outputs:output?[name]:[]}});
    pins.push({id,name,direction:output?'output':'input',bits:port.bits});
  }
  for(const [name,cell] of Object.entries(module.cells)) {
    const id='cell:'+name, inputs=Object.keys(cell.connections).filter(p=>cell.port_directions[p]!=='output'),outputs=Object.keys(cell.connections).filter(p=>cell.port_directions[p]==='output');
    nodes.push({id,type:'cell',position:{x:0,y:0},data:{label:name,kind:cell.type,inputs,outputs}});
    for(const [pin,bits] of Object.entries(cell.connections))pins.push({id,name:pin,direction:cell.port_directions[pin],bits});
  }
  if(nodes.length>500)throw Error('This module has more than 500 cells/ports. Select a smaller hierarchy for the browser view.');
  const drivers=new Map<number|string,{id:string;name:string}[]>();
  for(const pin of pins.filter(p=>p.direction==='output'))for(const bit of pin.bits){const list=drivers.get(bit)??[];list.push(pin);drivers.set(bit,list);}
  const grouped=new Map<string,{source:string;sourceHandle:string;target:string;targetHandle:string;bits:Set<number|string>}>();
  for(const pin of pins.filter(p=>p.direction!=='output'))for(const bit of pin.bits) {
    if(typeof bit==='string'&&!drivers.has(bit)) {
      const id='constant:'+bit;nodes.push({id,type:'cell',position:{x:0,y:0},data:{label:bit.toUpperCase(),kind:'Constant',inputs:[],outputs:['Y']}});drivers.set(bit,[{id,name:'Y'}]);
    }
    for(const driver of drivers.get(bit)??[]) {
      const key=JSON.stringify([driver.id,driver.name,pin.id,pin.name]),edge=grouped.get(key)??{source:driver.id,sourceHandle:'out:'+driver.name,target:pin.id,targetHandle:'in:'+pin.name,bits:new Set<number|string>()};edge.bits.add(bit);grouped.set(key,edge);
    }
  }
  if(grouped.size>4000)throw Error('This module has too many connections for the browser view.');
  const edges=[...grouped.values()].map(({bits,...edge},index)=>({id:'net:'+index,...edge,type:'smoothstep',label:bits.size>1?String(bits.size):undefined,style:{stroke:'var(--amber-dark)',strokeWidth:bits.size>1?2:1},labelStyle:{fill:'var(--ink)',fontSize:10}}));
  const levels=new Map(nodes.filter(n=>n.id.startsWith('port:')&&n.data.outputs.length||n.id.startsWith('constant:')).map(n=>[n.id,0]));
  for(let pass=0;pass<nodes.length;pass++) { let changed=false;for(const node of nodes) {if(levels.has(node.id))continue;const incoming=edges.filter(e=>e.target===node.id&&e.source!==node.id);if(incoming.every(e=>levels.has(e.source))){levels.set(node.id,1+Math.max(0,...incoming.map(e=>levels.get(e.source)!)));changed=true;}}if(!changed)break; }
  const heights=new Map<number,number>();
  for(const node of nodes) {const level=levels.get(node.id)??1; const y=heights.get(level)??0;node.position={x:level*300,y};heights.set(level,y+Math.max(100,48+Math.max(node.data.inputs.length,node.data.outputs.length)*24)+35);}
  return {nodes,edges};
}
