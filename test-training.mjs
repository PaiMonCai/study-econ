import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareTrainingBank,prepareComprehensiveBank,prepareTrainingPapers} from './build-training.mjs';
import stateModel from './dist/state-model.js';

const read=name=>readFile(new URL('./content/'+name+'.json',import.meta.url),'utf8').then(JSON.parse);
const clone=value=>JSON.parse(JSON.stringify(value));

for(const subject of ['micro','macro']){
 test(subject+' all 100 structured prompts bind to the existing source and answer steps',async()=>{
  const [source,review,bank]=await Promise.all([read(subject),read('exam-review-'+subject),read('training-'+subject)]);
  const prepared=prepareTrainingBank(bank,subject,source.questions,review);
  assert.equal(prepared.size,100);
  const stale=clone(bank);stale.questions[0].review_sha256='0'.repeat(64);
  assert.throws(()=>prepareTrainingBank(stale,subject,source.questions,review),/reviewed answer changed/);
  const missing=clone(bank);missing.questions[0].parts.forEach(part=>part.answer_step_indexes=[0]);
  assert.throws(()=>prepareTrainingBank(missing,subject,source.questions,review),/steps omitted/);
 });
 test(subject+' all 20 comprehensive cases cover the ten topics with matched rubrics',async()=>{
  const [source,bank]=await Promise.all([read(subject),read('comprehensive-'+subject)]);
  const prepared=prepareComprehensiveBank(bank,subject,source.questions,source.groups);
  assert.equal(prepared.length,20);assert.equal(prepared.reduce((sum,q)=>sum+q.points,0),500);
  const wrongScore=clone(bank);wrongScore.cases[0].parts[0].rubric[0].points++;
  assert.throws(()=>prepareComprehensiveBank(wrongScore,subject,source.questions,source.groups),/rubric/);
  const wrongScope=clone(bank);wrongScope.cases[0].figure_references=[{question_id:source.questions[0].id,part_ids:['99'],scope_md:'wrong scope'}];
  assert.throws(()=>prepareComprehensiveBank(wrongScope,subject,source.questions,source.groups),/figure scope/);
 });
}

test('three diagnostic papers contain distinct known cases and total 100 points each',async()=>{
 const subjects=await Promise.all(['micro','macro'].map(async subject=>{
  const [source,bank]=await Promise.all([read(subject),read('comprehensive-'+subject)]);
  return prepareComprehensiveBank(bank,subject,source.questions,source.groups);
 }));
 const cases=subjects.flat(),bank=await read('training-papers');
 assert.equal(prepareTrainingPapers(bank,cases).length,3);
 const duplicate=clone(bank);duplicate.papers[1].question_ids[0]=duplicate.papers[0].question_ids[0];
 assert.throws(()=>prepareTrainingPapers(duplicate,cases),/repeated/);
});

function modelFixture(){
 const ids=['CMI01','CMI07','CMA01','CMA05'];
 const questions=ids.map(id=>({id,comprehensive:true,parts:Array.from({length:5},(_,index)=>({id:String(index+1),points:5}))}));
 const data={subjects:[{key:'micro',questions:[{id:'MI001'}]}],plan:{start:'2026-11-03'},recall:{cards:[]},topics:[],comprehensive:{questions,papers:[{id:'P01',question_ids:ids}]}};
 return {model:stateModel.createStateModel(data),ids};
}
const record=(partScores={1:4.5,2:5,3:5,4:5,5:5})=>({id:'attempt-1',qid:'CMI01',rating:1,at:1000,updatedAt:1000,seconds:90,day:null,score:Object.values(partScores).reduce((sum,value)=>sum+value,0),maxScore:25,partScores});

test('legacy records remain intact when the comprehensive catalog is added',()=>{
 const {model}=modelFixture(),state=model.fresh();
 state.records=[{id:'old-record',qid:'MI001',rating:2,at:1000,seconds:30,day:1}];state.drafts={MI001:'old draft'};
 const restored=model.validate(state);
 assert.equal(restored.records[0].qid,'MI001');assert.equal(restored.records[0].rating,2);assert.equal(restored.drafts.MI001,'old draft');
 assert.equal(restored.records[0].score,undefined);
});

test('comprehensive part scores survive state validation and merge',()=>{
 const {model}=modelFixture(),state=model.fresh();state.records=[record()];
 const restored=model.validate(state),merged=model.merge(model.fresh(),restored);
 assert.equal(merged.records[0].score,24.5);assert.deepEqual(clone(merged.records[0].partScores),{1:4.5,2:5,3:5,4:5,5:5});
});

test('invalid score vectors and scoring ordinary questions are rejected',()=>{
 const {model}=modelFixture();
 for(const change of [r=>r.partScores[1]=5.5,r=>r.partScores[1]=4.25,r=>r.score=25,r=>r.qid='MI001']){
  const state=model.fresh();state.records=[record()];change(state.records[0]);assert.throws(()=>model.validate(state),/评分|总分/);
 }
});

test('unfinished papers restore without exposing answer or hints',()=>{
 const {model,ids}=modelFixture(),state=model.fresh();
 state.session={ids,index:0,day:null,paperId:'P01',paperAttempt:'paper-attempt',paperSubmitted:false,paperRunning:true,revealed:true,hint:true,work:{CMI01:{revealed:true,hint:true}}};
 const restored=model.validate(state).session;
 assert.equal(restored.revealed,false);assert.equal(restored.hint,false);assert.equal(restored.work.CMI01.revealed,false);assert.equal(restored.paperRunning,true);
 state.session.paperSubmitted=true;
 assert.equal(model.validate(state).session.revealed,true);assert.equal(model.validate(state).session.paperRunning,false);
});

test('paper records bind to their paper and attempt instead of unrelated cases',()=>{
 const {model}=modelFixture(),state=model.fresh();state.records=[{...record(),paperId:'P01',paperAttempt:'paper-attempt'}];
 assert.equal(model.validate(state).records[0].paperAttempt,'paper-attempt');
 state.records[0].paperId='P99';assert.throws(()=>model.validate(state),/限时卷记录/);
});

test('partial or reordered paper sessions are rejected during restore',()=>{
 const {model,ids}=modelFixture();
 for(const selected of [ids.slice(0,3),[...ids].reverse()]){
  const state=model.fresh();state.session={ids:selected,index:0,day:null,paperId:'P01',paperAttempt:'paper-attempt'};
  assert.throws(()=>model.validate(state),/限时训练卷/);
 }
});

test('restored paper sessions cannot count scores from earlier or individual attempts',()=>{
 const {model,ids}=modelFixture(),state=model.fresh();
 state.records=[{...record(),paperId:'P01',paperAttempt:'earlier-attempt'}];
 state.session={ids,index:0,day:null,paperId:'P01',paperAttempt:'current-attempt',paperSubmitted:true,ratingId:'attempt-1',work:{CMI01:{ratingId:'attempt-1'}}};
 const restored=model.validate(state);
 assert.equal(restored.session.ratingId,null);assert.equal(restored.session.work.CMI01.ratingId,null);
 assert.equal(restored.records[0].score,24.5);
});
