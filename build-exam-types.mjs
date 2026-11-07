import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import katex from 'katex';
import {Marked} from 'marked';
import {formatDisplayTex,tokenizeDisplayMath} from './format-math.mjs';
import {createExamTypeFigures} from './build-exam-type-figures.mjs';
import {loadIntegrationInputs,prepareExamIntegration} from './build-exam-integration.mjs';
import {prepareChapterStudy} from './build-chapter-study.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const draft=/本轮尚未|待本轮|待核读|迁移底稿|候选定位|不作为已核读/;

export function prepareExamTypes(bank,subject){
 const fail=message=>{throw Error('Invalid exam type bank '+subject+': '+message);};
 if(bank?.version!==1||bank.subject!==subject||!text(bank.label)||!text(bank.source_note)||!text(bank.coverage_note)||!Array.isArray(bank.cases)||!bank.cases.length)fail('header');
 const ids=new Set(),types=new Set();let extension=false;
 for(const [index,q] of bank.cases.entries()){
  if(!(subject==='micro'?/^EMI\d{3}$/:/^EMA\d{3}$/).test(q.id)||ids.has(q.id)||!text(q.type_key)||types.has(q.type_key))fail('duplicate or invalid identity '+q.id);
  ids.add(q.id);types.add(q.type_key);
  if(q.order!==index+1||!['core','extension'].includes(q.priority)||!text(q.priority_reason)||!text(q.title)||!text(q.stem_md)||!text(q.category)||!/^0[1-9]$|^10$/.test(q.group)||!Number.isFinite(q.minutes)||q.minutes<=0)fail('metadata '+q.id);
  if(q.priority==='extension')extension=true;else if(extension)fail('core after extension '+q.id);
  if(!Array.isArray(q.parts)||q.parts.length<2||q.parts.length>12)fail('parts '+q.id);
  const answers=new Set();
  for(const [partIndex,part] of q.parts.entries()){
   if(part.id!==String(partIndex+1)||!text(part.title)||!text(part.prompt_md)||!text(part.answer_md))fail('part alignment '+q.id+'/'+part.id);
   const answer=part.answer_md.trim();
   if(answers.has(answer))fail('duplicated answer '+q.id+'/'+part.id);
   answers.add(answer);
   if(/^(?:第[一二三四五六七八九十\d]+步[：:]|本问(?:先|要|用)|先做什么|动作[：:])/.test(answer))fail('instruction instead of answer '+q.id+'/'+part.id);
  }
  if(!Array.isArray(q.exam_refs)||!Array.isArray(q.textbook_refs)||!q.textbook_refs.length)fail('sources '+q.id);
  for(const ref of q.exam_refs){
   if(!text(ref.file)||!Number.isInteger(ref.year)||ref.year<2007||ref.year>2026||!text(ref.question)||!Array.isArray(ref.physical_pages)||!ref.physical_pages.length||ref.physical_pages.some(page=>!Number.isInteger(page)||page<1))fail('exam reference '+q.id);
  }
  for(const ref of q.textbook_refs){
   if(!text(ref.file)||!Array.isArray(ref.physical_pages)||!ref.physical_pages.length||ref.physical_pages.some(page=>!Number.isInteger(page)||page<1)||!text(ref.note))fail('textbook reference '+q.id);
  }
  if(!q.audit||!Array.isArray(q.audit.checked)||!q.audit.checked.length||!q.audit.checked.every(text)||!Array.isArray(q.audit.unresolved)||!q.audit.unresolved.every(text))fail('audit '+q.id);
  if(draft.test(JSON.stringify([q.exam_refs,q.textbook_refs,q.audit])))fail('unfinished source review '+q.id);
  function checkText(value){
   if(typeof value==='string'&&/[\x00-\x09\x0b-\x1f]/.test(value))fail('control character '+q.id);
   if(Array.isArray(value))value.forEach(checkText);
   else if(value&&typeof value==='object')Object.values(value).forEach(checkText);
  }
  checkText(q);
 }
 return bank;
}

