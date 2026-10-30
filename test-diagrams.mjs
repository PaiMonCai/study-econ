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
