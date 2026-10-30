'use strict';
window.createServerStore=async function(data){
 const model=window.createStateModel(data),url=path=>new URL(path,document.baseURI).href;
 let info,base,desired,workspace,revision=0,status='saved',error='',running=null,timer=null,recovery=null,conflict=null;
 const listeners=new Set(),clone=value=>JSON.parse(JSON.stringify(value));
 async function request(path,options={}){
  const response=await fetch(url(path),{cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(info?.csrfToken?{'X-Ruc802-CSRF':info.csrfToken}:{}),...options.headers}});
  if(response.status===401){const failure=Error('访问已过期，请先重新登录；未同步修改已保留在本机。');failure.auth=true;throw failure;}
  const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'服务器暂时无法保存，请重试'),{status:response.status,response:value});return value;
 }
 try{info=await request('_access/status');}catch(error){if(error.auth)location.replace(url('_access/login'));throw error;}
 const active=info.storageMode==='server';
 if(active){const initial=await request('api/state');base=desired=model.validate(initial.state);workspace=initial.workspace;revision=initial.revision;try{recovery=JSON.parse(localStorage.getItem('ruc802.server-recovery.v1.'+workspace));if(recovery?.workspace!==workspace)recovery=null;}catch{}}
 const recoveryKey=()=> 'ruc802.server-recovery.v1.'+workspace;
 function preserve(){if(!active)return;try{localStorage.setItem(recoveryKey(),JSON.stringify({workspace,base,state:desired}));}catch{}}
 function clearRecovery(){try{localStorage.removeItem(recoveryKey());}catch{}recovery=null;}
 const label=()=>status==='saved'?'服务器已保存':status==='pending'?'正在保存到服务器':status==='conflict'?'草稿有冲突，请处理':'未保存到服务器，请重试';
 function notify(next,reset=false){mount();for(const listener of listeners)listener(next,reset);}
 function adopt(value){base=model.validate(value.state);desired=clone(base);revision=value.revision;status='saved';error='';conflict=null;clearRecovery();notify(clone(desired),true);}
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
    status=model.diff(base,desired).length?'pending':'saved';error='';if(status==='saved')clearRecovery();else preserve();notify(clone(desired));
   }catch(failure){status=failure.status===409?'conflict':'error';error=failure.message;conflict=failure.status===409?failure.response:null;preserve();notify();throw failure;}
  })();
  try{await running;}finally{running=null;}
  if(status==='pending')return flush();
 }
 function notice(){if(!active)return'';if(recovery&&status==='saved')return '<div class="notice server-notice"><p>发现本机上次未同步的修改，可恢复后继续保存到服务器。</p><div class="actions"><button class="btn" data-storage-action="recover">恢复未同步修改</button><button class="btn" data-storage-action="download">下载未同步进度</button><button class="btn" data-storage-action="discard">使用服务器版本</button></div></div>';if(['error','conflict'].includes(status))return `<div class="notice server-notice"><p>${status==='conflict'?'另一端修改了同一份草稿。请先下载未同步进度，再选择保留哪一份。':'暂时未能写入服务器，当前修改仍保留在本次页面。请重试或下载未同步进度。'}</p><div class="actions">${status==='conflict'?'<button class="btn" data-storage-action="keep">保留本机草稿</button>':'<button class="btn" data-storage-action="retry">重试保存</button>'}<button class="btn" data-storage-action="download">下载未同步进度</button><button class="btn" data-storage-action="discard">使用服务器版本</button>${error.includes('重新登录')?'<button class="btn" data-storage-action="login">重新登录</button>':''}</div></div>`;return'';}
 function mount(){
  for(const area of document.querySelectorAll('[data-access-controls]')){area.replaceChildren();if(info.enabled){const form=document.createElement('form');form.method='post';form.action=url('_access/logout');const csrf=document.createElement('input');csrf.type='hidden';csrf.name='csrf';csrf.value=info.csrfToken;const button=document.createElement('button');button.className='access-logout';button.textContent='退出访问';form.append(csrf,button);area.append(form);}}
  if(active){for(const node of document.querySelectorAll('.local-status')){node.textContent=label();node.dataset.status=status;}for(const area of document.querySelectorAll('[data-server-notice]'))area.innerHTML=notice();}
 }
 function downloadPending(){const value=recovery?.state||desired;const blob=new Blob([JSON.stringify({...value,photosExcluded:true,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='802未同步进度-不含照片.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-storage-action]');if(!button)return;const action=button.dataset.storageAction;button.disabled=true;
  try{
   if(action==='download')downloadPending();
   if(action==='retry')await flush();
   if(action==='login'){preserve();location.assign(url('_access/login'));}
   if(action==='discard'&&confirm('使用服务器版本会放弃本机尚未同步的修改。建议先下载未同步进度。是否继续？'))adopt(await request('api/state'));
   if(action==='recover'&&recovery){const latest=await request('api/state'),changes=model.diff(recovery.base,recovery.state);base=model.validate(latest.state);try{desired=model.apply(base,changes);}catch(failure){conflict={state:base};desired=model.apply(base,changes,{checkConflicts:false});status='conflict';error=failure.message;preserve();notify();return;}recovery=null;notify(clone(desired));await flush();}
   if(action==='keep'&&conflict&&confirm('保留本机会覆盖服务器上发生冲突的同份草稿，其余学习记录会合并保留。是否继续？')){const changes=model.diff(base,desired);base=model.validate((await request('api/state')).state);desired=model.apply(base,changes,{checkConflicts:false});conflict=null;status='pending';error='';notify(clone(desired));await flush();}
  }catch(failure){if(!['error','conflict'].includes(status)){status='error';error=failure.message;notify();}}finally{if(button.isConnected)button.disabled=false;}
 });
 window.addEventListener('pagehide',()=>{
  if(!active||status==='saved'||conflict)return;preserve();const changes=model.diff(base,desired),body=JSON.stringify({changes});if(new Blob([body]).size<60000)fetch(url('api/state'),{method:'PATCH',headers:{'Content-Type':'application/json','X-Ruc802-CSRF':info.csrfToken},body,keepalive:true}).catch(()=>{});
 });
 async function importBackup(state,photos){
  await flush();const batch=await request('api/imports',{method:'POST',body:JSON.stringify({state})});
  try{for(let i=0;i<photos.length;i+=3){const items=await Promise.all(photos.slice(i,i+3).map(async({blob,...item})=>({...item,dataUrl:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);})})));await request('api/imports/'+batch.id+'/photos',{method:'POST',body:JSON.stringify({items})});}const value=await request('api/imports/'+batch.id+'/commit',{method:'POST',body:'{}'});adopt(value);return value;
  }catch(failure){await request('api/imports/'+batch.id,{method:'DELETE'}).catch(()=>{});throw failure;}
 }
 if(active&&recovery){
  try{const changes=model.diff(model.validate(recovery.base),model.validate(recovery.state));try{desired=model.apply(base,changes);status=changes.length?'pending':'saved';}catch(failure){desired=model.apply(base,changes,{checkConflicts:false});conflict={state:base};status='conflict';error=failure.message;}recovery=null;if(status==='pending')timer=setTimeout(()=>flush().catch(()=>{}),500);else if(status==='saved')clearRecovery();else preserve();}
  catch{status='error';error='本机恢复数据无法读取，请先下载未同步进度。';}
 }
 return{active,info,initialState:active?clone(desired):null,model,request,url,save,flush,mount,notice,importBackup,adopt,subscribe(listener){listeners.add(listener);},get status(){return status;},get message(){return label();},get state(){return clone(desired);},get revision(){return revision;}};
};
