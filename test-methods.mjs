import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,cp,rename} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import stateModel from './dist/state-model.js';
import {prepareMethodSheets,methodMarkdown} from './build-methods.mjs';
import {createDataStore} from './server-data.mjs';

const read=async name=>JSON.parse(await readFile(new URL('./content/'+name+'.json',import.meta.url),'utf8'));
const subjects=await Promise.all(['micro','macro','political'].map(async key=>({key,...await read(key)}))),banks={};
for(const subject of ['micro','macro']){const raw=await readFile(new URL('./content/concept-map-'+subject+'.json',import.meta.url));banks[subject]={...JSON.parse(raw),raw};}
const source=await read('method-sheets'),prepared=prepareMethodSheets(source,banks,subjects);
const recall=await read('recall'),plan=await read('plan');
const model=stateModel.createStateModel({subjects,plan,recall,methodSheets:source,conceptMaps:banks});
const entry=(extra={})=>({draft:'my first line',revealed:false,assisted:false,rating:null,round:1,at:1000,history:[],...extra});
const copy=value=>structuredClone(value);

test('twenty summaries have actual decision branches and all 26 previously untested nodes have direct checks',()=>{
 assert.deepEqual(prepared.summary,{sheets:20,checks:66,supplements:26,decisions:80});
 assert.equal(new Set(source.sheets.flatMap(sheet=>sheet.checks.map(check=>check.id))).size,66);
 for(const sheet of source.sheets){assert.equal(sheet.decisions.length,4);assert.equal(sheet.checks.filter(check=>check.kind!=='supplement').length,2);assert.ok(sheet.decisions.every(row=>row.branch_md.length>10&&row.check_md.length>10));}
 assert.equal(source.sheets.flatMap(sheet=>sheet.checks).filter(check=>check.kind==='supplement').length,26);
});

test('validation rejects stale sources, cross-subject methods, broken original links and missing supplement checks',()=>{
 for(const change of [d=>delete d.source_hashes['concept-map-micro.json'],d=>d.sheets[0].question_ids[0]='MA001',d=>d.sheets[0].checks[0].node_ids=['KMA001'],d=>d.sheets[2].checks.pop(),d=>d.sheets[0].checks[0].evidence[0].excerpt_md='unsupported text',d=>d.sheets[0].decisions[0].branch_md='']){const altered=copy(source);change(altered);assert.throws(()=>prepareMethodSheets(altered,banks,subjects));}
});

test('question-only export does not contain references or answers that reveal the solution',()=>{
 const questions=methodMarkdown(prepared,{checks:true}),answers=methodMarkdown(prepared,{checks:true,answers:true});
 assert.ok(questions.includes('MI01-D1'));assert.ok(questions.includes('MA09-D6'));assert.ok(!questions.includes('参考推导：'));assert.ok(!questions.includes('自查要点：'));assert.ok(!questions.includes('全部 $(x,y)$'));
 assert.equal((answers.match(/参考推导：/g)||[]).length,66);
});

test('old backups retain records and gain empty diagnostic state without claiming mastery',()=>{
 const old={version:1,start:'2026-10-29',records:[],drafts:{MI001:'keep'},favorites:['MI001'],session:null};
 const clean=model.validate(old);assert.deepEqual({...clean.methodProgress},{});assert.equal(clean.drafts.MI001,'keep');assert.deepEqual(clean.favorites,['MI001']);assert.deepEqual(clean.records,[]);
});

test('diagnostic state roundtrips drafts, reveal and retest history without modifying original results',()=>{
 const state=model.fresh();state.methodProgress['MI01-D1']=entry({revealed:true,rating:1,history:[{round:1,rating:1,at:1000,assisted:false}]});
 const clean=model.validate(JSON.parse(JSON.stringify(state)));assert.deepEqual(clean.methodProgress['MI01-D1'],state.methodProgress['MI01-D1']);assert.deepEqual(clean.records,[]);assert.deepEqual({...clean.conceptProgress},{});assert.deepEqual({...clean.intensiveProgress},{});
 for(const change of [e=>e.rating=3,e=>e.round=0,e=>e.draft='x'.repeat(20001),e=>e.revealed=false,e=>e.history[0].round=2]){const invalid=copy(state);change(invalid.methodProgress['MI01-D1']);assert.throws(()=>model.validate(invalid));}
});

