import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {preparePracticeSelection} from './build-practice-selection.mjs';
import catalogModule from './dist/practice-catalog.js';
import stateModule from './dist/state-model.js';

const context={window:{}};
vm.runInNewContext(await readFile('dist/data.js','utf8'),context);
const data=JSON.parse(JSON.stringify(context.window.STUDY_DATA));
const raw=JSON.parse(await readFile('content/practice-selection.json','utf8'));
const catalog=catalogModule.createPracticeCatalog(data);

test('political practice keeps exactly 40 calculation questions across nine groups',()=>{
 const prepared=preparePracticeSelection(raw,data.subjects);
 assert.deepEqual(prepared.summary.political,{source:100,retained:40,removed:60,groups:9});
 assert.deepEqual(data.practiceSelection,prepared);
 assert.deepEqual(catalog.questions.filter(question=>question.subject==='political').map(question=>question.id),raw.subjects.political.question_ids);
 for(const id of ['PE003','PE043','PE054','PE080','PE095','PE099'])assert.ok(catalog.isActive(id));
 for(const id of ['PE001','PE019','PE025','PE026','PE100'])assert.equal(catalog.isActive(id),false);
 assert.equal(catalog.questions.filter(question=>question.subject!=='political').length,200);
});

test('topic and group navigation expose only retained political question links',()=>{
 assert.equal(catalog.topics.length,29);
 const political=catalog.topics.filter(topic=>topic.subject==='political');
 assert.equal(political.length,9);
 assert.ok(!catalog.groups('political').some(group=>group.id==='09'));
 const linked=new Set(political.flatMap(topic=>[...topic.source_question_ids,...topic.stages.flatMap(stage=>stage.question_ids)]));
 assert.deepEqual([...linked].sort(),[...raw.subjects.political.question_ids].sort());
 assert.ok(political.every(topic=>topic.stages.every(stage=>stage.question_ids.length&&stage.question_ids.every(catalog.isActive))));
 assert.equal(data.topics.length,30);
 assert.equal(data.subjects.find(subject=>subject.key==='political').questions.length,100);
});

test('unknown, duplicate and reordered selection identifiers fail the build',()=>{
 for(const change of [ids=>ids.push('PE999'),ids=>ids.push(ids[0]),ids=>ids.reverse(),ids=>ids.splice(0)]){
  const input=JSON.parse(JSON.stringify(raw));change(input.subjects.political.question_ids);
  assert.throws(()=>preparePracticeSelection(input,data.subjects));
 }
});

test('removed essays retain their historical records, drafts, favorites and sessions',()=>{
 const model=stateModule.createStateModel(data),state=model.fresh();
 state.drafts.PE001='historical essay draft';state.drafts.PE003='calculation draft';state.favorites=['PE001','PE003'];
 state.records=[{id:'old-essay',qid:'PE001',at:Date.now(),seconds:30,rating:1,day:null}];
 state.session={ids:['PE001','PE003'],index:0,mode:'historical',day:null,seconds:0,startedAt:null,revealed:false,hint:false,ratingId:null,solutionLines:1,work:{}};
 const restored=model.validate(state);
 assert.equal(restored.drafts.PE001,state.drafts.PE001);
 assert.equal(restored.drafts.PE003,state.drafts.PE003);
 assert.deepEqual(restored.favorites,state.favorites);
 assert.equal(restored.records[0].qid,'PE001');
 assert.deepEqual(restored.session.ids,['PE001','PE003']);
 assert.deepEqual(model.merge(model.fresh(),restored).drafts,restored.drafts);
});
