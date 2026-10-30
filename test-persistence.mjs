import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createApp} from './serve.mjs';
import {listenForHttpTests} from './test-http-helper.mjs';

const password='test-only-long-password',token='test_only_url_token_0123456789abcdef';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZk0AAAAASUVORK5CYII=';
const photo=(id='photo1')=>({id,qid:'MI001',createdAt:1000,dataUrl:png});
async function fixture(fn,options={}){
 const dataDir=await mkdtemp(path.join(tmpdir(),'ruc802-data-test-'));let server,url;
 async function start(){server=await createApp({basePath:'/802',dataDir,access:{password,token,...options}});await listenForHttpTests(server);url=`http://127.0.0.1:${server.address().port}/802`;return url;}
 async function stop(){await new Promise(r=>{server.close(r);server.closeAllConnections();});}
 try{await start();await fn({get url(){return url;},start,stop});}finally{if(server.listening)await stop();await rm(dataDir,{recursive:true,force:true});}
}
async function login(url,credential=password){
 const jar=new Map();let csrf;
 const request=async(route,options={})=>{const response=await fetch(url+route,{redirect:'manual',...options,headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(options.body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-Ruc802-CSRF':csrf}:{}),...options.headers}});for(const c of response.headers.getSetCookie()){const [pair]=c.split(';'),i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}return response;};
 const page=await request('/_access/login'),nonce=/name="nonce" value="([^"]+)"/.exec(await page.text())[1];
 const result=await request('/_access/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:new URL(url).origin},body:new URLSearchParams({nonce,credential})});
 if(result.status===303)csrf=(await(await request('/_access/status')).json()).csrfToken;
 return{request,result,get cookie(){return[...jar].map(([k,v])=>k+'='+v).join('; ');},get csrf(){return csrf;},json:async(route,options={})=>{const r=await request(route,options);assert.ok(r.ok,await r.clone().text());return r.json();}};
}
test('protected assets and APIs require login, including conditional and range requests',()=>fixture(async({url})=>{
 assert.equal((await fetch(url+'/',{redirect:'manual'})).status,303);
 for(const file of ['/app.js','/data.js','/materials/micro-training.pdf','/api/state','/api/backup','/_access/status']){const r=await fetch(url+file,{headers:{Range:'bytes=0-7','If-None-Match':'*'},redirect:'manual'});assert.equal(r.status,401,file);assert.match(r.headers.get('cache-control'),/no-store/);}
 const bad=await login(url,'wrong-password');assert.equal(bad.result.status,401);
 const user=await login(url);assert.equal(user.result.status,303);assert.match(user.result.headers.getSetCookie().join(';'),/HttpOnly; SameSite=Lax/);
 assert.equal((await user.request('/app.js')).status,200);assert.match((await user.request('/app.js')).headers.get('cache-control'),/private, no-store/);
 assert.equal((await user.request('/api/state',{method:'PATCH',body:'{"changes":[]}',headers:{'X-Ruc802-CSRF':'wrong'}})).status,403);
 assert.equal((await user.request('/api/state',{method:'PATCH',body:'{"changes":[]}',headers:{Origin:'https://other.example'}})).status,403);
 assert.equal((await user.request('/api/state',{method:'PATCH',body:'{"changes":[]}',headers:{Origin:'null','Sec-Fetch-Site':'cross-site'}})).status,403);
 assert.equal((await user.request('/api/state',{method:'PATCH',body:'{"changes":[]}',headers:{Origin:'null','Sec-Fetch-Site':'same-origin','X-Ruc802-CSRF':'wrong'}})).status,403);
 const oldCookie=user.cookie;assert.equal((await user.request('/_access/logout',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:user.csrf})})).status,303);
 assert.equal((await fetch(url+'/api/state',{headers:{Cookie:oldCookie}})).status,401);
}));
test('URL token is stripped and only configured credentials work',()=>fixture(async({url})=>{
 const r=await fetch(url+'/?token='+token+'&view=1',{redirect:'manual'});assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/802/?view=1');assert.match(r.headers.get('referrer-policy'),/no-referrer/);
 assert.equal((await fetch(url+'/?token='+token+'&token='+token,{redirect:'manual'})).status,401);
 const user=await login(url,token);assert.equal(user.result.status,303);
}));
test('login expiry and rate limiting are enforced on server',()=>fixture(async({url})=>{
 for(let i=0;i<10;i++)assert.equal((await login(url,'wrong-password')).result.status,401);
 const page=await fetch(url+'/_access/login');const cookie=page.headers.getSetCookie()[0].split(';')[0],nonce=/name="nonce" value="([^"]+)"/.exec(await page.text())[1];
 const r=await fetch(url+'/_access/login',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({nonce,credential:password})});assert.equal(r.status,429);assert.ok(Number(r.headers.get('retry-after'))>0);
}));
test('expired sessions cannot read and public startup requires a credential',async()=>{
 let time=1000000;await fixture(async({url})=>{const user=await login(url);time+=3600001;assert.equal((await user.request('/api/state')).status,401);},{now:()=>time,sessionHours:1});
 const result=spawnSync(process.execPath,['serve.mjs'],{env:{...process.env,HOST:'0.0.0.0',ACCESS_PASSWORD:'',ACCESS_TOKEN:'',ACCESS_REQUIRED:'false'},encoding:'utf8',timeout:10000});assert.notEqual(result.status,0);assert.match(result.stderr,/Access protection is required/);
});
test('state and photo survive restart and are visible in a new session',()=>fixture(async f=>{
 const user=await login(f.url),initial=await user.json('/api/state');
 await user.json('/api/state',{method:'PATCH',body:JSON.stringify({changes:[{path:['favorites','MI001'],before:false,after:true}]})});
 await user.json('/api/photos',{method:'POST',body:JSON.stringify({items:[photo()]})});
 await f.stop();await f.start();assert.equal((await fetch(f.url+'/api/state',{headers:{Cookie:user.cookie}})).status,401);
 const other=await login(f.url),saved=await other.json('/api/state');assert.equal(saved.workspace,initial.workspace);assert.deepEqual(saved.state.favorites,['MI001']);assert.equal((await other.json('/api/photos')).count,1);assert.equal((await other.request('/api/photos/photo1')).headers.get('content-type'),'image/png');
 const backup=await other.json('/api/backup');assert.deepEqual(backup.favorites,['MI001']);assert.equal(backup.photos.items[0].dataUrl,png);
}));
test('concurrent entity changes merge and same-draft conflict is explicit and atomic',()=>fixture(async({url})=>{
 const a=await login(url),b=await login(url),patch=changes=>({method:'PATCH',body:JSON.stringify({changes})});
 await a.json('/api/state',patch([{path:['favorites','MI001'],before:false,after:true},{path:['drafts','MI001'],before:null,after:'first'}]));
 const merged=await b.json('/api/state',patch([{path:['favorites','MI002'],before:false,after:true}]));assert.deepEqual(new Set(merged.state.favorites),new Set(['MI001','MI002']));
 const conflict=await b.request('/api/state',patch([{path:['drafts','MI001'],before:null,after:'other'},{path:['favorites','MI003'],before:false,after:true}]));assert.equal(conflict.status,409);assert.deepEqual((await a.json('/api/state')).state.favorites,merged.state.favorites);
 assert.equal((await b.request('/api/state',patch([{path:['drafts','MI001'],before:'first',after:'chosen'}]))).status,200);
}));
test('photo import is staged, cancel and failed commit preserve live data, repeats deduplicate',()=>fixture(async({url})=>{
 const user=await login(url),fresh=(await user.json('/api/state')).state,begin=state=>user.json('/api/imports',{method:'POST',body:JSON.stringify({state})}),stage=(id,items)=>user.json('/api/imports/'+id+'/photos',{method:'POST',body:JSON.stringify({items})}),commit=id=>user.request('/api/imports/'+id+'/commit',{method:'POST',body:'{}'});
 let batch=await begin({...fresh,favorites:['MI001']});await stage(batch.id,[photo()]);assert.equal((await user.json('/api/photos')).count,0);await user.json('/api/imports/'+batch.id,{method:'DELETE'});assert.deepEqual((await user.json('/api/state')).state.favorites,[]);
 batch=await begin({...fresh,favorites:['MI001']});await stage(batch.id,[photo(),photo('photo2'),photo('photo3')]);assert.equal((await commit(batch.id)).status,200);
 batch=await begin({...fresh,favorites:['MI002']});await stage(batch.id,[photo('photo4')]);assert.equal((await commit(batch.id)).status,409);assert.deepEqual((await user.json('/api/state')).state.favorites,['MI001']);assert.equal((await user.json('/api/photos')).count,3);
 batch=await begin(fresh);await stage(batch.id,[photo()]);assert.equal((await commit(batch.id)).status,200);assert.equal((await user.json('/api/photos')).count,3);
}));
test('invalid photo and oversized request fail without changing database',()=>fixture(async({url})=>{
 const user=await login(url);assert.equal((await user.request('/api/photos',{method:'POST',body:JSON.stringify({items:[{...photo(),dataUrl:'data:image/png;base64,YWJj'}]})})).status,400);
 assert.equal((await user.request('/api/state',{method:'PATCH',body:' '.repeat(9*1024*1024+1)})).status,413);assert.equal((await user.json('/api/photos')).count,0);
}));
test('unknown database schema is rejected before any schema or journal mutation',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'ruc802-schema-test-')),filename=path.join(dataDir,'study.sqlite');
 try{const db=new DatabaseSync(filename);db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY,value TEXT);INSERT INTO meta VALUES ('schema','99');CREATE TABLE future_table (id INTEGER)");db.close();const before=await readFile(filename);await assert.rejects(createApp({dataDir,access:{password}}),/Unsupported database schema/);assert.deepEqual(await readFile(filename),before);const check=new DatabaseSync(filename,{readOnly:true});assert.deepEqual(check.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(r=>r.name),['future_table','meta']);check.close();}finally{await rm(dataDir,{recursive:true,force:true});}
});
