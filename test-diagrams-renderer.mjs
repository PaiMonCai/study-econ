import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('./dist/diagrams.js',import.meta.url),'utf8'),context);const api=context.StudyDiagrams;
test('direction arrows have escaped, stage-specific equivalent text',()=>{
 const graph={...d,arrows:[{from:[0,1],to:[1,1],label:'right <safe>',stage:1}]};
 const initial=api.renderDiagram(graph,0).split('<div class="diagram-print">')[0];
 const next=api.renderDiagram(graph,1).split('<div class="diagram-print">')[0];
 assert.ok(!initial.includes('right &lt;safe&gt;'));
 assert.ok(next.includes('right &lt;safe&gt;'));
 assert.ok(next.includes('class="diagram-direction-label"'));
 assert.ok(next.indexOf('class="diagram-directions"')<next.indexOf('<details class="diagram-text">'));
});
const d={id:'test',title:'<unsafe>',mode:'numeric',intro:'test',stages:[0,1,2].map(i=>({title:'step'+i,explanation:'explain'+i,checklist:['check']})),axes:{x:{label:'x',min:-1,max:1},y:{label:'y',min:0,max:2}},series:[{id:'s',label:'later',stage:2,points:[[-1,0],[1,2]]}],points:[{id:'p',label:'origin',x:0,y:1,stage:0}],notes:[]};
test('maps nonzero domains and escapes labels',()=>{const h=api.renderDiagram(d);assert.ok(h.includes('cx="340" cy="200"'));assert.ok(h.includes('&lt;unsafe&gt;'));assert.ok(!h.includes('<unsafe>'));});
test('stage gates plotted paths while print contains final chart',()=>{const h=api.renderDiagram(d,0);const screen=h.split('<div class="diagram-print">')[0];assert.ok(!screen.includes('M75 340 L605 60'));assert.ok(h.includes('M75 340 L605 60'));assert.ok(api.renderDiagram(d,2).includes('aria-pressed="true">3.'));});
test('rejects invalid axes and nonfinite coordinates',()=>{assert.throws(()=>api.renderDiagram({...d,axes:{...d.axes,x:{min:1,max:1}}}));assert.throws(()=>api.renderDiagram({...d,points:[{x:NaN,y:0}]}));assert.throws(()=>api.renderDiagram(d,4));});
test('flow endpoints must resolve and user strings are escaped',()=>{const flow={...d,kind:'flow',nodes:[{id:'a',label:'<a>',column:0,row:0,stage:0},{id:'b',label:'b',column:1,row:0,stage:1}],edges:[{from:'a',to:'b',stage:1}]};assert.ok(api.renderDiagram(flow,1).includes('&lt;a&gt;'));assert.throws(()=>api.renderDiagram({...flow,edges:[{from:'a',to:'missing'}]}));});
test('flow connections clear an intervening node and preserve the route across reveals',()=>{
 const flow={...d,kind:'flow',nodes:[{id:'a',label:'source',column:0,row:0,stage:0},{id:'middle',label:'unrelated',column:1,row:0,stage:1},{id:'b',label:'target',column:2,row:0,stage:0}],edges:[{from:'a',to:'b',stage:0,label:'cycle'}]};
 const route=stage=>api.renderDiagram(flow,stage).match(/data-edge-index="0"[^>]*?\sd="([^"]+)"/)[1];
 assert.equal(route(0),route(2));
 const points=[...route(0).matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
 assert.ok(points.length>=4,'the route must bend around the intervening node');
 const obstacle={left:236.667,right:416.667,top:35,bottom:115};
 for(let i=1;i<points.length;i++){
  const [a,b]=[points[i-1],points[i]];
  assert.ok(a[0]===b[0]||a[1]===b[1]);
  const crosses=a[0]===b[0]?a[0]>obstacle.left&&a[0]<obstacle.right&&Math.max(a[1],b[1])>obstacle.top&&Math.min(a[1],b[1])<obstacle.bottom:a[1]>obstacle.top&&a[1]<obstacle.bottom&&Math.max(a[0],b[0])>obstacle.left&&Math.min(a[0],b[0])<obstacle.right;
  assert.equal(crosses,false,'a causal arrow must not pass through an unrelated node');
 }
 assert.ok(api.renderDiagram(flow).includes('marker-end="url(#diagram-step-0-test-arrow)"'));
});