export function compileExamTypes(bank){
 let formulaCount=0;
 const math=(source,displayMode)=>{
  formulaCount++;
  const original=source.trim(),formatted=formatDisplayTex(original);
  let html=katex.renderToString(formatted,{displayMode,throwOnError:true,strict:'ignore',trust:false,output:'htmlAndMathml'});
  if(formatted!==original)html=html.replace(/<annotation encoding="application\/x-tex">[\s\S]*?<\/annotation>/,'<annotation encoding="application/x-tex">'+escape(original)+'</annotation>');
  return html;
 };
 const renderer=new Marked({gfm:true,breaks:true,hooks:{emStrongMask(source){return source.replace(/\$\$[\s\S]+?\$\$|\$[^$]+?\$/g,match=>'a'.repeat(match.length));}},renderer:{html({text}){return /^<br\s*\/?\s*>$/i.test(text.trim())?'<br>':escape(text);}},extensions:[
  {name:'displayMath',level:'block',start:source=>source.indexOf('$$'),tokenizer:tokenizeDisplayMath,renderer:token=>'<div class="math-block">'+math(token.tex,true)+(token.punctuation?'<span class="math-punctuation">'+escape(token.punctuation)+'</span>':'')+'</div>'},
  {name:'inlineMath',level:'inline',start:source=>source.indexOf('$'),tokenizer(source){const match=/^\$([^$]+?)\$/.exec(source);if(match)return{type:'inlineMath',raw:match[0],tex:match[1]};},renderer:token=>math(token.tex,false)},
  {name:'textTimes',level:'inline',start:source=>source.indexOf('\\times'),tokenizer(source){const match=/^\\times(?![A-Za-z])/.exec(source);if(match)return{type:'textTimes',raw:match[0]};},renderer:()=>'&times;'}
 ]});
 function compile(value,location=bank.subject){
  if(Array.isArray(value))return value.map((item,index)=>compile(item,location+'['+(item?.id||index)+']'));
  if(!value||typeof value!=='object')return value;
  const result={};
  for(const [key,item] of Object.entries(value)){
   result[key]=compile(item,location+'.'+key);
   if(key.endsWith('_md')){
    try{result[key.replace(/_md$/,'_html')]=renderer.parse(item||'');}
    catch(error){throw Error('Invalid exam type markdown '+location+'.'+key+': '+error.message);}
   }
  }
  return result;
 }
 const compiled=compile(bank);
 return{...compiled,formula_count:formulaCount};
}

export async function buildExamTypes(directory=path.dirname(fileURLToPath(import.meta.url))){
 const banks={},rawBanks={},chapterStudy={},hashes={};
 for(const subject of ['micro','macro']){
  const raw=await readFile(path.join(directory,'content','exam-types-'+subject+'.json'));
  rawBanks[subject]=prepareExamTypes(JSON.parse(raw),subject);
  banks[subject]=compileExamTypes(rawBanks[subject]);
  hashes[subject]=createHash('sha256').update(raw).digest('hex');
  const studyRaw=await readFile(path.join(directory,'content','chapter-study-'+subject+'.json'));
  chapterStudy[subject]=compileExamTypes(prepareChapterStudy(JSON.parse(studyRaw),rawBanks[subject],subject));
  hashes['chapter_study_'+subject]=createHash('sha256').update(studyRaw).digest('hex');
 }
 const figures=createExamTypeFigures(Object.values(banks).flatMap(bank=>bank.cases));
 await mkdir(path.join(directory,'dist','exam-type-figures'),{recursive:true});
 for(const figure of figures)await writeFile(path.join(directory,'dist',figure.url),figure.svg,'utf8');
 hashes.figure_renderer=createHash('sha256').update(await readFile(path.join(directory,'build-exam-type-figures.mjs'))).digest('hex');
 const integrationRaw=await readFile(path.join(directory,'content','exam-type-integration.json'));
 const integration=prepareExamIntegration(JSON.parse(integrationRaw),banks,await loadIntegrationInputs(directory));
 hashes.integration=createHash('sha256').update(integrationRaw).digest('hex');
 const payload={version:1,banks,figures,integration,chapterStudy};
 const script='window.STUDY_DATA.examTypes='+JSON.stringify(payload).replace(/</g,'\\u003c')+';\nwindow.STUDY_DATA.examTypes.questions=Object.entries(window.STUDY_DATA.examTypes.banks).flatMap(([subject,bank])=>bank.cases.map(q=>({...q,subject,exam_type:true})));\n';
 await writeFile(path.join(directory,'dist','exam-type-data.js'),script,'utf8');
 const manifest={version:1,source_hashes:hashes,integration:integration.summary,chapterStudy:Object.fromEntries(Object.entries(chapterStudy).map(([key,study])=>[key,{...study.summary,formulas:study.formula_count}])),figures:figures.map(({id,qid,part_id,url})=>({id,qid,part_id,url})),subjects:Object.fromEntries(Object.entries(banks).map(([key,bank])=>[key,{cases:bank.cases.length,parts:bank.cases.reduce((sum,q)=>sum+q.parts.length,0),core:bank.cases.filter(q=>q.priority==='core').length,formulas:bank.formula_count}]))};
 await writeFile(path.join(directory,'dist','exam-type-manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
 console.log(JSON.stringify(manifest));
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildExamTypes();
