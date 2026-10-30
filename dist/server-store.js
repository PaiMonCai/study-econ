'use strict';
window.createServerStore=async function(data){
 const model=window.createStateModel(data),url=path=>new URL(path,document.baseURI).href;
 let info,base,desired,workspace,revision=0,status='saved',error='',running=null,timer=null,recovery=null,conflict=null,cacheDurable=true,lastFailure=null,leavingApproved=false;
 const listeners=new Set(),clone=value=>JSON.parse(JSON.stringify(value)),mountedControls=new WeakSet(),noticeMarkup=new WeakMap();
 async function request(path,{timeoutMs=15000,responseType='json',...options}={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetch(url(path),{cache:'no-store',...options,signal:options.signal||controller.signal,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(info?.csrfToken?{'X-Ruc802-CSRF':info.csrfToken}:{}),...options.headers}});
   if(response.status===401)throw Object.assign(Error('访问已过期，请先下载未同步进度，再重新登录。'),{auth:true,status:401});
   if(response.ok&&responseType==='blob')return await response.blob();
   const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'服务器暂时无法保存，请重试'),{status:response.status,response:value});return value;
  }catch(failure){if(failure.status)throw failure;throw Object.assign(Error(controller.signal.aborted?'服务器响应超时，保存结果尚未确认。请重试或下载未同步进度。':'暂时无法连接服务器，请检查网络后重试。'),{network:true,timeout:controller.signal.aborted});}
  finally{clearTimeout(timeout);}
 }
 try{info=await request('_access/status');}catch(error){if(error.auth)location.replace(url('_access/login'));throw error;}
 const active=info.storageMode==='server';
 if(active){const initial=await request('api/state');base=desired=model.validate(initial.state);workspace=initial.workspace;revision=initial.revision;try{recovery=JSON.parse(localStorage.getItem('ruc802.server-recovery.v1.'+workspace));if(recovery?.workspace!==workspace)recovery=null;}catch{}}
 const recoveryKey=()=> 'ruc802.server-recovery.v1.'+workspace;
 function preserve(){if(!active)return true;try{localStorage.setItem(recoveryKey(),JSON.stringify({workspace,base,state:desired}));cacheDurable=true;}catch{cacheDurable=false;}return cacheDurable;}
 function clearRecovery(){try{localStorage.removeItem(recoveryKey());}catch{}recovery=null;cacheDurable=true;}
 const label=()=>status==='saved'?'服务器已保存':status==='pending'?'正在保存到服务器':status==='conflict'?'草稿有冲突，请处理':'未保存到服务器，请重试';
 function notify(next,reset=false){mount();for(const listener of listeners)listener(next,reset);}
 function adopt(value){base=model.validate(value.state);desired=clone(base);revision=value.revision;status='saved';error='';conflict=null;lastFailure=null;clearRecovery();notify(clone(desired),true);}
 function save(state){desired=clone(state);status=conflict?'conflict':'pending';if(!conflict)error='';preserve();notify();clearTimeout(timer);if(!conflict)timer=setTimeout(()=>flush().catch(()=>{}),250);return false;}
 async function flush(){
  if(!active)return;
  clearTimeout(timer);if(running){await running;if(model.diff(base,desired).length)return flush();return;}
  if(conflict)throw Error(error||'请先处理草稿冲突');
  const sent=clone(desired),changes=model.diff(base,sent);if(!changes.length){status='saved';clearRecovery();notify();return;}
  status='pending';notify();
  running=(async()=>{
   try{
    const result=await request('api/state',{method:'PATCH',body:JSON.stringify({changes})});
    const remaining=model.diff(sent,desired);base=model.validate(result.state);revision=result.revision;desired=model.apply(base,remaining,{checkConflicts:false});
    status=model.diff(base,desired).length?'pending':'saved';error='';lastFailure=null;if(status==='saved')clearRecovery();else preserve();notify(clone(desired));
   }catch(failure){status=failure.status===409?'conflict':'error';error=failure.message;lastFailure=failure;conflict=failure.status===409?failure.response:null;preserve();notify();throw failure;}
  })();
  try{await running;}finally{running=null;}
  if(status==='pending')return flush();
 }
 function notice(){if(!active)return'';if(recovery&&status==='saved')return '<div class="notice server-notice"><p>发现本机上次未同步的修改，可恢复后继续保存到服务器。</p><div class="actions"><button class="btn" data-storage-action="recover">恢复未同步修改</button><button class="btn" data-storage-action="download">下载未同步进度</button><button class="btn" data-storage-action="discard">使用服务器版本</button></div></div>';if(['error','conflict'].includes(status))return `<div class="notice server-notice"><p>${status==='conflict'?'另一端修改了同一份草稿。请先下载未同步进度，再选择保留哪一份。':'当前修改尚未确认保存到服务器。请重试或下载未同步进度。'}</p>${error?'<p class="small">'+window.StudyUI.esc(error)+'</p>':''}${!cacheDurable?'<p class="small">本浏览器无法保留离线副本。关闭或重新登录前，请先下载未同步进度。</p>':''}<div class="actions">${status==='conflict'?'<button class="btn" data-storage-action="keep">保留本机草稿</button>':'<button class="btn" data-storage-action="retry">重试保存</button>'}<button class="btn" data-storage-action="download">下载未同步进度</button><button class="btn" data-storage-action="discard">使用服务器版本</button>${lastFailure?.auth?'<button class="btn" data-storage-action="login">重新登录</button>':''}</div></div>`;return'';}
 function mount(){
  for(const area of document.querySelectorAll('[data-access-controls]')){if(mountedControls.has(area))continue;mountedControls.add(area);area.replaceChildren();if(info.enabled){const form=document.createElement('form');form.method='post';form.action=url('_access/logout');const csrf=document.createElement('input');csrf.type='hidden';csrf.name='csrf';csrf.value=info.csrfToken;const button=document.createElement('button');button.className='access-logout';button.textContent='退出访问';form.append(csrf,button);area.append(form);}}
  if(active){for(const node of document.querySelectorAll('.local-status')){if(node.textContent!==label())node.textContent=label();node.dataset.status=status;}for(const area of document.querySelectorAll('[data-server-notice]')){const html=notice();if(noticeMarkup.get(area)!==html){area.innerHTML=html;noticeMarkup.set(area,html);}}}
 }
 function downloadPending(){const value=recovery?.state||desired;const blob=new Blob([JSON.stringify({...value,photosExcluded:true,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='802未同步进度-不含照片.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-storage-action]');if(!button)return;const action=button.dataset.storageAction;button.disabled=true;
  try{
   if(action==='download')downloadPending();
   if(action==='retry')await flush();
   if(action==='login'){
    if(!preserve()&&!await window.StudyUI.confirm({title:'先保留未同步进度',body:'<p>本浏览器无法保存离线副本。请先下载本次页面的未同步进度，确认文件已下载后再继续登录。</p><button class="btn" data-storage-action="download">下载未同步进度</button>',confirmText:'已下载，重新登录',cancelText:'留在此页',returnTo:button}))return;
    leavingApproved=true;location.assign(url('_access/login'));
   }
   if(action==='discard'&&await window.StudyUI.confirm({title:'使用服务器版本？',body:'<p>这会放弃本机尚未同步的修改，读取服务器已保存的版本。需要保留两份时，请先下载未同步进度。</p>',confirmText:'确认使用服务器版本',danger:true,returnTo:button,fallback:'#main h1'}))adopt(await request('api/state'));
   if(action==='recover'&&recovery){const latest=await request('api/state'),changes=model.diff(recovery.base,recovery.state);base=model.validate(latest.state);try{desired=model.apply(base,changes);}catch(failure){conflict={state:base};desired=model.apply(base,changes,{checkConflicts:false});status='conflict';error=failure.message;preserve();notify();return;}recovery=null;notify(clone(desired));await flush();}
   if(action==='keep'&&conflict&&await window.StudyUI.confirm({title:'保留本机草稿？',body:'<p>这会覆盖服务器上发生冲突的同份草稿，其余学习记录会合并保留。需要保留两份时，请先下载未同步进度。</p>',confirmText:'确认保留本机草稿',danger:true,returnTo:button,fallback:'#main h1'})){const changes=model.diff(base,desired);base=model.validate((await request('api/state')).state);desired=model.apply(base,changes,{checkConflicts:false});conflict=null;status='pending';error='';notify(clone(desired));await flush();}
  }catch(failure){if(!['error','conflict'].includes(status)){status='error';error=failure.message;lastFailure=failure;notify();}}finally{if(button.isConnected)button.disabled=false;if(['retry','discard','keep'].includes(action))window.StudyUI.restoreFocus(button,'#main h1');}
 });
 window.addEventListener('pagehide',()=>{
  if(!active||status==='saved'||conflict)return;preserve();const changes=model.diff(base,desired),body=JSON.stringify({changes});if(new Blob([body]).size<60000)fetch(url('api/state'),{method:'PATCH',headers:{'Content-Type':'application/json','X-Ruc802-CSRF':info.csrfToken},body,keepalive:true}).catch(()=>{});
 });
 async function importBackup(state,photos,onProgress=()=>{}){
  await flush();const batch=await request('api/imports',{method:'POST',timeoutMs:60000,body:JSON.stringify({state})});onProgress({phase:'upload',done:0,total:photos.length});
  try{for(let i=0;i<photos.length;i+=3){const items=await Promise.all(photos.slice(i,i+3).map(async({blob,...item})=>({...item,dataUrl:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);})})));await request('api/imports/'+batch.id+'/photos',{method:'POST',timeoutMs:60000,body:JSON.stringify({items})});onProgress({phase:'upload',done:Math.min(i+3,photos.length),total:photos.length});}onProgress({phase:'commit',done:photos.length,total:photos.length});const value=await request('api/imports/'+batch.id+'/commit',{method:'POST',timeoutMs:60000,body:'{}'});adopt(value);return value;
  }catch(failure){await request('api/imports/'+batch.id,{method:'DELETE'}).catch(()=>{});throw failure;}
 }
 if(active&&recovery){
  try{const changes=model.diff(model.validate(recovery.base),model.validate(recovery.state));try{desired=model.apply(base,changes);status=changes.length?'pending':'saved';}catch(failure){desired=model.apply(base,changes,{checkConflicts:false});conflict={state:base};status='conflict';error=failure.message;}recovery=null;if(status==='pending')timer=setTimeout(()=>flush().catch(()=>{}),500);else if(status==='saved')clearRecovery();else preserve();}
  catch{status='error';error='本机恢复数据无法读取，请先下载未同步进度。';}
 }
 window.addEventListener('online',()=>{if(active&&status==='error'&&lastFailure?.network&&!conflict)flush().catch(()=>{});});
 window.addEventListener('beforeunload',event=>{if(active&&status!=='saved'&&!cacheDurable&&!leavingApproved){event.preventDefault();event.returnValue='';}});
 return{active,info,initialState:active?clone(desired):null,model,request,url,save,flush,mount,notice,importBackup,adopt,subscribe(listener){listeners.add(listener);},get status(){return status;},get message(){return label();},get state(){return clone(desired);},get revision(){return revision;}};
};
