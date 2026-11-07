import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {loadIntegrationInputs,prepareExamIntegration,partHash} from './build-exam-integration.mjs';

const input=JSON.parse(await readFile('content/exam-type-integration.json','utf8'));
const banks=Object.fromEntries(await Promise.all(['micro','macro'].map(async subject=>[subject,JSON.parse(await readFile('content/exam-types-'+subject+'.json','utf8'))])));
const legacy=await loadIntegrationInputs(process.cwd());
const merged=prepareExamIntegration(input,banks,legacy);
const copy=value=>JSON.parse(JSON.stringify(value));

test('all 240 old cases and all 708 numbered tasks have concrete formal destinations',()=>{
 assert.equal(merged.entries.length,240);
 assert.equal(merged.entries.reduce((sum,entry)=>sum+entry.part_map.length,0),708);
 for(const subject of ['micro','macro']){
  assert.equal(merged.summary[subject].source_questions,120);
  assert.equal(merged.summary[subject].source_parts,subject==='micro'?300:408);
  assert.equal(merged.summary[subject].duplicate+merged.summary[subject].supplemented+merged.summary[subject].independent,120);
 }
 assert.ok(merged.entries.some(entry=>entry.disposition==='supplemented'));
 assert.ok(merged.entries.some(entry=>entry.disposition==='independent'));
});

test('missing old questions, missing parts and nonexistent formal answers block integration',()=>{
 for(const change of [
  value=>value.entries.pop(),
  value=>value.entries[0].part_map.pop(),
  value=>value.entries[0].part_map[0].targets[0].part_ids.push('999'),
  value=>value.entries[0].part_map[0].targets[0].part_ids=['notes'],
  value=>value.entries[0].source_kind='comprehensive',
 ]){
  const invalid=copy(input);change(invalid);assert.throws(()=>prepareExamIntegration(invalid,banks,legacy));
 }
});

test('a claim of added coverage must change a formal prompt or answer',()=>{
 const invalid=copy(input);
 let selected;
 for(const entry of invalid.entries){
  if(entry.disposition!=='duplicate')continue;
  for(const mapping of entry.part_map){
   const target=mapping.targets[0],question=banks.micro.cases.find(question=>question.id===target.case_id)||banks.macro.cases.find(question=>question.id===target.case_id);
   if(target.part_ids.every(id=>input.baseline[target.case_id]?.[id]===partHash(question.parts.find(part=>part.id===id)))){selected={entry,mapping};break;}
  }
  if(selected)break;
 }
 assert.ok(selected,'At least one same-model duplicate should retain its formal solution');
 selected.entry.disposition='supplemented';selected.mapping.decision='added';
 assert.throws(()=>prepareExamIntegration(invalid,banks,legacy),/no changed formal answer/);
});

test('compiled aliases bind the current sources and never duplicate canonical cases',async()=>{
 const context={window:{STUDY_DATA:{}}};
 vm.runInNewContext(await readFile('dist/exam-type-data.js','utf8'),context);
 assert.equal(JSON.stringify(context.window.STUDY_DATA.examTypes.integration),JSON.stringify(merged));
 for(const targets of Object.values(merged.aliases)){
  assert.equal(new Set(targets.map(target=>target.case_id)).size,targets.length);
  for(const target of targets)assert.equal(new Set(target.part_ids).size,target.part_ids.length);
 }
});

test('topic and method links resolve old identifiers to a deduplicated canonical list',async()=>{
 const data={examTypes:{banks,integration:merged,questions:Object.entries(banks).flatMap(([subject,bank])=>bank.cases.map(question=>({...question,subject})))}};
 const context={window:{}};vm.runInNewContext(await readFile('dist/exam-types.js','utf8'),context);
 const ids=legacy.sources.micro.map(question=>question.id);
 const targets=context.window.ExamTypes.sourceTargets(data,ids);
 assert.equal(targets.length,new Set(targets.map(target=>target.question.id)).size);
 assert.ok(targets.every(target=>/^EMI\d{3}$/.test(target.question.id)));
 const links=context.window.ExamTypes.sourceLinks(data,ids,{writing:true});
 assert.equal((links.match(/data-exam-link=/g)||[]).length,targets.length);
 assert.doesNotMatch(links,/#legacy|#archive|data-action="single"/);
 assert.ok(links.includes('/write'));
});
