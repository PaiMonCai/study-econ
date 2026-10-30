import {test} from 'node:test';
import assert from 'node:assert/strict';
import {get,createServer} from 'node:http';
import {gunzipSync} from 'node:zlib';
import {createApp,normalizeBase} from './serve.mjs';
import {listenForHttpTests} from './test-http-helper.mjs';

async function withServer(basePath,fn){const server=await createApp({basePath,storageMode:'browser'});await listenForHttpTests(server);try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}}
function raw(url,headers={}){const [,origin,route]=/^(http:\/\/[^/]+)(.*)$/.exec(url);const parsed=new URL(origin);return new Promise((resolve,reject)=>{get({hostname:parsed.hostname,port:parsed.port,path:route||'/',headers},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject);});}
test('root and static files serve independently with correct methods and caching',()=>withServer('',async url=>{
 const home=await fetch(url);assert.equal(home.status,200);assert.match(await home.text(),/802练习室/);assert.match(home.headers.get('content-security-policy'),/script-src 'self'/);
 const script=await fetch(url+'/app.js');assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);const etag=script.headers.get('etag');await script.arrayBuffer();
 const cached=await fetch(url+'/app.js',{headers:{'If-None-Match':etag}});assert.equal(cached.status,304);
 const head=await fetch(url+'/app.js',{method:'HEAD',headers:{'Accept-Encoding':'identity'}});assert.equal(head.status,200);assert.ok(Number(head.headers.get('content-length'))>1000);assert.equal((await head.text()).length,0);
 assert.equal((await fetch(url+'/app.js',{method:'POST'})).status,405);
 assert.equal((await fetch(url+'/missing.js')).status,404);
 assert.equal((await fetch(url+'/materials/')).status,404);
 assert.deepEqual(await (await fetch(url+'/healthz')).json(),{status:'ok',app:'ruc802',basePath:'/'});
}));
test('subdirectory assets, redirect, and health routes',()=>withServer('/802',async url=>{
 const redirect=await fetch(url+'/802',{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/802/');
 assert.equal((await fetch(url+'/802/')).status,200);assert.equal((await fetch(url+'/802/data.js')).status,200);
 assert.equal((await fetch(url+'/app.js')).status,404);assert.equal((await fetch(url+'/802-extra/')).status,404);
 assert.equal((await fetch(url+'/802/healthz')).status,200);assert.equal((await fetch(url+'/healthz')).status,200);
}));
test('PDF byte ranges return the requested data',()=>withServer('',async url=>{
 const pdf=await fetch(url+'/materials/micro-training.pdf');const full=Buffer.from(await pdf.arrayBuffer());
 const part=await fetch(url+'/materials/micro-training.pdf',{headers:{Range:'bytes=0-15'}});assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),`bytes 0-15/${full.length}`);assert.deepEqual(Buffer.from(await part.arrayBuffer()),full.subarray(0,16));
 const suffix=await fetch(url+'/materials/micro-training.pdf',{headers:{Range:'bytes=-24'}});assert.equal(suffix.status,206);assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),full.subarray(-24));
 for(const range of ['bytes=999999999-','bytes=4-1','bytes=-0','bytes=0-1,4-5','bytes=-'])assert.equal((await fetch(url+'/materials/micro-training.pdf',{headers:{Range:range}})).status,416);
 const stale=await fetch(url+'/materials/micro-training.pdf',{headers:{Range:'bytes=0-15','If-Range':'stale'}});assert.equal(stale.status,200);await stale.arrayBuffer();
}));
test('gzip data is complete and can be disabled by the client',()=>withServer('',async url=>{
 const compressed=await raw(url+'/data.js',{'Accept-Encoding':'gzip'});assert.equal(compressed.status,200);assert.equal(compressed.headers['content-encoding'],'gzip');
 const plain=await raw(url+'/data.js',{'Accept-Encoding':'gzip;q=0'});assert.equal(plain.headers['content-encoding'],undefined);assert.deepEqual(gunzipSync(compressed.body),plain.body);assert.ok(compressed.body.length<plain.body.length/3);
}));
test('private source paths and malformed traversal are not served',()=>withServer('',async url=>{
 for(const suffix of ['/%2e%2e%2fpackage.json','/.env','/.git/config','/materials/%2e%2e/%2e%2e/package.json','/%00','/%5c..%5cpackage.json'])assert.equal((await raw(url+suffix)).status,403,suffix);
 assert.equal((await raw(url+'/%xx')).status,400);assert.equal((await fetch(url+'/package.json')).status,404);
}));
test('base path configuration rejects invalid paths',()=>{
 assert.equal(normalizeBase('/802/'),'/802');assert.equal(normalizeBase('/'),'');
 for(const v of ['802','//other','/../','/a b','/a?b'])assert.throws(()=>normalizeBase(v));
});

test('HTTP fixture allocation avoids Fetch-blocked ports and handles an occupied candidate',async()=>{
 const first=createServer(),second=createServer();
 try{
  const occupied=await listenForHttpTests(first),chosen=await listenForHttpTests(second,occupied);
  assert.ok(chosen>=20000&&chosen<60000);assert.notEqual(chosen,occupied);
  await assert.rejects(listenForHttpTests(createServer(),10080),/Invalid HTTP test port/);
 }finally{for(const server of [first,second])if(server.listening)await new Promise(resolve=>server.close(resolve));}
});
