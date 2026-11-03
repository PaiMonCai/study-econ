import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {prepareTopics} from './build-topics.mjs';
import {prepareSolution,prepareStudyCorrection,teachingLines} from './build-solutions.mjs';
import {createRequire} from 'node:module';
const read=name=>JSON.parse(fs.readFileSync(new URL('./content/'+name+'.json',import.meta.url)));
const cards=read('recall').cards;

test('Docker build inputs include the local build and check module dependency graph',()=>{
 const text=file=>fs.readFileSync(new URL('./'+file,import.meta.url),'utf8');
 const pkg=JSON.parse(text('package.json'));
 const commands=pkg.scripts.build+' && '+pkg.scripts.check;
 const pending=[...commands.matchAll(/node(?:\s+--check)?\s+([\w-]+\.mjs)\b/g)].map(m=>m[1]);
 const required=new Set();
 while(pending.length){
  const file=pending.pop();if(required.has(file))continue;
  required.add(file);
  for(const match of text(file).matchAll(/from\s+['"]\.\/([\w.-]+\.mjs)['"]|import\s*['"]\.\/([\w.-]+\.mjs)['"]/g))pending.push(match[1]||match[2]);
 }
 const matches=(pattern,file)=>new RegExp('^'+pattern.replace(/\./g,'\\.').replace(/\*/g,'.*')+'$').test(file);
 function missing(dockerfile,ignore){
  const stage=dockerfile.split(/\r?\nFROM\s/i)[0];
  const copied=[...stage.matchAll(/^COPY\s+(.+?)\s+\.\/\s*$/gm)].flatMap(m=>m[1].split(/\s+/));
  const rules=ignore.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  return [...required].filter(file=>{
   let included=true;
   for(const rule of rules)if(matches(rule.startsWith('!')?rule.slice(1):rule,file))included=rule.startsWith('!');
   return !included||!copied.some(pattern=>matches(pattern,file));
  });
 }
 const dockerfile=text('Dockerfile'),ignore=text('.dockerignore');
 assert.ok(required.has('build-topics.mjs')&&required.has('export-exam-review.mjs'));
 assert.deepEqual(missing(dockerfile,ignore),[]);
 assert.ok(missing('COPY build-data.mjs build-solutions.mjs build-diagrams.mjs verify-site.mjs ./\n',ignore).includes('build-topics.mjs'));
 assert.ok(missing(dockerfile,'**\n!build-data.mjs\n!build-solutions.mjs\n!build-diagrams.mjs\n!verify-site.mjs\n').includes('build-topics.mjs'));
});

test('each topic has a full group, valid applications and same-subject cards',()=>{
 const covered=[];
 for(const subject of ['micro','macro','political']){
  const source=read(subject),topics=prepareTopics(read('topics-'+subject),subject,source,cards);
  assert.equal(topics.length,10);
  for(const topic of topics){
   const group=source.groups.find(g=>g.id===topic.group);
   assert.ok(group.question_ids.every(id=>topic.source_question_ids.includes(id)),topic.id);
   assert.ok(topic.stages.every(s=>s.explanation_md.trim().length>40),topic.id);
   covered.push(...group.question_ids);
  }
 }
 assert.equal(new Set(covered).size,300);
});

test('topic validation rejects incomplete coverage and cross-subject links',()=>{
 const bank=read('topics-micro'),source=read('micro');
 for(const change of [b=>b.topics.pop(),b=>b.topics[0].source_question_ids.splice(0,1),b=>b.topics[0].stages[0].question_ids.push('MA001'),b=>b.topics[0].card_ids.push(cards.find(c=>c.subject==='macro').id),b=>b.topics[1].group=b.topics[0].group]){
  const invalid=structuredClone(bank);change(invalid);assert.throws(()=>prepareTopics(invalid,'micro',source,cards));
 }
});

test('guided corrections retain the original source and remove known wrong conclusions',()=>{
 const corrected=[];
 for(const subject of ['micro','macro','political']){
  const annotations=new Map(read('knowledge-'+subject).questions.map(q=>[q.id,q])),diagrams=read('diagrams-'+subject).diagrams;
  for(const question of read(subject).questions){
   const answer=question.answer_md,guide=prepareSolution(question,subject,cards,annotations.get(question.id));
   const study=prepareStudyCorrection(question,guide,diagrams.filter(d=>d.question_id===question.id));
   assert.equal(question.answer_md,answer);assert.equal(guide.steps.map(s=>s.body_md).join(''),answer);
   if(!study)continue;
   corrected.push(question.id);assert.equal(study.steps.map(s=>s.body_md).join(''),study.answer_md);
   for(const correction of study.corrections){assert.ok(!study.answer_md.includes(correction.original_quote));assert.ok(study.answer_md.includes(correction.explanation));}
   for(const knowledge of study.knowledge)if(knowledge.source_field==='answer_md')assert.ok(study.answer_md.includes(knowledge.application_md),question.id);
  }
 }
 assert.deepEqual(corrected,['MI075','MA012','MA025']);
});

test('knowledge labels follow source spans rather than the ordinal of each step',()=>{
 const q={id:'EX',answer_md:'**第一步** 求出预算。\n\n**第二步** 代回需求。',outline_md:'按预算再需求。',prompt_md:'题面'};
 const solution=prepareSolution(q,'micro',[],{id:'EX',knowledge:[{title:'需求',source_field:'answer_md',application_md:'代回需求。',card_ids:[]},{title:'预算',source_field:'answer_md',application_md:'求出预算。',card_ids:[]}],recap_md:'先预算，再需求。'});
 assert.deepEqual(solution.steps.map(s=>s.knowledge_indexes),[[1],[0]]);
});

test('teaching lines isolate equations without breaking math or changing source characters',()=>{
 const source='先写预算，$p_xx+p_yy=m$；所以代回。\n\n$$x=1。+2$$\n\n**条件$x=y$。** 再核$x。y$。';
 const lines=teachingLines(source);
 assert.equal(lines.join(''),source);assert.ok(lines.some(s=>s.includes('$p_xx+p_yy=m$；')));
 assert.ok(lines.some(s=>s.includes('$$x=1。+2$$')));assert.ok(lines.some(s=>s.includes('**条件$x=y$。**')));
});

test('guided reading position survives validation and sync without practice records',()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('./dist/data.js',import.meta.url),'utf8'),context);
 const {createStateModel}=createRequire(import.meta.url)('./dist/state-model.js'),model=createStateModel(context.window.STUDY_DATA),before=model.fresh();
 const reading={...before,session:{ids:['MI043','MI051'],index:1,mode:'跟读',day:null,study:true,topicId:'micro-05',seconds:0,startedAt:null,revealed:true,hint:false,ratingId:null,work:{MI043:{seconds:0,revealed:false}}}};
 const saved=model.apply(before,model.diff(before,reading));
 assert.equal(saved.session.study,true);assert.equal(saved.session.topicId,'micro-05');assert.equal(saved.session.index,1);assert.equal(saved.session.work.MI043.revealed,false);assert.deepEqual(saved.records,[]);
 const legacy=model.validate({...reading,session:{...reading.session,study:undefined,topicId:'unknown'}});
 assert.equal(legacy.session.study,false);assert.equal(legacy.session.topicId,null);
 const unrelated=model.validate({...reading,session:{...reading.session,ids:['MA011'],index:0}});
 assert.equal(unrelated.session.topicId,null);
 const fromTopic=model.validate({...reading,recallSession:{ids:['FM28'],index:0,revealed:[],returnTo:'topics/micro/05'}});
 assert.equal(fromTopic.recallSession.returnTo,'topics/micro/05');
});
