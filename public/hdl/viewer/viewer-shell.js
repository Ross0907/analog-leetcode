// MIT. Presentation adapter for VCDrom's parsed lanes and native viewport.
import {RADICES,sampleAt,vectorSample,formatValue,numericValue,timeText,parseCursorTime,escapeSvgText} from './signal-values.mjs';
let active=null;
const svgNS='http://www.w3.org/2000/svg';
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function svg(tag,attributes){const node=document.createElementNS(svgNS,tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const colors=()=>{
  const light=document.documentElement.dataset.theme==='light';
  const palette=light?['#00000000','#b91c1c','#12734c','#12734c','#be123c','#176da7','#7c3aed','#176da7','#867600','#867600','#777777']:['#00000000','#ff8585','#71dcac','#71dcac','#ff8585','#7ac5ec','#c792ea','#7ac5ec','#d5ce77','#d5ce77','#b5bdc9'];
  const output=new Float32Array(64);
  palette.forEach((color,index)=>{if(color.length===9)return;for(let c=0;c<3;c++)output[index*4+c]=parseInt(color.slice(1+c*2,3+c*2),16)/255;output[index*4+3]=1;});return output;
};
function lanesFrom(wires){
  const lanes=[];
  function visit(node,path){
    if(node.kind==='var'){lanes.push({name:node.name,path:[...path,node.name].join('.'),ref:node.link,width:Math.max(1,Number(node.size)||1),format:{anacodeRadix:Number(node.size)===1?'binary':'hex',anacodeWidth:Number(node.size)||1},anacodeAnalog:false});return;}
    const next=node.name&&node.name!=='.'?[...path,node.name]:path;
    for(const child of node.body??[])visit(child,next);
  }
  visit(wires,[]);return lanes;
}
function attach({container,deso,cm}){
  active?.destroy();
  const {elo,pstate}=container,host=elo.container;
  const events=new AbortController(),cleanups=[];
  const listen=(target,type,callback,options={})=>target.addEventListener(type,callback,{...options,signal:events.signal});
  let cursorTime=0,selected=null,menu=null,drawQueued=0,previousWidth=0,locked=false,preferredSide=null,nameFraction=.5;
  try{const saved=JSON.parse(localStorage.getItem('anacode.hdl.columns')||'null');if(Number.isFinite(saved?.width)&&saved.width>=100&&saved.width<=1600)preferredSide=saved.width;if(Number.isFinite(saved?.nameFraction))nameFraction=clamp(saved.nameFraction,.15,.85);}catch{/* Storage may be unavailable. */}
  const lanes=lanesFrom(deso.wires),laneByPath=new Map(lanes.map(lane=>[lane.path,lane])),nativeRender=deso.render;
  deso.view=lanes;pstate.numLanes=lanes.length;
  host.classList.add('anacode-viewer');host.setAttribute('aria-label','Digital waveform timeline');
  elo.waveqlPanel.hidden=true;elo.waveqlPanel.setAttribute('aria-hidden','true');
  elo.cursor.hidden=true;elo.cursor.setAttribute('aria-hidden','true');
  const side=element('section','signal-pane');side.setAttribute('aria-label','Signals and cursor values');
  const header=element('div','signal-header');header.append(element('span','','Signal'),element('span','','Value'));
  const body=element('div','signal-scroll'),rowSpace=element('div','signal-space');body.append(rowSpace);
  const cursorReadout=element('output','cursor-readout');cursorReadout.setAttribute('aria-label','Waveform cursor time');
  const cursorControls=element('div','cursor-controls'),cursorInput=element('input','cursor-input'),cursorError=element('span','cursor-error');
  cursorInput.type='text';cursorInput.inputMode='decimal';cursorInput.maxLength=80;cursorInput.setAttribute('aria-label','Waveform cursor position');cursorInput.title='Cursor time in seconds or engineering units, e.g. 12.345 ns. Enter applies; Escape reverts.';cursorInput.spellcheck=false;
  cursorError.setAttribute('role','alert');cursorError.hidden=true;
  cursorControls.append(element('span','','Cursor'),cursorInput,cursorReadout,cursorError);
  side.append(header,body,cursorControls);host.append(side);
  const paneDivider=element('div','signal-resizer pane-resizer'),columnDivider=element('div','signal-resizer column-resizer');
  for(const [divider,label]of [[paneDivider,'Resize signal table'],[columnDivider,'Resize signal and value columns']]){divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-label',label);divider.title=label+' · drag, or use Left/Right arrows';side.append(divider);}
  const analog=svg('svg',{class:'analog-lanes','aria-label':'Analog signal display'});host.append(analog);
  const cursor=element('div','time-cursor'),cursorLabel=element('span','');cursor.append(cursorLabel);host.append(cursor);
  const tools=element('div','timeline-tools');
  for(const [label,text,action]of [['Fit timeline','Fit',()=>fit()],['Zoom out timeline','−',()=>zoom(2/3)],['Zoom in timeline','+',()=>zoom(1.5)]]){const button=element('button','',text);button.type='button';button.setAttribute('aria-label',label);listen(button,'click',action);tools.append(button);}host.append(tools);
  const lockButton=element('button','','Lock');lockButton.type='button';lockButton.setAttribute('aria-label','Lock waveform view');lockButton.setAttribute('aria-pressed','false');lockButton.title='Prevent accidental pan, zoom, and cursor changes';tools.append(lockButton);
  listen(lockButton,'click',()=>{locked=!locked;lockButton.textContent=locked?'Unlock':'Lock';lockButton.setAttribute('aria-pressed',String(locked));host.dataset.locked=String(locked);cursorInput.disabled=locked;for(const button of tools.querySelectorAll('button'))if(button!==lockButton)button.disabled=locked;});
  function columnBounds(){const width=host.clientWidth;return [Math.min(128,width*.45),Math.max(Math.min(128,width*.45),width*(width<600?.55:.72))];}
  function saveColumns(){try{localStorage.setItem('anacode.hdl.columns',JSON.stringify({width:preferredSide??pstate.sidebarWidth,nameFraction}));}catch{/* Keep resizing usable without storage. */}}
  function resizeColumn(divider,position){const [min,max]=columnBounds();if(divider===paneDivider)preferredSide=clamp(position,min,max);else nameFraction=clamp(position,Math.min(64,pstate.sidebarWidth*.35),pstate.sidebarWidth-Math.min(64,pstate.sidebarWidth*.35))/pstate.sidebarWidth;schedule();}
  for(const divider of [paneDivider,columnDivider]){
    listen(divider,'pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();divider.focus();divider.setPointerCapture(event.pointerId);});
    listen(divider,'pointermove',event=>{if(!divider.hasPointerCapture(event.pointerId))return;event.preventDefault();event.stopPropagation();resizeColumn(divider,event.clientX-host.getBoundingClientRect().left);});
    const finish=event=>{if(divider.hasPointerCapture(event.pointerId)){divider.releasePointerCapture(event.pointerId);saveColumns();}};
    listen(divider,'pointerup',finish);listen(divider,'pointercancel',finish);
    listen(divider,'keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const [min,max]=divider===paneDivider?columnBounds():[Math.min(64,pstate.sidebarWidth*.35),pstate.sidebarWidth-Math.min(64,pstate.sidebarWidth*.35)];const current=divider===paneDivider?pstate.sidebarWidth:pstate.sidebarWidth*nameFraction;resizeColumn(divider,event.key==='Home'?min:event.key==='End'?max:current+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?40:10));render();saveColumns();});
  }
  function closeMenu(){menu?.remove();menu=null;}
  function openMenu(lane,x,y){
    closeMenu();selected=lane;menu=element('div','signal-menu');menu.setAttribute('role','menu');menu.setAttribute('aria-label','Signal display: '+lane.path);
    menu.append(element('strong','',lane.path),element('span','menu-caption','Radix'));
    const labels={binary:'Binary',hex:'Hexadecimal',octal:'Octal',unsigned:'Unsigned decimal',signed:'Signed decimal',ascii:'ASCII'};
    function option(label,checked,action){const button=element('button','',label);button.type='button';button.setAttribute('role','menuitemradio');button.setAttribute('aria-checked',String(checked));listen(button,'click',()=>{action();closeMenu();render();host.focus();});menu.append(button);}
    for(const radix of RADICES)option(labels[radix],lane.format.anacodeRadix===radix,()=>{lane.format.anacodeRadix=radix;});
    menu.append(element('span','menu-caption','Visualization'));
    option('Digital',!lane.anacodeAnalog,()=>{lane.anacodeAnalog=false;});
    option('Analog · unsigned',lane.anacodeAnalog==='unsigned',()=>{lane.anacodeAnalog='unsigned';});
    option('Analog · signed',lane.anacodeAnalog==='signed',()=>{lane.anacodeAnalog='signed';});
    document.body.append(menu);const box=menu.getBoundingClientRect();menu.style.left=clamp(x,5,innerWidth-box.width-5)+'px';menu.style.top=clamp(y,5,innerHeight-box.height-5)+'px';menu.querySelector('button').focus();
  }
  function value(lane){const pair=vectorSample(deso.chango[lane.ref],sampleAt(deso.chango[lane.ref]?.wave,cursorTime));return pair?formatValue(...pair,lane.width,lane.format.anacodeRadix):'—';}
  function rows(){
    const fragment=document.createDocumentFragment(),start=Math.max(0,Math.floor(pstate.yOffset/pstate.yStep)),end=Math.min(lanes.length,start+Math.ceil(body.clientHeight/pstate.yStep)+2);
    rowSpace.style.height=lanes.length*pstate.yStep+'px';
    for(let index=start;index<end;index++){
      const lane=lanes[index],row=element('div','signal-row');row.style.top=index*pstate.yStep+'px';row.dataset.signal=lane.path;row.dataset.radix=lane.format.anacodeRadix;row.dataset.visualization=lane.anacodeAnalog||'digital';row.setAttribute('role','row');
      if(lane===selected)row.dataset.selected='true';
      const name=element('button','signal-name',lane.path);name.type='button';name.title=lane.path+' · '+lane.width+' bit'+(lane.width===1?'':'s')+' · signal options';name.setAttribute('aria-label','Signal options: '+lane.path);name.setAttribute('aria-haspopup','menu');
      const cell=element('output','signal-value',value(lane));cell.title=cell.textContent;cell.setAttribute('aria-label','Value of '+lane.path);
      row.append(name,cell);fragment.append(row);
      // These short-lived row listeners are reclaimed with the virtual rows.
      const show=event=>{event.preventDefault();event.stopPropagation();const box=row.getBoundingClientRect();openMenu(lane,event.clientX||box.left,event.clientY||box.bottom);};
      name.addEventListener('click',show);row.addEventListener('contextmenu',show);
      row.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')show(event);});
    }
    rowSpace.replaceChildren(fragment);
  }
  function updateValues(){for(const row of rowSpace.children){const lane=laneByPath.get(row.dataset.signal);if(lane){const cell=row.querySelector('output');cell.textContent=value(lane);cell.title=cell.textContent;}}}
  function drawAnalog(){
    analog.setAttribute('width',pstate.width);analog.setAttribute('height',pstate.height);
    const children=[],start=Math.max(0,Math.floor(pstate.yOffset/pstate.yStep)),end=Math.min(lanes.length,start+Math.ceil(pstate.height/pstate.yStep));
    for(let index=start;index<end;index++){
      const lane=lanes[index];if(!lane.anacodeAnalog)continue;
      const chang=deso.chango[lane.ref];if(!chang?.wave?.length)continue;
      const cacheKey=lane.anacodeAnalog;
      if(lane.cachedMode!==cacheKey){
        let min=Infinity,max=-Infinity;
        lane.numericPoints=chang.wave.map(sample=>{const pair=vectorSample(chang,sample),number=numericValue(...pair,lane.width,cacheKey==='signed');if(number!==null){min=Math.min(min,number);max=Math.max(max,number);}return [sample[0],number];});
        lane.range=Number.isFinite(min)?[min,max===min?min+1:max]:[0,1];lane.cachedMode=cacheKey;
      }
      const top=pstate.topBarHeight+index*pstate.yStep-pstate.yOffset,range=lane.range,points=lane.numericPoints;
      const y=number=>top+pstate.yStep-4-(number-range[0])/(range[1]-range[0])*(pstate.yStep-8);
      const leftTime=(pstate.sidebarWidth-pstate.xOffset)/pstate.xScale,rightTime=(pstate.width-pstate.xOffset)/pstate.xScale;
      let first=0,hi=points.length;while(first<hi){const mid=(first+hi)>>>1;if(points[mid][0]<leftTime)first=mid+1;else hi=mid;}first=Math.max(0,first-1);
      let last=first;while(last<points.length&&points[last][0]<=rightTime)last++;
      // Preserve min/max envelopes when multiple real samples occupy one pixel.
      const stride=Math.max(1,Math.ceil((last-first)/Math.max(1,pstate.width-pstate.sidebarWidth)));
      let path='',connected=false;
      for(let i=first;i<last;i+=stride){
        const x=clamp(points[i][0]*pstate.xScale+pstate.xOffset,pstate.sidebarWidth,pstate.width);
        let min=Infinity,max=-Infinity,unknown=false;
        for(let j=i;j<Math.min(last,i+stride);j++){const number=points[j][1];if(number===null){unknown=true;break;}min=Math.min(min,number);max=Math.max(max,number);}
        if(unknown){connected=false;continue;}
        const currentY=y(points[i][1]);path+=(connected?'H':'M')+x+(connected?'V':' ')+currentY;
        if(stride>1&&max>min)path+='V'+y(min)+'V'+y(max)+'V'+currentY;
        const next=points[Math.min(points.length-1,i+stride)];
        const endTime=i+stride<points.length?next[0]:deso.time;
        path+='H'+clamp(endTime*pstate.xScale+pstate.xOffset,pstate.sidebarWidth,pstate.width);connected=true;
      }
      const line=svg('path',{d:path,class:'analog-trace','data-signal':lane.path,fill:'none'});const title=svg('title',{});title.textContent=lane.path+' · '+lane.anacodeAnalog+' numeric values · range '+range.join(' to ');line.append(title);children.push(line);
    }
    analog.replaceChildren(...children);
  }
  function drawCursor(){
    const x=cursorTime*pstate.xScale+pstate.xOffset,visible=x>=pstate.sidebarWidth&&x<=pstate.width;
    cursor.hidden=!visible;cursor.style.left=x+'px';cursor.style.top=pstate.topBarHeight+'px';cursor.style.bottom=pstate.botBarHeight+'px';cursorLabel.textContent=timeText(cursorTime,deso.tgcd,deso.timescale);cursorLabel.style.transform=x>pstate.width-110?'translateX(-100%)':'none';
    cursorReadout.textContent='Cursor '+timeText(cursorTime,deso.tgcd,deso.timescale);cursorReadout.dataset.time=String(cursorTime);
    cursorReadout.dataset.timeSeconds=String(cursorTime*deso.tgcd*10**deso.timescale);
    if(document.activeElement!==cursorInput)cursorInput.value=timeText(cursorTime,deso.tgcd,deso.timescale,12);
  }
  listen(cursorInput,'input',()=>{cursorError.hidden=true;cursorInput.removeAttribute('aria-invalid');});
  listen(cursorInput,'keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();cursorInput.value=timeText(cursorTime,deso.tgcd,deso.timescale,12);cursorInput.removeAttribute('aria-invalid');cursorError.hidden=true;}
    if(event.key!=='Enter')return;
    event.preventDefault();
    const next=parseCursorTime(cursorInput.value,deso.tgcd,deso.timescale,deso.time);
    if(next===null){cursorError.textContent='Enter 0 to '+timeText(deso.time,deso.tgcd,deso.timescale,12)+'.';cursorError.hidden=false;cursorInput.setAttribute('aria-invalid','true');return;}
    cursorTime=next;cursorError.hidden=true;cursorInput.removeAttribute('aria-invalid');cursorInput.value=timeText(cursorTime,deso.tgcd,deso.timescale,12);drawCursor();updateValues();
  });
  function render(){
    if(!host.isConnected)return;
    const width=host.clientWidth,height=host.clientHeight;if(width<1||height<1)return;
    const [minSide,maxSide]=columnBounds(),sideWidth=clamp(preferredSide??Math.min(300,Math.round(width*.36)),minSide,maxSide),span=Math.max(1,deso.time);
    const oldSide=pstate.sidebarWidth,oldMinimum=pstate.xScaleMin,oldScale=pstate.xScale,oldOffset=pstate.xOffset;
    pstate.width=width;pstate.height=height;pstate.sidebarWidth=sideWidth;pstate.xScaleMin=(width-sideWidth)/span;pstate.xScaleMax=Math.max(1000,pstate.xScaleMin);
    if(!previousWidth||!Number.isFinite(pstate.xScale)||!Number.isFinite(pstate.xOffset)){pstate.xScale=pstate.xScaleMin;pstate.xOffset=sideWidth;}else{pstate.xScale=Math.max(pstate.xScaleMin,pstate.xScale);}
    if(previousWidth&&(previousWidth!==width||oldSide!==sideWidth)){const leftTime=(oldSide-oldOffset)/oldScale;pstate.xScale=clamp(oldScale/oldMinimum*pstate.xScaleMin,pstate.xScaleMin,pstate.xScaleMax);pstate.xOffset=sideWidth-leftTime*pstate.xScale;}
    previousWidth=width;pstate.xOffset=clamp(pstate.xOffset,width-pstate.xScale*span,sideWidth);pstate.xCursor=clamp(cursorTime*pstate.xScale+pstate.xOffset,sideWidth,width);pstate.yOffset=body.scrollTop;
    const nameWidth=clamp(sideWidth*nameFraction,Math.min(64,sideWidth*.35),sideWidth-Math.min(64,sideWidth*.35));
    host.style.setProperty('--signal-width',sideWidth+'px');host.style.setProperty('--signal-name-width',nameWidth+'px');host.style.setProperty('--lane-offset',-pstate.yOffset+'px');
    for(const [divider,min,max,current]of [[paneDivider,minSide,maxSide,sideWidth],[columnDivider,Math.min(64,sideWidth*.35),sideWidth-Math.min(64,sideWidth*.35),nameWidth]]){divider.setAttribute('aria-valuemin',String(Math.round(min)));divider.setAttribute('aria-valuemax',String(Math.round(max)));divider.setAttribute('aria-valuenow',String(Math.round(current)));divider.setAttribute('aria-valuetext',Math.round(current)+' pixels');}
    nativeRender();
    // Centered native tick captions at the plot edge would otherwise be cut in half.
    for(const label of elo.grid.querySelectorAll('text.wd-grid-time')){const x=Number(label.getAttribute('x')),half=label.getComputedTextLength()/2;label.style.textAnchor='middle';if(x-half<sideWidth+4){label.style.textAnchor='start';label.setAttribute('x',String(sideWidth+4));}else if(x+half>width-4){label.style.textAnchor='end';label.setAttribute('x',String(width-4));}}
    rows();drawAnalog();drawCursor();
  }
  function schedule(){if(!drawQueued)drawQueued=requestAnimationFrame(()=>{drawQueued=0;render();});}
  function fit(){if(locked)return;pstate.xScale=pstate.xScaleMin;pstate.xOffset=pstate.sidebarWidth;render();}
  function zoom(factor){if(locked)return;const anchor=clamp(cursorTime*pstate.xScale+pstate.xOffset,pstate.sidebarWidth,pstate.width),time=(anchor-pstate.xOffset)/pstate.xScale;pstate.xScale=clamp(pstate.xScale*factor,pstate.xScaleMin,pstate.xScaleMax);pstate.xOffset=anchor-time*pstate.xScale;render();}
  function setCursor(event){if(locked)return;const rect=host.getBoundingClientRect(),x=event.clientX-rect.left;if(x<pstate.sidebarWidth||event.clientY-rect.top<24)return;cursorTime=clamp((x-pstate.xOffset)/pstate.xScale,0,deso.time);pstate.xCursor=x;drawCursor();updateValues();}
  for(const type of ['pointerdown','pointermove','pointerup','mousedown','mousemove','mouseup','dblclick'])listen(host,type,event=>{if(locked&&!event.target.closest('button,input,.signal-pane')){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  listen(host,'pointerdown',event=>{if(event.button!==0||event.target.closest('button,.signal-pane'))return;closeMenu();host.focus();setCursor(event);host.setPointerCapture(event.pointerId);}, {capture:true});
  listen(host,'pointermove',event=>{if(host.hasPointerCapture(event.pointerId))setCursor(event);});
  listen(host,'pointerup',event=>{if(host.hasPointerCapture(event.pointerId))host.releasePointerCapture(event.pointerId);});
  listen(host,'contextmenu',event=>{const rect=host.getBoundingClientRect(),index=Math.floor((event.clientY-rect.top-pstate.topBarHeight+pstate.yOffset)/pstate.yStep);if(event.clientX-rect.left>=pstate.sidebarWidth&&lanes[index]){event.preventDefault();openMenu(lanes[index],event.clientX,event.clientY);}});
  listen(body,'scroll',schedule);
  listen(host,'wheel',event=>{event.preventDefault();event.stopImmediatePropagation();if(locked&&(event.ctrlKey||event.metaKey||event.shiftKey||!event.target.closest('.signal-pane')))return;const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?host.clientHeight:1);if(event.ctrlKey||event.metaKey){zoom(delta>0?2/3:1.5);}else if(event.shiftKey){pstate.xOffset-=delta;render();}else{body.scrollTop+=delta;schedule();}}, {capture:true,passive:false});
  listen(host,'keydown',event=>{
    if(event.key==='Escape'){closeMenu();return;}
    if(locked&&!event.target.closest('button,input,.signal-pane')&&event.key!=='Tab'){event.preventDefault();event.stopImmediatePropagation();return;}
    if(!event.altKey)return;
    const action=({'0':fit,'=':()=>zoom(1.5),'+':()=>zoom(1.5),'-':()=>zoom(2/3),',':()=>{pstate.xOffset+=pstate.width*.2;render();},'.':()=>{pstate.xOffset-=pstate.width*.2;render();},'[':()=>{pstate.xOffset=pstate.sidebarWidth;render();},']':()=>{pstate.xOffset=pstate.width-pstate.xScale*Math.max(1,deso.time);render();}})[event.key];
    if(action){event.preventDefault();event.stopImmediatePropagation();action();}
  },{capture:true});
  listen(document,'pointerdown',event=>{if(menu&&!menu.contains(event.target))closeMenu();},{capture:true});
  listen(document,'keydown',event=>{if(!menu)return;const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();closeMenu();host.focus();}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}});
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});cleanups.push(()=>observer.disconnect());
  deso.render=render;active={destroy(){events.abort();cleanups.forEach(clean=>clean());cancelAnimationFrame(drawQueued);closeMenu();cm.view.destroy();}};
  render();host.focus();host.dataset.viewerReady='true';
}
window.AnacodeVcdrom={attach,formatValue,colors,escapeSvgText};
