import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const bank=JSON.parse(fs.readFileSync(new URL('./content/diagrams-macro.json',import.meta.url)));const source=JSON.parse(fs.readFileSync(new URL('./content/macro.json',import.meta.url)));const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('macro coverage and graphic sources correspond to all questions',()=>{assert.equal(bank.coverage.length,100);assert.equal(new Set(bank.coverage.map(x=>x.question_id)).size,100);for(const d of bank.diagrams){let q=source.questions.find(q=>q.id===d.question_id);assert.ok(q[d.source.field].includes(d.source.quote));for(const s of d.series)for(const [x,y]of s.points){assert.ok(Number.isFinite(x)&&Number.isFinite(y));assert.ok(x>=d.axes.x.min-1e-9&&x<=d.axes.x.max+1e-9);assert.ok(y>=d.axes.y.min-1e-9&&y<=d.axes.y.max+1e-9);}for(const p of d.points){assert.ok(p.x>=d.axes.x.min&&p.x<=d.axes.x.max&&p.y>=d.axes.y.min&&p.y<=d.axes.y.max);}}});
for(const d of bank.diagrams)test(d.question_id+' independently checks economic equations',()=>{const f=d.numeric_facts;if(f.model==='solow'){close(f.s0*f.k0**f.alpha,f.mu*f.k0);close(f.s1*f.k1**f.alpha,f.mu*f.k1);for(const s of d.series)for(const [x,y]of s.points)close(y,s.id==='production'?x**f.alpha:s.id==='maintenance'?f.mu*x:(s.id==='changed'?f.s1:f.s0)*x**f.alpha);}if(f.model==='budget')for(const p of d.points)close(p.x+p.y,16);if(f.model==='adas')for(const [y,p,m,pe]of f.equilibria){close(y,160+m/p);close(p,pe+.01*(y-100));}if(f.model==='inflation')for(let t=1;t<=3;t++){close(1.5*f.demand[t],f.demand[t-1]+1+(t===1?1.5:0));close(1.5*f.supply[t],f.supply[t-1]+1+(t===1?1:0));}if(f.model==='hysteresis')for(let t=2;t<f.values.length;t++)close(f.values[t],(f.values[t-1]+f.values[t-2])/2);if(f.model==='open')for(const[y,e,g,m]of f.states){close(.5*y,m);close(.2*y,120+g-20*e);}if(f.model==='debt')close(f.investmentChange,-.5*(100/1.6-100/2));if(f.model==='schematic')assert.equal(d.mode,'schematic');});
for(const d of bank.diagrams.filter(d=>['MA023','MA027','MA028','MA033','MA034','MA043','MA063','MA073','MA077'].includes(d.question_id)))test(d.question_id+' policy and dynamics correspond to specified equations',()=>{const f=d.numeric_facts;if(f.model==='islm23')for(const[y,i,a,m]of f.states){close(y,a-5*i);close(m,.5*y-10*i);}if(f.model==='dynamics27'){close(120-.6*160-4*6,0);close(.5*160-10*6-20,0);close(120-.6*100-4*4,44);close(.5*100-10*4-20,-10);assert.ok(f.trace<0&&f.determinant>0);}if(f.model==='floor28')for(const[y,i,g]of f.states)close(y,80+g-5*i);if(f.model==='adas33')for(const[y,p,m,pe]of f.states){close(y,200+m-10*p);close(p,pe+.1*(y-100));}if(f.model==='tradeoff34')for(const[x,p,a,v]of f.states){close(x,a-p);close(p,2+x+v);}if(f.model==='negative43')for(let j=0;j<2;j++)for(let t=1;t<f.paths[j].length;t++)close(f.paths[j][t][1],f.paths[j][t-1][1]/(1-[.2,3][j]));if(f.model==='rule63'){for(const a of d.series)for(const[pi,rate]of a.points)close(rate,2+2+1.5*(pi-2)-.5-(a.id==='real'?pi:0));}if(f.model==='feedback73'){for(let j=0;j<3;j++){const series=d.series[j+1];for(const[t,z]of series.points)close(z,((1.04-f.phis[j])/1.02)**t);}}if(f.model==='funds77')for(const[i,r]of f.states)close(i,200-20*r);});
test('macro continuous curves meet exact visible intercepts without sampling gaps',()=>{const d=bank.diagrams.find(d=>d.question_id==='MA031');for(const id of ['ad','ad1']){const s=d.series.find(s=>s.id===id);close(s.points[0][1],d.axes.y.max);close(s.points.at(-1)[0],d.axes.x.max);const m=id==='ad'?560:1064;for(const[y,p]of s.points)close((y-160)*p,m);}for(const id of ['MA021','MA091']){const points=bank.diagrams.find(d=>d.question_id===id).series.find(s=>s.id==='is').points;assert.deepEqual(points[0],[0,9]);assert.deepEqual(points.at(-1),[9,0]);for(const[x,y]of points)close(x+y,9);}});
test('all macro diagrams have traceable textbook pages and original question sources',()=>{for(const d of bank.diagrams){assert.ok(d.textbook.references.length>0,d.id);for(const r of d.textbook.references){assert.ok(r.title&&r.file&&r.section,d.id);assert.ok(r.pages.length&&r.pages.every(n=>Number.isInteger(n)&&n>0),d.id);}assert.ok(d.textbook.checks.length>=3,d.id);for(const p of d.points)assert.ok(p.description,d.id);}});
test('golden rule consumption gap and marginal conditions match each question',()=>{for(const id of ['MA001','MA004','MA010']){const d=bank.diagrams.find(d=>d.question_id===id),f=d.numeric_facts;const p=d.points.find(p=>p.id==='gold-output');close(f.alpha*p.x**(f.alpha-1),f.mu);close(p.y,p.x**f.alpha);assert.ok(p.y-f.mu*p.x>0);}});
for(const d of bank.diagrams.filter(d=>['compound35','labor36','dad42','reaction65','debt72'].includes(d.numeric_facts.model)))test(d.id+' textbook redraw preserves complete question equations',()=>{const f=d.numeric_facts;if(f.model==='compound35'){close(f.dx,-f.d-2*f.dp);close(f.dp,.5*f.dx+f.s);for(const line of d.series)for(const[x,p]of line.points)close(p,line.id==='ad0'?-x/2:line.id==='as0'?.5*x:line.id==='ad1'?-(f.d+x)/2:.5*x+f.s);}if(f.model==='labor36'){for(const[n,w,p]of f.states){close(w,f.W/p);close(n,100-2*w);}for(const[n,w]of d.series[0].points)close(n,100-2*w);}if(f.model==='dad42'){const[x,pi]=f.first;close(x,2-pi+(f.supply?0:3));close(pi,2+.5*x+(f.supply?1:0));const[x2,pi2]=f.next;close(x2,2-pi2);close(pi2,pi+.5*x2);}if(f.model==='reaction65'){for(const[e,pi,gamma]of f.states){close(pi,(6+e)/(1+gamma));close(e,pi);}}if(f.model==='debt72'){const map=x=>(1.05*x-.03)/1.02;close(map(1),1);close(map(.8),27/34);assert.ok(map(map(.8))<map(.8));assert.ok(1.05/1.02>1);for(const[x,y]of d.series.find(s=>s.id==='map').points)close(y,map(x));}});
test('policy and open-economy panels isolate distinct experiments',()=>{const fiscal=bank.diagrams.find(d=>d.id==='MA081-graph'),money=bank.diagrams.find(d=>d.id==='MA081-money');assert.ok(!fiscal.series.some(s=>s.id==='money'));assert.ok(!money.series.some(s=>s.id==='fiscal'));assert.ok(money.series.some(s=>s.id==='is'));for(const id of ['MA090-fixed','MA090-floating']){const d=bank.diagrams.find(d=>d.id===id);const e=d.points.at(-1);close(e.x+e.y,11);if(id.endsWith('fixed'))close(e.y,5);else close(e.x,4);}});
test('special LM retains rule-specific slopes and shared intercept',()=>{const d=bank.diagrams.find(d=>d.question_id==='MA022'),up=d.series.find(s=>s.id==='counter'),down=d.series.find(s=>s.id==='pro');close(up.points[0][1],down.points[0][1]);assert.ok(up.points.at(-1)[1]>up.points[0][1]);assert.ok(down.points.at(-1)[1]<down.points[0][1]);for(const p of d.points)close(p.x+p.y,9);});
test('MA022 both marked equilibria satisfy IS and their corresponding policy LM',()=>{const d=bank.diagrams.find(d=>d.id==='MA022-lm');for(const p of d.points){close(p.y,9-p.x);close(p.y,p.id==='counter'?3+.5*p.x:3-.25*p.x);}});
test('borrowing-constraint utility curves show tangency only at the unconstrained optimum',()=>{const d=bank.diagrams.find(d=>d.id==='MA012-graph');for(const[c,id]of [[64,'utility-free'],[48,'utility-limited'],[60,'utility-transfer']])for(const[x,y]of d.series.find(s=>s.id===id).points)close(x*y,c);close(-64/8**2,-1);assert.ok(-48/4**2 < -1);assert.ok(-60/6**2 < -1);});
test('textbook redraw projection labels use model variables rather than generic output symbols',()=>{for(const[id,x,y]of [['MA036-labor','N','w'],['MA042-dad-demand','x','π'],['MA042-das-supply','x','π'],['MA061-graph','u','π'],['MA065-graph','πᵉ','π']]){const d=bank.diagrams.find(d=>d.id===id);for(const p of d.points){assert.ok(p.xLabel.startsWith(x),d.id);assert.ok(p.yLabel.startsWith(y),d.id);}}for(const d of bank.diagrams)for(const p of d.points){assert.ok(p.description&&!p.description.includes('对应本阶段均衡或参照点'),d.id);}});
test('equal coordinates reuse the same symbolic projection in policy comparisons',()=>{for(const id of ['MA030-horizontal','MA030-vertical','MA062-graph','MA090-floating','MA090-fixed']){const d=bank.diagrams.find(d=>d.id===id);for(const a of d.points)for(const p of d.points){if(a.x===p.x)assert.equal(a.xLabel,p.xLabel,d.id);if(a.y===p.y)assert.equal(a.yLabel,p.yLabel,d.id);}}});
test('all in-plot macro labels remain attached to an exact sample of their own visible curve',()=>{for(const d of bank.diagrams)for(const l of d.labels){const s=d.series.find(s=>s.id===l.curve_id);assert.ok(s&&s.stage<=l.stage,d.id);assert.ok(s.points.some(p=>p.every((n,i)=>Math.abs(n-l.curve_anchor[i])<1e-8)),d.id);close(l.x,l.curve_anchor[0]);close(l.y,l.curve_anchor[1]);}});
test('model-specific in-plot names cannot leak across reused series identifiers',()=>{for(const[id,curve,expected]of [['MA077-graph','investment','I(r)'],['MA036-labor','demand','Nᵈ(w)'],['MA051-graph','limit','Δu∞=4/3']]){const d=bank.diagrams.find(d=>d.id===id),label=d.labels.find(l=>l.curve_id===curve);assert.equal(label.text,expected,d.id);assert.ok(d.series.find(s=>s.id===curve),d.id);}for(const d of bank.diagrams){if(d.numeric_facts.model!=='solow'&&d.id!=='MA002-solow')assert.ok(d.labels.every(l=>!['s₀f(k)','s₁f(k)'].includes(l.text)),d.id);if(d.id!=='MA012-graph')assert.ok(d.labels.every(l=>!l.text.includes('c₁≤')),d.id);}});
test('short macro point names stay beside their own marker rather than retaining old long-label offsets',()=>{for(const d of bank.diagrams)for(const p of d.points){assert.ok(Math.abs(p.dx??8)<=24,d.id+' '+p.id);assert.ok(Math.abs(p.dy??-10)<=24,d.id+' '+p.id);}});

