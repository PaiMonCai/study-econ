import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
for(const base of ['','/802']){
 const {stdout}=await exec('docker',['run','-d','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','-e','BASE_PATH='+base,'-p','127.0.0.1:18080:8080','study-econ:test']);
 const id=stdout.trim();
 try{
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
  const data=await fetch(origin+base+'/data.js');assert.equal(data.status,200);assert.match(await data.text(),/MI100/);
  const pdf=await fetch(origin+base+'/materials/micro-training.pdf',{headers:{Range:'bytes=0-7'}});assert.equal(pdf.status,206);assert.match(Buffer.from(await pdf.arrayBuffer()).toString(),/^%PDF/);
  assert.equal((await fetch(origin+base+'/.env')).status,403);
  if(base)assert.equal((await fetch(origin+'/app.js')).status,404);
  console.log('Container smoke passed:',base||'/');
 }catch(error){const logs=await exec('docker',['logs',id]);console.error(logs.stdout,logs.stderr);throw error;}
 finally{await exec('docker',['rm','-f',id]);}
}
