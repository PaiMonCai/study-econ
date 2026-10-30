import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {httpError,readBody,sendJson} from './http-utils.mjs';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digest=value=>createHash('sha256').update(String(value)).digest();
const equal=(a,b)=>timingSafeEqual(digest(a),digest(b));
const random=()=>randomBytes(32).toString('base64url');
const boolean=(value,name)=>{if(value===undefined||value==='')return false;if(['true','1'].includes(value))return true;if(['false','0'].includes(value))return false;throw Error(name+' must be true or false.');};
export function accessFromEnv(env){return{password:env.ACCESS_PASSWORD||'',token:env.ACCESS_TOKEN||'',required:boolean(env.ACCESS_REQUIRED,'ACCESS_REQUIRED'),cookieSecure:boolean(env.ACCESS_COOKIE_SECURE,'ACCESS_COOKIE_SECURE'),sessionHours:Number(env.ACCESS_SESSION_HOURS||168)};}

export function createAccess({password='',token='',required=false,cookieSecure=false,sessionHours=168,now=Date.now}={},base='',storageMode='server'){
 if(password&&(password.length<12||password.length>256))throw Error('ACCESS_PASSWORD must contain 12 to 256 characters.');
 if(token&&!/^[A-Za-z0-9_-]{32,256}$/.test(token))throw Error('ACCESS_TOKEN must contain 32 to 256 letters, digits, underscores or hyphens.');
 if(!Number.isInteger(sessionHours)||sessionHours<1||sessionHours>720)throw Error('ACCESS_SESSION_HOURS must be an integer from 1 to 720.');
 const enabled=!!(password||token);
 if(required&&!enabled)throw Error('Access protection is required. Set ACCESS_PASSWORD or ACCESS_TOKEN before starting.');
 const home=base+'/',prefix=base+'/_access',scope=createHash('sha256').update(base).digest('hex').slice(0,10),sessionName='ruc802_access_'+scope,nonceName='ruc802_nonce_'+scope;
 const sessions=new Map(),challenges=new Map(),failures=new Map(),localCsrf=random(),ttl=sessionHours*3600*1000;
 const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').slice(0,100).map(s=>{const i=s.indexOf('=');return i<0?['','']:[s.slice(0,i).trim(),s.slice(i+1).trim()];}));
 const cookie=(name,value,seconds)=>`${name}=${value}; Path=${home}; Max-Age=${seconds}; HttpOnly; SameSite=Lax${cookieSecure?'; Secure':''}`;
 const prune=()=>{for(const map of [sessions,challenges,failures])for(const [key,value] of map)if(value.expiresAt<=now())map.delete(key);};
 function safeNext(value){try{if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\x00-\x20\x7f]/.test(value))return home;const u=new URL(value,'http://local');const decoded=decodeURIComponent(u.pathname);if(u.origin!=='http://local'||decoded.startsWith('//')||decoded.includes('\\')||decoded.split('/').some(p=>p==='..')||(base&&!u.pathname.startsWith(home)&&u.pathname!==base)||u.pathname.startsWith(prefix))return home;u.searchParams.delete('token');return(u.pathname===base?home:u.pathname)+u.search;}catch{return home;}}
 function getSession(req){const key=cookies(req)[sessionName];const entry=key&&sessions.get(key);if(!entry)return null;if(entry.expiresAt<=now()){sessions.delete(key);return null;}return{...entry,key};}
 const redirect=(res,location)=>{res.writeHead(303,{'Location':location,'Cache-Control':'no-store'});res.end();};
 function checkOrigin(req){if(req.headers['sec-fetch-site']==='cross-site')throw httpError(403,'请从本站页面提交');if(req.headers.origin){
  // Browsers send an opaque Origin on no-referrer form navigation. The nonce
  // or CSRF token remains required after this same-origin metadata check.
  if(req.headers.origin==='null'&&req.headers['sec-fetch-site']==='same-origin')return;
  let origin;try{origin=new URL(req.headers.origin);}catch{throw httpError(403,'请求来源不正确');}if(!['http:','https:'].includes(origin.protocol)||origin.host.toLowerCase()!==String(req.headers.host||'').toLowerCase())throw httpError(403,'请求来源不正确');}}
 function requireWrite(req,session,csrf){checkOrigin(req);const expected=enabled?session?.csrf:localCsrf;if(!expected||typeof csrf!=='string'||csrf.length>256||!equal(expected,csrf))throw httpError(403,'访问凭证已更新，请刷新后重试');}
 function newSession(req,res){prune();const old=cookies(req)[sessionName];if(old)sessions.delete(old);if(sessions.size>=1024)throw httpError(503,'当前登录较多，请稍后重试');const key=random(),entry={csrf:random(),expiresAt:now()+ttl};sessions.set(key,entry);res.setHeader('Set-Cookie',[cookie(sessionName,key,Math.floor(ttl/1000)),cookie(nonceName,'',0)]);return entry;}
 function rate(req){prune();const key=req.socket.remoteAddress||'unknown',entry=failures.get(key);if(entry?.count>=10)throw httpError(429,'尝试次数较多，请稍后再试',{retryAfter:Math.max(1,Math.ceil((entry.expiresAt-now())/1000))});return key;}
 function failed(key){const old=failures.get(key);if(!old&&failures.size>=2048)throw httpError(429,'尝试次数较多，请稍后再试',{retryAfter:900});failures.set(key,{count:(old?.count||0)+1,expiresAt:old?.expiresAt||now()+900000});}
 function loginPage(req,res,next,message='',status=200){
  prune();const old=cookies(req)[nonceName];if(old)challenges.delete(old);if(challenges.size>=4096)throw httpError(429,'请求较多，请稍后再试',{retryAfter:600});const nonce=random();challenges.set(nonce,{expiresAt:now()+600000});res.setHeader('Set-Cookie',cookie(nonceName,nonce,600));
  const label=password&&token?'访问密码或令牌':password?'访问密码':'访问令牌';
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>进入802练习室</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:#183347;background:linear-gradient(145deg,#eaf2f5,#f8fbfc 65%);font:16px/1.8 "Microsoft YaHei",sans-serif}main{width:min(100%,460px);padding:36px;background:white;border:1px solid #dce5ea;border-radius:10px}.brand{font-weight:700;color:#166a62}h1{font:700 28px/1.5 SimSun,serif;margin:18px 0 10px}p{color:#526e7a;font-size:14px}label{display:block;margin:22px 0 7px}input{width:100%;padding:13px;border:1px solid #b9ccd6;border-radius:5px;font:inherit}button{width:100%;padding:13px;margin-top:20px;border:0;border-radius:5px;background:#166a62;color:white;font:inherit;cursor:pointer}:focus-visible{outline:3px solid #76ada4;outline-offset:3px}.error{padding:12px;background:#fff1ec;color:#944536;border-radius:5px}.note{border-top:1px solid #dce5ea;margin-top:27px;padding-top:18px}a{color:#166a62}@media(max-width:480px){main{padding:26px 22px}}</style><script src="${prefix}/client.js" defer></script></head><body><main><div class="brand">802练习室</div><h1>继续你的复习。</h1><p>输入访问口令，进入自己的学习空间。</p>${message?`<p class="error" role="alert">${escape(message)}</p>`:''}<form action="${prefix}/login" method="post" data-access-form data-token="${!!token}"><input type="hidden" name="nonce" value="${nonce}"><input type="hidden" name="next" value="${escape(safeNext(next))}"><label for="credential">${label}</label><input id="credential" name="credential" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">进入练习室</button></form><p class="note">${storageMode==='server'?'学习进度和作答照片保存在服务器，同一口令下的设备共享同一份学习库。':'当前为浏览器保存模式，换浏览器可导入完整备份。'}退出访问不会删除学习数据。</p></main></body></html>`;
  res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:html);
 }
 const client=`(()=>{const form=document.querySelector('[data-access-form]');if(!form||!location.hash.startsWith('#token='))return;const values=new URLSearchParams(location.hash.slice(1));const token=values.getAll('token');history.replaceState(null,'',location.pathname+location.search);if(form.dataset.token==='true'&&token.length===1&&token[0]){form.elements.credential.value=token[0];form.requestSubmit();}})();`;
 async function handle(req,res,route){
  const parsed=new URL(req.url,'http://local'),params=parsed.searchParams;
  if(route===prefix+'/client.js'&&['GET','HEAD'].includes(req.method)){res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:client);return false;}
  if(enabled)res.setHeader('Referrer-Policy','no-referrer');
  let session=getSession(req);
  if(enabled&&params.has('token')&&['GET','HEAD'].includes(req.method)){
   const key=rate(req),values=params.getAll('token');
   if(values.length===1&&token&&values[0].length<=256&&equal(values[0],token)){failures.delete(key);newSession(req,res);redirect(res,safeNext(req.url));return false;}
   if(session){redirect(res,safeNext(req.url));return false;}
   failed(key);loginPage(req,res,safeNext(req.url),'访问链接已失效或令牌不正确，请输入访问口令。',401);return false;
  }
  if(route===prefix+'/login'){
   if(!enabled){redirect(res,home);return false;}
   if(['GET','HEAD'].includes(req.method)){if(session)redirect(res,safeNext(params.get('next')));else loginPage(req,res,params.get('next'),params.get('logged_out')==='1'?'已退出访问，学习数据仍保留。':'');return false;}
   if(req.method!=='POST')throw httpError(405,'不支持此请求方式');
   checkOrigin(req);const key=rate(req);if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type']||''))throw httpError(415,'请使用登录表单提交');
   const form=new URLSearchParams((await readBody(req,4096)).toString('utf8')),nonce=form.get('nonce')||'',challenge=challenges.get(nonce);
   if(!challenge||challenge.expiresAt<=now()||!equal(cookies(req)[nonceName]||'',nonce))throw httpError(403,'登录页面已过期，请刷新后重试');challenges.delete(nonce);
   const value=form.get('credential')||'';if(value.length<=256&&((password&&equal(value,password))||(token&&equal(value,token)))){failures.delete(key);newSession(req,res);redirect(res,safeNext(form.get('next')));return false;}
   failed(key);loginPage(req,res,form.get('next'),'访问口令不正确，请重新输入。',401);return false;
  }
  if(enabled&&!session){if(req.method==='GET'&&(route===base||route.endsWith('/')||(req.headers.accept||'').includes('text/html')))redirect(res,prefix+'/login?next='+encodeURIComponent(safeNext(req.url)));else sendJson(res,401,{error:'访问已过期，请重新输入访问口令',code:'AUTH_REQUIRED',login:prefix+'/login'});return false;}
  if(route===prefix+'/status'){
   if(!['GET','HEAD'].includes(req.method))throw httpError(405,'不支持此请求方式');sendJson(res,200,{enabled,storageMode,expiresAt:session?.expiresAt||null,csrfToken:session?.csrf||localCsrf});return false;
  }
  if(route===prefix+'/logout'){
   if(req.method!=='POST')throw httpError(405,'请使用退出按钮');
   const form=new URLSearchParams((await readBody(req,4096)).toString('utf8'));requireWrite(req,session,form.get('csrf'));if(session)sessions.delete(session.key);res.setHeader('Set-Cookie',cookie(sessionName,'',0));redirect(res,enabled?prefix+'/login?logged_out=1':home);return false;
  }
  if(!['GET','HEAD'].includes(req.method)&&route.startsWith(base+'/api/'))requireWrite(req,session,req.headers['x-ruc802-csrf']);
  return{session};
 }
 return{enabled,handle,safeNext,close(){sessions.clear();challenges.clear();failures.clear();}};
}
