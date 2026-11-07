import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {prepareExamTypes,compileExamTypes} from './build-exam-types.mjs';

const banks=Object.fromEntries(await Promise.all(['micro','macro'].map(async subject=>[subject,JSON.parse(await readFile('content/exam-types-'+subject+'.json','utf8'))])));
const context={window:{STUDY_DATA:{}}};
vm.runInNewContext(await readFile('dist/exam-type-data.js','utf8'),context);
const compiled=context.window.STUDY_DATA.examTypes;
const clone=value=>JSON.parse(JSON.stringify(value));

test('plain arithmetic shows multiplication signs while math and code keep their source',()=>{
 const source={subject:'macro',answer_md:String.raw`GDP=2\times10+4\times10=60; $a\times b$; `+'`'+String.raw`\times`+'`'+String.raw`; \timeseries`};
 const shown=compileExamTypes(source);
 assert.equal(shown.answer_md,source.answer_md);
 assert.match(shown.answer_html,/GDP=2&times;10\+4&times;10=60/);
 assert.match(shown.answer_html,/<annotation encoding="application\/x-tex">a\\times b<\/annotation>/);
 assert.match(shown.answer_html,/<code>\\times<\/code>/);
 assert.match(shown.answer_html,/\\timeseries/);
});

test('every displayed question and numbered answer matches the reviewed source',()=>{
 for(const [subject,source] of Object.entries(banks)){
  prepareExamTypes(source,subject);
  const actual=compiled.banks[subject];
  assert.equal(actual.cases.length,source.cases.length);
  for(const [index,q] of source.cases.entries()){
   const shown=actual.cases[index];
   assert.equal(shown.id,q.id);assert.equal(shown.stem_md,q.stem_md);
   assert.equal(shown.parts.length,q.parts.length);
   for(const [partIndex,part] of q.parts.entries()){
    const answer=shown.parts[partIndex];
    for(const key of ['id','title','prompt_md','answer_md'])assert.equal(answer[key],part[key],q.id+'/'+part.id+'/'+key);
    assert.ok(answer.prompt_html.length>0);assert.ok(answer.answer_html.length>0);
    assert.doesNotMatch(answer.answer_html,/math-error|katex-error|<script\b|javascript:/i);
   }
  }
 }
 const ids=compiled.questions.map(q=>q.id);
 assert.equal(new Set(ids).size,ids.length);
 assert.ok(ids.every(id=>/^EM[IA]\d{3}$/.test(id)));
});

test('missing question numbers, duplicated answers and unfinished source review block publication',()=>{
 for(const mutate of [
  bank=>{bank.cases[0].parts[1].id='1';},
  bank=>{bank.cases[0].parts[1].answer_md=bank.cases[0].parts[0].answer_md;},
  bank=>{bank.cases[0].textbook_refs=[];},
  bank=>{bank.cases[0].audit.unresolved.push('待本轮核读');},
  bank=>{bank.cases[0].parts[0].prompt_md+='\x07lpha';}
 ]){
  const bank=clone(banks.micro);mutate(bank);assert.throws(()=>prepareExamTypes(bank,'micro'));
 }
});

test('all formulas retain their original TeX and source hashes match the loaded data',async()=>{
 const manifest=JSON.parse(await readFile('dist/exam-type-manifest.json','utf8'));
 const decode=value=>value.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'");
 for(const [subject,source] of Object.entries(banks)){
  const raw=await readFile('content/exam-types-'+subject+'.json');
  assert.equal(manifest.source_hashes[subject],createHash('sha256').update(raw).digest('hex'));
  const fresh=compileExamTypes(source);
  assert.equal(JSON.stringify(fresh),JSON.stringify(compiled.banks[subject]));
  let count=0;
  function check(value){
   if(Array.isArray(value)){value.forEach(check);return;}
   if(!value||typeof value!=='object')return;
   for(const [key,item] of Object.entries(value)){
    if(key.endsWith('_md')){
     const expected=[...(item||'').matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)].map(match=>(match[1]||match[2]).trim());
     const actual=[...value[key.replace(/_md$/,'_html')].matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(match=>decode(match[1]));
     assert.deepEqual(actual,expected,key);count+=actual.length;
    }else if(!key.endsWith('_html'))check(item);
   }
  }
  check(fresh);assert.equal(count,manifest.subjects[subject].formulas);
 }
});

test('new question drafts survive validation alongside legacy data without reusing old IDs',async()=>{
 const modelContext={window:{}};vm.runInNewContext(await readFile('dist/state-model.js','utf8'),modelContext);
 const subjects=await Promise.all(['micro','macro','political'].map(async key=>({key,...JSON.parse(await readFile('content/'+key+'.json','utf8'))})));
 const plan=JSON.parse(await readFile('content/plan.json','utf8')),recall=JSON.parse(await readFile('content/recall.json','utf8'));
 const model=modelContext.createStateModel({subjects,plan,recall,examTypes:compiled});
 const state=model.fresh(),id=compiled.questions[0].id;
 state.drafts.MI001='原题草稿';state.drafts[id]='（1）由预算约束得……';
 for(const added of ['EMI065','EMI066','EMI067','EMI068','EMA047'])state.drafts[added]='新增题型 '+added+' 的独立作答';
 const restored=model.validate(clone(state));
 assert.equal(restored.drafts.MI001,'原题草稿');assert.equal(restored.drafts[id],state.drafts[id]);
 for(const added of ['EMI065','EMI066','EMI067','EMI068','EMA047'])assert.equal(restored.drafts[added],state.drafts[added]);
 assert.deepEqual(Array.from(restored.records),[]);
});