test('short direction names stay on the chart and full economic conditions remain visible',()=>{
 const graph={...d,arrows:[{from:[-1,.4],to:[.8,.4],label:'constant expected prices; money expansion moves the equilibrium right',shortLabel:'money +',stage:1}]};
 const screen=api.renderDiagram(graph,1).split('<div class="diagram-print">')[0];
 assert.match(screen,/class="diagram-direction-label"[^>]*>money \+</);
 const baseline=Number(screen.match(/class="diagram-direction-label"[^>]* y="([\d.-]+)"/)[1]);
 assert.ok(baseline<=278||baseline>=304,'the name must not cover the horizontal arrow at y=284');
 assert.ok(screen.indexOf('constant expected prices')<screen.indexOf('<details class="diagram-text">'));
 assert.ok(!api.renderDiagram(graph,0).split('<div class="diagram-print">')[0].includes('constant expected prices'));
});

test('opposite flow directions remain distinguishable instead of sharing one segment',()=>{
 const flow={...d,kind:'flow',nodes:[{id:'a',label:'goods',column:0,row:0,stage:0},{id:'b',label:'money',column:1,row:0,stage:0}],edges:[{from:'a',to:'b',stage:0,label:'delivery'},{from:'b',to:'a',stage:0,label:'payment'}]};
 const screen=api.renderDiagram(flow).split('<div class="diagram-print">')[0];
 const routes=[...screen.matchAll(/data-edge-index="\d+"[^>]*?\sd="([^"]+)"/g)].map(m=>[...m[1].matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(p=>[Number(p[1]),Number(p[2])]));
 assert.equal(routes.length,2);assert.ok(routes.every(r=>r.length>=2));
 const segments=route=>route.slice(1).map((p,i)=>[p.join(','),route[i].join(',')].sort().join('|')).sort();
 assert.notDeepEqual(segments(routes[0]),segments(routes[1]));
 assert.ok(screen.includes('goods → money：delivery'));
 assert.ok(screen.includes('money → goods：payment'));
});
test('same-role series have distinct stable line patterns and matching legend swatches',()=>{const chart={...d,series:[{id:'early',label:'first',role:'base',stage:0,points:[[-1,0],[1,1]]},{id:'late',label:'second',role:'base',stage:1,points:[[-1,1],[1,2]]}]};const zero=api.renderDiagram(chart,0).split('<div class="diagram-print">')[0],one=api.renderDiagram(chart,1).split('<div class="diagram-print">')[0];assert.ok(zero.includes('data-series-id="early" class="diagram-base" style="stroke-dasharray:none"'));assert.ok(one.includes('data-series-id="early" class="diagram-base" style="stroke-dasharray:none"'));assert.ok(one.includes('data-series-id="late" class="diagram-base" style="stroke-dasharray:10 4"'));assert.ok(one.includes('class="diagram-base" style="stroke-dasharray:10 4" d="M1 6H35"'));});
test('flow labels preserve complete numeric tokens and center line baselines',()=>{const chart={...d,kind:'flow',nodes:[{id:'a',label:'II获得生产资料2000',column:0,row:0,stage:0},{id:'b',label:'国民收入3500→3800',column:1,row:0,stage:0}],edges:[]};const h=api.renderDiagram(chart);assert.ok(h.includes('II获得生产资料2000</tspan>'));assert.ok(h.includes('3500'));assert.ok(h.includes('3800</tspan>'));assert.ok(!h.includes('>00</tspan>'));assert.ok(h.includes('y="80" text-anchor="middle"'));});
test('key points project onto both axes with configurable labels and opt out',()=>{const h=api.renderDiagram({...d,points:[{id:'p',label:'E',x:0,y:1,xLabel:'x₀',yLabel:'y₀',stage:0},{id:'hidden',label:'N',x:1,y:1,projection:false,stage:0}]});assert.ok(h.includes('data-projection="p"'));assert.ok(h.includes('>x₀</text>'));assert.ok(h.includes('>y₀</text>'));assert.ok(!h.includes('data-projection="hidden"'));assert.ok(h.includes('marker-end="url(#diagram-step-0-test-arrow)"'));});
test('schematic axes use explicit symbols without arbitrary numeric ticks',()=>{const graph={...d,mode:'schematic',points:[],axes:{x:{label:'Y',min:0,max:100,ticks:[{value:40,label:'Y₀'}]},y:{label:'r',min:0,max:100,ticks:[]}}};const h=api.renderDiagram(graph);assert.ok(h.includes('>Y₀</text>'));assert.ok(!h.includes('>25</text>'));});
test('textbook references are escaped and printed as physical pages and checks',()=>{const h=api.renderDiagram({...d,textbook:{references:[{title:'Book <A>',file:'book.pdf',pages:[2,3],section:'<section>'}],checks:['check <axis>']}});assert.ok(h.includes('Book &lt;A&gt;'));assert.ok(h.includes('PDF物理页 2、3'));assert.ok(h.includes('check &lt;axis&gt;'));assert.ok(h.includes('data-diagram-enlarge'));});
import {validateDiagram} from './build-diagrams.mjs';
test('schema validates textbook physical pages and optional projection and tick metadata',()=>{const question={id:'Q',answer_md:'source'};const valid={...d,id:'Q-graph',question_id:'Q',source:{field:'answer_md',quote:'source'},notes:['conditions'],series:[{id:'s',role:'base',label:'curve',stage:0,points:[[-1,0],[1,2]]}],textbook:{references:[{title:'Book',file:'book.pdf',section:'chapter',pages:[1]}],checks:['axes checked']}};assert.equal(validateDiagram(valid,question),valid);assert.throws(()=>validateDiagram({...valid,textbook:{...valid.textbook,references:[{...valid.textbook.references[0],pages:[0]}]}},question));assert.throws(()=>validateDiagram({...valid,points:[{...d.points[0],projection:'no'}]},question));assert.throws(()=>validateDiagram({...valid,axes:{...valid.axes,x:{...valid.axes.x,ticks:[{value:3,label:'outside'}]}}},question));});

