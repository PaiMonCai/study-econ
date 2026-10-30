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
function svg(d,stage,printing=false){
 const id='diagram-'+(printing?'print-':'step-'+stage+'-')+String(d.id).replace(/[^a-z0-9_-]/gi,'');
 let body='';
 const visible=a=>(a||[]).filter(e=>(e.stage??0)<=stage);
 if(d.kind==='flow'){
 const nodes=d.nodes||[],cols=Math.max(1,...nodes.map(n=>n.column+1)),rows=Math.max(1,...nodes.map(n=>n.row+1));
 // Trim connections to node boundaries so arrowheads remain visible.
 const pos=n=>[20+n.column*650/cols,35+n.row*350/rows];
 let edgeLabels='';
 for(const e of visible(d.edges)){const a=nodes.find(n=>n.id===e.from),b=nodes.find(n=>n.id===e.to);if(!a||!b)throw Error('Unknown flow endpoint');const[x,y]=pos(a),[u,v]=pos(b);const cx=x+90,cy=y+40,tx=u+90,ty=v+40,dx=tx-cx,dy=ty-cy;if(!dx&&!dy)throw Error("Overlapping flow nodes");const scale=1/Math.max(Math.abs(dx)/94,Math.abs(dy)/44);const sx=cx+dx*scale,sy=cy+dy*scale,ex=tx-dx*scale,ey=ty-dy*scale;const route=a.row===b.row&&Math.abs(a.column-b.column)>1?`M${num(sx)} ${num(sy)} V${num(y-18)} H${num(ex)} V${num(ey)}`:`M${num(sx)} ${num(sy)} L${num(ex)} ${num(ey)}`;body+=`<path class="diagram-reference" d="${route}" marker-end="url(#${id}-arrow)"/>`;if(e.label)edgeLabels+=`<text class="diagram-edge-label" text-anchor="middle" x="${num((sx+ex)/2)}" y="${num(a.row===b.row&&Math.abs(a.column-b.column)>1?y-8:(sy+ey)/2+5)}">${esc(e.label)}</text>`;}
 for(const n of visible(nodes)){const[x,y]=pos(n);const lines=flowLines(n.label),baseline=45-(lines.length-1)*10;body+=`<rect class="diagram-node" x="${num(x)}" y="${num(y)}" width="180" height="80" rx="4"/><text x="${num(x+90)}" y="${num(y+baseline)}" text-anchor="middle">${lines.map((s,i)=>`<tspan x="${num(x+90)}" dy="${i?20:0}">${esc(s)}</tspan>`).join('')}</text>`;}
 body+=edgeLabels;
 }else{
 const a=d.axes;if(!a||a.x.max<=a.x.min||a.y.max<=a.y.min)throw Error('Invalid diagram axes');
 const x=v=>num(75+(v-a.x.min)/(a.x.max-a.x.min)*530),y=v=>num(340-(v-a.y.min)/(a.y.max-a.y.min)*280);
 body+=`<path class="diagram-axis" d="M75 50V340H620"/><text x="610" y="387" text-anchor="end">${esc(a.x.label)}</text><text x="20" y="25">${esc(a.y.label)}</text>`;
 for(let i=0;i<=4;i++){const xv=a.x.min+(a.x.max-a.x.min)*i/4,yv=a.y.min+(a.y.max-a.y.min)*i/4;body+=`<text class="diagram-tick" x="${x(xv)}" y="362" text-anchor="middle">${num(xv)}</text><text class="diagram-tick" x="65" y="${y(yv)+4}" text-anchor="end">${num(yv)}</text>`;}
 for(const s of visible(d.series)){if(!s.points?.length)throw Error('Empty diagram series');body+=`<path data-series-id="${esc(s.id)}" class="diagram-${esc(s.role||'base')}" style="stroke-dasharray:${seriesDash(d,s)}" d="${s.points.map((p,i)=>(i?'L':'M')+x(p[0])+' '+y(p[1])).join(' ')}${s.closed?'Z':''}"/>`;}
 for(const a of visible(d.arrows))body+=`<path class="diagram-change" d="M${x(a.from[0])} ${y(a.from[1])}L${x(a.to[0])} ${y(a.to[1])}" marker-end="url(#${id}-arrow)"/>`;
 for(const p of visible(d.points))body+=`<circle class="diagram-dot" cx="${x(p.x)}" cy="${y(p.y)}" r="4"/><text x="${num(x(p.x)+(p.dx??8))}" y="${num(y(p.y)+(p.dy??-10))}">${esc(p.label)}</text>`;
 for(const l of visible(d.labels))body+=`<text x="${x(l.x)}" y="${y(l.y)}">${esc(l.text)}</text>`;
 }
 return `<svg viewBox="0 0 680 410" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${esc(d.title)}</title><desc id="${id}-desc">${esc(d.stages[stage].explanation)}</desc><defs><marker id="${id}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="currentColor"/></marker></defs>${body}</svg>`;
}
function frame(d,stage,printing=false){const s=d.stages[stage];return `<div class="diagram-screen" data-current-stage="${stage}"><div class="diagram-canvas" tabindex="0" role="region" aria-label="图形，可横向滚动查看">${svg(d,stage,printing)}</div><ul class="diagram-legend">${(d.series||[]).filter(e=>(e.stage??0)<=stage).map(e=>`<li class="legend-${esc(e.role||'base')}"><svg class="diagram-legend-swatch" viewBox="0 0 36 12" aria-hidden="true"><path class="diagram-${esc(e.role||'base')}" style="stroke-dasharray:${seriesDash(d,e)}" d="M1 6H35"/></svg>${esc(e.label)}</li>`).join('')}</ul><details class="diagram-text"><summary>图形文字说明</summary><ul>${(d.kind==='flow'?d.nodes||[]:d.points||[]).filter(p=>(p.stage??0)<=stage).map(p=>`<li>${esc(p.label)}${d.kind==='flow'?': '+esc(p.detail||''):': ('+esc(coordinate(p.x))+', '+esc(coordinate(p.y))+')'}</li>`).join('')}${(d.arrows||[]).filter(a=>(a.stage??0)<=stage&&a.label).map(a=>`<li>${esc(a.label)}：(${esc(coordinate(a.from[0]))}, ${esc(coordinate(a.from[1]))}) → (${esc(coordinate(a.to[0]))}, ${esc(coordinate(a.to[1]))})</li>`).join('')}</ul></details><div class="diagram-explanation" aria-live="polite"><h4>${esc(s.title)}</h4><p>${esc(s.explanation)}</p><ul>${(s.checklist||[]).map(c=>`<li>${esc(c)}</li>`).join('')}</ul></div></div>`;}
function renderDiagram(d,stage=0){if(!d.id||!Array.isArray(d.stages)||d.stages.length!==3||!Number.isInteger(stage)||stage<0||stage>2)throw Error('Invalid diagram stages');cache.set(d.id,d);return `<section class="study-diagram" data-diagram-id="${esc(d.id)}"><h3>${esc(d.title)}</h3><p class="diagram-mode">${d.mode==='numeric'?'按本题数值或方程绘制':d.kind==='flow'?'关系结构图':'定性示意图'}</p><p>${esc(d.intro)}</p><p class="diagram-scroll-hint">小屏幕可在图形区域左右滑动，查看完整图形。</p><div class="diagram-controls" role="group" aria-label="图形推演步骤">${d.stages.map((s,i)=>`<button type="button" data-diagram-stage="${i}" aria-pressed="${i===stage}">${i+1}. ${esc(s.title)}</button>`).join('')}</div><div class="diagram-frame">${frame(d,stage)}</div><div class="diagram-print">${frame(d,2,true)}</div><ul class="diagram-notes">${(d.notes||[]).map(n=>`<li>${esc(n)}</li>`).join('')}</ul></section>`;}
function render(q){if(!q.diagrams?.length)return '';return '<section class="diagram-review" aria-label="图形辅助解题">'+q.diagrams.map(d=>renderDiagram(d,stages.get(d.id)??0)).join('')+'</section>';}
root.StudyDiagrams={render,renderDiagram};
if(root.document)root.document.addEventListener('click',e=>{const b=e.target.closest('[data-diagram-stage]');if(!b)return;const section=b.closest('[data-diagram-id]'),d=cache.get(section.dataset.diagramId);if(!d)return;const stage=Number(b.dataset.diagramStage);stages.set(d.id,stage);section.querySelector('.diagram-frame').innerHTML=frame(d,stage);section.querySelectorAll('[data-diagram-stage]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));});
})(typeof window==='undefined'?globalThis:window);
