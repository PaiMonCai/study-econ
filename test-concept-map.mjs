import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {prepareConceptMap,conceptDigest,compileConceptMap,prepareConceptBridges} from './build-concept-map.mjs';
import {createDataStore} from './server-data.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('./content/'+name+'.json',import.meta.url),'utf8'));
const raw=name=>fs.readFileSync(new URL('./content/'+name+'.json',import.meta.url));
const {createStateModel}=createRequire(import.meta.url)('./dist/state-model.js');
function sources(subject){
 const files={[subject]:subject,['exam_'+subject]:'exam-review-'+subject,['topics_'+subject]:'topics-'+subject,recall:'recall',['training_'+subject]:'training-'+subject,['comprehensive_'+subject]:'comprehensive-'+subject};
 return{hashes:Object.fromEntries(Object.entries(files).map(([key,file])=>[key,conceptDigest(raw(file))])),topics:read('topics-'+subject),exam:read('exam-review-'+subject),recall:read('recall'),training:read('training-'+subject),comprehensive:read('comprehensive-'+subject)};
}
for(const subject of ['micro','macro']){
 test(subject+' concept catalog covers all cards, questions, parts and primary sections',()=>{
  const source=sources(subject),bank=prepareConceptMap(read('concept-map-'+subject),subject,source);
  assert.equal(bank.summary.topics,10);assert.equal(bank.summary.questions,120);
  assert.equal(bank.summary.cards,source.recall.cards.filter(c=>c.subject===subject).length);
  assert.equal(bank.summary.parts,[...source.training.questions,...source.comprehensive.cases].reduce((n,q)=>n+q.parts.length,0));
  for(const node of bank.nodes)assert.equal(bank.topics.flatMap(t=>t.sections.flatMap(s=>s.node_ids)).filter(id=>id===node.id).length,1);
 });
 test(subject+' rejects stale sources, invented quotes, missing paths and invalid relations',()=>{
  const original=read('concept-map-'+subject),source=sources(subject);
  const changes=[b=>b.source_hashes.recall='0'.repeat(64),b=>b.nodes[0].evidence[0].excerpt_md='This quotation does not exist in any source.',b=>b.nodes[0].topic_id='unknown',b=>b.nodes[0].aliases=[null],b=>b.audit.checked='unfinished',b=>b.topics[0].sections[0].node_ids.pop(),b=>b.applications.pop(),b=>b.applications[0].parts.pop(),b=>b.applications[0].parts[0].node_ids=['unknown'],b=>b.edges[0].to=b.edges[0].from,b=>b.edges.push({...b.edges[0],id:subject==='micro'?'EMI999':'EMA999'}),b=>{const e=b.edges.find(e=>e.type==='prerequisite');assert.ok(e);b.edges.push({...e,from:e.to,to:e.from,id:subject==='micro'?'EMI998':'EMA998'});}];
  for(const change of changes){const invalid=structuredClone(original);change(invalid);assert.throws(()=>prepareConceptMap(invalid,subject,source));}
 });
 test(subject+' never silently invents edges for a one-node definition check',()=>{
  const bank=read('concept-map-'+subject),source=sources(subject),part=bank.applications[0].parts[0];
  part.node_ids=part.node_ids.slice(0,1);part.edge_ids=[];delete part.no_edge_reason_md;
  assert.throws(()=>prepareConceptMap(bank,subject,source),/no relation reason/);
  part.no_edge_reason_md='This part tests a definition, without an asserted inference.';
  assert.doesNotThrow(()=>prepareConceptMap(bank,subject,source));
 });
}
const catalog=()=>({subjects:['micro','macro','political'].map(key=>({...read(key),key})),plan:read('plan'),recall:read('recall'),topics:['micro','macro','political'].flatMap(s=>read('topics-'+s).topics),comprehensive:{questions:['micro','macro'].flatMap(s=>read('comprehensive-'+s).cases.map(q=>({...q,comprehensive:true}))),papers:read('training-papers').papers},conceptMaps:Object.fromEntries(['micro','macro'].map(s=>[s,read('concept-map-'+s)]))});
test('knowledge self-assessment preserves legacy records and keeps three layers separate',()=>{
 const model=createStateModel(catalog()),legacy=model.fresh();delete legacy.conceptProgress;
 legacy.records=[{id:'legacy',qid:'MI001',rating:1,at:100,seconds:30,day:null}];legacy.drafts={MI001:'old draft'};legacy.favorites=['MI001'];
 const restored=model.validate(legacy);assert.deepEqual(restored.records[0].qid,'MI001');assert.equal(restored.drafts.MI001,'old draft');assert.deepEqual(restored.favorites,['MI001']);assert.equal(Object.keys(restored.conceptProgress).length,0);
 const id=Object.values(catalog().conceptMaps)[0].nodes[0].id,first={...restored,conceptProgress:{[id+':concept']:{rating:2,at:300}}},second={...restored,conceptProgress:{[id+':relation']:{rating:1,at:400}}};
 const both=model.apply(model.validate(first),model.diff(restored,second));
 assert.equal(both.conceptProgress[id+':concept'].rating,2);assert.equal(both.conceptProgress[id+':relation'].rating,1);assert.equal(both.conceptProgress[id+':application'],undefined);
 const stale={...both,conceptProgress:{[id+':concept']:{rating:0,at:200}}};assert.equal(model.merge(both,stale).conceptProgress[id+':concept'].rating,2);
 const incoming={...both,conceptProgress:{[id+':application']:{rating:0,at:500}}};assert.equal(Object.keys(model.merge(both,incoming).conceptProgress).length,3);
 assert.throws(()=>model.validate({...both,conceptProgress:{[id+':concept']:{rating:3,at:1}}}),/自评/);
 assert.throws(()=>model.validate({...both,conceptProgress:{[id+':concept']:{rating:2,at:Infinity}}}),/自评/);
 assert.equal(Object.keys(model.validate({...restored,conceptProgress:{unknown:{rating:2,at:1}}}).conceptProgress).length,0);
 const recall={...both,recallSession:{ids:['FM01'],index:0,revealed:[],returnTo:'maps/micro/01/network/'+id}};assert.equal(model.validate(recall).recallSession.returnTo,recall.recallSession.returnTo);
});
test('compilation retains every source field while adding rendered markdown',()=>{
 const bank=read('concept-map-micro'),compiled=compileConceptMap(bank,text=>'<p>'+text+'</p>');
 assert.equal(compiled.nodes[0].core_md,bank.nodes[0].core_md);assert.equal(compiled.nodes[0].core_html,'<p>'+bank.nodes[0].core_md+'</p>');
 assert.equal(compiled.nodes[0].evidence[0].excerpt_md,bank.nodes[0].evidence[0].excerpt_md);assert.ok(compiled.nodes[0].evidence[0].excerpt_html);
 assert.throws(()=>compileConceptMap({core_md:'An incomplete $x'},x=>x),/Unclosed math delimiter/);
 assert.throws(()=>compileConceptMap({core_md:'Mixed $$x$'},x=>x),/Mismatched math delimiters/);
});

