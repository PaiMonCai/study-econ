import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareIntensivePlan,intensiveMarkdown} from './build-intensive.mjs';
import stateModel from './dist/state-model.js';
import intensiveUI from './dist/intensive.js';

const read=async name=>JSON.parse(await readFile(new URL('./content/'+name+'.json',import.meta.url),'utf8'));
const subjects=await Promise.all(['micro','macro','political'].map(async key=>({key,...await read(key)})));
const banks=await Promise.all(['micro','macro'].map(s=>read('comprehensive-'+s)));
const comprehensive={questions:banks.flatMap(b=>b.cases.map(q=>({...q,comprehensive:true}))),papers:(await read('training-papers')).papers};
const raw=await read('intensive-plan'),plan=prepareIntensivePlan(raw,subjects,comprehensive);
const model=stateModel.createStateModel({subjects,comprehensive,plan:await read('plan'),intensivePlan:plan,recall:await read('recall')});
const copy=value=>structuredClone(value);
const rec=(id,qid,extra={})=>({id,qid,rating:2,at:1000,updatedAt:1000,seconds:60,day:null,...extra});

test('15 days cover all 200 specialist questions, twenty topics, and real four-hour blocks',()=>{
 assert.equal(plan.days.length,15);
 for(const subject of plan.subjects){const first=plan.days.slice(0,10).map(d=>d[subject]);assert.equal(new Set(first.flatMap(b=>b.groups)).size,10);assert.equal(first.flatMap(b=>b.required_refs).length,20);assert.equal(new Set(first.flatMap(b=>[...b.required_refs,...b.screen_refs])).size,100);}
 assert.ok(plan.days.every(d=>d.blocks.reduce((n,b)=>n+b.minutes,0)===240));
 assert.equal(plan.days.flatMap(d=>['micro','macro'].flatMap(s=>d[s].checks)).length,90);
 const guide=intensiveMarkdown(plan,subjects,comprehensive);assert.ok(guide.includes('第15天'));assert.ok(guide.includes('筛查不计完整作答'));
});

test('plan validation rejects missing scope, excess time, wrong-subject refs and prematurely exposed final papers',()=>{
 for(const mutate of [p=>p.days.pop(),p=>p.days[0].blocks[0].minutes++,p=>p.days[0].micro.screen_refs.pop(),p=>p.days[0].micro.extra_refs.push('PE001'),p=>p.days[0].micro.extra_refs.push('CMI09'),p=>p.days[0].macro.extra_refs.push('CMA17'),p=>p.days[0].macro.required_refs.reverse().push('MA002'),p=>p.days[14].macro.required_refs.pop()]){
  const p=copy(raw);mutate(p);assert.throws(()=>prepareIntensivePlan(p,subjects,comprehensive));
 }
});

test('legacy state migrates without changing fifty-day dates, drafts, favorites, records or day attribution',()=>{
 const old={version:1,start:'2026-10-29',records:[rec('old','MI001',{day:1})],drafts:{MI001:'legacy'},favorites:['MI001'],session:null};
 const migrated=model.validate(old);assert.equal(migrated.start,old.start);assert.deepEqual(migrated.records,old.records);assert.deepEqual(migrated.drafts,old.drafts);assert.deepEqual(migrated.favorites,old.favorites);assert.equal(migrated.schedule.mode,'intensive');assert.equal(migrated.schedule.start,'2026-11-04');assert.equal(migrated.records[0].planId,undefined);
});

test('intensive sessions and ratings survive validation but cannot inherit a legacy rating',()=>{
 const state=model.fresh();state.records=[rec('old','MI001',{day:1}),rec('int','MI010',{planId:plan.id,planDay:1})];
 state.session={ids:['MI001','MI010'],index:0,mode:'test',day:null,planId:plan.id,planDay:1,ratingId:'old',work:{MI001:{ratingId:'old'},MI010:{ratingId:'int'}}};
 const clean=model.validate(state);assert.equal(clean.session.planId,plan.id);assert.equal(clean.session.planDay,1);assert.equal(clean.session.ratingId,null);assert.equal(clean.session.work.MI001.ratingId,null);assert.equal(clean.session.work.MI010.ratingId,'int');assert.equal(clean.records[1].planDay,1);
});