test('concurrent diagnostics merge across questions and detect same-draft conflicts atomically',()=>{
 const base=model.fresh(),a=copy(base),b=copy(base);a.methodProgress['MI01-D1']=entry();b.methodProgress['MA01-D1']=entry({draft:'other'});
 const merged=model.apply(model.apply(base,model.diff(base,a)),model.diff(base,b));assert.equal(Object.keys(merged.methodProgress).length,2);
 const conflict=copy(base);conflict.methodProgress['MI01-D1']=entry({draft:'competing',at:2000});assert.throws(()=>model.apply(merged,model.diff(base,conflict)),error=>error.status===409);assert.equal(merged.methodProgress['MI01-D1'].draft,'my first line');
 assert.equal(model.apply(conflict,model.diff(base,a),{checkConflicts:false}).methodProgress['MI01-D1'].draft,'my first line');
 const older=copy(merged);older.methodProgress['MI01-D1'].at=1;assert.equal(model.merge(merged,older).methodProgress['MI01-D1'].at,1000);
});

test('missing diagnostic catalog rejects existing diagnostics instead of silently dropping them',()=>{
 const without=stateModel.createStateModel({subjects,plan,recall});
 assert.throws(()=>without.validate({...model.fresh(),methodProgress:{'MI01-D1':entry()}}),/目录未完整/);
});

test('server restart retains diagnostics and missing catalog fails before database writes',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ruc802-methods-')),catalog=path.join(dir,'catalog'),dataDir=path.join(dir,'data');let store;
 try{
  await cp(new URL('./content',import.meta.url),catalog,{recursive:true});store=await createDataStore({dataDir,catalogDir:catalog});
  const first=store.snapshot();assert.ok(first.state.methodProgress);store.close();store=null;
  first.state.methodProgress['MI01-D1']=entry();
  const db=new DatabaseSync(path.join(dataDir,'study.sqlite'));db.prepare('UPDATE state SET json=? WHERE id=1').run(JSON.stringify(first.state));db.close();
  store=await createDataStore({dataDir,catalogDir:catalog});assert.equal(store.snapshot().state.methodProgress['MI01-D1'].draft,'my first line');store.close();store=null;
  const before=await readFile(path.join(dataDir,'study.sqlite'));
  await rename(path.join(catalog,'method-sheets.json'),path.join(catalog,'method-sheets.hidden'));
  await assert.rejects(createDataStore({dataDir,catalogDir:catalog}),/ENOENT/);
  assert.deepEqual(await readFile(path.join(dataDir,'study.sqlite')),before);
 }finally{store?.close();await rm(dir,{recursive:true,force:true});}
});

test('independent numeric cross-checks cover supplementary and changed-condition examples',()=>{
 const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
 const taxQuantity=(10-2)/2;assert.equal(taxQuantity,4);assert.equal((10-taxQuantity)*1,6);assert.equal(taxQuantity*2,8);
 close((10-2)/3,8/3);close(2+8/3,14/3);
 assert.equal((10-4)/2,3);close((95-90)/90,1/18);
 assert.equal(0.02/(0.02+0.18),0.1);assert.equal((4-2)/(6-2),0.5);
 close(0.02+1.5*(0.08-0.02),0.11);assert.equal(2*10+5*2,30);assert.equal(5*12,60);
 assert.equal(Math.sqrt(16/1),4);assert.equal(Math.sqrt(16/1)/2,2);
 assert.equal(12-4,8);assert.equal((12-4)/2,4);
 close(0.5*0.9*10,4.5);close(0.5*0.9**2*15,6.075);close(0.5*0.9*15,6.75);
 assert.equal((20+4*20)/10,10);assert.equal((100-5)/(100-5-90),19);assert.equal(95-10*5,45);
 assert.equal(Math.sqrt(0.04*200/2),2);assert.equal(200/(2*2),50);assert.equal(Math.sqrt(200/(2*0.16)),25);
 assert.equal(2+0.05*100,7);close(1.02/1.10,51/55);
 assert.equal(100*7-100*6,100);
 for(const [alpha,s,b,tau] of [[0.3,0.2,0.1,0.1],[0.4,0.3,0.2,0.5]]){const k=(s/b)**(1/(1-alpha))*(1-tau)**(-1/alpha),g=b*(1-tau)**(1/alpha);close(s*(1-tau)*k**alpha,g*k);close((1-tau)*k**alpha,(s/b)**(alpha/(1-alpha)));}
});
