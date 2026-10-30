import {readFile,writeFile,mkdir,cp,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import katex from 'katex';
import {Marked} from 'marked';
import {prepareSolution} from './build-solutions.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'../..');
const SOURCE=path.join(HERE,'content');
const DIST=path.join(HERE,'dist');
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const errors=[];let mathCount=0,current='';
function math(src,displayMode){
 mathCount++;
 try{return katex.renderToString(src.trim(),{displayMode,throwOnError:true,strict:'ignore',trust:false,output:'htmlAndMathml'});}
 catch(e){errors.push({question:current,formula:src,error:e.message});return '<span class="math-error">'+escape(src)+'</span>';}
}
const marked=new Marked({gfm:true,breaks:true,hooks:{emStrongMask(src){return src.replace(/\$\$[\s\S]+?\$\$|\$[^$]+?\$/g,match=>'a'.repeat(match.length));}},renderer:{html({text}){return /^<br\s*\/?\s*>$/i.test(text.trim())?'<br>':escape(text);}},extensions:[
 {name:'strongLabel',level:'inline',start(src){return src.indexOf('**');},tokenizer(src){const m=/^\*\*([^*\n$]+?)\*\*/.exec(src);if(m)return{type:'strongLabel',raw:m[0],text:m[1]};},renderer(token){return '<strong>'+escape(token.text)+'</strong>';}},
 {name:'displayMath',level:'block',start(src){return src.indexOf('$$');},tokenizer(src){const m=/^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src);if(m)return{type:'displayMath',raw:m[0],tex:m[1]};},renderer(token){return `<div class="math-block">${math(token.tex,true)}</div>`;}},
 {name:'inlineMath',level:'inline',start(src){return src.indexOf('$');},tokenizer(src){const m=/^\$([^$]+?)\$/.exec(src);if(m)return{type:'inlineMath',raw:m[0],tex:m[1]};},renderer(token){return math(token.tex,false);}}
]});
const subjects=[];const sourceHashes={};let solutionMathCount=0;
const recallRaw=await readFile(path.join(SOURCE,'recall.json'));
const recallSource=JSON.parse(recallRaw);
for(const [key,name] of [['micro','微观'],['macro','宏观'],['political','政经']]){
 const file=path.join(SOURCE,key+'.json');const raw=await readFile(file);const bank=JSON.parse(raw);
 sourceHashes[key]=createHash('sha256').update(raw).digest('hex');
 const knowledgeRaw=await readFile(path.join(SOURCE,'knowledge-'+key+'.json'));
 const knowledgeBank=JSON.parse(knowledgeRaw),knowledgeById=new Map(knowledgeBank.questions.map(q=>[q.id,q]));
 if(knowledgeBank.subject!==key||knowledgeById.size!==bank.questions.length||knowledgeBank.questions.length!==bank.questions.length)throw Error('Invalid knowledge bank: '+key);
 sourceHashes['knowledge_'+key]=createHash('sha256').update(knowledgeRaw).digest('hex');
 if(bank.questions.length!==100||bank.groups.length!==10)throw new Error('Expected 100 questions / 10 groups: '+key);
 const questions=bank.questions.map(q=>{
  const result={...q};
  for(const field of ['prompt','outline','answer','pitfalls']){current=q.id+' '+field;result[field+'_html']=marked.parse(q[field+'_md']);}
  const guide=prepareSolution(q,key,recallSource.cards,knowledgeById.get(q.id)),before=mathCount;
  result.solution={...guide,steps:guide.steps.map(step=>({...step,body_html:step.lines_md.map(line=>marked.parse(line)).join('')})),knowledge:guide.knowledge.map(item=>({...item,title_html:marked.parseInline(item.title),explanation_html:marked.parse(item.explanation)})),recap_html:marked.parse(guide.recap_md)};
  solutionMathCount+=mathCount-before;
  return result;
 });
 subjects.push({key,name,groups:bank.groups,questions});
}
const plan=JSON.parse(await readFile(path.join(SOURCE,'plan.json'),'utf8'));
const questionMathCount=mathCount-solutionMathCount;
sourceHashes.recall=createHash('sha256').update(recallRaw).digest('hex');
const recall={...recallSource,cards:recallSource.cards.map(card=>{current='recall '+card.id;return{...card,body_html:marked.parse(card.body_md)};})};
const recallMathCount=mathCount-questionMathCount-solutionMathCount;
const ids=new Set(subjects.flatMap(s=>s.questions.map(q=>q.id)));
if(ids.size!==300||plan.days.length!==50)throw new Error('Invalid question count or plan');
for(const d of plan.days)for(const s of subjects){const refs=d[s.key+'_refs'];if(refs.length!==10||new Set(refs).size!==10||refs.some(id=>!ids.has(id)))throw new Error('Invalid plan day '+d.day);}
for(const s of subjects)for(const q of s.questions){if(plan.days.filter(d=>d[s.key+'_refs'].includes(q.id)).length!==5)throw new Error('Question must occur 5 times: '+q.id);}
if(errors.length){await writeFile(path.join(HERE,'math-errors.json'),JSON.stringify(errors,null,2));throw new Error(`${errors.length} math rendering errors; fix before build.`);}
await mkdir(path.join(DIST,'vendor'),{recursive:true});
await cp(path.join(HERE,'node_modules/katex/dist/katex.min.css'),path.join(DIST,'vendor/katex.min.css'));
await cp(path.join(HERE,'node_modules/katex/dist/fonts'),path.join(DIST,'vendor/fonts'),{recursive:true});
await cp(path.join(HERE,'node_modules/katex/LICENSE'),path.join(DIST,'vendor/katex.LICENSE'));
await mkdir(path.join(DIST,'materials'),{recursive:true});
const materials=[];
async function material(title,tag,description,files){const outputs=[];for(const [source,name,label] of files){const destination=path.join(DIST,'materials',name);if(await stat(path.join(ROOT,source)).then(()=>true,()=>false))await cp(path.join(ROOT,source),destination);else await stat(destination);outputs.push({url:'materials/'+name,label});}materials.push({title,tag,description,files:outputs});}
await material('微观基础与公式','微观 · 38页','53个公式模板，29道典型基础例题与完整解答。',[['微观/01_复习手册/02_背诵与公式/人大802微观基础与公式手册.pdf','micro-foundation.pdf','打开PDF']]);
await material('宏观基础与公式','宏观 · 28页','48个公式模板、6张起笔条件卡，另含10道基础演示。',[['宏观/01_复习手册/人大802宏观基础与公式手册.pdf','macro-foundation.pdf','打开PDF']]);
await material('政治经济学背诵手册','政经 · 73页','沿用原背诵册，回查概念、机制、公式和基础计算。',[['政经/01_复习手册/人大802政治经济学背诵手册.pdf','political-foundation.pdf','打开PDF']]);
await material('三科主线训练打印版','完整题目与解答','与网站题库配套的打印版；题目在前，解答在后。',[
 ['微观/01_复习手册/01_分组刷题/人大802微观真题分组模拟训练手册.pdf','micro-training.pdf','微观PDF'],
 ['宏观/01_复习手册/人大802宏观真题分组模拟训练手册.pdf','macro-training.pdf','宏观PDF'],
 ['政经/01_复习手册/人大802政经真题分组模拟训练手册.pdf','political-training.pdf','政经PDF']]);
await material('五十天复习计划','三科每天各10题','打印版与Excel记录表。网站中改动的日期和练习记录不会自动写回Excel。',[
 ['综合资料/01_复习手册/人大802五十天复习计划表.pdf','50-day-plan.pdf','打开PDF'],
 ['综合资料/01_复习手册/人大802五十天复习计划表.xlsx','50-day-plan.xlsx','下载Excel']]);
const data={version:1,title:'802练习室',subjects,plan,materials,recall};
await writeFile(path.join(DIST,'data.js'),'window.STUDY_DATA='+JSON.stringify(data).replace(/</g,'\\u003c')+';\n','utf8');
const manifest={questions:300,groups:30,days:50,mathCount:questionMathCount,solutionMathCount,recallCards:recall.cards.length,recallMathCount,mathErrors:errors,sourceHashes,materials:materials.length,builtAt:new Date().toISOString()};
await writeFile(path.join(HERE,'build-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest));