test('MA072 projections identify the fixed point and actual debt iteration periods',()=>{
 const d=bank.diagrams.find(d=>d.id==='MA072-graph'),by=id=>d.points.find(p=>p.id===id),step=b=>(1.05*b-.03)/1.02;
 const fixed=by('fixed'),first=by('first'),second=by('second');
 assert.deepEqual([fixed.xLabel,fixed.yLabel],['b*','b*']);close(fixed.x,1);close(fixed.y,1);
 assert.deepEqual([first.xLabel,first.yLabel],['b₀','b₁']);close(first.x,.8);close(first.y,step(.8));
 assert.deepEqual([second.xLabel,second.yLabel],['b₁','b₂']);close(second.x,first.y);close(second.y,step(first.y));
});

const diagram=id=>{const d=bank.diagrams.find(d=>d.id===id);assert.ok(d,id);return d;};
const equations={
 'MA011-risk-budget':{saving:x=>21-.9*x,loan0:x=>24-1.2*x,loan1:x=>27-1.5*x},
 'MA013-smoothing':{base:()=>9,temporary:()=>11,permanent:()=>15},
 'MA014-saver':{r1:x=>20-x,r2:x=>30-2*x,u0:x=>100/x,u1:x=>112.5/x},
 'MA014-borrower':{r1:x=>20-x,r2:x=>20-2*x,u0:x=>100/x,u1:x=>50/x},
 'MA015-linear-choice':{before:x=>12-1.2*x,after:x=>12-1.5*x,indifference:x=>12-x},
 'MA016-investment':{frontier:x=>6*Math.sqrt(10-x),finance:x=>19-x},
 'MA017-capital-cost':{mpk:x=>5/Math.sqrt(x),uc0:()=>.2,uc1:()=>.16},
 'MA018-q-investment':{zero:()=>0,positive:q=>(q-1)/4,depreciation:()=>.1},
 'MA019-tax-demand':{diag:x=>x,base:x=>.5*x,shift:x=>40+.5*x},
 'MA020-precaution':{cost:s=>1/(10-s),safe:s=>1/(10+s),risk:s=>.5/(4+s)+.5/(16+s)},
 'MA024-tax-spending':{is0:y=>25-.1*y,lm0:y=>.1*y-8,g:y=>27.5-.1*y,gt:y=>25.5-.1*y},
 'MA025-credit-feedback':{is0:y=>(85-.95*y)/4,lm0:y=>.05*y-2,is1:y=>(73.5-.95*y)/4,fixed:y=>(88.5-5*(3-.01*1860/23)-y)/4},
 'MA026-feedback-denominator':{mult:g=>1/(1.2-g),base:()=>1/1.2},
 'MA029-dual-shift':{is0:y=>(65-.25*y)/2,lm0:y=>.1*y-6,is1:y=>(71-.25*y)/2,lm1:y=>.1*y-5.2},
 'MA037-real-rate':{old:p=>4-p,new:p=>2-p},
 'MA038-expectation-path':{zero:()=>0,path:t=>2*.75**t},
 'MA039-supply-slope':{ad:y=>5-.5*y,flat:()=>0,medium:y=>.5*y,steep:y=>2*y},
 'MA040-potential-loss':{ad:y=>40-.2*y,as0:y=>.2*y,as1:y=>2+.2*y,aslong:y=>4+.2*y},
 'MA044-timing-A':{dad0:x=>2-x,dad1:x=>3-x,supply0:x=>2+.5*x,supply1:x=>2+.5*x},
 'MA044-timing-B':{dad0:x=>2-x,dad1:x=>3-x,supply0:x=>2+x,supply1:x=>4+x},
 'MA047-anticipated':{old:x=>2+x/2,expected:x=>4+x/2},
 'MA049-anchoring':{zero:()=>0,theta0:t=>t===1?1:0,theta05:t=>.5**(t-1),theta09:t=>.9**(t-1)},
 'MA050-stabilization':{feasible:x=>x+2,loss1:x=>Math.sqrt(Math.max(0,2-x*x)),loss3:x=>Math.sqrt(Math.max(0,3-3*x*x))},
 'MA053-unemployment-map':{diag:u=>u,old:u=>.02+.8*u,new:u=>.02+.75*u},
 'MA054-wage-price':{ws:u=>2.2-4*u,ps0:()=>1.6,ps1:()=>20/11},
 'MA056-sacrifice':{phillips:u=>-.5*(u-5),target:()=>-1},
 'MA057-hysteresis-path':{zero:()=>0,temporary:t=>t===0?0:.4*.8**(t-1),permanent:t=>t===0?0:.4},
 'MA058-labor-market':{supply:n=>n/4,demand:n=>10/Math.sqrt(n),tech:n=>15/Math.sqrt(n),fixed:()=>5},
 'MA059-malthus':{old:n=>2/Math.sqrt(n),new:n=>3/Math.sqrt(n),threshold:()=>1},
 'MA060-employment-policy':{base:()=>200,a:t=>150+50*.8**t,b:t=>1000/7+(200-1000/7)*.86**t},
 'MA064-policy-reaction':{rule:()=>0,discretion:v=>1+v/2},
 'MA068-money-multiplier':{before:b=>3*b,after:b=>2*b,target:()=>300},
 'MA070-lower-bound':{original:i=>2-i,crisis:i=>-1-i,credible:i=>.5-i},
 'MA074-ricardian-budget':{budget:c=>24-1.2*c,utility:c=>120/c},
 'MA075-stabilizers':{tax:a=>2*a,notax:a=>10/3*a},
 'MA076-policy-closure':{is0:y=>10-.1*y,lm0:y=>.1*y-6,is1:y=>10-.09*y,fixedrate:()=>2},
 'MA078-debt-revaluation':{realdebt:p=>100/p},
 'MA079-finite-budget':{budget:s=>121-1.1*s},
 'MA080-tax-supply':{ad0:x=>-x,as0:x=>.5*x,ad1:x=>2-x,as1:x=>.5*x-.5},
 'MA082-fixed-rate':{is0:y=>7-.01*y,peg:()=>5,is1:y=>7.5-.01*y},
 'MA083-export-cross':{diag:y=>y,old:y=>80+.75*y,new:y=>70+.75*y},
 'MA084-risk-exchange':{expected10:r=>10/(1.02-r/100),expected95:r=>9.5/(1.02-r/100)},
 'MA085-bp':{is:y=>19-.05*y,bp:y=>1+.005*y,lm:y=>.05*y-151/11},
 'MA086-long-exchange':{nx:nx=>6-nx/10},
 'MA087-j-curve':{zero:()=>0},
 'MA088-real-exchange':{base:p=>700/p,new:p=>785.4/p}
};
for(const[id,curves]of Object.entries(equations))test(id+' all samples satisfy independently stated question relationships',()=>{
 const d=diagram(id);for(const[curve,f]of Object.entries(curves)){const s=d.series.find(s=>s.id===curve);assert.ok(s,id+' '+curve);for(const[x,y]of s.points)close(y,f(x));}
});
test('added consumption and investment optima meet budgets and marginal conditions',()=>{
 for(const[id,y1,y2,r]of [['MA014-saver',10,10,2],['MA014-borrower',0,20,2]]){const p=diagram(id).points.find(p=>p.id==='new');close(p.x+p.y/r,y1+y2/r);close(p.y,r*p.x);}
 const p=diagram('MA020-precaution').points.find(p=>p.id==='risk');close(p.x,Math.sqrt(43)-5);close(1/(10-p.x),.5/(4+p.x)+.5/(16+p.x));
 close(3/Math.sqrt(9),1);const separate=diagram('MA016-investment').points.find(p=>p.id==='separate');close(separate.x+separate.y,19);close(separate.x,separate.y);
 for(const p of diagram('MA017-capital-cost').points)close(5/Math.sqrt(p.x),p.y);
 assert.deepEqual(diagram('MA011-risk-budget').series.find(s=>s.id==='loan1').points.at(-1),[18,0]);
});
test('financial and fiscal equilibrium points meet simultaneous constraints, not merely one curve',()=>{
 for(const p of diagram('MA025-credit-feedback').points){close(p.y,.05*p.x-2);if(p.id!=='fixed')close(p.x,(p.id==='old'?100:88.5)-4*p.y-5*(3-.01*p.x));assert.ok(3-.01*p.x>=0);}
 for(const p of diagram('MA029-dual-shift').points){const t=p.id==='old'?20:12;close(.25*p.x,80-.75*t-2*p.y);close(20,.5*(p.x-t)-5*p.y);}
 for(const p of diagram('MA076-policy-closure').points){const t=p.id==='old'?.25:.2;close(p.x,40+.8*(1-t)*p.x-4*p.y);if(p.id!=='rate')close(30,.5*p.x-5*p.y);}
 const bp=diagram('MA085-bp').points[0];close(bp.x,380-20*bp.y);close(80-.1*bp.x+20*(bp.y-5),0);close(.5*bp.x-10*bp.y,1510/11);
});
test('supply, expectation timing, and policy tradeoff points retain each distinct closure',()=>{
 for(const branch of ['A','B']){const p=diagram('MA044-timing-'+branch).points.find(p=>p.id==='new');close(p.x,3-p.y);close(p.y,branch==='A'?2+.5*p.x:4+p.x);}
 for(const p of diagram('MA039-supply-slope').points){close(p.x,10-2*p.y);close(p.y,({flat:0,medium:.5,steep:2})[p.id]*p.x);}
 const points=diagram('MA040-potential-loss').points;close(points.find(p=>p.id==='short').x,95);close(points.find(p=>p.id==='long').x,90);for(const p of points)close(p.x,200-5*p.y);
 for(const[id,lambda]of [['one',1],['three',3]]){const p=diagram('MA050-stabilization').points.find(p=>p.id===id);close(p.y,p.x+2);close(p.y,-lambda*p.x);}
 for(const p of diagram('MA080-tax-supply').points){if(p.id==='base')continue;close(p.x,2-p.y);close(p.y,.5*p.x-(p.id==='both'?.5:0));}
});
test('population and labor flow reforms preserve timing and stock-flow definitions',()=>{
 const u=diagram('MA053-unemployment-map').points.find(p=>p.id==='first');close(u.y,u.x+.02*(1-u.x)-.23*u.x);assert.notEqual(u.y,.08);
 for(const p of diagram('MA054-wage-price').points){close(p.y,2*(1-2*p.x+.1));close(p.y,2/(1+(p.id==='old'?.25:.1)));}
 const labor=diagram('MA058-labor-market');for(const id of ['demand','new']){const p=labor.points.find(p=>p.id===id);close(p.y,(id==='demand'?10:15)/Math.sqrt(p.x));}close(labor.points.find(p=>p.id==='supply').x,4*5);
 for(const p of diagram('MA059-malthus').points){const a=p.id==='old'?2:3;close(p.y,a/Math.sqrt(p.x));if(p.id!=='impact')close(2*p.y/(1+p.y),1);}
 const a=diagram('MA060-employment-policy').points.find(p=>p.id==='a'),b=diagram('MA060-employment-policy').points.find(p=>p.id==='b');close(a.y,200+.03*800-.17*200);close(b.y,200+.02*800-.12*200);
});
test('lower bound and exchange-rate experiments use explicit feasible rates and quote definitions',()=>{
 const floor=diagram('MA070-lower-bound');for(const p of floor.points){const pi=p.id==='credible'?2.5:1,rn=p.id==='old'?1:-2;close(p.y,-(p.x-pi-rn));if(p.id==='desired')assert.ok(p.x<0);else assert.ok(p.x>=0);}
 for(const p of diagram('MA082-fixed-rate').points){close(.2*p.x,120+(p.id==='old'?20:30)-20*p.y);close(p.y,5);}
 const fx=diagram('MA084-risk-exchange');for(const p of fx.points){const risk=p.id==='old'?.01:.02,expected=p.id==='both'?9.5:10;close(.03,.01+(expected-p.y)/p.y+risk);}
 const j=diagram('MA087-j-curve').points;close(j[1].y,10-1.2*10);close(j[2].y,12-1.2*8);
 close(diagram('MA088-real-exchange').points.find(p=>p.id==='actual').y,7.7*102/110);
});
test('structural diagrams retain separate accounting, timing, and theory branches',()=>{
 const qe=diagram('MA066-qe-ledger');assert.equal(qe.kind,'flow');assert.ok(qe.nodes.find(n=>n.id==='bank').detail.includes('总资产不变'));assert.ok(qe.nodes.find(n=>n.id==='base').detail.includes('不因该交易自动增加'));
 const qt=diagram('MA067-qt-ledger');for(const id of ['issue','account','mature','scarce','ample'])assert.ok(qt.nodes.some(n=>n.id===id));
 const timing=diagram('MA041-timing-branches');for(const id of ['strict','fisher','shared','zero','sign','sharedsign'])assert.ok(timing.nodes.some(n=>n.id===id));assert.ok(timing.nodes.find(n=>n.id==='zero').detail.includes('=0'));
 const growth=diagram('MA009-knowledge');assert.ok(growth.nodes.find(n=>n.id==='less').detail.includes('趋零'));assert.ok(growth.nodes.find(n=>n.id==='bpg').detail.includes('nR/(1−φ)'));
 for(const d of bank.diagrams.filter(d=>d.kind==='flow')){assert.equal(d.mode,'structure');for(const e of d.edges){const a=d.nodes.find(n=>n.id===e.from),b=d.nodes.find(n=>n.id===e.to);assert.ok(a&&b);assert.ok(e.stage>=a.stage&&e.stage>=b.stage);}}
});
test('MA025 original answer erratum distinguishes lower total borrowing cost from weaker easing',()=>{
 const d=diagram('MA025-credit-feedback'),q=source.questions.find(q=>q.id==='MA025');
 assert.ok(q.answer_md.includes(d.erratum.original_quote));
 const old=d.points.find(p=>p.id==='old'),next=d.points.find(p=>p.id==='endogenous');
 const di=next.y-old.y,dw=(3-.01*next.x)-(3-.01*old.x);
 close(di,-.5);close(dw,.1);close(di+dw,-.4);assert.ok(di+dw<0);
 close((next.x-old.x)-(-11.5/1.2),-5/12);
 assert.ok(d.erratum.explanation.includes('仍然下降'));assert.ok(d.erratum.checks.some(s=>s.includes('4和5')));
});
test('MA009 persistent research-growth branch explicitly excludes phi equal to one',()=>{
 const d=diagram('MA009-knowledge'),n=d.nodes.find(n=>n.id==='trend');
 assert.ok(n.label.includes('0<φ<1')&&n.label.includes('nR>0'));
 for(const e of d.edges.filter(e=>e.from==='trend'||e.to==='trend'))assert.ok(e.label.includes('0<φ<1')&&e.label.includes('nR>0'));
});
test('Solow investment-rate shift arrows compare the same capital, never an instantaneous capital jump',()=>{
 for(const id of ['MA001-graph','MA004-graph','MA005-graph','MA010-graph']){
  const d=diagram(id),f=d.numeric_facts,a=d.arrows.find(a=>a.shortLabel==='投资率变化');assert.ok(a,id);
  close(a.from[0],a.to[0]);close(a.from[1],f.s0*a.from[0]**f.alpha);close(a.to[1],f.s1*a.to[0]**f.alpha);assert.equal(a.stage,1);
 }
});
test('non-equilibrium, observations and target markers cannot masquerade as numbered equilibria',()=>{
 const a=diagram('MA021-graph'),dynamic=diagram('MA027-graph');
 assert.ok(a.title.includes('A点非均衡')&&!a.title.includes('IS左移'));
 assert.equal(a.points.find(p=>p.id==='b').label,'B');assert.equal(a.points.find(p=>p.id==='a').label,'A');
 assert.equal(dynamic.points.find(p=>p.id==='e').label,'E*');assert.equal(dynamic.points.find(p=>p.id==='a').label,'A');
 assert.deepEqual(a.arrows.map(a=>a.shortLabel),['产出减','利率降']);assert.deepEqual(dynamic.arrows.map(a=>a.shortLabel),['产出增','利率降']);
 for(const[id,pointId]of [['MA051-graph','initial'],['MA043-graph','start'],['MA073-graph','start'],['MA053-unemployment-map','first'],['MA058-labor-market','supply'],['MA069-policy-lags','implementation'],['MA070-lower-bound','desired'],['MA074-ricardian-budget','endowment'],['MA088-real-exchange','nominal']])assert.ok(!/^E[₀₁₂₃₄₅₆₇₈₉]/u.test(diagram(id).points.find(p=>p.id===pointId).label),id);
 for(const d of bank.diagrams)for(const a of d.arrows)assert.notEqual(a.shortLabel,'本题变化',d.id);
 const fisher=diagram('MA063-graph');assert.deepEqual(fisher.points.map(p=>p.label),['i₀','r₀','i₁','r₁']);assert.ok(fisher.arrows[0].label.includes('预期通胀差额'));
});
