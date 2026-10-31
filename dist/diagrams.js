(function(root){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cache=new Map(),stages=new Map();
const coordinate=n=>{const rounded=num(n);return (rounded===n?'':'≈')+rounded;};
const num=n=>{if(!Number.isFinite(n))throw Error('Invalid diagram coordinate');return Number(n.toFixed(3));};
// Include hidden series so line styles stay stable while revealing stages.
function seriesDash(d,s){
 if(s.role==='area')return s.dashed?'6 4':'none';
 const siblings=(d.series||[]).filter(e=>(e.role||'base')===(s.role||'base'));
 const index=siblings.indexOf(s);
 const patterns=s.dashed?['6 4','12 4 2 4','2 4','10 3 2 3 2 3']:['none','10 4','2 4','12 4 2 4','10 3 2 3 2 3'];
 return patterns[index%patterns.length];
}
function flowLines(label){
 const tokens=String(label).match(/[A-Za-z0-9.,%+−=()]+|[^A-Za-z0-9.,%+−=()]/gu)||[''];
 const width=t=>Array.from(t).reduce((sum,c)=>sum+(/[\x00-\x7f]/.test(c)?.55:1),0);
 const lines=[];let line='',used=0;
 for(const token of tokens){const size=width(token);if(line&&used+size>10.5){lines.push(line);line='';used=0;}line+=token;used+=size;}
 if(line||!lines.length)lines.push(line);return lines;
}
const textWidth=(value,size=17)=>Array.from(String(value)).reduce((sum,c)=>sum+(/[\x00-\x7f]/.test(c)?size*.65:size),0);
const directionKey=(item,index,flow=false)=>{
 const name=item.shortLabel||item.label||'',limit=flow?32:112;
 return textWidth(name,14)<=limit?name:(index<20?String.fromCodePoint(0x2460+index):'R'+(index+1));
};
const overlaps=(a,b,pad=3)=>a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;
function annotation(value,anchor,occupied,bounds={left:8,right:672,top:19,bottom:397}){
 const width=textWidth(value,14)+4,height=17;
 const box=(cx,baseline)=>({x:Math.max(bounds.left,Math.min(bounds.right-width,cx-width/2)),y:Math.max(bounds.top,Math.min(bounds.bottom-height,baseline-height+3)),w:width,h:height});
 const options=[[0,-12],[0,25],[24,-12],[-24,-12],[0,-34],[0,47],[48,-12],[-48,-12],[48,25],[-48,25]].map(([dx,dy])=>box(anchor[0]+dx,anchor[1]+dy));
 for(let cy=bounds.top+height;cy<bounds.bottom;cy+=25)for(let cx=bounds.left+width/2;cx<bounds.right-width/2;cx+=40)options.push(box(cx,cy));
 for(const r of options)r.score=occupied.filter(o=>overlaps(r,o)).length*100000+Math.hypot(r.x+r.w/2-anchor[0],r.y+r.h/2-anchor[1]);
 options.sort((a,b)=>a.score-b.score);
 const chosen=options[0];occupied.push(chosen);
 return {...chosen,baseline:chosen.y+height-3};
}
function placePlotLabel(value,preferred,anchor,occupied,alternatives=[]){
 const width=textWidth(value,17)+4,height=21;
 const make=(left,baseline,at)=>({x:Math.max(4,Math.min(676-width,left)),baseline:Math.max(43,Math.min(331,baseline)),w:width,h:height,anchor:at});
 const options=[make(preferred[0],preferred[1],anchor)];
 for(const at of [anchor,...alternatives])for(const [left,baseline] of [[at[0]+8,at[1]-10],[at[0]-width-8,at[1]-10],[at[0]+8,at[1]+24],[at[0]-width-8,at[1]+24],[at[0]-width/2,at[1]-24],[at[0]-width/2,at[1]+24]])options.push(make(left,baseline,at));
 for(const item of options){
  item.y=item.baseline-height+4;
  item.score=occupied.filter(r=>overlaps(item,r)).length*100000+Math.hypot(item.x-preferred[0],item.baseline-preferred[1])*.35+Math.hypot(item.x+width/2-item.anchor[0],item.baseline-height/2-item.anchor[1])*.1;
 }
 options.sort((a,b)=>a.score-b.score);
 const chosen=options[0];occupied.push(chosen);return chosen;
}
function flowRoute(from,to,nodes,position,previous=[]){
 const obstacles=nodes.map(n=>{const [x,y]=position(n);return{x:x-3,y:y-3,w:186,h:86};});
 const ports=n=>{const [x,y]=position(n);return[
  [[x-4,y+40],[x-12,y+40]],[[x+184,y+40],[x+192,y+40]],
  [[x+90,y-4],[x+90,y-12]],[[x+90,y+84],[x+90,y+92]]
 ];};
 const blocked=(a,b)=>obstacles.some(r=>a[0]===b[0]?a[0]>r.x&&a[0]<r.x+r.w&&Math.max(a[1],b[1])>r.y&&Math.min(a[1],b[1])<r.y+r.h:a[1]>r.y&&a[1]<r.y+r.h&&Math.max(a[0],b[0])>r.x&&Math.min(a[0],b[0])<r.x+r.w);
 const clean=points=>points.filter((p,i)=>!i||p.some((v,j)=>v!==points[i-1][j])).filter((p,i,all)=>!i||i===all.length-1||!(all[i-1][0]===p[0]&&p[0]===all[i+1][0]||all[i-1][1]===p[1]&&p[1]===all[i+1][1]));
 const xs=[8,672,...obstacles.flatMap(r=>[r.x-10,r.x+r.w+10])].filter(x=>x>=8&&x<=672);
 const ys=[14,396,...obstacles.flatMap(r=>[r.y-10,r.y+r.h+10])].filter(y=>y>=14&&y<=396);
 const candidates=[];
 for(const [a,s] of ports(from))for(const [b,t] of ports(to)){
  const add=middle=>{const route=clean([a,s,...middle,t,b]);if(route.some(p=>p[0]<4||p[0]>676||p[1]<4||p[1]>406)||route.slice(1).some((p,i)=>blocked(route[i],p)))return;candidates.push(route);};
  if(s[0]===t[0]||s[1]===t[1])add([]);
  add([[s[0],t[1]]]);add([[t[0],s[1]]]);
  for(const x of xs)add([[x,s[1]],[x,t[1]]]);
  for(const y of ys)add([[s[0],y],[t[0],y]]);
 }
 const score=route=>route.slice(1).reduce((total,p,i)=>{
  const a=route[i];let reused=0;
  for(const old of previous)for(let k=1;k<old.length;k++){
   const b=old[k-1],c=old[k];
   if(a[0]===p[0]&&b[0]===c[0]&&a[0]===b[0]&&Math.min(Math.max(a[1],p[1]),Math.max(b[1],c[1]))>Math.max(Math.min(a[1],p[1]),Math.min(b[1],c[1]))+2)reused+=500;
   if(a[1]===p[1]&&b[1]===c[1]&&a[1]===b[1]&&Math.min(Math.max(a[0],p[0]),Math.max(b[0],c[0]))>Math.max(Math.min(a[0],p[0]),Math.min(b[0],c[0]))+2)reused+=500;
  }
  return total+Math.hypot(p[0]-a[0],p[1]-a[1])+reused;
 },route.length*15);
 candidates.sort((a,b)=>score(a)-score(b));
 if(!candidates.length)throw Error('No clear route between flow nodes');
 return candidates[0];
}
function directionLegend(d,stage){
 const items=(d.kind==='flow'?d.edges||[]:d.arrows||[]).map((item,index)=>({item,index})).filter(({item})=>(item.stage??0)<=stage&&item.label);
 if(!items.length)return '';
 return `<ul class="diagram-directions" aria-label="图中关系与方向">${items.map(({item,index})=>{
  const key=directionKey(item,index,d.kind==='flow'),meaning=d.kind==='flow'?d.nodes.find(n=>n.id===item.from).label+' → '+d.nodes.find(n=>n.id===item.to).label+(key===item.label?'':'：'+item.label):key===item.label?'':item.label;
  return `<li data-direction-item="${index}"><span class="diagram-direction-key">${esc(key)}</span>${meaning?`<span>${esc(meaning)}</span>`:''}</li>`;
 }).join('')}</ul>`;
}
function sourceCorrection(d){
 const e=d.erratum;if(!e)return '';
 return `<aside class="diagram-correction" role="note" aria-label="本题解答核查更正"><h4>${esc(e.title)}</h4><p>${esc(e.explanation)}</p><ul>${e.checks.map(item=>`<li>${esc(item)}</li>`).join('')}</ul><details><summary>查看需更正的原句</summary><blockquote>${esc(e.original_quote)}</blockquote><p>原编制解答保留供对照，本处结论以核查更正为准。</p></details></aside>`;
}
function plotText(value,px,py,attributes=''){
 const width=textWidth(value),left=Math.max(4,Math.min(676-width,px)),baseline=Math.max(42,Math.min(332,py));
 return `<text x="${num(left)}" y="${num(baseline)}" ${attributes}>${esc(value)}</text>`;
}
function svg(d,stage,printing=false,context=''){
 const id='diagram-'+context+(printing?'print-':'step-'+stage+'-')+String(d.id).replace(/[^a-z0-9_-]/gi,'');
 let body='';
 const visible=a=>(a||[]).filter(e=>(e.stage??0)<=stage);
 if(d.kind==='flow'){
 const nodes=d.nodes||[],cols=Math.max(1,...nodes.map(n=>n.column+1)),rows=Math.max(1,...nodes.map(n=>n.row+1));
 const pos=n=>[20+n.column*650/cols,35+n.row*350/rows];
 const occupied=nodes.map(n=>{const [x,y]=pos(n);return{x:x-5,y:y-5,w:190,h:90};}),routes=[];
 let edgeLabels='';
 // Route every stage against the same nodes so later reveals never move an earlier connection.
 for(const [index,e] of (d.edges||[]).entries()){
  const a=nodes.find(n=>n.id===e.from),b=nodes.find(n=>n.id===e.to);if(!a||!b)throw Error('Unknown flow endpoint');if(a===b)throw Error('Overlapping flow nodes');
  const points=flowRoute(a,b,nodes,pos,routes);routes.push(points);
  if((e.stage??0)>stage)continue;
  body+=`<path data-edge-index="${index}" class="diagram-reference" d="${points.map((p,i)=>(i?'L':'M')+num(p[0])+' '+num(p[1])).join(' ')}" marker-end="url(#${id}-arrow)"/>`;
  if(e.label){
   const segments=points.slice(1).map((p,i)=>({a:points[i],b:p,length:Math.hypot(p[0]-points[i][0],p[1]-points[i][1])})).sort((a,b)=>b.length-a.length),segment=segments[0],anchor=[(segment.a[0]+segment.b[0])/2,(segment.a[1]+segment.b[1])/2];
   const key=directionKey(e,index,true),label=annotation(key,anchor,occupied);
   edgeLabels+=`<path class="diagram-annotation-leader" d="M${num(anchor[0])} ${num(anchor[1])}L${num(label.x+label.w/2)} ${num(label.baseline+2)}"/><text class="diagram-edge-label" data-relation-index="${index}" x="${num(label.x)}" y="${num(label.baseline)}">${esc(key)}</text>`;
  }
 }
 for(const n of visible(nodes)){const[x,y]=pos(n);const lines=flowLines(n.label),lineHeight=Math.min(20,64/Math.max(1,lines.length-1)),fontSize=Math.min(15,lineHeight*.8),baseline=40-(lines.length-1)*lineHeight/2+fontSize/3;body+=`<rect class="diagram-node" x="${num(x)}" y="${num(y)}" width="180" height="80" rx="4"/><text style="font-size:${num(fontSize)}px" x="${num(x+90)}" y="${num(y+baseline)}" text-anchor="middle">${lines.map((s,i)=>`<tspan x="${num(x+90)}" dy="${i?num(lineHeight):0}">${esc(s)}</tspan>`).join('')}</text>`;}
 body+=edgeLabels;
 }else{
 const a=d.axes;if(!a||a.x.max<=a.x.min||a.y.max<=a.y.min)throw Error('Invalid diagram axes');
 const x=v=>num(75+(v-a.x.min)/(a.x.max-a.x.min)*530),y=v=>num(340-(v-a.y.min)/(a.y.max-a.y.min)*280);
 const originX=x(Math.max(a.x.min,Math.min(a.x.max,0))),originY=y(Math.max(a.y.min,Math.min(a.y.max,0)));
 const projections=(d.points||[]).filter(p=>p.projection!==false);
 const axisLabels={x:[],y:[]};
 // Merge only currently visible symbols; later stages must not reveal future labels.
 for(const p of visible(projections))for(const axis of ['x','y']){
  const value=p[axis],label=String(p[axis+'Label']??a[axis].ticks?.find(t=>Math.abs(t.value-value)<1e-8)?.label??coordinate(value));
  const existing=axisLabels[axis].find(t=>Math.abs(t.value-value)<1e-8);
  if(existing){if(!existing.labels.includes(label))existing.labels.push(label);}
  else axisLabels[axis].push({value,labels:[label],stage:0});
 }
 const positions={x:[],y:[]};
 for(const axis of ['x','y'])positions[axis]=axisLabels[axis].map(item=>({...item,label:item.labels.join('='),center:axis==='x'?x(item.value):y(item.value)})).sort((a,b)=>a.center-b.center);
 // One ordered baseline per y value, with a leader back to the exact coordinate.
 let previous=31;
 for(const p of positions.y){p.baseline=Math.max(p.center+4,previous+18);previous=p.baseline;}
 if(previous>340){let next=358;for(let i=positions.y.length-1;i>=0;i--){const p=positions.y[i];p.baseline=Math.min(p.baseline,next-18);next=p.baseline;}}
 // Pack x labels by measured-width estimates instead of wrapping lanes modulo three.
 const xRows=[[]];let rowWidth=0;
 for(const p of positions.x){p.width=textWidth(p.label,12)+8;if(rowWidth+p.width+8>640&&xRows.at(-1).length){xRows.push([]);rowWidth=0;}p.lane=xRows.length-1;xRows.at(-1).push(p);rowWidth+=p.width+8;}
 for(const row of xRows){let right=4;for(const p of row){p.labelX=Math.max(p.center,right+p.width/2);right=p.labelX+p.width/2+8;}if(right>676){let next=676;for(let i=row.length-1;i>=0;i--){const p=row[i];p.labelX=Math.min(p.labelX,next-p.width/2);next=p.labelX-p.width/2-8;}}}
 const occupied=[];
 body+=`<path class="diagram-axis" d="M${originX} 340V45" marker-end="url(#${id}-arrow)"/><path class="diagram-axis" d="M75 ${originY}H625" marker-end="url(#${id}-arrow)"/><text class="diagram-axis-title" x="625" y="405" text-anchor="end">${esc(a.x.label)}</text><text class="diagram-axis-title" x="20" y="25">${esc(a.y.label)}</text>`;
 for(const axis of ['x','y']){
  const ticks=a[axis].ticks??(d.mode==='numeric'?Array.from({length:5},(_,i)=>({value:a[axis].min+(a[axis].max-a[axis].min)*i/4})):[]);
  for(const tick of ticks){if(axis==='y'&&Math.abs(tick.value)<1e-8&&(positions.x.some(p=>Math.abs(p.value)<1e-8)||d.mode==='numeric'||a.x.ticks?.some(t=>Math.abs(t.value)<1e-8)))continue;const center=axis==='x'?x(tick.value):y(tick.value);if(positions[axis].some(p=>Math.abs(p.center-center)<(axis==='x'?35:16)||(axis==='y'?Math.abs(p.baseline-center-4)<18:Math.abs(p.labelX-center)<p.width/2+12)))continue;
   const label=tick.label??coordinate(tick.value),width=textWidth(label,11);
   occupied.push(axis==='x'?{x:center-width/2,y:originY+9,w:width,h:17}:{x:originX-10-width,y:center-9,w:width,h:17});
   body+=axis==='x'?`<text class="diagram-tick" x="${center}" y="${originY+22}" text-anchor="middle">${esc(label)}</text>`:`<text class="diagram-tick" x="${originX-10}" y="${center+4}" text-anchor="end">${esc(label)}</text>`;
  }
 }
 for(const p of visible(projections))body+=`<path data-projection="${esc(p.id)}" class="diagram-projection" d="M${x(p.x)} ${originY}V${y(p.y)}H${originX}"/>`;
 for(const s of visible(d.series).sort((a,b)=>(a.role==='area'?0:1)-(b.role==='area'?0:1))){if(!s.points?.length)throw Error('Empty diagram series');body+=`<path data-series-id="${esc(s.id)}" class="diagram-${esc(s.role||'base')}" style="stroke-dasharray:${seriesDash(d,s)}" d="${s.points.map((p,i)=>(i?'L':'M')+x(p[0])+' '+y(p[1])).join(' ')}${s.closed?'Z':''}"/>`;}
 for(const [index,a] of (d.arrows||[]).entries())if((a.stage??0)<=stage)body+=`<path data-direction-index="${index}" class="diagram-change" d="M${x(a.from[0])} ${y(a.from[1])}L${x(a.to[0])} ${y(a.to[1])}" marker-end="url(#${id}-arrow)"/>`;
 for(const p of positions.x)occupied.push({x:p.labelX-p.width/2,y:originY+8+p.lane*18,w:p.width,h:18});
 for(const p of positions.y)occupied.push({x:Math.max(4,originX-12-textWidth(p.label,12)),y:p.baseline-13,w:textWidth(p.label,12),h:18});
 for(const p of visible(d.points)){body+=`<circle class="diagram-dot" cx="${x(p.x)}" cy="${y(p.y)}" r="4"/>`;occupied.push({x:x(p.x)-5,y:y(p.y)-5,w:10,h:10});}
 for(const p of visible(d.points)){
  const anchor=[x(p.x),y(p.y)],label=placePlotLabel(p.label,[anchor[0]+(p.dx??8),anchor[1]+(p.dy??-10)],anchor,occupied);
  if(Math.hypot(label.x+label.w/2-anchor[0],label.baseline-8-anchor[1])>32)body+=`<path class="diagram-annotation-leader" d="M${anchor[0]} ${anchor[1]}L${num(label.x+label.w/2)} ${num(label.baseline-5)}"/>`;
  body+=`<text class="diagram-point-label" data-point-label="${esc(p.id)}" x="${num(label.x)}" y="${num(label.baseline)}">${esc(p.label)}</text>`;
 }
 for(const l of visible(d.labels)){
  const curve=(d.series||[]).find(s=>s.id===l.curve_id),anchor=l.curve_anchor?.map((v,i)=>i?y(v):x(v))||[x(l.x),y(l.y)];
  const alternatives=curve?curve.points.filter((_,i)=>i%Math.max(1,Math.floor(curve.points.length/16))===0).map(p=>[x(p[0]),y(p[1])]):[];
  const label=placePlotLabel(l.text,[x(l.x),y(l.y)],anchor,occupied,alternatives);
  if(Math.hypot(label.x+label.w/2-label.anchor[0],label.baseline-8-label.anchor[1])>24)body+=`<path class="diagram-annotation-leader" d="M${label.anchor[0]} ${label.anchor[1]}L${num(label.x+label.w/2)} ${num(label.baseline-5)}"/>`;
  body+=`<text class="diagram-curve-label" data-curve-label-for="${esc(l.curve_id||'')}" data-label-anchor="${label.anchor.map(num).join(',')}" x="${num(label.x)}" y="${num(label.baseline)}">${esc(l.text)}</text>`;
 }
 for(const [index,arrow] of (d.arrows||[]).entries())if((arrow.stage??0)<=stage&&arrow.label){
  const key=directionKey(arrow,index),anchor=[(x(arrow.from[0])+x(arrow.to[0]))/2,(y(arrow.from[1])+y(arrow.to[1]))/2];
  occupied.push({x:Math.min(x(arrow.from[0]),x(arrow.to[0]))-6,y:Math.min(y(arrow.from[1]),y(arrow.to[1]))-6,w:Math.abs(x(arrow.to[0])-x(arrow.from[0]))+12,h:Math.abs(y(arrow.to[1])-y(arrow.from[1]))+12});
  const label=annotation(key,anchor,occupied,{left:80,right:615,top:46,bottom:328});
  body+=`<path class="diagram-annotation-leader" d="M${num(anchor[0])} ${num(anchor[1])}L${num(label.x+label.w/2)} ${num(label.baseline+2)}"/><text class="diagram-direction-label" data-direction-label="${index}" x="${num(label.x)}" y="${num(label.baseline)}">${esc(key)}</text>`;
 }
 for(const p of positions.x){
  const baseline=Math.min(386,originY+20+p.lane*18);
  body+=`<path class="diagram-projection-leader" d="M${p.center} ${originY+2}L${num(p.labelX)} ${baseline-12}"/><text class="diagram-projection-label" data-axis="x" x="${num(p.labelX)}" y="${baseline}" text-anchor="middle">${esc(p.label)}</text>`;
 }
 for(const p of positions.y){
  if(Math.abs(p.value)<1e-8&&positions.x.some(x=>Math.abs(x.value)<1e-8&&x.label===p.label))continue;
  const labelX=Math.max(textWidth(p.label,12)+4,originX-12);
  body+=`<path class="diagram-projection-leader" d="M${originX-2} ${p.center}L${num(labelX+3)} ${num(p.baseline-4)}"/><text class="diagram-projection-label" data-axis="y" x="${num(labelX)}" y="${num(p.baseline)}" text-anchor="end">${esc(p.label)}</text>`;
 }


 }
 return `<svg viewBox="0 0 680 410" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${esc(d.title)}</title><desc id="${id}-desc">${esc(d.stages[stage].explanation)}</desc><defs><marker id="${id}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="currentColor"/></marker></defs>${body}</svg>`;
}
function frame(d,stage,printing=false,context=''){const s=d.stages[stage];return `<div class="diagram-screen" data-current-stage="${stage}"><div class="diagram-canvas" tabindex="0" role="region" aria-label="图形，可横向滚动查看">${svg(d,stage,printing,context)}</div><ul class="diagram-legend">${(d.series||[]).filter(e=>(e.stage??0)<=stage).map(e=>`<li class="legend-${esc(e.role||'base')}"><svg class="diagram-legend-swatch" viewBox="0 0 36 12" aria-hidden="true"><path class="diagram-${esc(e.role||'base')}" style="stroke-dasharray:${seriesDash(d,e)}" d="M1 6H35"/></svg>${esc(e.label)}</li>`).join('')}</ul>${directionLegend(d,stage)}<details class="diagram-text"><summary>图形文字说明</summary>${d.kind!=='flow'?`<p>横轴：${esc(d.axes.x.label)}；纵轴：${esc(d.axes.y.label)}。</p>`:''}<ul>${(d.kind==='flow'?d.nodes||[]:d.points||[]).filter(p=>(p.stage??0)<=stage).map(p=>`<li>${esc(p.label)}${p.description?'：'+esc(p.description):''}${d.kind==='flow'?': '+esc(p.detail||''):': ('+esc(coordinate(p.x))+', '+esc(coordinate(p.y))+')'}</li>`).join('')}${(d.arrows||[]).filter(a=>(a.stage??0)<=stage&&a.label).map(a=>`<li>${esc(a.label)}：(${esc(coordinate(a.from[0]))}, ${esc(coordinate(a.from[1]))}) → (${esc(coordinate(a.to[0]))}, ${esc(coordinate(a.to[1]))})</li>`).join('')}</ul></details><div class="diagram-explanation" aria-live="polite"><h4>${esc(s.title)}</h4><p>${esc(s.explanation)}</p><ul>${(s.checklist||[]).map(c=>`<li>${esc(c)}</li>`).join('')}</ul></div></div>`;}
function renderDiagram(d,stage=0){if(!d.id||!Array.isArray(d.stages)||d.stages.length!==3||!Number.isInteger(stage)||stage<0||stage>2)throw Error('Invalid diagram stages');cache.set(d.id,d);return `<section class="study-diagram" data-diagram-id="${esc(d.id)}">${sourceCorrection(d)}<h3>${esc(d.title)}</h3><p class="diagram-mode">${d.mode==='numeric'?'按本题数值或方程绘制':d.kind==='flow'?'关系结构图':'定性示意图'}</p><p>${esc(d.intro)}</p><p class="diagram-scroll-hint">小屏幕可在图形区域左右滑动，查看完整图形。</p><div class="diagram-controls" role="group" aria-label="图形推演步骤">${d.stages.map((s,i)=>`<button type="button" data-diagram-stage="${i}" aria-pressed="${i===stage}">${i+1}. ${esc(s.title)}</button>`).join('')}</div><button class="btn diagram-enlarge" type="button" data-diagram-enlarge>放大图形</button><div class="diagram-frame">${frame(d,stage)}</div><div class="diagram-print">${frame(d,2,true)}</div>${d.textbook?`<details class="diagram-textbook"><summary>教材依据与核查要点</summary><ul>${d.textbook.references.map(r=>`<li>${esc(r.title)} · ${esc(r.section)} · PDF物理页 ${r.pages.map(esc).join('、')}</li>`).join('')}</ul><ul>${d.textbook.checks.map(c=>`<li>${esc(c)}</li>`).join('')}</ul></details>`:''}<ul class="diagram-notes">${(d.notes||[]).map(n=>`<li>${esc(n)}</li>`).join('')}</ul></section>`;}
function render(q){if(!q.diagrams?.length)return '';return '<section class="diagram-review" aria-label="图形辅助解题">'+q.diagrams.map(d=>renderDiagram(d,stages.get(d.id)??0)).join('')+'</section>';}
root.StudyDiagrams={render,renderDiagram};
if(root.document)root.document.addEventListener('click',e=>{
 const enlarge=e.target.closest('[data-diagram-enlarge]');
 if(enlarge){const section=enlarge.closest('[data-diagram-id]'),d=cache.get(section.dataset.diagramId),dialog=root.document.createElement('dialog');dialog.className='diagram-dialog study-diagram';dialog.innerHTML=`<button class="btn diagram-close" type="button">关闭大图</button><h3>${esc(d.title)}</h3>${sourceCorrection(d)}<p class="diagram-scroll-hint">左右滑动图形查看全图；下方保留当前阶段的图例和解释。</p>${frame(d,stages.get(d.id)??0,false,'enlarged-')}`;root.document.body.append(dialog);dialog.querySelector('.diagram-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{dialog.remove();if(enlarge.isConnected)enlarge.focus();},{once:true});dialog.showModal();return;}
 const b=e.target.closest('[data-diagram-stage]');if(!b)return;const section=b.closest('[data-diagram-id]'),d=cache.get(section.dataset.diagramId);if(!d)return;const stage=Number(b.dataset.diagramStage);stages.set(d.id,stage);section.querySelector('.diagram-frame').innerHTML=frame(d,stage);section.querySelectorAll('[data-diagram-stage]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));});
})(typeof window==='undefined'?globalThis:window);
