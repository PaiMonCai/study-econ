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
 // Trim connections to node boundaries so arrowheads remain visible.
 const pos=n=>[20+n.column*650/cols,35+n.row*350/rows];
 let edgeLabels='';
 for(const e of visible(d.edges)){const a=nodes.find(n=>n.id===e.from),b=nodes.find(n=>n.id===e.to);if(!a||!b)throw Error('Unknown flow endpoint');const[x,y]=pos(a),[u,v]=pos(b);const cx=x+90,cy=y+40,tx=u+90,ty=v+40,dx=tx-cx,dy=ty-cy;if(!dx&&!dy)throw Error("Overlapping flow nodes");const scale=1/Math.max(Math.abs(dx)/94,Math.abs(dy)/44);const sx=cx+dx*scale,sy=cy+dy*scale,ex=tx-dx*scale,ey=ty-dy*scale;const detour=a.row===b.row&&Math.abs(a.column-b.column)>1;const route=detour?`M${num(sx)} ${num(sy)} V${num(y-18)} H${num(tx)} V${num(v-4)}`:`M${num(sx)} ${num(sy)} L${num(ex)} ${num(ey)}`;body+=`<path class="diagram-reference" d="${route}" marker-end="url(#${id}-arrow)"/>`;if(e.label)edgeLabels+=`<text class="diagram-edge-label" text-anchor="middle" x="${num((sx+(detour?tx:ex))/2)}" y="${num(detour?y-8:(sy+ey)/2+5)}">${esc(e.label)}</text>`;}
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
 body+=`<path class="diagram-axis" d="M${originX} 340V45" marker-end="url(#${id}-arrow)"/><path class="diagram-axis" d="M75 ${originY}H625" marker-end="url(#${id}-arrow)"/><text class="diagram-axis-title" x="625" y="405" text-anchor="end">${esc(a.x.label)}</text><text class="diagram-axis-title" x="20" y="25">${esc(a.y.label)}</text>`;
 for(const axis of ['x','y']){
  const ticks=a[axis].ticks??(d.mode==='numeric'?Array.from({length:5},(_,i)=>({value:a[axis].min+(a[axis].max-a[axis].min)*i/4})):[]);
  for(const tick of ticks){if(axis==='y'&&Math.abs(tick.value)<1e-8&&(positions.x.some(p=>Math.abs(p.value)<1e-8)||d.mode==='numeric'||a.x.ticks?.some(t=>Math.abs(t.value)<1e-8)))continue;const center=axis==='x'?x(tick.value):y(tick.value);if(positions[axis].some(p=>Math.abs(p.center-center)<(axis==='x'?35:16)||(axis==='y'?Math.abs(p.baseline-center-4)<18:Math.abs(p.labelX-center)<p.width/2+12)))continue;
   body+=axis==='x'?`<text class="diagram-tick" x="${center}" y="${originY+22}" text-anchor="middle">${esc(tick.label??coordinate(tick.value))}</text>`:`<text class="diagram-tick" x="${originX-10}" y="${center+4}" text-anchor="end">${esc(tick.label??coordinate(tick.value))}</text>`;
  }
 }
 for(const p of visible(projections))body+=`<path data-projection="${esc(p.id)}" class="diagram-projection" d="M${x(p.x)} ${originY}V${y(p.y)}H${originX}"/>`;
 for(const s of visible(d.series).sort((a,b)=>(a.role==='area'?0:1)-(b.role==='area'?0:1))){if(!s.points?.length)throw Error('Empty diagram series');body+=`<path data-series-id="${esc(s.id)}" class="diagram-${esc(s.role||'base')}" style="stroke-dasharray:${seriesDash(d,s)}" d="${s.points.map((p,i)=>(i?'L':'M')+x(p[0])+' '+y(p[1])).join(' ')}${s.closed?'Z':''}"/>`;}
 for(const a of visible(d.arrows))body+=`<path class="diagram-change" d="M${x(a.from[0])} ${y(a.from[1])}L${x(a.to[0])} ${y(a.to[1])}" marker-end="url(#${id}-arrow)"/>`;
 for(const p of visible(d.points))body+=`<circle class="diagram-dot" cx="${x(p.x)}" cy="${y(p.y)}" r="4"/>${plotText(p.label,x(p.x)+(p.dx??8),y(p.y)+(p.dy??-10),'class="diagram-point-label"')}`;
 for(const l of visible(d.labels))body+=plotText(l.text,x(l.x),y(l.y),'class="diagram-curve-label"');
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
function frame(d,stage,printing=false,context=''){const s=d.stages[stage];return `<div class="diagram-screen" data-current-stage="${stage}"><div class="diagram-canvas" tabindex="0" role="region" aria-label="图形，可横向滚动查看">${svg(d,stage,printing,context)}</div><ul class="diagram-legend">${(d.series||[]).filter(e=>(e.stage??0)<=stage).map(e=>`<li class="legend-${esc(e.role||'base')}"><svg class="diagram-legend-swatch" viewBox="0 0 36 12" aria-hidden="true"><path class="diagram-${esc(e.role||'base')}" style="stroke-dasharray:${seriesDash(d,e)}" d="M1 6H35"/></svg>${esc(e.label)}</li>`).join('')}</ul><details class="diagram-text"><summary>图形文字说明</summary>${d.kind!=='flow'?`<p>横轴：${esc(d.axes.x.label)}；纵轴：${esc(d.axes.y.label)}。</p>`:''}<ul>${(d.kind==='flow'?d.nodes||[]:d.points||[]).filter(p=>(p.stage??0)<=stage).map(p=>`<li>${esc(p.label)}${p.description?'：'+esc(p.description):''}${d.kind==='flow'?': '+esc(p.detail||''):': ('+esc(coordinate(p.x))+', '+esc(coordinate(p.y))+')'}</li>`).join('')}${(d.arrows||[]).filter(a=>(a.stage??0)<=stage&&a.label).map(a=>`<li>${esc(a.label)}：(${esc(coordinate(a.from[0]))}, ${esc(coordinate(a.from[1]))}) → (${esc(coordinate(a.to[0]))}, ${esc(coordinate(a.to[1]))})</li>`).join('')}</ul></details><div class="diagram-explanation" aria-live="polite"><h4>${esc(s.title)}</h4><p>${esc(s.explanation)}</p><ul>${(s.checklist||[]).map(c=>`<li>${esc(c)}</li>`).join('')}</ul></div></div>`;}
function renderDiagram(d,stage=0){if(!d.id||!Array.isArray(d.stages)||d.stages.length!==3||!Number.isInteger(stage)||stage<0||stage>2)throw Error('Invalid diagram stages');cache.set(d.id,d);return `<section class="study-diagram" data-diagram-id="${esc(d.id)}"><h3>${esc(d.title)}</h3><p class="diagram-mode">${d.mode==='numeric'?'按本题数值或方程绘制':d.kind==='flow'?'关系结构图':'定性示意图'}</p><p>${esc(d.intro)}</p><p class="diagram-scroll-hint">小屏幕可在图形区域左右滑动，查看完整图形。</p><div class="diagram-controls" role="group" aria-label="图形推演步骤">${d.stages.map((s,i)=>`<button type="button" data-diagram-stage="${i}" aria-pressed="${i===stage}">${i+1}. ${esc(s.title)}</button>`).join('')}</div><button class="btn diagram-enlarge" type="button" data-diagram-enlarge>放大图形</button><div class="diagram-frame">${frame(d,stage)}</div><div class="diagram-print">${frame(d,2,true)}</div>${d.textbook?`<details class="diagram-textbook"><summary>教材依据与核查要点</summary><ul>${d.textbook.references.map(r=>`<li>${esc(r.title)} · ${esc(r.section)} · PDF物理页 ${r.pages.map(esc).join('、')}</li>`).join('')}</ul><ul>${d.textbook.checks.map(c=>`<li>${esc(c)}</li>`).join('')}</ul></details>`:''}<ul class="diagram-notes">${(d.notes||[]).map(n=>`<li>${esc(n)}</li>`).join('')}</ul></section>`;}
function render(q){if(!q.diagrams?.length)return '';return '<section class="diagram-review" aria-label="图形辅助解题">'+q.diagrams.map(d=>renderDiagram(d,stages.get(d.id)??0)).join('')+'</section>';}
root.StudyDiagrams={render,renderDiagram};
if(root.document)root.document.addEventListener('click',e=>{
 const enlarge=e.target.closest('[data-diagram-enlarge]');
 if(enlarge){const section=enlarge.closest('[data-diagram-id]'),d=cache.get(section.dataset.diagramId),dialog=root.document.createElement('dialog');dialog.className='diagram-dialog study-diagram';dialog.innerHTML=`<button class="btn diagram-close" type="button">关闭大图</button><h3>${esc(d.title)}</h3><p class="diagram-scroll-hint">左右滑动图形查看全图；下方保留当前阶段的图例和解释。</p>${frame(d,stages.get(d.id)??0,false,'enlarged-')}`;root.document.body.append(dialog);dialog.querySelector('.diagram-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{dialog.remove();if(enlarge.isConnected)enlarge.focus();},{once:true});dialog.showModal();return;}
 const b=e.target.closest('[data-diagram-stage]');if(!b)return;const section=b.closest('[data-diagram-id]'),d=cache.get(section.dataset.diagramId);if(!d)return;const stage=Number(b.dataset.diagramStage);stages.set(d.id,stage);section.querySelector('.diagram-frame').innerHTML=frame(d,stage);section.querySelectorAll('[data-diagram-stage]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));});
})(typeof window==='undefined'?globalThis:window);
