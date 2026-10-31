import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareDiagrams} from './build-diagrams.mjs';
const bank=JSON.parse(fs.readFileSync(new URL('./content/diagrams-political.json',import.meta.url),'utf8'));
const questions=JSON.parse(fs.readFileSync(new URL('./content/political.json',import.meta.url),'utf8')).questions;
const diagram=id=>{const d=bank.diagrams.find(d=>d.id===id||d.question_id===id);assert.ok(d,id);return d;};
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${message}: ${a} != ${b}`);
const hasEdge=(id,from,to)=>assert.ok(diagram(id).edges.some(e=>e.from===from&&e.to===to),`${id}: ${from} -> ${to}`);
const node=(id,nid)=>{const n=diagram(id).nodes.find(n=>n.id===nid);assert.ok(n,`${id} ${nid}`);return n;};
const allText=id=>JSON.stringify(diagram(id));
test('all political coverage decisions are question-specific and graphs validate',()=>{
 assert.equal(bank.coverage.length,100);assert.equal(new Set(bank.coverage.map(c=>c.question_id)).size,100);
 prepareDiagrams(bank,'political',questions);
 for(const c of bank.coverage){assert.ok(c.reason.length>25,c.question_id);assert.equal(c.decision==='diagram',bank.diagrams.some(d=>d.question_id===c.question_id));}
 assert.equal(new Set(bank.coverage.filter(c=>c.decision==='text').map(c=>c.reason)).size,bank.coverage.filter(c=>c.decision==='text').length);
});
for(const d of bank.diagrams.filter(d=>d.kind==='flow'))test(d.id+' has named relations and coherent stage dependencies',()=>{
 assert.ok(d.edges.every(e=>e.label?.trim().length>1));
 for(const edge of d.edges){const a=d.nodes.find(n=>n.id===edge.from),b=d.nodes.find(n=>n.id===edge.to);assert.ok(edge.stage>=a.stage&&edge.stage>=b.stage);}
 for(const s of d.stages){assert.ok(s.explanation.length>15);assert.ok(s.checklist.length);}
});
test('labor duality branches represent one labor and preserve the value source distinction',()=>{
 hasEdge('PE001','labor','concrete');hasEdge('PE001','labor','abstract');hasEdge('PE001','abstract','v');hasEdge('PE001','abstract','m');
 assert.ok(!diagram('PE001').edges.some(e=>e.from==='concrete'&&e.to==='abstract'));
 assert.ok(node('PE001','old').detail.includes('不能把机器'));
});
test('three capital circuits use three parallel complete viewpoints, not three consecutive capitals',()=>{
 const d=diagram('PE031');assert.equal(d.nodes.length,9);
 for(const [row,stage]of [[0,0],[1,1],[2,2]]){const ns=d.nodes.filter(n=>n.row===row);assert.equal(ns.length,3);assert.ok(ns.every(n=>n.stage===stage));}
 assert.ok(allText('PE031').includes('空间并存'));assert.ok(allText('PE031').includes('回款中断'));
 assert.ok(d.edges.every(e=>d.nodes.find(n=>n.id===e.from).row===d.nodes.find(n=>n.id===e.to).row));
});
test('simple reproduction keeps real flows and value correspondences in the right departments',()=>{
 hasEdge('PE041','I','IIc');hasEdge('PE041','II','Ivm');
 assert.ok(node('PE041','IIc').label.includes('生产资料2000'));assert.ok(node('PE041','Ivm').label.includes('消费资料2000'));
 near(6000,4000+2000,'production goods');near(3000,1000+2000,'consumption goods');
 assert.ok(allText('PE041').includes('不是货币支付方向'));
});
test('expanded reproduction forms next capital before next surplus and national income',()=>{
 hasEdge('PE042','n2','nextI');hasEdge('PE042','n3','nextII');hasEdge('PE042','nextI','n5');hasEdge('PE042','nextII','n5');
 near(1000*.5*4/5,400,'I extra c');near(1000*.5/5,100,'I extra v');near(150/750,.2,'II accumulation rate');
 near(6000,4400+1600,'current production goods');near(3000,1100+500+800+600,'current consumption goods');near(3800,2*(1100+800),'next new value');
 assert.ok(allText('PE042').includes('不能用未来m倒填本期积累'));
});
test('feedbacks are explicit and parallel pressures do not become false causal chains',()=>{
 hasEdge('PE061','risk','expand');assert.ok(!diagram('PE061').edges.some(e=>e.from==='credit'&&e.to==='private'));
 hasEdge('PE078','n5','n0');hasEdge('PE088','n0','n1');hasEdge('PE088','n0','n2');hasEdge('PE088','n4','n1');
 assert.ok(!diagram('PE088').edges.some(e=>e.from==='n1'&&e.to==='n2'));
 hasEdge('PE094','n1','n3');hasEdge('PE094','n3','n5');hasEdge('PE094','n5','n1');
 hasEdge('PE096','exposure','funding');hasEdge('PE096','exposure','currency');hasEdge('PE096','capital','funding');
 assert.ok(!diagram('PE096').edges.some(e=>e.from==='funding'&&e.to==='currency'));
});
test('productivity, intensity and money value are distinct independent experiments',()=>{
 const f=diagram('PE003').numeric_facts;near(f.base_quantity*f.base_unit_value,2000,'baseline new value');
 for(const [q,total,unit,price]of f.cases){near(q,f.base_quantity*f.factor,'both produce125');near(total/q,unit,'unit value');near(unit/f.money_value,price,'money price');}
 near(f.cases[0][1],2000,'same-time productivity');near(f.cases[1][1],2500,'increased intensity');
});
test('payment netting and price purchasing-power factors use different denominators',()=>{
 const f=diagram('PE006').numeric_facts;near((f.sale-f.credit+f.due-f.offset)/f.velocity,f.needed,'real payment requirement');near(f.issued/f.needed,10/9,'price factor');near(f.needed/f.issued,.9,'purchasing power');
});
test('capital accumulation separates nominal funds and real combinations',()=>{
 const f=diagram('PE021').numeric_facts;near(f.v*f.rate*f.turns,f.M,'annual surplus');near(f.M*.4,f.base_acc,'base accumulation');near(f.M*.5,f.higher_acc,'higher accumulation');near(f.base_acc/f.base_price,12,'base units');near(f.higher_acc/f.base_price,15,'funds route');near(f.base_acc/f.lower_price,15,'price route');
});
const plotEquations={
 capital_employment:{old:x=>x/5,new:x=>x/10},profit_composition:{r100:x=>100/(x+1),r150:x=>150/(x+1)},turnover33:{M:x=>50*x},circulation_time:{turns:x=>12/(1+x)},accumulation_feasibility:{balance:x=>1-1.6*x,feasible:x=>1-1.6*x},renewal45:{purchase:x=>1800+x,demand:x=>2000},rent_capitalization58:{capitalization:x=>2000/x},leverage66:{equity:x=>x-150},accumulation_consumption80:{constraint:x=>600-x}
};
for(const d of bank.diagrams.filter(d=>plotEquations[d.numeric_facts?.model]))test(d.id+' independently matches its economic relation at every curve point',()=>{
 const equations=plotEquations[d.numeric_facts.model];for(const s of d.series)for(const[x,y]of s.points)near(y,equations[s.id](x),d.id+' '+s.id);
});
test('employment and profit ratios retain their fixed-condition comparisons',()=>{
 const e=diagram('PE022').numeric_facts;near(e.old_K/(1+e.old_ratio),200,'old v');near(e.new_K/(1+e.new_ratio),150,'new v');near(e.hold_K/(1+e.new_ratio),200,'hold jobs');
 const f=diagram('PE029').numeric_facts;near(f.v*f.m_rates[0],200,'initial M');near(f.v*f.m_rates[1],300,'larger M');near(200/1000,.2,'old p');near(200/2000,.1,'new p');near(300/2000,.15,'larger M but lower p');
});
test('year turnover uses recovery flows and full advanced stock, not the fluid count alone',()=>{
 const f=diagram('PE032').numeric_facts;near(f.fixed/5+(f.fluid-f.v)*3,f.c_used,'annual c');near(f.v*3,f.v_used,'annual wages');near(f.output_value-f.c_used-f.v_used,f.M,'M312');near(f.M/f.v,f.Mrate,'annual M ratio');near((f.fixed/5+f.fluid*3)/f.capital,f.turnover,'first turnover');near((f.next_fixed/5+f.next_fluid*6)/f.next_capital,f.next_turnover,'next turnover');
 const g=diagram('PE033').numeric_facts;for(const[n,M,Mr,pr,total]of g.cases){near(g.v*g.m_rate*n,M,'M');near(M/g.v,Mr,'annual M ratio');near(M/g.K,pr,'profit rate');near((g.fixed_transfer+g.fluid*n)/g.K,total,'total turnover');}
});
test('circulation time zero still leaves a finite production lower bound',()=>{
 const f=diagram('PE036').numeric_facts;for(const[t,n,M]of f.cases){near(f.year_months/(f.production_months+t),n,'turns');near(f.v*f.m_rate*n,M,'annual M');}assert.equal(f.cases.at(-1)[1],12);
});
test('the three surplus denominators remain economically different',()=>{
 const f=diagram('PE038').numeric_facts;near(f.fixed/f.life+f.fluid_c*f.n,f.c_used,'c');near(f.v*f.n,f.v_used,'wages');near(f.v*f.m_rate*f.n,f.M,'M');near(f.c_used+f.v_used+f.M,f.product,'product');near(f.M/f.v,3,'M ratio');near(f.M/f.advance,.3,'profit rate');near(f.M/(f.c_used+f.v_used),3/7,'cost ratio');
});
test('reproduction feasible set, whole-capital updates and renewal mismatch retain all conditions',()=>{
 const a=diagram('PE043').numeric_facts;near(a.intercept+a.slope*a.a_max,0,'boundary b0');near(a.intercept+a.slope*a.test_a,a.test_b,'infeasible b');assert.ok(a.test_b<0);
 const w=diagram('PE044').numeric_facts;for(const[v,mr,NI,consumption]of w.cases){near((w.I_next_v+v)*(1+mr),NI,'next national income');near(w.I_next_v+1000+v+consumption,w.current_consumption_goods,'current consumer realization');}
 const r=diagram('PE045').numeric_facts;for(const[R,purchase,gap]of r.cases){near(r.fluid_used+R,purchase,'real purchases');near(r.I_vm-purchase,gap,'gap');}
 const z=diagram('PE049').numeric_facts;near(4400+1500+z.bad_II_c_add,z.bad_production_demand,'production demand');near(1600+750+125+375,z.bad_consumption_demand,'consumer demand');near(z.bad_production_demand-6000,z.gap,'structure mismatch');near(3000-z.bad_consumption_demand,z.gap,'other side mismatch');
});
test('average profit and commercial distribution conserve total produced surplus',()=>{
 const f=diagram('PE051').numeric_facts;near(f.m.reduce((a,b)=>a+b,0)/f.capitals.reduce((a,b)=>a+b,0),f.rate,'general rate');near(f.values.reduce((a,b)=>a+b,0),f.prices.reduce((a,b)=>a+b,0),'price value sum');for(let i=0;i<3;i++)near(f.capitals[i]*(1+f.rate),f.prices[i],'production price');
 const g=diagram('PE052').numeric_facts;near(g.M/(g.industrial_K+g.commercial_K),g.rate,'commercial rate');near(g.industrial_profit+g.commercial_profit,g.M,'M conserved');near(g.industrial_K+g.industrial_profit,g.wholesale,'wholesale');near(g.wholesale+g.commercial_profit,g.retail,'retail');
 const h=diagram('PE053').numeric_facts;near((h.industrial_v+h.transport_v+h.storage_v)*h.m_rate,h.gross_M,'productive M');near(h.gross_M-h.pure_cost,h.distributable,'net distribution');near(h.distributable/h.total_K,h.average_rate,'average');near(h.industrial_profit+h.commercial_profit,h.distributable,'profits');near(h.wholesale+50+30+20+70,h.retail,'retail only adds expenditures once');near(1400+70+50,h.retail,'total production value');
});
test('capitalization, bank losses, leverage and consumption do not silently switch their bases',()=>{
 const f=diagram('PE058').numeric_facts;for(const[i,P]of f.cases)near(f.rent/(i/100),P,'land capitalization');
 const b=diagram('PE065').numeric_facts;near(b.loans*b.loan_rate-b.deposits*b.deposit_rate-b.cost,b.profit,'bank profit');near(b.profit-b.loss,b.after_profit,'credit loss');near(b.after_profit/b.equity,.05,'initial equity denominator');
 const l=diagram('PE066').numeric_facts;near(l.asset*(1-l.drop),l.after_asset,'asset mark');near(l.after_asset-l.debt,l.after_equity,'book equity');near((l.cash_income-l.debt*l.loan_rate+l.after_equity-l.equity)/l.equity,l.total_return,'total equity return');
 const n=diagram('PE080').numeric_facts;near(n.gross_product-n.old_value,n.NI,'net new value');for(const[A,C,rate]of n.cases){near(A+C,n.NI,'A+C');near(A/n.NI,rate,'accumulation ratio');}
});
test('new credit and crisis maps distinguish propagation from root and show feedbacks',()=>{
 hasEdge('PE069','demand','cash');hasEdge('PE069','credit','output');hasEdge('PE062','imbalance','over');
 assert.ok(allText('PE062').includes('物质基础'));assert.ok(allText('PE062').includes('具体触发'));assert.ok(allText('PE069').includes('原本正常企业'));
});
test('existing political value and distribution plots still follow original problem functions',()=>{
 const models={PE012:{base:x=>30*x,v:x=>120,extend:x=>30*x,vnew:x=>90},PE016:{new:x=>40*x,wage:x=>160},PE095:{export:x=>100*x,import:x=>40*x,profit:x=>60*x-300,'total-cost':x=>40*x+300},PE099:{net:x=>350,local:x=>.8*x+86,foreign:x=>264-.8*x,profits:x=>330-x}};
 for(const[id,functions]of Object.entries(models)){const d=diagram(id);for(const s of d.series)for(const[x,y]of s.points)near(y,functions[s.id](x),id+' '+s.id);}
 near(30*8-120,120,'baseline surplus');near(30*10-120,180,'absolute surplus');near(30*8-90,150,'relative surplus');near(40*8+500,820,'product value');near((160/660)*100,800/33,'consumed capital ratio');
 const fx=diagram('PE095');assert.ok(fx.points.some(p=>p.id==='base-import'&&p.y===280));assert.ok(fx.points.some(p=>p.id==='new-import'&&p.y===260));near(60*(6.5-7),-30,'net FX exposure');
 const local=diagram('PE099');near(.8*210+86-(.8*180+86),24,'local gain');near((264-.8*210)-(264-.8*180),-24,'foreign reduction');assert.ok(local.arrows.length===2);
});
test('workday segmented rectangles encode time lengths only, not a false value area',()=>{
 const d=diagram('PE012-hours');const lengths={'base-necessary':4,'base-surplus':4,'absolute-necessary':4,'absolute-surplus':6,'relative-necessary':3,'relative-surplus':5};
 for(const s of d.series){const xs=s.points.map(p=>p[0]);near(Math.max(...xs)-Math.min(...xs),lengths[s.id],s.id+' hours');}
 assert.ok(d.notes.some(n=>n.includes('矩形高度只为排版')));
});