test('direction metadata rejects missing meaning and zero-length arrows',()=>{
 const question={id:'Q',answer_md:'source'},valid={...d,id:'Q-graph',question_id:'Q',source:{field:'answer_md',quote:'source'},notes:['conditions'],series:[{id:'s',role:'base',label:'curve',stage:0,points:[[-1,0],[1,2]]}],arrows:[{from:[-1,.4],to:[.8,.4],label:'output rises at fixed prices',shortLabel:'output +',stage:1}]};
 assert.equal(validateDiagram(valid,question),valid);
 assert.throws(()=>validateDiagram({...valid,arrows:[{...valid.arrows[0],to:[-1,.4]}]},question),/nonzero direction/);
 assert.throws(()=>validateDiagram({...valid,arrows:[{...valid.arrows[0],label:''}]},question),/economic meaning/);
 assert.throws(()=>validateDiagram({...valid,arrows:[{...valid.arrows[0],shortLabel:4}]},question),/short name/);
 const flow={...valid,kind:'flow',mode:'structure',nodes:[{id:'a',label:'production',column:0,row:0,stage:0},{id:'b',label:'realization',column:1,row:0,stage:1}],edges:[{from:'a',to:'b',stage:1,label:'sell output'}]};
 assert.equal(validateDiagram(flow,question),flow);
 assert.throws(()=>validateDiagram({...flow,edges:[{...flow.edges[0],label:''}]},question),/economic meaning/);
});

