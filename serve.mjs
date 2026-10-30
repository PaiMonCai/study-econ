import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat,realpath} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import path from 'node:path';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const TYPES={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.pdf':'application/pdf',
 '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json; charset=utf-8',
 '.txt':'text/plain; charset=utf-8','.LICENSE':'text/plain; charset=utf-8'};

export function normalizeBase(value='') {
 const base=value==='/'?'':value.replace(/\/+$/,'');
 if(base && (!/^\/[a-zA-Z0-9_/-]+$/.test(base)||base.includes('//')))throw new Error('BASE_PATH must be empty or an absolute path such as /802.');
 return base;
}

export async function createApp({directory=path.join(HERE,'dist'),basePath=''}={}) {
 const root=await realpath(directory),base=normalizeBase(basePath);
 return createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
  function text(status,message,headers={}){res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store',...headers});res.end(req.method==='HEAD'?undefined:message);}
  if(!['GET','HEAD'].includes(req.method)){text(405,'Method not allowed',{'Allow':'GET, HEAD'});return;}
  let route;
  try{route=decodeURIComponent((req.url||'/').split('?')[0]);}
  catch{text(400,'Invalid URL');return;}
  if(!route.startsWith('/')||/[\\\x00-\x1f\x7f]/.test(route)||route.split('/').some(x=>x==='..'||x.startsWith('.'))){text(403,'Forbidden');return;}
  if(route==='/healthz'||route===base+'/healthz'){
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
   res.end(req.method==='HEAD'?undefined:JSON.stringify({status:'ok',app:'ruc802',basePath:base||'/'}));return;
  }
  if(base&&route===base){res.writeHead(308,{'Location':base+'/','Cache-Control':'no-store'});res.end();return;}
  if(base&&!route.startsWith(base+'/')){text(404,'Not found');return;}
  const relative=(base?route.slice(base.length):route);
  const target=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));
  if(!target.startsWith(root+path.sep)){text(403,'Forbidden');return;}
  try{
   const actual=await realpath(target);
   if(!actual.startsWith(root+path.sep)){text(403,'Forbidden');return;}
   const info=await stat(actual);
   if(!info.isFile()){text(404,'Not found');return;}
   const etag=`W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
   res.setHeader('Content-Type',TYPES[path.extname(actual)]||'application/octet-stream');
   res.setHeader('Cache-Control','no-cache');
   res.setHeader('ETag',etag);
   res.setHeader('Last-Modified',info.mtime.toUTCString());
   res.setHeader('Accept-Ranges','bytes');
   res.setHeader('Vary','Accept-Encoding');
   if(req.headers['if-none-match']?.split(',').map(s=>s.trim()).some(s=>s===etag||s==='*')){res.writeHead(304);res.end();return;}
   let start=0,end=info.size-1,partial=false;
   if(req.headers.range&&(!req.headers['if-range']||req.headers['if-range']===info.mtime.toUTCString())){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match||(!match[1]&&!match[2])){text(416,'Invalid range',{'Content-Range':`bytes */${info.size}`});return;}
    if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
    else start=Math.max(0,info.size-Number(match[2]));
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){text(416,'Range not satisfiable',{'Content-Range':`bytes */${info.size}`});return;}
    partial=true;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
   }
   const gzip=!partial&&info.size>1024&&/\.(?:html|js|css|svg|json|txt)$/.test(actual)&&
    (req.headers['accept-encoding']||'').split(',').some(s=>/^gzip(?:\s*;\s*q=(?!0(?:\.0*)?$)[\d.]+)?$/i.test(s.trim()));
   if(gzip)res.setHeader('Content-Encoding','gzip');else res.setHeader('Content-Length',partial?end-start+1:info.size);
   res.writeHead(partial?206:200);
   if(req.method==='HEAD'||info.size===0){res.end();return;}
   const stream=createReadStream(actual,partial?{start,end}:undefined);
   if(gzip)await pipeline(stream,createGzip(),res);else await pipeline(stream,res);
  }catch(error){
   if(res.headersSent){res.destroy();return;}
   if(['ENOENT','ENOTDIR'].includes(error.code)){text(404,'Not found');return;}
   console.error('Static request failed:',error.code||error.name);text(500,'Server error');
  }
 });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const host=process.env.HOST||'0.0.0.0',port=Number(process.env.PORT||8080),basePath=normalizeBase(process.env.BASE_PATH||'');
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
 const server=await createApp({basePath});
 server.on('error',error=>{console.error(error.message);process.exitCode=1;});
 server.listen(port,host,()=>console.log(`802 practice listening on ${host}:${port}${basePath}/`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));server.closeIdleConnections();setTimeout(()=>process.exit(1),10000).unref();});
}
