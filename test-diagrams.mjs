import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareDiagrams, validateDiagram} from './build-diagrams.mjs';

const subjects = ['micro', 'macro', 'political'];
const banks = Object.fromEntries(subjects.map(s => [s, JSON.parse(fs.readFileSync(new URL('./content/diagrams-' + s + '.json', import.meta.url)))]));
const questions = Object.fromEntries(subjects.map(s => [s, JSON.parse(fs.readFileSync(new URL('./content/' + s + '.json', import.meta.url))).questions]));
const political = id => banks.political.diagrams.find(d => d.question_id === id);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, actual + ' != ' + expected);

test('all 300 coverage decisions bind only to their own original question and subject', () => {
 const ids = new Set();
 for (const subject of subjects) {
  const index = prepareDiagrams(banks[subject], subject, questions[subject]);
  assert.equal(banks[subject].coverage.length, 100);
  for (const [qid, diagrams] of index) for (const d of diagrams) {
   assert.equal(d.question_id, qid);
   assert.ok(!ids.has(d.id)); ids.add(d.id);
   assert.ok(questions[subject].find(q => q.id === qid)[d.source.field].includes(d.source.quote));
  }
 }
});

test('every drawing names the textbook mechanism, physical pages and checked economic relationships', () => {
 for (const subject of subjects) for (const d of banks[subject].diagrams) {
  assert.ok(d.textbook?.references.length > 0,d.id+' missing textbook reference');
  assert.ok(d.textbook.references.every(r=>r.file.endsWith('.pdf')&&r.pages.length&&r.pages.every(p=>Number.isInteger(p)&&p>0)),d.id);
  assert.ok(d.textbook.checks.length>=2,d.id+' must explain what was checked');
 }
});

test('political relationship drawings preserve circular reproduction and institutional direction', () => {
 assert.ok(political('PE015').edges.some(e=>e.from==='n5'&&e.to==='n0'),'PE015 must connect the next round');
 const circuits=political('PE031');
 for(const [from,to,stage,label] of [['g2','g0',0,'实现的货币资本再预付，进入下一轮'],['p2','p0',1,'再次生产接续下一轮生产资本循环'],['w2','w0',2,'新商品资本接续下一轮实现与生产']]) {
  assert.ok(circuits.edges.some(e=>e.from===from&&e.to===to&&e.stage===stage&&e.label===label),'PE031 each circuit must return at its own reveal stage');
  assert.equal(circuits.nodes.find(n=>n.id===from).stage,stage);
  assert.equal(circuits.nodes.find(n=>n.id===to).stage,stage);
 }
 const exports=political('PE094');
 assert.ok(exports.edges.some(e=>e.from==='n5'&&e.to==='n1'&&e.stage===2&&e.label==='再次购买投入'),'export receipts support renewed inputs');
 assert.ok(exports.edges.some(e=>e.from==='n4'&&e.to==='n0'&&e.stage===2&&e.label==='市场需要反馈'),'consumption feeds back to orders');
 assert.ok(exports.notes.some(n=>n.includes('不是出口订单增加的充分原因')),'domestic consumption alone does not establish export demand');
 const credit=political('PE061');
 assert.ok(credit.edges.some(e=>e.from==='social'&&e.to==='private'&&e.stage===2&&e.label==='社会化不等于占有变更'),'socialization and ownership link marks a distinction');
 assert.ok(credit.nodes.find(n=>n.id==='private').detail.includes('不自动改变控制和占有关系'));
 assert.ok(credit.stages[2].explanation.includes('不是信用创新的结果'),'private ownership is a pre-existing relation rather than a result of credit');
 assert.ok(credit.textbook.checks.includes('促进社会化和维持私人占有不可画成前者产生后者。'));
 const market=political('PE081');
 for (const target of ['allocation','government'])assert.ok(market.edges.some(e=>e.from==='rules'&&e.to===target));
 assert.ok(political('PE088').edges.some(e=>e.from==='n4'&&e.to==='n1'),'consumption feeds back to production');
});

test('rejects ungrounded diagrams and inconsistent coverage before publishing data', () => {
 const bank = structuredClone(banks.micro), q = questions.micro[0];
 const graph = structuredClone(bank.diagrams[0]);
 assert.throws(() => prepareDiagrams({...bank, subject:'macro'}, 'micro', questions.micro), /subject/);
 assert.throws(() => prepareDiagrams({...bank, coverage:bank.coverage.slice(1)}, 'micro', questions.micro), /coverage/);
 assert.throws(() => prepareDiagrams({...bank, diagrams:[...bank.diagrams, bank.diagrams[0]]}, 'micro', questions.micro), /unique/);
 assert.throws(() => validateDiagram({...graph, source:{field:'answer_md', quote:'not present in this answer'}}, q), /source quotation/);
 assert.throws(() => validateDiagram({...graph, axes:{...graph.axes,x:{label:'x',min:1,max:1}}}, q), /axis/);
 assert.throws(() => validateDiagram({...graph, series:[{...graph.series[0], points:[[NaN,0],[1,1]]}]}, q), /coordinates/);
 assert.throws(() => validateDiagram({...graph, points:[{id:'bad',x:1e12,y:0,label:'bad',stage:0}]}, q), /key points/);
});