test('source corrections identify the retained sentence and appear before the chart',()=>{
 const erratum={title:'Reviewed <source>',original_quote:'retained wrong sentence',explanation:'A remains 2; B rises from 1 to 2.',checks:['fixed y only']};
 const question={id:'Q',answer_md:'original: retained wrong sentence'},graph={...d,id:'Q-graph',question_id:'Q',source:{field:'answer_md',quote:'retained wrong sentence'},notes:['conditions'],series:[{id:'s',role:'base',label:'curve',stage:0,points:[[-1,0],[1,2]]}],erratum};
 assert.equal(validateDiagram(graph,question),graph);
 const screen=api.renderDiagram(graph).split('<div class="diagram-print">')[0];
 assert.ok(screen.indexOf('class="diagram-correction"')<screen.indexOf('class="diagram-canvas"'));
 assert.ok(screen.includes('Reviewed &lt;source&gt;'));
 assert.ok(screen.includes('retained wrong sentence'));
 assert.ok(screen.includes('A remains 2; B rises from 1 to 2.'));
 assert.throws(()=>validateDiagram({...graph,erratum:{...erratum,original_quote:'not in the source'}},question),/retained source sentence/);
});
test('text equivalents include axis units and full point descriptions while areas paint first',()=>{const graph={...d,points:[{...d.points[0],description:'full <description>'}],series:[{id:'curve',label:'curve',role:'base',stage:0,points:[[-1,0],[1,1]]},{id:'area',label:'area',role:'area',stage:0,closed:true,points:[[-1,0],[1,1],[1,0]]}]};const h=api.renderDiagram(graph);assert.ok(h.includes('横轴：x；纵轴：y'));assert.ok(h.includes('full &lt;description&gt;'));assert.ok(h.indexOf('data-series-id="area"')<h.indexOf('data-series-id="curve"'));});
test('nearby y projections have at least eighteen pixel baseline separation',()=>{const graph={...d,points:[{id:'a',label:'A',x:0,y:1,stage:0},{id:'b',label:'B',x:1,y:1.01,stage:0}]};const screen=api.renderDiagram(graph).split('<div class="diagram-print">')[0];const labels=[...screen.matchAll(/class="diagram-projection-label" data-axis="y" x="[^"]+" y="([^"]+)"/g)].map(m=>Number(m[1]));assert.equal(labels.length,2);assert.ok(Math.abs(labels[0]-labels[1])>=18);assert.ok(screen.includes('class="diagram-projection-leader"'));});
test('equal-value symbols merge only after their stage becomes visible',()=>{const graph={...d,points:[{id:'a',label:'A',x:0,y:1,yLabel:'i₀',stage:0},{id:'b',label:'B',x:1,y:1,yLabel:'i₁',stage:1}]};const zero=api.renderDiagram(graph,0).split('<div class="diagram-print">')[0],one=api.renderDiagram(graph,1).split('<div class="diagram-print">')[0];assert.ok(!zero.includes('i₁'));assert.ok(one.includes('>i₀=i₁</text>'));assert.equal([...one.matchAll(/data-axis="y"/g)].length,1);});
test('x projection label packing keeps close numeric labels distinct and in the canvas',()=>{const graph={...d,points:[{id:'a',label:'A',x:.5,y:1,xLabel:'20.801',stage:0},{id:'b',label:'B',x:.5001,y:1,xLabel:'20.802',stage:0}]};const screen=api.renderDiagram(graph).split('<div class="diagram-print">')[0],xs=[...screen.matchAll(/data-axis="x" x="([^"]+)"/g)].map(m=>Number(m[1]));assert.equal(xs.length,2);assert.ok(xs[1]-xs[0]>50);assert.ok(xs.every(x=>x>0&&x<680));});