test('intensive context rejects political records, legacy day collisions and invalid plan days',()=>{
 for(const extra of [{planId:plan.id,planDay:16},{planId:'other',planDay:1},{planId:plan.id,planDay:1,day:1},{planId:plan.id}])assert.throws(()=>model.validate({...model.fresh(),records:[rec('bad','MI001',extra)]}));
 assert.throws(()=>model.validate({...model.fresh(),records:[rec('bad','PE001',{planId:plan.id,planDay:1})]}));
});

test('schedule and checklist sync merge newer values, including unchecked results and old backups',()=>{
 const before=model.fresh(),next=copy(before);next.schedule={mode:'legacy',start:'2026-11-08',at:2000};next.intensiveProgress={'1:micro:0':{checked:true,at:2000}};
 const synced=model.apply(before,model.diff(before,next));assert.deepEqual(JSON.parse(JSON.stringify(synced)),JSON.parse(JSON.stringify(next)));
 const other=copy(before);other.intensiveProgress={'1:micro:0':{checked:false,at:3000},'2:macro:1':{checked:true,at:3000}};other.schedule={mode:'intensive',start:'2026-11-09',at:1000};
 const merged=model.merge(synced,other);assert.equal(merged.intensiveProgress['1:micro:0'].checked,false);assert.equal(merged.intensiveProgress['2:macro:1'].checked,true);assert.deepEqual(merged.schedule,synced.schedule);
 const old=copy(before);delete old.schedule;delete old.intensiveProgress;const restored=model.merge(merged,old);assert.deepEqual(restored.schedule,synced.schedule);assert.equal(restored.intensiveProgress['1:micro:0'].checked,false);
 assert.equal(model.apply(merged,[{path:['schedule'],before:null,after:other.schedule}]).schedule.at,2000);
 assert.throws(()=>model.validate({...before,intensiveProgress:{'16:micro:0':{checked:true,at:1}}}));
});

test('review queue uses one, three and seven days, latest self-ratings and only macro/micro',()=>{
 const queue=intensiveUI.reviewQueue(plan,[rec('pe','PE001',{rating:0}),rec('a','MI001',{rating:0}),rec('b','MI001',{rating:2,at:2000}),rec('c','MA003',{rating:1})],8);
 assert.deepEqual(queue.dueDays,[7,5,1]);assert.deepEqual(queue.wrong,['MA003']);assert.ok(!queue.ids.includes('PE001'));assert.ok(queue.ids.length<=6);
});

test('final paper scores use the latest complete attempt without mixing old perfect answers',()=>{
 const paper=comprehensive.papers.find(p=>p.id==='P02');const scores=paper.question_ids.map((qid,i)=>rec('a'+i,qid,{at:1000+i,paperId:paper.id,paperAttempt:'first',score:25,maxScore:25}));
 assert.equal(intensiveUI.paperSummary(paper,scores).total,100);
 scores.push(rec('new',paper.question_ids[0],{at:5000,paperId:paper.id,paperAttempt:'second',score:20,maxScore:25}));
 let result=intensiveUI.paperSummary(paper,scores);assert.equal(result.count,1);assert.equal(result.total,null);assert.equal(result.micro,20);
 scores.push(...paper.question_ids.slice(1).map((qid,i)=>rec('b'+i,qid,{at:5001+i,paperId:paper.id,paperAttempt:'second',score:25,maxScore:25})));
 result=intensiveUI.paperSummary(paper,scores);assert.equal(result.total,95);assert.equal(result.micro,45);assert.equal(result.macro,50);
 const ratingOnly=paper.question_ids.map(qid=>rec(qid,qid,{paperId:paper.id,paperAttempt:'unscored'}));assert.equal(intensiveUI.paperSummary(paper,ratingOnly).total,null);
});
