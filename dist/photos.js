'use strict';
window.createPhotoAnswers=({root,getQuestionId,toast,remote})=>{
 const MAX=3,limit=100*1024*1024,UI=window.StudyUI,esc=UI.esc;
 const uid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 let queue=Promise.resolve(),urls=[],visibleItems=[],db,refreshTicket=0;
 const storageError=(code,message)=>Object.assign(Error(message),{code});
 const friendly=(error,fallback)=>/[\u4e00-\u9fff]/.test(error?.message||'')?error:storageError('PHOTO_STORAGE_FAILED',fallback);
 const openDatabase=()=>{const promise=new Promise((resolve,reject)=>{const request=indexedDB.open('ruc802.photos.v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('photos',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});promise.catch(()=>{});return promise;};
 const database=async()=>{try{return await(db??=openDatabase());}catch{throw storageError('PHOTO_STORAGE_UNAVAILABLE','照片存储不可用，请检查浏览器权限；可另行仅导出学习进度');}};
 const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
 async function localAll(){const connection=await database();return new Promise((resolve,reject)=>{const r=connection.transaction('photos').objectStore('photos').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)));r.onerror=()=>reject(storageError('PHOTO_STORAGE_UNAVAILABLE','照片存储不可用，请检查浏览器权限；可另行仅导出学习进度'));});}
 async function localWrite(items,remove=[]){const connection=await database();return new Promise((resolve,reject)=>{const tx=connection.transaction('photos','readwrite'),store=tx.objectStore('photos');remove.forEach(id=>store.delete(id));items.forEach(item=>store.put(item));tx.oncomplete=resolve;tx.onerror=()=>reject(storageError('PHOTO_STORAGE_WRITE_FAILED','照片未能写入浏览器，请检查存储空间后重试'));tx.onabort=()=>reject(storageError('PHOTO_STORAGE_WRITE_FAILED','照片保存已取消，未修改原图片'));});}
 async function all(qid){
  if(!remote?.active)return localAll();
  const result=await remote.request('api/photos'+(qid?'?question='+encodeURIComponent(qid):''));
  return Promise.all(result.items.map(async item=>({...item,blob:await remote.request('api/photos/'+item.id,{responseType:'blob',timeoutMs:30000})})));
 }
 const dataUrl=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
 async function write(items,remove=[]){
  if(!remote?.active)return localWrite(items,remove);
  if(items.length)await remote.request('api/photos',{method:'POST',timeoutMs:60000,body:JSON.stringify({items:await Promise.all(items.map(async({blob,...item})=>({...item,dataUrl:await dataUrl(blob)})))})});
  for(const id of remove)await remote.request('api/photos/'+encodeURIComponent(id),{method:'DELETE'});
 }
 async function signature(blob){const b=new Uint8Array(await blob.slice(0,12).arrayBuffer());const ok=blob.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:blob.type==='image/png'?b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71:blob.type==='image/webp'?String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP':false;if(!ok)throw Error('图片内容或格式无效，请重新选择');}
 async function decode(blob){try{return await createImageBitmap(blob);}catch{throw Error('图片无法读取，请选择有效的JPEG、PNG或WebP图片');}}
 async function compress(blob){
  if(!['image/jpeg','image/png','image/webp'].includes(blob.type)||blob.size>8*1024*1024)throw Error('请选择8MB以内的JPEG、PNG或WebP图片');
  await signature(blob);const bitmap=await decode(blob);
  try{if(bitmap.width*bitmap.height>80000000)throw Error('图片尺寸过大');const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return await new Promise((resolve,reject)=>canvas.toBlob(b=>b&&b.size<2*1024*1024?resolve(b):reject(Error('图片过大，请裁剪后重试')),'image/jpeg',.85));}finally{bitmap.close();}
 }
 function render(qid){return `<section class="photo-answer" data-photo-qid="${esc(qid)}" aria-busy="true"><div class="writing-head"><h2>纸上作答，拍照留存</h2><span data-photo-status role="status" aria-live="polite">正在读取图片…</span></div><p>可拍照或选择图片，每题最多3张。${remote?.active?'图片保存在服务器，换浏览器后仍可查看。':'图片保存在当前浏览器，核对时可放大查看。'}</p><div class="actions"><label class="btn">拍照<input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-photo-input aria-label="拍照添加作答图片"></label><label class="btn">选择图片<input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple data-photo-input aria-label="选择作答图片"></label></div><div class="photo-grid"></div></section>`;}
 function status(area,text,state=''){const node=area?.querySelector('[data-photo-status]');if(node){node.textContent=text;node.dataset.state=state;}}
 async function refresh(qid=getQuestionId()){
  const area=root.querySelector('[data-photo-qid]');if(!area||area.dataset.photoQid!==qid)return;const ticket=++refreshTicket;
  try{
   const items=(await all(qid)).filter(x=>x.qid===qid);if(ticket!==refreshTicket||!area.isConnected||getQuestionId()!==qid)return;
   urls.forEach(URL.revokeObjectURL);urls=[];visibleItems=items;
   area.querySelector('.photo-grid').innerHTML=items.length?items.map((item,i)=>{const url=URL.createObjectURL(item.blob);urls.push(url);return `<figure><button data-action="photo-view" data-id="${esc(item.id)}" aria-label="放大作答图片${i+1}"><img src="${url}" alt="作答图片${i+1}"></button><button data-action="photo-remove" data-id="${esc(item.id)}" data-qid="${esc(qid)}">删除图片${i+1}</button></figure>`;}).join(''):'<div class="photo-empty">拍下纸上的推导或论证，核对时再放大查看。</div>';
   status(area,items.length?`已保存 ${items.length}/3 张`:'尚未添加图片');
  }catch{if(ticket===refreshTicket&&area.isConnected)status(area,remote?.active?'无法读取服务器图片，请重新登录或重试':'无法读取图片存储，请检查浏览器权限','error');}
  finally{if(ticket===refreshTicket&&area.isConnected)area.setAttribute('aria-busy','false');}
 }
 async function handleChange(event){
  if(!event.target.matches('[data-photo-input]'))return;
  const files=[...event.target.files],qid=getQuestionId();event.target.value='';if(!files.length)return;
  let failure=null;const area=event.target.closest('[data-photo-qid]');refreshTicket++;area.setAttribute('aria-busy','true');status(area,'正在处理并保存图片…');area.querySelectorAll('input,button').forEach(el=>el.disabled=true);
  try{
   await serial(async()=>{const existing=await all(remote?.active?qid:undefined);if(existing.filter(x=>x.qid===qid).length+files.length>MAX)throw Error('每题最多保存3张图片');const items=[];let createdAt=Math.max(Date.now(),...existing.filter(x=>x.qid===qid).map(x=>x.createdAt+1));for(const file of files)items.push({id:uid(),qid,createdAt:createdAt++,blob:await compress(file)});if(!remote?.active&&existing.reduce((n,x)=>n+x.blob.size,0)+items.reduce((n,x)=>n+x.blob.size,0)>limit)throw Error('图片总量超过100MB，请先导出并整理');await write(items);});
   toast(remote?.active?'作答图片已保存到服务器':'作答图片已保存');
  }catch(error){failure=friendly(error,remote?.active?'图片未能上传到服务器，请检查网络后重新选择图片':'图片未能保存，请检查浏览器空间或重新选择图片').message;toast(failure);}
  if(area.isConnected){area.querySelectorAll('input,button').forEach(el=>el.disabled=false);area.setAttribute('aria-busy','false');}
  await refresh(getQuestionId());if(failure&&getQuestionId()===qid)status(root.querySelector('[data-photo-qid]'),'本次图片未保存，请重试','error');
 }
 function view(button){
  if(document.querySelector('.photo-viewer'))return;
  const items=[...visibleItems],viewerUrls=items.map(x=>URL.createObjectURL(x.blob));let index=items.findIndex(x=>x.id===button.dataset.id);if(index<0){viewerUrls.forEach(URL.revokeObjectURL);return;}
  const dialog=document.createElement('dialog');dialog.className='photo-dialog photo-viewer';dialog.setAttribute('aria-labelledby','photo-viewer-title');
  dialog.innerHTML=`<div class="viewer-toolbar"><h2 id="photo-viewer-title">${esc(items[index].qid)} 作答照片</h2><div class="actions"><button class="btn" data-viewer-zoom aria-pressed="false">放大查看</button><button class="btn" data-viewer-close autofocus>关闭图片</button></div></div><div class="viewer-stage"><img alt="放大的作答图片"></div><div class="viewer-navigation"><button class="btn" data-viewer-prev>上一张图片</button><span class="viewer-count" role="status" aria-live="polite"></span><button class="btn" data-viewer-next>下一张图片</button></div>`;
  const previous=dialog.querySelector('[data-viewer-prev]'),next=dialog.querySelector('[data-viewer-next]'),zoom=dialog.querySelector('[data-viewer-zoom]'),stage=dialog.querySelector('.viewer-stage');
  function draw(){dialog.dataset.zoomed='false';zoom.textContent='放大查看';zoom.setAttribute('aria-pressed','false');stage.scrollTop=stage.scrollLeft=0;dialog.querySelector('img').src=viewerUrls[index];dialog.querySelector('img').alt=`${items[index].qid} 作答图片${index+1}`;dialog.querySelector('.viewer-count').textContent=`第 ${index+1} / ${items.length} 张`;previous.disabled=index===0;next.disabled=index===items.length-1;}
  function move(delta){const value=Math.max(0,Math.min(items.length-1,index+delta));if(value===index)return;index=value;draw();if(document.activeElement?.disabled)(delta>0?previous:next).focus({preventScroll:true});}
  previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));dialog.querySelector('[data-viewer-close]').addEventListener('click',()=>dialog.close());
  zoom.addEventListener('click',()=>{const expanded=dialog.dataset.zoomed!=='true';dialog.dataset.zoomed=String(expanded);zoom.textContent=expanded?'适应屏幕':'放大查看';zoom.setAttribute('aria-pressed',String(expanded));});
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}});
  dialog.addEventListener('close',()=>{viewerUrls.forEach(URL.revokeObjectURL);dialog.remove();requestAnimationFrame(()=>UI.restoreFocus(button,()=>root.querySelector('input[data-photo-input]')||root.querySelector('h1')));},{once:true});
  document.body.append(dialog);draw();dialog.showModal();
 }
 async function remove(button){
  const item=visibleItems.find(x=>x.id===button.dataset.id);if(!item)return;const preview=URL.createObjectURL(item.blob);
  try{await UI.confirm({title:'删除这张作答照片？',body:`<p>将删除 <strong>${esc(item.qid)}</strong> 的这张照片。其他照片、练习记录和自评保留。需要留存时，请先导出完整备份。</p><img class="dialog-photo" src="${preview}" alt="待删除的作答照片">`,confirmText:'确认删除',danger:true,returnTo:button,fallback:()=>root.querySelector('input[data-photo-input]')||root.querySelector('h1'),onConfirm:()=>serial(async()=>{await write([],[item.id]);await refresh(getQuestionId());toast('作答照片已删除');})});}finally{URL.revokeObjectURL(preview);}
 }
 function handleClick(button){if(button.dataset.action==='photo-remove')remove(button);if(button.dataset.action==='photo-view')view(button);}
 async function exportBackup(){try{await queue;const items=await all();return{version:1,items:await Promise.all(items.map(async({blob,...item})=>({...item,dataUrl:await dataUrl(blob)})))};}catch(error){if(error.code==='PHOTO_STORAGE_UNAVAILABLE')throw error;throw storageError('PHOTO_STORAGE_UNAVAILABLE','照片备份无法读取，请检查浏览器权限；可另行仅导出学习进度');}}
 async function prepareImport(raw,validQids,onProgress=()=>{}){
  if(raw==null)return[];if(raw.version!==1||!Array.isArray(raw.items)||raw.items.length>900)throw Error('图片备份格式不正确');const ids=new Set(),counts={},items=[];let total=0;onProgress(0,raw.items.length);
  for(const item of raw.items){if(!item||typeof item.id!=='string'||item.id.length>100||ids.has(item.id)||!validQids.includes(item.qid)||!Number.isFinite(item.createdAt)||typeof item.dataUrl!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(item.dataUrl))throw Error('图片备份中存在无效图片');ids.add(item.id);if((counts[item.qid]=(counts[item.qid]||0)+1)>MAX)throw Error('备份每题图片超过3张');const[header,encoded]=item.dataUrl.split(','),binary=atob(encoded),blob=new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:header.slice(5).split(';')[0]});total+=blob.size;if(total>limit||blob.size>2*1024*1024)throw Error('图片备份过大');await signature(blob);const image=await decode(blob);const valid=image.width>0&&image.height>0&&image.width*image.height<=80000000;image.close();if(!valid)throw Error('图片尺寸无效或过大');items.push({id:item.id,qid:item.qid,createdAt:item.createdAt,blob});onProgress(items.length,raw.items.length);}
  return items;
 }
 function mergeImport(items){return serial(async()=>{if(!items.length)return;const current=await all(),merged=new Map(current.map(x=>[x.id,x]));for(const item of items){const old=merged.get(item.id);if(old&&old.qid!==item.qid)throw Error('图片编号冲突');if(!old)merged.set(item.id,item);}const counts={};let total=0;for(const item of merged.values()){if((counts[item.qid]=(counts[item.qid]||0)+1)>MAX)throw Error('合并后某题超过3张图片，请先整理');total+=item.blob.size;}if(total>limit)throw Error('合并图片超过100MB');await write([...merged.values()]);}).catch(error=>{throw friendly(error,'照片合并失败，原图片未改动，请检查浏览器存储后重试');});}
 async function exportLocalBackup(){await queue;const items=await localAll();return{version:1,items:await Promise.all(items.map(async({blob,...item})=>({...item,dataUrl:await dataUrl(blob)})))};}
 return{render,refresh,handleChange,handleClick,exportBackup,exportLocalBackup,prepareImport,mergeImport,whenIdle:()=>queue};
};
