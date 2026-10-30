export const httpError=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});
export function sendJson(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
export function readBody(req,limit){
 return new Promise((resolve,reject)=>{
  let size=0;const chunks=[];
  const cleanup=()=>{req.off('data',data);req.off('end',end);req.off('error',fail);req.off('aborted',aborted);};
  const fail=error=>{cleanup();reject(error);};
  const aborted=()=>fail(httpError(400,'请求未完整上传，请重试'));
  const end=()=>{cleanup();resolve(Buffer.concat(chunks));};
  const data=chunk=>{size+=chunk.length;if(size>limit){cleanup();req.resume();reject(httpError(413,'上传内容过大'));}else chunks.push(chunk);};
  if(Number(req.headers['content-length'])>limit){req.resume();reject(httpError(413,'上传内容过大'));return;}
  req.on('data',data);req.on('end',end);req.on('error',fail);req.on('aborted',aborted);
 });
}
export async function readJson(req,limit=9*1024*1024){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw httpError(415,'请使用JSON格式上传');
 const body=await readBody(req,limit);try{return JSON.parse(body.toString('utf8'));}catch{throw httpError(400,'JSON内容无法读取');}
}
