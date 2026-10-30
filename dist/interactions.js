'use strict';
window.StudyUI=(()=>{
 let sequence=0;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function restoreFocus(opener,fallback){
  let target=opener?.isConnected?opener:null;
  if(!target&&opener?.id)target=document.getElementById(opener.id);
  if(!target&&opener?.dataset.action){let selector='[data-action="'+CSS.escape(opener.dataset.action)+'"]';for(const key of ['id','sub','index','rating'])if(opener.dataset[key]!==undefined)selector+='[data-'+key+'="'+CSS.escape(opener.dataset[key])+'"]';target=document.querySelector(selector);}
  if(!target)target=typeof fallback==='function'?fallback():typeof fallback==='string'?document.querySelector(fallback):fallback;
  if(target&&!target.disabled)target.focus({preventScroll:true});
 }
 function confirm({title,body='',confirmText='确认',cancelText='取消',danger=false,onConfirm,returnTo=document.activeElement,fallback}={}){
  return new Promise(resolve=>{
   const id='interaction-'+(++sequence),dialog=document.createElement('dialog');let busy=false;
   dialog.className='interaction-dialog';dialog.setAttribute('aria-labelledby',id+'-title');dialog.setAttribute('aria-describedby',id+'-body');
   dialog.innerHTML=`<div class="dialog-content"><h2 id="${id}-title">${esc(title)}</h2><div id="${id}-body" class="dialog-body">${body}</div><p class="dialog-status" role="status" aria-live="polite" tabindex="-1"></p><progress class="dialog-progress" hidden aria-label="备份照片上传进度"></progress></div><div class="dialog-actions"><button class="btn" data-dialog-cancel autofocus>${esc(cancelText)}</button><button class="btn ${danger?'danger':'primary'}" data-dialog-confirm>${esc(confirmText)}</button></div>`;
   const cancel=dialog.querySelector('[data-dialog-cancel]'),accept=dialog.querySelector('[data-dialog-confirm]'),status=dialog.querySelector('.dialog-status');
   cancel.addEventListener('click',()=>{if(!busy)dialog.close('cancel');});
   dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();status.textContent='正在处理，请稍候完成。';}});
   accept.addEventListener('click',async()=>{
    if(busy)return;busy=true;dialog.setAttribute('aria-busy','true');accept.setAttribute('aria-busy','true');cancel.disabled=accept.disabled=true;accept.textContent='正在处理…';status.textContent='';status.classList.remove('is-error');
    try{await onConfirm?.(dialog);dialog.close('confirmed');}
    catch(error){status.textContent=/[\u4e00-\u9fff]/.test(error?.message||'')?error.message:'未能完成操作，请检查网络后重试。';status.classList.add('is-error');status.focus({preventScroll:true});}
    finally{busy=false;dialog.setAttribute('aria-busy','false');accept.setAttribute('aria-busy','false');cancel.disabled=accept.disabled=false;accept.textContent=confirmText;}
   });
   dialog.addEventListener('close',()=>{const confirmed=dialog.returnValue==='confirmed';dialog.remove();resolve(confirmed);requestAnimationFrame(()=>restoreFocus(returnTo,fallback));},{once:true});
   document.body.append(dialog);dialog.showModal();
  });
 }
 function loadError(root,message){
  root.setAttribute('aria-busy','false');root.innerHTML='<section class="opening-error paper" role="alert"><h1 tabindex="-1">练习室暂时未能打开</h1><p></p><button class="btn primary">重新打开</button><p class="small muted">服务器已保存的学习记录不会因此清空。</p></section>';
  root.querySelector('p').textContent=/[\u4e00-\u9fff]/.test(message||'')?message:'无法读取服务器学习库，请检查网络后重试。';root.querySelector('button').addEventListener('click',()=>location.reload());root.querySelector('h1').focus({preventScroll:true});
 }
 return{confirm,restoreFocus,loadError,esc};
})();
