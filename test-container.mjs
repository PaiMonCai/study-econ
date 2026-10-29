import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
async function smoke(id,base){
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
 const home=await fetch(origin+base+'/');assert.equal(home.status,200);assert.match(await home.text(),/802练习室/);
 const data=await fetch(origin+base+'/data.js');assert.equal(data.status,200);const script=await data.text();assert.match(script,/MI100/);assert.match(script,/FM53/);assert.match(script,/recall/);
 for(const asset of ['learning.js','learning.css'])assert.equal((await fetch(origin+base+'/'+asset)).status,200);
 const pdf=await fetch(origin+base+'/materials/micro-training.pdf',{headers:{Range:'bytes=0-7'}});assert.equal(pdf.status,206);assert.match(Buffer.from(await pdf.arrayBuffer()).toString(),/^%PDF/);
 assert.equal((await fetch(origin+base+'/.env')).status,403);
 if(base)assert.equal((await fetch(origin+'/app.js')).status,404);
}
for(const base of ['','/802']){
 const {stdout}=await exec('docker',['run','-d','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','-e','BASE_PATH='+base,'-p','127.0.0.1:18080:8080','study-econ:test']);
 const id=stdout.trim();
 try{
  await smoke(id,base);
  console.log('Container smoke passed:',base||'/');
 }catch(error){const logs=await exec('docker',['logs',id]);console.error(logs.stdout,logs.stderr);throw error;}
 finally{await exec('docker',['rm','-f',id]);}
}
const project='study-econ-smoke-'+process.pid;
const env={...process.env,IMAGE:'study-econ:test',SITE_PORT:'18080',BIND_ADDRESS:'127.0.0.1',BASE_PATH:'/802'};
const compose=(...args)=>exec('docker',['compose','-f',fileURLToPath(new URL('./compose.yaml',import.meta.url)),'-p',project,...args],{env});
await compose('config','--quiet');
try{
 await compose('up','-d','--no-build','--pull','never');
 const {stdout}=await compose('ps','-q','practice');
 await smoke(stdout.trim(),'/802');
 console.log('Compose deployment smoke passed: /802');
}catch(error){const logs=await compose('logs','--no-color');console.error(logs.stdout,logs.stderr);throw error;}
finally{await compose('down','--remove-orphans');}