test('cross-subject bridges preserve both source identities and reject false endpoint evidence',()=>{
 const banks=['micro','macro'].map(s=>read('concept-map-'+s)),hashes=Object.fromEntries(['micro','macro'].map(s=>['concept_map_'+s,conceptDigest(raw('concept-map-'+s))]));
 const source=read('concept-map-bridges'),prepared=prepareConceptBridges(source,banks,hashes);assert.ok(prepared.bridges.length>0);
 for(const change of [b=>b.source_hashes.concept_map_micro='0'.repeat(64),b=>b.bridges[0].to=b.bridges[0].from,b=>b.bridges[0].type='derives',b=>b.bridges[0].evidence[0].excerpt_md='This is an invented source quotation.',b=>b.bridges[0].evidence=b.bridges[0].evidence.filter(e=>e.id===b.bridges[0].from)]){const invalid=structuredClone(source);change(invalid);assert.throws(()=>prepareConceptBridges(invalid,banks,hashes));}
});

test('missing concept catalogs reject existing self-assessments instead of filtering them away',()=>{
 const data=catalog(),model=createStateModel(data),input=model.fresh();const id=data.conceptMaps.macro.nodes[0].id;input.conceptProgress[id+':concept']={rating:2,at:100};delete data.conceptMaps.macro;
 const unavailable=createStateModel(data);assert.throws(()=>unavailable.validate(input),/知识图目录/);assert.doesNotThrow(()=>unavailable.validate({...input,conceptProgress:{}}));
});

test('an incomplete server catalog cannot open or rewrite the existing learning database',async()=>{
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'ruc802-catalog-')),catalogDir=path.join(fixture,'content'),dataDir=path.join(fixture,'data');
 let store;
 try{
  fs.mkdirSync(catalogDir);for(const name of fs.readdirSync(new URL('./content/',import.meta.url)))if(name.endsWith('.json'))fs.writeFileSync(path.join(catalogDir,name),fs.readFileSync(new URL('./content/'+name,import.meta.url)));
  store=await createDataStore({catalogDir,dataDir});const input=store.snapshot().state;store.close();store=null;
  input.conceptProgress['KMA001:concept']={rating:2,at:100};input.drafts.MI001='retained before repair';
  const filename=path.join(dataDir,'study.sqlite'),db=new DatabaseSync(filename);db.prepare('UPDATE state SET json=? WHERE id=1').run(JSON.stringify(input));db.close();
  const before=conceptDigest(fs.readFileSync(filename)),missing=path.join(catalogDir,'concept-map-macro.json'),source=fs.readFileSync(missing);fs.rmSync(missing);
  await assert.rejects(createDataStore({catalogDir,dataDir}),/ENOENT/);assert.equal(conceptDigest(fs.readFileSync(filename)),before);
  fs.writeFileSync(missing,source);store=await createDataStore({catalogDir,dataDir});assert.deepEqual(store.snapshot().state.conceptProgress,input.conceptProgress);assert.equal(store.snapshot().state.drafts.MI001,input.drafts.MI001);
 }finally{store?.close();fs.rmSync(fixture,{recursive:true,force:true});}
});
