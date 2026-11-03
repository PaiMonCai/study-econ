'use strict';
(() => {
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function rows(guide){
  return (guide?.steps||[]).flatMap((step,stepIndex)=>{
   let offset=0;
   const lines=Array.isArray(step.line_lengths)?step.line_lengths.map(length=>{const html=step.body_html.slice(offset,offset+length);offset+=length;return html;}):Array.isArray(step.lines_html)?step.lines_html:[step.body_html||''];
   return lines.flatMap((html,lineIndex)=>String(html).trim()?[{html,step,stepIndex,lineIndex}]:[]);
  });
 }
 function metadata(guide,progress=1){
  const all=rows(guide),total=all.length;
  const visible=total?Math.max(1,Math.min(total,Number.isFinite(Number(progress))?Math.floor(Number(progress)):1)):0;
  const current=all[visible-1],next=all[visible];
  return {total,progress:visible,stepCount:(guide?.steps||[]).length,currentStep:current?current.stepIndex+1:0,nextStep:next?next.stepIndex+1:null,crossesStep:!!next&&next.stepIndex!==current?.stepIndex,complete:visible===total};
 }
 function render(question,{progress=1,guide=question.solution,readerId='answer'}={}){
  const all=rows(guide),meta=metadata(guide,progress),reader=escape(readerId);
  const groups=[];
  for(const row of all.slice(0,meta.progress)){
   let group=groups[groups.length-1];
   if(!group||group.stepIndex!==row.stepIndex){group={...row,lines:[]};groups.push(group);}
   group.lines.push(row);
  }
  const body=groups.map(group=>{
   const step=group.step;
   const concepts=(step.knowledge_indexes||[]).map(index=>guide.knowledge?.[index]).filter(Boolean);
   const labels=step.uses?.map(escape)||concepts.map(item=>item.title_html||escape(item.title));
   return `<li class="solution-step solution-reader-step" data-solution-step="${group.stepIndex+1}"><div class="step-heading"><span>第 ${group.stepIndex+1} 步</span>${guide.exam?`<h3>${escape(step.title)}</h3>`:''}</div>${labels.length?`<div class="step-uses"><span>这一步用到</span>${labels.map(label=>`<span class="step-concept">${label}</span>`).join('')}</div>`:''}<div class="solution-lines">${group.lines.map(row=>`<div class="solution-line rich" data-solution-line="${all.indexOf(row)+1}" tabindex="-1">${row.html}</div>`).join('')}</div></li>`;
  }).join('');
  return `<section class="solution-reader" data-solution-reader="${reader}" data-progress="${meta.progress}" data-total="${meta.total}"><ol class="solution-steps solution-reader-steps">${body}</ol><div class="solution-reader-controls"><p class="solution-reader-progress" role="status" aria-live="polite" aria-atomic="true">已展开 ${meta.progress} / ${meta.total} 行<span>当前第 ${meta.currentStep} / ${meta.stepCount} 步</span></p><div class="solution-reader-actions">${meta.complete?`<button class="btn" data-action="solution-reset" data-reader="${reader}">从第一行重读</button>`:`<button class="btn primary" data-action="solution-next" data-reader="${reader}">${meta.crossesStep?'进入第 '+meta.nextStep+' 步':'展开下一行'}</button><button class="btn" data-action="solution-all" data-reader="${reader}">展开全部解答</button>`}</div></div><div class="solution-reader-print rich">${guide.steps.map((step,index)=>(guide.exam?'<h3>第 '+(index+1)+' 步 '+escape(step.title)+'</h3>':'')+step.body_html).join('')}</div></section>`;
 }
 const guide=question=>question.solution.exam&&question.solution.exam.verdict!=='needs-source'?question.solution.exam:question.solution.study||question.solution;
 window.SolutionReader={render,metadata,guide};
})();
