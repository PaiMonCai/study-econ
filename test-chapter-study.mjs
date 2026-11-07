import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {prepareChapterStudy,chapterQuestionDigest} from './build-chapter-study.mjs';
import {compileExamTypes} from './build-exam-types.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const banks={},studies={};
for(const subject of ['micro','macro']){
 banks[subject]=JSON.parse(await readFile('content/exam-types-'+subject+'.json','utf8'));
 studies[subject]=JSON.parse(await readFile('content/chapter-study-'+subject+'.json','utf8'));
}
const context={window:{STUDY_DATA:{}}};vm.runInNewContext(await readFile('dist/exam-type-data.js','utf8'),context);
const compiled=context.window.STUDY_DATA.examTypes.chapterStudy;
const manifest=JSON.parse(await readFile('dist/exam-type-manifest.json','utf8'));

test('all 38 textbook chapters have a model and all 111 cases have a unique primary chapter',()=>{
 let cases=0,chapters=0,formulas=0;
 for(const subject of ['micro','macro']){
  const result=prepareChapterStudy(studies[subject],banks[subject],subject);
  chapters+=result.chapters.length;cases+=result.summaries.length;formulas+=result.summary.formula_entries;
  assert.equal(result.ordered_case_ids.length,banks[subject].cases.length);
  assert.equal(new Set(result.ordered_case_ids).size,result.ordered_case_ids.length);
  assert.ok(result.chapters.every(chapter=>chapter.model_md&&chapter.formula_md));
  assert.equal(JSON.stringify(compileExamTypes(result)),JSON.stringify(compiled[subject]));
 }
 assert.equal(chapters,38);assert.equal(cases,111);assert.equal(formulas,233);
 assert.equal(studies.micro.book.edition,11);assert.equal(studies.macro.book.edition,10);
 assert.equal(studies.micro.reference_books[0].author,'高鸿业');
 assert.equal(studies.micro.reference_books[0].edition,8);
});

test('cross chapter links agree with each case and never clone a canonical question',()=>{
 for(const subject of ['micro','macro']){
  const study=studies[subject];
  for(const summary of study.summaries){
   assert.equal(study.chapters.filter(chapter=>chapter.case_ids.includes(summary.case_id)).length,1);
   assert.ok(study.chapters[summary.chapter-1].case_ids.includes(summary.case_id));
   for(const chapter of study.chapters)assert.equal(chapter.related_case_ids.includes(summary.case_id),summary.related_chapters.includes(chapter.number));
  }
 }
 for(const [subject,id,chapter] of [['micro','EMI001',5],['micro','EMI018',19],['micro','EMI056',8],['macro','EMA046',2],['macro','EMA029',15],['macro','EMA005',19]])assert.equal(studies[subject].summaries.find(item=>item.case_id===id).chapter,chapter);
});

test('summary bindings become stale when the source prompt, answer or conditions change',()=>{
 for(const field of ['prompt_md','answer_md','notes_md']){
  const bank=copy(banks.micro);bank.cases[0].parts[0][field]+=' changed';
  assert.throws(()=>prepareChapterStudy(studies.micro,bank,'micro'),/stale summary/);
 }
 const bank=copy(banks.macro);bank.cases[0].stem_md+=' changed';
 assert.throws(()=>prepareChapterStudy(studies.macro,bank,'macro'),/stale summary/);
 assert.equal(studies.micro.summaries[0].question_digest,chapterQuestionDigest(banks.micro.cases[0]));
});

test('missing knowledge, formula conditions or chapter assignments block the build',()=>{
 for(const mutate of [
  value=>value.chapters[2].case_ids.pop(),
  value=>value.chapters[0].number=2,
  value=>value.summaries.pop(),
  value=>value.summaries[0].formulas[0].conditions_md='',
  value=>value.summaries[0].knowledge_points=[],
  value=>value.summaries[0].application_md='',
  value=>value.summaries[0].related_chapters.push(value.summaries[0].chapter),
  value=>value.book.edition=8,
  value=>delete value.chapters[3].quick_check.answer_md,
  value=>value.reference_books[0].edition=7,
  value=>value.chapters[0].reading_refs[0].chapter=2,
  value=>value.chapters[0].reading_refs[1].book_key='missing-book',
  value=>value.chapters[0].reading_refs[1].physical_page_range=[200,300],
 ]){
  const invalid=copy(studies.micro);mutate(invalid);assert.throws(()=>prepareChapterStudy(invalid,banks.micro,'micro'));
 }
});

test('every new formula renders strictly while retaining its reviewed TeX',async()=>{
 const decode=value=>value.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'");
 for(const subject of ['micro','macro']){
  const raw=await readFile('content/chapter-study-'+subject+'.json');
  assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.source_hashes['chapter_study_'+subject]);
  let count=0;
  function inspect(value){
   if(Array.isArray(value)){value.forEach(inspect);return;}
   if(!value||typeof value!=='object')return;
   for(const [key,item] of Object.entries(value)){
    if(key.endsWith('_md')){
     const expected=[...item.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)].map(match=>(match[1]||match[2]).trim());
     const html=value[key.replace(/_md$/,'_html')];assert.equal(typeof html,'string');
     assert.doesNotMatch(html,/katex-error|math-error|<script|javascript:/i);
     const actual=[...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map(match=>decode(match[1]));
     assert.deepEqual(actual,expected);count+=actual.length;
    }else if(!key.endsWith('_html'))inspect(item);
   }
  }
  inspect(compiled[subject]);assert.equal(count,manifest.chapterStudy[subject].formulas);
 }
});

test('foundations use related cases while the supplemental behavior example retains its identity',()=>{
 const behavior=studies.micro.chapters[3];
 assert.ok(behavior.quick_check.prompt_md&&behavior.quick_check.answer_md);
 assert.match(behavior.quick_check.prompt_md,/编者补充/);
 for(const chapter of studies.micro.chapters.slice(0,2)){
  assert.equal(chapter.case_ids.length,0);assert.ok(chapter.related_case_ids.length>0);
  assert.match(chapter.selection_note_md,/方法基础/);
 }
 assert.equal(compiled.micro.summary.related_only_chapters,2);
 assert.equal(compiled.macro.summary.related_only_chapters,2);
});
