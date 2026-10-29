import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const base=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.pdf':'application/pdf','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const port=Number(process.env.PORT||18765);
createServer(async(req,res)=>{try{const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(base,'.'+(route==='/'?'/index.html':route));if(target!==base&&!target.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}const info=await stat(target);if(!info.isFile())throw new Error();res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:await readFile(target));}catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('文件未找到');}}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/`));
