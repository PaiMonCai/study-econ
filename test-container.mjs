import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const testToken='ci_only_access_token_0123456789abcdefgh';
async function smoke(id,base,expectSaved=false){
 let healthy=false;
 for(let attempt=0;attempt<45;attempt++){
  const {stdout}=await exec('docker',['inspect','--format','{{.State.Health.Status}}',id]);
  if(stdout.trim()==='healthy'){healthy=true;break;}
  if(stdout.trim()==='unhealthy')throw Error('Container is unhealthy');
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert.ok(healthy,'Container must become healthy');
 const origin='http://127.0.0.1:18080';
 assert.equal((await fetch(origin+'/healthz')).status,200);
 assert.equal((await fetch(origin+base+'/api/state')).status,401);
 const login=await fetch(origin+base+'/?token='+testToken,{redirect:'manual'});assert.equal(login.status,303);assert.equal(login.headers.get('location'),base+'/');const Cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),headers={Cookie};
 const request=(route,options={})=>fetch(origin+base+route,{...options,headers:{...headers,...options.headers}});
 const status=await(await request('/_access/status')).json();assert.equal(status.storageMode,'server');assert.equal(status.enabled,true);
 const state=await(await request('/api/state')).json();assert.equal(state.state.favorites.includes('MI001'),expectSaved);
 const saved=await request('/api/state',{method:'PATCH',headers:{'Content-Type':'application/json','X-Ruc802-CSRF':status.csrfToken},body:JSON.stringify({changes:[{path:['favorites','MI001'],before:expectSaved,after:true}]})});assert.equal(saved.status,200);
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZk0AAAAASUVORK5CYII=';
 if(expectSaved)assert.equal((await(await request('/api/photos')).json()).count,1);
 else assert.equal((await request('/api/photos',{method:'POST',headers:{'Content-Type':'application/json','X-Ruc802-CSRF':status.csrfToken},body:JSON.stringify({items:[{id:'smoke-photo',qid:'MI001',createdAt:1000,dataUrl:png}]})})).status,200);
 const home=await request('/');assert.equal(home.status,200);assert.match(await home.text(),/802练习室/);
 const data=await request('/data.js');assert.equal(data.status,200);const script=await data.text();assert.match(script,/MI100/);assert.match(script,/FM53/);assert.match(script,/recall/);
 assert.match(script,/solution/);assert.match(script,/application_md/);
 for(const asset of ['learning.js','learning.css','photos.js','photos.css','solutions.css'])assert.equal((await request('/'+asset)).status,200);
 assert.match(home.headers.get('content-security-policy'),/img-src[^;]*blob:/);
 const pdf=await request('/materials/micro-training.pdf',{headers:{Range:'bytes=0-7'}});assert.equal(pdf.status,206);assert.match(Buffer.from(await pdf.arrayBuffer()).toString(),/^%PDF/);
 assert.equal((await request('/.env')).status,403);
 if(base)assert.equal((await fetch(origin+'/app.js')).status,404);
}
for(const base of ['','/802']){
 const volume='study-econ-smoke-'+process.pid+(base?'sub':'root');await exec('docker',['volume','create',volume]);
 const {stdout}=await exec('docker',['run','-d','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','-e','BASE_PATH='+base,'-e','ACCESS_TOKEN='+testToken,'--mount','type=volume,source='+volume+',target=/app/data','-p','127.0.0.1:18080:8080','study-econ:test']);
 const id=stdout.trim();
 try{
  await smoke(id,base);
  await exec('docker',['restart',id]);await smoke(id,base,true);
  console.log('Container smoke passed:',base||'/');
 }catch(error){const logs=await exec('docker',['logs',id]);console.error(logs.stdout,logs.stderr);throw error;}
 finally{await exec('docker',['rm','-f',id]);await exec('docker',['volume','rm',volume]);}
}
const project='study-econ-smoke-'+process.pid;
const env={...process.env,IMAGE:'study-econ:test',SITE_PORT:'18080',BIND_ADDRESS:'127.0.0.1',BASE_PATH:'/802',ACCESS_TOKEN:testToken,ACCESS_PASSWORD:''};
const compose=(...args)=>exec('docker',['compose','-f',fileURLToPath(new URL('./compose.yaml',import.meta.url)),'-p',project,...args],{env});
await compose('config','--quiet');
try{
 await compose('up','-d','--no-build','--pull','never');
 const {stdout}=await compose('ps','-q','practice');
 await smoke(stdout.trim(),'/802');
 await compose('up','-d','--no-build','--pull','never','--force-recreate');const next=await compose('ps','-q','practice');await smoke(next.stdout.trim(),'/802',true);
 console.log('Compose deployment and persistent database recreation passed: /802');
}catch(error){const logs=await compose('logs','--no-color');console.error(logs.stdout,logs.stderr);throw error;}
finally{await compose('down','--remove-orphans','--volumes');}
