import {readFile,stat,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import {prepareDiagrams} from './build-diagrams.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),dist=path.join(here,'dist');
const checks=[];const check=(name,passed)=>checks.push({name,passed:!!passed});
const context={window:{}};vm.runInNewContext(await readFile(path.join(dist,'data.js'),'utf8'),context);
const data=context.window.STUDY_DATA,manifest=JSON.parse(await readFile(path.join(here,'build-manifest.json'),'utf8'));
const decode=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'");
let mathCount=0,solutionMathCount=0;
for(const subject of data.subjects){
 const raw=await readFile(path.join(here,'content',subject.key+'.json'));const source=JSON.parse(raw);
 check(subject.key+' source hash',createHash('sha256').update(raw).digest('hex')===manifest.sourceHashes[subject.key]);
 const knowledgeRaw=await readFile(path.join(here,'content','knowledge-'+subject.key+'.json'));
 const knowledgeSource=new Map(JSON.parse(knowledgeRaw).questions.map(q=>[q.id,q]));
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
 const stepMath=solution.steps.flatMap(step=>[...step.body_html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>decode(m[1])));
 const answerMath=[...q.answer_html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(m=>decode(m[1]));
 check(q.id+' step math retained in order',JSON.stringify(stepMath)===JSON.stringify(answerMath));
 check(q.id+' knowledge grounded in original question',solution.knowledge.length>=2&&solution.knowledge.every(k=>q[k.source_field]?.includes(k.application_md)));
 check(q.id+' knowledge annotation correspondence',solution.source.knowledge_sha256===createHash('sha256').update(JSON.stringify(knowledgeSource.get(q.id))).digest('hex'));
 check(q.id+' knowledge cards same subject',solution.knowledge.every(k=>k.card_ids.every(id=>data.recall.cards.some(c=>c.id===id&&c.subject===subject.key))));
 const extraHtml=solution.steps.map(s=>s.body_html).join('')+solution.knowledge.map(k=>k.title_html+k.explanation_html).join('')+solution.recap_html;
 solutionMathCount+=[...extraHtml.matchAll(/<annotation encoding="application\/x-tex">/g)].length;
 for(let block=0;block<5;block++)check(q.id+' round '+(block+1),data.plan.days.slice(block*10,block*10+10).filter(d=>d[subject.key+'_refs'].includes(q.id)).length===1);
}
}
check('all rendered formulas accounted for',mathCount===manifest.mathCount);
check('all step and review formulas accounted for',solutionMathCount===manifest.solutionMathCount);
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
const result={all_passed:checks.every(c=>c.passed),count:checks.length,questions:300,days:50,mathCount,solutionMathCount,recallCards:recall.cards.length,recallMathCount,diagramSummary:manifest.diagramSummary,assetCount:new Set(urls).size,checks};
await writeFile(path.join(here,'site-checks.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,checks:checks.filter(c=>!c.passed)}));
if(!result.all_passed)process.exit(1);
