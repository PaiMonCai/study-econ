import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {prepareExamTypes,compileExamTypes} from './build-exam-types.mjs';
import {createExamTypeFigures} from './build-exam-type-figures.mjs';
import {loadIntegrationInputs,prepareExamIntegration} from './build-exam-integration.mjs';
import {prepareChapterStudy} from './build-chapter-study.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const context={window:{STUDY_DATA:{}}};
const output=await readFile(new URL('./dist/exam-type-data.js',import.meta.url),'utf8');
vm.runInNewContext(output,context);
const data=context.window.STUDY_DATA.examTypes;
const manifest=JSON.parse(await readFile(new URL('./dist/exam-type-manifest.json',import.meta.url),'utf8'));
for(const subject of ['micro','macro']){
 const raw=await readFile(new URL('./content/exam-types-'+subject+'.json',import.meta.url));
 const bank=prepareExamTypes(JSON.parse(raw),subject);
 assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.source_hashes[subject]);
 assert.equal(JSON.stringify(compileExamTypes(bank)),JSON.stringify(data.banks[subject]));
 assert.equal(data.banks[subject].cases.length,manifest.subjects[subject].cases);
 const studyRaw=await readFile(new URL('./content/chapter-study-'+subject+'.json',import.meta.url));
 assert.equal(createHash('sha256').update(studyRaw).digest('hex'),manifest.source_hashes['chapter_study_'+subject]);
 const study=compileExamTypes(prepareChapterStudy(JSON.parse(studyRaw),bank,subject));
 assert.equal(JSON.stringify(study),JSON.stringify(data.chapterStudy[subject]));
 assert.equal(JSON.stringify({...study.summary,formulas:study.formula_count}),JSON.stringify(manifest.chapterStudy[subject]));
}
assert.equal(data.questions.length,new Set(data.questions.map(q=>q.id)).size);
const integrationRaw=await readFile(new URL('./content/exam-type-integration.json',import.meta.url));
assert.equal(createHash('sha256').update(integrationRaw).digest('hex'),manifest.source_hashes.integration);
const integration=prepareExamIntegration(JSON.parse(integrationRaw),data.banks,await loadIntegrationInputs(path.dirname(fileURLToPath(import.meta.url))));
assert.equal(JSON.stringify(integration),JSON.stringify(data.integration));
assert.equal(JSON.stringify(integration.summary),JSON.stringify(manifest.integration));
assert.equal(JSON.stringify(data.figures),JSON.stringify(createExamTypeFigures(data.questions)));
assert.equal(manifest.source_hashes.figure_renderer,createHash('sha256').update(await readFile(new URL('./build-exam-type-figures.mjs',import.meta.url))).digest('hex'));
for(const figure of data.figures)assert.equal(await readFile(new URL('./dist/'+figure.url,import.meta.url),'utf8'),figure.svg);
assert.ok(Buffer.byteLength(output)<25*1024*1024,'Exam type asset exceeds hosting limit');
console.log(JSON.stringify({examTypes:'verified',...manifest.subjects,chapterStudy:manifest.chapterStudy}));
