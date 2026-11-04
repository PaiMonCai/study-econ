import {readFile,stat,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import {prepareDiagrams} from './build-diagrams.mjs';
import {prepareTopics} from './build-topics.mjs';
import {prepareStudyCorrection} from './build-solutions.mjs';
import {prepareExamBank} from './build-exam-review.mjs';
import {prepareTrainingBank,prepareComprehensiveBank,prepareTrainingPapers,trainingDigest} from './build-training.mjs';
import {prepareConceptMap,conceptDigest,prepareConceptBridges} from './build-concept-map.mjs';
import {prepareIntensivePlan,intensiveMarkdown} from './build-intensive.mjs';
import {prepareMethodSheets,methodMarkdown} from './build-methods.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),dist=path.join(here,'dist');
const checks=[];const check=(name,passed)=>checks.push({name,passed:!!passed});
const context={window:{}};vm.runInNewContext(await readFile(path.join(dist,'data.js'),'utf8'),context);
const data=context.window.STUDY_DATA,manifest=JSON.parse(await readFile(path.join(here,'build-manifest.json'),'utf8'));
for(const subject of data.subjects)vm.runInNewContext(await readFile(path.join(dist,'exam-'+subject.key+'.js'),'utf8'),context);
for(const subject of ['micro','macro'])vm.runInNewContext(await readFile(path.join(dist,'training-data-'+subject+'.js'),'utf8'),context);
for(const subject of ['micro','macro'])vm.runInNewContext(await readFile(path.join(dist,'concept-data-'+subject+'.js'),'utf8'),context);
vm.runInNewContext(await readFile(path.join(dist,'method-data.js'),'utf8'),context);
vm.runInNewContext(await readFile(path.join(dist,'exam-review.js'),'utf8'),context);
const intensiveRaw=await readFile(path.join(here,'content/intensive-plan.json'));
const intensive=prepareIntensivePlan(JSON.parse(intensiveRaw),data.subjects,data.comprehensive);
check('15-day plan source hash',createHash('sha256').update(intensiveRaw).digest('hex')===manifest.sourceHashes.intensive_plan);
check('15-day plan matches validated source',JSON.stringify(data.intensivePlan)===JSON.stringify(intensive));
check('15-day offline guide matches complete source',await readFile(path.join(dist,'materials/intensive-15-day-plan.md'),'utf8')===intensiveMarkdown(intensive,data.subjects,data.comprehensive));
const decode=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'");
const methodBanks={};for(const subject of ['micro','macro']){const raw=await readFile(path.join(here,'content','concept-map-'+subject+'.json'));methodBanks[subject]={...JSON.parse(raw),raw};}
const methodRaw=await readFile(path.join(here,'content/method-sheets.json'));
const methods=prepareMethodSheets(JSON.parse(methodRaw),methodBanks,data.subjects);
check('method sheets source hash',createHash('sha256').update(methodRaw).digest('hex')===manifest.sourceHashes.method_sheets);
check('method sheets validated summary',JSON.stringify(methods.summary)===JSON.stringify(manifest.methodSummary));
let methodMathCount=0;
function methodFields(source,compiled){
 if(Array.isArray(source)){source.forEach((item,index)=>methodFields(item,compiled?.[index]));return;}
 if(!source||typeof source!=='object')return;
 for(const [key,value] of Object.entries(source)){
  if(key.endsWith('_md')){const html=compiled?.[key.replace(/_md$/,'_html')]||'',expected=[...value.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)].map(match=>(match[1]||match[2]).trim()),actual=[...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(match=>decode(match[1]));check('method formula and source '+key,compiled?.[key]===value&&JSON.stringify(expected)===JSON.stringify(actual)&&!/math-error|katex-error|<script\b|javascript:/i.test(html));methodMathCount+=actual.length;}
  else methodFields(value,compiled?.[key]);
 }
}
methodFields(methods,data.methodSheets);
for(const sheet of data.methodSheets.sheets)for(const html of [...sheet.comparison_html.flat(),...sheet.memory_html]){check('method comparison rendered',!/math-error|katex-error|<script\b|javascript:/i.test(html));methodMathCount+=[...html.matchAll(/<annotation encoding="application\/x-tex">/g)].length;}
check('method mathematical expressions accounted for',methodMathCount===manifest.methodMathCount);
const methodArtifacts=JSON.parse(await readFile(path.join(dist,'materials/method-artifacts.json'),'utf8'));
check('method print artifacts match current source',methodArtifacts.source_sha256===createHash('sha256').update(methodRaw).digest('hex')&&methodArtifacts.pages===40);
for(const [file,digest] of Object.entries(methodArtifacts.files))check('method print output digest '+file,createHash('sha256').update(await readFile(path.join(dist,'materials',file))).digest('hex')===digest);
for(const [file,options] of [['method-sheets.md',{}],['method-checks.md',{checks:true}],['method-check-answers.md',{checks:true,answers:true}]])check('method offline mirror '+file,await readFile(path.join(dist,'materials',file),'utf8')===methodMarkdown(methods,options));
let mathCount=0,solutionMathCount=0,examMathCount=0,examQuestions=0;
for(const subject of data.subjects){
 const raw=await readFile(path.join(here,'content',subject.key+'.json'));const source=JSON.parse(raw);
 check(subject.key+' source hash',createHash('sha256').update(raw).digest('hex')===manifest.sourceHashes[subject.key]);
 const knowledgeRaw=await readFile(path.join(here,'content','knowledge-'+subject.key+'.json'));
 const knowledgeSource=new Map(JSON.parse(knowledgeRaw).questions.map(q=>[q.id,q]));
 const examRaw=await readFile(path.join(here,'content','exam-review-'+subject.key+'.json'));
 const examIndex=prepareExamBank(JSON.parse(examRaw),subject.key,source.questions);
 check(subject.key+' exam review source hash',createHash('sha256').update(examRaw).digest('hex')===manifest.sourceHashes['exam_'+subject.key]);
 check(subject.key+' knowledge annotation hash',createHash('sha256').update(knowledgeRaw).digest('hex')===manifest.sourceHashes['knowledge_'+subject.key]);
 const diagramRaw=await readFile(path.join(here,'content','diagrams-'+subject.key+'.json'));
 const diagramBank=JSON.parse(diagramRaw),diagramIndex=prepareDiagrams(diagramBank,subject.key,source.questions);
 check(subject.key+' diagram snapshot hash',createHash('sha256').update(diagramRaw).digest('hex')===manifest.sourceHashes['diagrams_'+subject.key]);
 check(subject.key+' all diagram coverage decisions accounted for',diagramBank.coverage.length===100&&manifest.diagramSummary.subjects[subject.key]===diagramBank.diagrams.length);
 check(subject.key+' count and unique IDs',subject.questions.length===100&&new Set(subject.questions.map(q=>q.id)).size===100);
 check(subject.key+' groups',subject.groups.length===10&&subject.groups.every(g=>g.question_ids.length===10));
 for(const q of subject.questions){const original=source.questions.find(x=>x.id===q.id);for(const field of ['prompt','outline','answer','pitfalls']){
  const md=q[field+'_md'],html=q[field+'_html'];
  check(q.id+' '+field+' source unchanged',md===original[field+'_md']);
  const expected=[...md.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)].map(m=>(m[1]||m[2]).trim());
  const actual=[...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>decode(m[1]));
  mathCount+=actual.length;
  check(q.id+' '+field+' complete math',JSON.stringify(expected)===JSON.stringify(actual));
  check(q.id+' '+field+' rendered',html.length>5&&!/math-error|katex-error|<script\b|javascript:/i.test(html));
 }
 check(q.id+' source metadata',q.source_refs.length>0&&q.source_refs.every(r=>r.exam_id&&r.source&&r.pages));
 check(q.id+' diagrams match validated question-specific snapshot',JSON.stringify(q.diagrams)===JSON.stringify(diagramIndex.get(q.id)||[]));
 const solution=q.solution;
 check(q.id+' step source preserved',solution?.steps.map(s=>s.body_md).join('')===q.answer_md&&solution.source.preserved);
 check(q.id+' progressive lines cover rendered answer',solution.steps.every(s=>s.lines_md.join('')===s.body_md&&s.line_lengths.length===s.lines_md.length&&s.line_lengths.every(n=>Number.isInteger(n)&&n>0)&&s.line_lengths.reduce((sum,n)=>sum+n,0)===s.body_html.length));
 const stepMath=solution.steps.flatMap(step=>[...step.body_html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>decode(m[1])));
 const answerMath=[...q.answer_html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>decode(m[1]));
 check(q.id+' step math retained in order',JSON.stringify(stepMath)===JSON.stringify(answerMath));
 check(q.id+' knowledge grounded in original question',solution.knowledge.length>=2&&solution.knowledge.every(k=>q[k.source_field]?.includes(k.application_md)));
 check(q.id+' knowledge annotation correspondence',solution.source.knowledge_sha256===createHash('sha256').update(JSON.stringify(knowledgeSource.get(q.id))).digest('hex'));
 check(q.id+' knowledge cards same subject',solution.knowledge.every(k=>k.card_ids.every(id=>data.recall.cards.some(c=>c.id===id&&c.subject===subject.key))));
 const extraHtml=solution.steps.map(s=>s.body_html).join('')+solution.knowledge.map(k=>k.title_html+k.explanation_html).join('')+solution.recap_html;
 solutionMathCount+=[...extraHtml.matchAll(/<annotation encoding="application\/x-tex">/g)].length;
 const study=prepareStudyCorrection(original,solution,diagramIndex.get(q.id)||[]);
 check(q.id+' guided correction presence matches existing errata',!!study===!!solution.study);
 if(study){
  check(q.id+' guided correction matches audited explanation',solution.study.answer_md===study.answer_md&&solution.study.steps.map(s=>s.body_md).join('')===study.answer_md&&JSON.stringify(solution.study.corrections)===JSON.stringify(study.corrections));
  check(q.id+' corrected progressive lines cover rendered answer',solution.study.steps.every(s=>s.lines_md.join('')===s.body_md&&s.line_lengths.length===s.lines_md.length&&s.line_lengths.reduce((sum,n)=>sum+n,0)===s.body_html.length));
  check(q.id+' corrected knowledge uses corrected answer',solution.study.knowledge.every(k=>k.source_field!=='answer_md'||study.answer_md.includes(k.application_md)));
  const studyHtml=solution.study.answer_html+solution.study.steps.map(s=>s.body_html).join('')+solution.study.knowledge.map(k=>k.title_html+k.explanation_html).join('');
  solutionMathCount+=[...studyHtml.matchAll(/<annotation encoding="application\/x-tex">/g)].length;
 }
 const exam=solution.exam,expectedExam=examIndex.get(q.id);examQuestions++;
 check(q.id+' exam review complete and resolved',exam?.verdict!=='needs-source'&&exam?.audit.unresolved.length===0&&exam?.audit.checked.length>=2);
 check(q.id+' exam review bound to unchanged source',exam?.source.source_sha256===expectedExam.source.source_sha256&&exam?.source.review_sha256===expectedExam.source.review_sha256);
 check(q.id+' exam steps correspond to individually reviewed content',JSON.stringify(exam?.steps.map(s=>({title:s.title,uses:s.uses,body_md:s.body_md})))===JSON.stringify(expectedExam.steps.map(s=>({title:s.title,uses:s.uses,body_md:s.body_md}))));
 check(q.id+' exam progressive lines retain complete steps',exam.steps.every(s=>s.lines_md.join('')===s.body_md&&s.line_lengths.length===s.lines_md.length&&s.line_lengths.every(n=>Number.isInteger(n)&&n>0)&&s.line_lengths.reduce((sum,n)=>sum+n,0)===s.body_html.length));
 const examFields=['method','pitfalls','recap'].map(f=>({md:exam[f+'_md'],html:exam[f+'_html']})).concat(exam.steps.map(s=>({md:s.body_md,html:s.body_html})));
 if(exam.prompt_md!==undefined)examFields.push({md:exam.prompt_md,html:exam.prompt_html});
 for(const {md,html} of examFields){
  const expected=[...md.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)].map(m=>(m[1]||m[2]).trim());
  const actual=[...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>decode(m[1]));
  examMathCount+=actual.length;
  check(q.id+' exam formula correspondence and safe rendering',JSON.stringify(expected)===JSON.stringify(actual)&&!/math-error|katex-error|<script\b|javascript:/i.test(html));
 }
 for(let block=0;block<5;block++)check(q.id+' round '+(block+1),data.plan.days.slice(block*10,block*10+10).filter(d=>d[subject.key+'_refs'].includes(q.id)).length===1);
}
}
check('all rendered formulas accounted for',mathCount===manifest.mathCount);
check('all step and review formulas accounted for',solutionMathCount===manifest.solutionMathCount);
check('all 300 exam answers reviewed',examQuestions===300&&manifest.examSummary.total===300&&manifest.examSummary.unresolved===0);
check('all exam formulas accounted for',examMathCount===manifest.examMathCount);
const recallSourceRaw=await readFile(path.join(here,'content/recall.json'));
const recallSource=JSON.parse(recallSourceRaw),recall=data.recall;
check('recall snapshot hash',createHash('sha256').update(recallSourceRaw).digest('hex')===manifest.sourceHashes.recall);
check('recall cards complete and unique',recall.cards.length===323&&new Set(recall.cards.map(c=>c.id)).size===323);
check('micro formula templates preserved',recall.cards.filter(c=>c.subject==='micro'&&c.kind==='formula').length===53);
check('macro formula and condition cards preserved',recall.cards.filter(c=>c.subject==='macro'&&c.kind==='formula').length===48&&recall.cards.filter(c=>c.kind==='condition').length===6);
check('political calculation topics preserved',recall.cards.filter(c=>c.subject==='political'&&c.kind==='formula').length===18);
let recallMathCount=0;
for(const card of recall.cards){
 const original=recallSource.cards.find(c=>c.id===card.id);
 check(card.id+' recall body matches snapshot',card.body_md===original?.body_md&&createHash('sha256').update(card.body_md).digest('hex')===card.body_sha256);
 check(card.id+' recall provenance and group links',recall.sources.some(s=>s.id===card.source_id&&s.sha256.length===64)&&card.groups.length>0&&card.groups.every(g=>data.subjects.find(s=>s.key===card.subject)?.groups.some(group=>group.id===g)));
 const expected=[...card.body_md.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)].map(m=>(m[1]||m[2]).trim());
 const actual=[...card.body_html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>decode(m[1]));
 recallMathCount+=actual.length;
 check(card.id+' recall formula correspondence',JSON.stringify(expected)===JSON.stringify(actual));
 check(card.id+' recall rendered safely',card.body_html.length>5&&!/math-error|katex-error|<script\b|javascript:/i.test(card.body_html));
}
check('all recall formulas accounted for',recallMathCount===manifest.recallMathCount);
check('30 distinct topic summaries',data.topics.length===30&&new Set(data.topics.map(t=>t.id)).size===30&&manifest.topicSummary.total===30);
let topicMathCount=0;
const topicHandbook=await readFile(path.join(here,'docs','topic-guide.md'),'utf8');
const oldErrors=data.subjects.flatMap(s=>s.questions.flatMap(q=>q.diagrams.filter(d=>d.erratum).map(d=>d.erratum.original_quote)));
for(const subject of data.subjects){
 const raw=await readFile(path.join(here,'content','topics-'+subject.key+'.json'));
 check(subject.key+' topic source hash',createHash('sha256').update(raw).digest('hex')===manifest.sourceHashes['topics_'+subject.key]);
 const expected=prepareTopics(JSON.parse(raw),subject.key,subject,data.recall.cards),actual=data.topics.filter(t=>t.subject===subject.key);
 check(subject.key+' all ten topic groups represented',actual.length===10&&manifest.topicSummary.subjects[subject.key]===10);
 for(const original of expected){
  const topic=actual.find(t=>t.id===original.id);
  check(original.id+' offline guide matches current topic',topicHandbook.includes(original.title)&&['lead_md','comparison_md','boundaries_md','recall_md'].every(f=>topicHandbook.includes(original[f]))&&original.stages.every(s=>topicHandbook.includes(s.explanation_md)));
  check(original.id+' known source mistakes not repeated as teaching text',oldErrors.every(error=>!original.stages.some(s=>s.explanation_md.includes(error))));
  check(original.id+' source and stage links preserved',topic&&['title','source_note','editorial_note','source_question_ids','card_ids'].every(f=>JSON.stringify(topic[f])===JSON.stringify(original[f]))&&JSON.stringify(topic.stages.map(s=>({title:s.title,explanation_md:s.explanation_md,question_ids:s.question_ids})))===JSON.stringify(original.stages));
  const fields=['lead','comparison','boundaries','recall'].map(f=>({md:original[f+'_md'],html:topic[f+'_html']})).concat(topic.stages.map(s=>({md:s.explanation_md,html:s.explanation_html})));
  for(const {md,html} of fields){
   const expectedMath=[...md.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)].map(m=>(m[1]||m[2]).trim());
   const actualMath=[...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>decode(m[1]));
   topicMathCount+=actualMath.length;
   check(original.id+' topic formula and safe rendering',JSON.stringify(expectedMath)===JSON.stringify(actualMath)&&!/math-error|katex-error|<script\b|javascript:/i.test(html));
  }
 }
}
check('all topic formulas accounted for',topicMathCount===manifest.topicMathCount);
let trainingMathCount=0;
function trainingField(id,md,html){
 const expected=[...md.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)].map(m=>(m[1]||m[2]).trim());
 const actual=[...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>decode(m[1]));
 trainingMathCount+=actual.length;
 check(id+' training formula correspondence and safe rendering',JSON.stringify(expected)===JSON.stringify(actual)&&!/math-error|katex-error|<script\b|javascript:/i.test(html));
}
const expectedCases=[];
for(const subject of data.subjects.filter(subject=>['micro','macro'].includes(subject.key))){
 const [trainingRaw,caseRaw,reviewRaw]=await Promise.all(['training-','comprehensive-','exam-review-'].map(prefix=>readFile(path.join(here,'content',prefix+subject.key+'.json'))));
 const structured=prepareTrainingBank(JSON.parse(trainingRaw),subject.key,subject.questions,JSON.parse(reviewRaw));
 const cases=prepareComprehensiveBank(JSON.parse(caseRaw),subject.key,subject.questions,subject.groups);
 expectedCases.push(...cases);
 check(subject.key+' training source hash',createHash('sha256').update(trainingRaw).digest('hex')===manifest.sourceHashes['training_'+subject.key]);
 check(subject.key+' comprehensive source hash',createHash('sha256').update(caseRaw).digest('hex')===manifest.sourceHashes['comprehensive_'+subject.key]);
 for(const q of subject.questions){
  const expected=structured.get(q.id),actual=q.training;
  check(q.id+' structured content and answer mapping',actual&&Object.keys(expected).every(key=>JSON.stringify(actual[key])===JSON.stringify(expected[key])));
  check(q.id+' linked comprehensive cases exist',actual.comprehensive_ids.every(id=>cases.some(entry=>entry.id===id)));
  trainingField(q.id,actual.prompt_md,actual.prompt_html);
 }
}
const compiledCases=data.comprehensive.questions;
check('40 distinct comprehensive cases outside original 300',compiledCases.length===40&&new Set(compiledCases.map(q=>q.id)).size===40&&!compiledCases.some(q=>data.subjects.some(s=>s.questions.some(original=>original.id===q.id))));
for(const expected of expectedCases){
 const q=compiledCases.find(q=>q.id===expected.id),guide=q.solution;
 check(q.id+' comprehensive source and all parts retained',Object.keys(expected).every(key=>JSON.stringify(q[key])===JSON.stringify(expected[key]))&&guide.source.review_sha256===trainingDigest(expected));
 check(q.id+' comprehensive answers retained',guide.steps.every((step,index)=>step.body_md===expected.parts[index].answer_md&&step.lines_md.join('')===step.body_md&&step.line_lengths.reduce((sum,n)=>sum+n,0)===step.body_html.length));
 check(q.id+' comprehensive scoring parts retained',q.scoring_parts.every((part,index)=>part.points===expected.parts[index].points&&part.prompt_md===expected.parts[index].prompt_md&&part.rubric.every((row,i)=>row.points===expected.parts[index].rubric[i].points&&row.criterion_md===expected.parts[index].rubric[i].criterion_md)));
 check(q.id+' scoped figures retain original geometry',q.diagrams.length===q.figure_references.reduce((sum,ref)=>sum+data.subjects.find(s=>s.key===q.subject).questions.find(source=>source.id===ref.question_id).diagrams.length,0)&&q.diagrams.every(figure=>{
  const ref=q.figure_references.find(ref=>data.subjects.find(s=>s.key===q.subject).questions.find(source=>source.id===ref.question_id).diagrams.some(original=>original.id===figure.source_diagram_id));
  const original=data.subjects.find(s=>s.key===q.subject).questions.find(source=>source.id===ref.question_id).diagrams.find(original=>original.id===figure.source_diagram_id);
  return figure.question_id===q.id&&figure.situation.includes(ref.scope_md)&&Object.keys(original).filter(key=>!['id','question_id','situation','erratum'].includes(key)).every(key=>JSON.stringify(original[key])===JSON.stringify(figure[key]));
 }));
 trainingField(q.id,q.prompt_md,q.prompt_html);
 for(const field of ['source_note','connections','diagram_decision'])trainingField(q.id,q[field+'_md'],q[field+'_html']);
 for(const field of ['method','pitfalls','recap'])trainingField(q.id,guide[field+'_md'],guide[field+'_html']);
 for(const step of guide.steps)trainingField(q.id,step.body_md,step.body_html);
 for(const part of q.scoring_parts){trainingField(q.id,part.prompt_md,part.prompt_html);for(const row of part.rubric)trainingField(q.id,row.criterion_md,row.criterion_html);}
}
const papersRaw=await readFile(path.join(here,'content','training-papers.json'));
const expectedPapers=prepareTrainingPapers(JSON.parse(papersRaw),expectedCases);
check('timed paper source hash',createHash('sha256').update(papersRaw).digest('hex')===manifest.sourceHashes.training_papers);
check('three 100 point timed papers retained',expectedPapers.every((paper,index)=>Object.keys(paper).every(key=>JSON.stringify(paper[key])===JSON.stringify(data.comprehensive.papers[index][key]))));
for(const paper of data.comprehensive.papers)trainingField(paper.id,paper.instructions_md,paper.instructions_html);
check('all training formulas accounted for',trainingMathCount===manifest.trainingMathCount);
check('training summary matches actual catalog',JSON.stringify(data.trainingSummary)===JSON.stringify(manifest.trainingSummary)&&manifest.trainingSummary.structured===200&&manifest.trainingSummary.cases===40&&manifest.trainingSummary.papers===3&&manifest.trainingSummary.parts===compiledCases.reduce((sum,q)=>sum+q.parts.length,0)&&manifest.trainingSummary.figures===compiledCases.filter(q=>q.diagrams.length).length&&manifest.trainingSummary.textOnly===compiledCases.filter(q=>!q.diagrams.length).length);
let conceptMathCount=0;
function checkConcept(raw,compiled,label){
 if(Array.isArray(raw)){check(label+' array length',Array.isArray(compiled)&&raw.length===compiled.length);for(let i=0;i<raw.length;i++)checkConcept(raw[i],compiled[i],label+'/'+i);return;}
 if(raw&&typeof raw==='object'){
  for(const [key,value] of Object.entries(raw)){
   checkConcept(value,compiled?.[key],label+'/'+key);
   if(key.endsWith('_md')){
    const html=compiled?.[key.slice(0,-3)+'_html']||'';
    const expected=[...value.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)].map(m=>(m[1]||m[2]).trim());
    const actual=[...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>decode(m[1]));
    conceptMathCount+=actual.length;
    check(label+'/'+key+' formula correspondence and safe rendering',JSON.stringify(expected)===JSON.stringify(actual)&&!/math-error|katex-error|<script\b|javascript:/i.test(html));
   }
  }
  return;
 }
 check(label+' source retained',JSON.stringify(raw)===JSON.stringify(compiled));
}
const conceptSummary={topics:0,nodes:0,edges:0,cards:0,questions:0,parts:0,subjects:{}};
const conceptBanks=[];
for(const subject of ['micro','macro']){
 const raw=await readFile(path.join(here,'content','concept-map-'+subject+'.json'));
 check(subject+' concept source fingerprint',conceptDigest(raw)===manifest.sourceHashes['concept_map_'+subject]);
 const sources={hashes:manifest.sourceHashes};
 for(const [key,file] of [['recall','recall'],['topics','topics-'+subject],['exam','exam-review-'+subject],['training','training-'+subject],['comprehensive','comprehensive-'+subject]])sources[key]=JSON.parse(await readFile(path.join(here,'content',file+'.json'),'utf8'));
 const prepared=prepareConceptMap(JSON.parse(raw),subject,sources),compiled=data.conceptMaps[subject];
 conceptBanks.push(prepared);
 checkConcept(prepared,compiled,subject+' concept map');
 conceptSummary.subjects[subject]=prepared.summary;
 for(const key of ['topics','nodes','edges','cards','questions','parts'])conceptSummary[key]+=prepared.summary[key];
}
const bridgeRaw=await readFile(path.join(here,'content','concept-map-bridges.json'));
check('cross-subject bridge fingerprint',conceptDigest(bridgeRaw)===manifest.sourceHashes.concept_map_bridges);
const conceptBridges=prepareConceptBridges(JSON.parse(bridgeRaw),conceptBanks,manifest.sourceHashes);
checkConcept(conceptBridges,data.conceptBridges,'cross-subject bridges');
conceptSummary.bridges=conceptBridges.bridges.length;
check('all concept formulas accounted for',conceptMathCount===manifest.conceptMathCount);
check('concept summary matches the catalog',JSON.stringify(conceptSummary)===JSON.stringify(manifest.conceptSummary)&&JSON.stringify(conceptSummary)===JSON.stringify(data.conceptSummary));
const diagrams=data.subjects.flatMap(s=>s.questions.flatMap(q=>q.diagrams));
check('diagram totals match build manifest',JSON.stringify(data.diagramSummary)===JSON.stringify(manifest.diagramSummary)&&diagrams.length===manifest.diagramSummary.total);
for(const mode of ['numeric','schematic','structure'])check(mode+' diagram count matches',diagrams.filter(d=>d.mode===mode).length===manifest.diagramSummary[mode]);
for(const day of data.plan.days){for(const subject of data.subjects){const refs=day[subject.key+'_refs'];check('day '+day.day+' '+subject.key+' 10 independent questions',refs.length===10&&new Set(refs).size===10);}}
const html=await readFile(path.join(dist,'index.html'),'utf8');const css=await readFile(path.join(dist,'styles.css'),'utf8');const katexCss=await readFile(path.join(dist,'vendor/katex.min.css'),'utf8');
const urls=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(u=>!u.startsWith('#'));
for(const m of data.materials)for(const f of m.files)urls.push(f.url);
for(const m of katexCss.matchAll(/url\(([^)]+)\)/g))urls.push('vendor/'+m[1].replace(/["']/g,''));
for(const u of new Set(urls))check('local asset '+u,!/^(?:https?:)?\/\//.test(u)&&await stat(path.join(dist,u)).then(s=>s.isFile(),()=>false));
check('responsive and focus styles',css.includes('@media(max-width:600px)')&&css.includes(':focus-visible')&&css.includes('prefers-reduced-motion'));
async function files(folder){const entries=await readdir(folder,{withFileTypes:true});let result=[];for(const e of entries){const p=path.join(folder,e.name);result.push(...e.isDirectory()?await files(p):[p]);}return result;}
for(const file of await files(dist))check('static file under platform size limit '+path.relative(dist,file),(await stat(file)).size<25*1024*1024);
const result={all_passed:checks.every(c=>c.passed),count:checks.length,questions:300,days:50,mathCount,solutionMathCount,recallCards:recall.cards.length,recallMathCount,topicMathCount,topicSummary:manifest.topicSummary,examMathCount,examSummary:manifest.examSummary,trainingMathCount,trainingSummary:manifest.trainingSummary,conceptMathCount,conceptSummary:manifest.conceptSummary,diagramSummary:manifest.diagramSummary,assetCount:new Set(urls).size,checks};
await writeFile(path.join(here,'site-checks.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,checks:checks.filter(c=>!c.passed)}));
if(!result.all_passed)process.exit(1);