test('a curve name cannot be anchored to another curve or a hidden future relationship', () => {
 const graph=structuredClone(banks.micro.diagrams[0]);
 const q=questions.micro.find(q=>q.id===graph.question_id);
 const label=graph.labels.find(l=>l.curve_id);
 assert.ok(label,'consumer graph has explicit curve-name anchors');
 label.curve_id='missing-curve';
 assert.throws(()=>validateDiagram(graph,q),/curve label/);
 label.curve_id=graph.series[0].id;
 label.curve_anchor=[q.id.length,graph.axes.y.min];
 assert.throws(()=>validateDiagram(graph,q),/curve label/);
});

test('flow edges cannot point at nodes that are hidden at that stage', () => {
 const graph = structuredClone(political('PE001'));
 const q = questions.political.find(q => q.id === graph.question_id);
 graph.edges.push({from:'labor',to:'m',stage:0});
 assert.throws(() => validateDiagram(graph,q), /visible edge endpoints/);
});

test('PE012 compares absolute and relative surplus value as separate experiments', () => {
 const d = political('PE012'), facts = d.numeric_facts;
 assert.deepEqual(facts,{rate:30,base_hours:8,necessary_hours:4,extended_hours:10,new_v:90});
 const baseV = facts.necessary_hours * facts.rate;
 close(facts.base_hours * facts.rate - baseV,120);
 close(facts.extended_hours * facts.rate - baseV,180);
 close(facts.base_hours * facts.rate - facts.new_v,150);
 close(facts.new_v / facts.rate,3);
 for (const id of ['base','extend']) for (const [hours,value] of d.series.find(s=>s.id===id).points) close(value,30*hours);
 assert.match(d.stages[2].explanation,/8小时/);
});

test('PE012 workday segments use the stated hours and compare each experiment with the baseline', () => {
 const d=banks.political.diagrams.find(d=>d.id==='PE012-hours');
 for (const [id,necessary,total] of [['base',4,8],['absolute',4,10],['relative',3,8]]) {
  const n=d.series.find(s=>s.id===id+'-necessary'),m=d.series.find(s=>s.id===id+'-surplus');
  close(n.points[1][0]-n.points[0][0],necessary);
  close(m.points[1][0]-m.points[0][0],total-necessary);
  close(n.points[1][0],m.points[0][0]);
 }
 assert.match(d.notes.join(''),/高度.*不表示价值量/);
});

test('PE016 separates transferred value, new value and the denominator of surplus-value ratios', () => {
 const d = political('PE016');
 for (const [hours,value] of d.series.find(s=>s.id==='new').points) close(value,40*hours);
 assert.equal(d.series.some(s=>s.id==='product'||s.id==='old'),false,'no unsupported intraday transfer path');
 for (const [,value] of d.series.find(s=>s.id==='wage').points) close(value,160);
 close(8*40-160,160);
 close(500+8*40,820);
 assert.match(d.notes.join(''),/未给逐小时转移假设/);
});

test('PE095 computes the net currency exposure and fixed-cost profit exactly', () => {
 const d = political('PE095');
 for (const s of d.series) for (const [e,value] of s.points) close(value,({export:100*e,import:40*e,profit:60*e-300,'total-cost':40*e+300})[s.id]);
 close(60*7-300,120);close(60*6.5-300,90);close(60*(6.5-7),-30);
 close((120-90)/120,.25);
});

test('PE099 keeps net value added fixed while local and foreign incomes reallocate', () => {
 const d = political('PE099');
 for (const s of d.series) for (const [w,value] of s.points) close(value,({net:350,local:w+20+.2*(350-w-20),foreign:.8*(350-w-20),profits:350-w-20})[s.id]);
 close(1000-600-50,350);
 for (const wage of [180,210]) close(wage+20+.2*(330-wage)+.8*(330-wage),350);
 close(.8*30,24);
});

test('reproduction and capital concentration labels preserve the stated accounting', () => {
 const simple = political('PE041'), expanded = political('PE042'), concentration = political('PE025');
 assert.ok(simple.nodes.some(n=>n.id==='IIc'&&n.label.includes('2000')));
 close(4000+2000,6000);close(1000+2000,3000);
 close(1000+100+500,1600);close(150/750,.2);close((3800-3500)/3500,3/35);
 assert.ok(expanded.nodes.some(n=>n.label.includes('3500→3800')));
 assert.ok(concentration.nodes.find(n=>n.id==='noadd').detail.includes('不自动'));
});
