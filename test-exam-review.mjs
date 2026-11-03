import test from 'node:test';
import assert from 'node:assert/strict';
import {questionReviewHash,prepareExamReview,prepareExamBank} from './build-exam-review.mjs';

const question={id:'T001',prompt_md:'求$x$。',answer_md:'$x=2$。',outline_md:'联立求解。',pitfalls_md:'检查约束。'};
const entry=()=>({id:question.id,source_sha256:questionReviewHash(question),verdict:'revised',method_md:'用两条独立条件联立求解。',steps:[{title:'列出条件',uses:['联立方程'],body_md:'由题意，\n\n$$x+y=3.$$'},{title:'解出并检验',uses:['代回检验'],body_md:'代入$y=1$，得$x=2$；满足原条件。'}],pitfalls_md:'不省略代回。',recap_md:'列式，再代回。',audit:{checked:['两式给出唯一解。','代回满足原约束。'],changes:['补足检验。'],unresolved:[]}});

test('exam review binds all source fields and preserves line-level mathematics',()=>{
 const review=prepareExamReview(question,entry());
 for(const step of review.steps)assert.equal(step.lines_md.join(''),step.body_md);
 assert.equal(review.source.source_sha256,questionReviewHash(question));
 assert.throws(()=>prepareExamReview({...question,prompt_md:'另一个条件。'},entry()),/source hash changed/);
});

test('review bank rejects missing, duplicate and foreign entries',()=>{
 const bank={version:1,subject:'micro',label:'编者审校',questions:[entry()]};
 assert.equal(prepareExamBank(bank,'micro',[question]).size,1);
 assert.throws(()=>prepareExamBank({...bank,questions:[]},'micro',[question]),/Incomplete/);
 assert.throws(()=>prepareExamBank({...bank,questions:[entry(),entry()]},'micro',[question]),/duplicate/);
 assert.throws(()=>prepareExamBank(bank,'macro',[question]),/Invalid/);
});

test('unresolved content cannot be presented as a completed review',()=>{
 const e=entry();e.audit.unresolved=['题面缺少必要参数。'];
 assert.throws(()=>prepareExamReview(question,e),/unresolved status/);
 e.verdict='needs-source';assert.equal(prepareExamReview(question,e).verdict,'needs-source');
 e.audit.checked=[];assert.throws(()=>prepareExamReview(question,e),/audit evidence/);
});

test('exam layout rejects repeated headings and punctuation leftovers',()=>{
 const duplicate=entry();duplicate.steps[1].title=duplicate.steps[0].title;
 assert.throws(()=>prepareExamReview(question,duplicate),/duplicate step titles/);
 const residue=entry();residue.steps[0].body_md='****\n正文。';
 assert.throws(()=>prepareExamReview(question,residue),/unfinished step layout/);
 const repeated=entry();repeated.steps[0].body_md='**列出条件。** 正文。';
 assert.throws(()=>prepareExamReview(question,repeated),/unfinished step layout/);
 const punctuation=entry();punctuation.steps[0].body_md='$$x=1$$\n\n，代入条件。';
 assert.throws(()=>prepareExamReview(question,punctuation),/orphan punctuation/);
});

test('inline parameter conditions stay with the reasoning they qualify',()=>{
 const e=entry();e.steps[0].body_md='当$a=1/3$时，导数在$q=0$处为正。';
 const review=prepareExamReview(question,e);
 assert.deepEqual(review.steps[0].lines_md,['当$a=1/3$时，导数在$q=0$处为正。']);
});

test('exam prose keeps its reasoning clauses together until the sentence ends',()=>{
 const e=entry();e.steps[0].body_md='联立两式，先消去$y$；再代入预算，可得$x=2$。因此原条件成立。';
 const review=prepareExamReview(question,e);
 assert.deepEqual(review.steps[0].lines_md,['联立两式，先消去$y$；再代入预算，可得$x=2$。','因此原条件成立。']);
 assert.equal(review.steps[0].lines_md.join(''),e.steps[0].body_md);
});
