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
 function render(question,{guide=question.solution,readerId='answer'}={}){
  const meta=metadata(guide,Number.MAX_SAFE_INTEGER),reader=escape(readerId);
  const body=guide.steps.map((step,index)=>{
   const concepts=(step.knowledge_indexes||[]).map(index=>guide.knowledge?.[index]).filter(Boolean);
   const labels=step.uses?.map(escape)||concepts.map(item=>item.title_html||escape(item.title));
   return `<li class="solution-step solution-reader-step" data-solution-step="${index+1}" id="${reader}-step-${index+1}"><div class="step-heading"><span>第 ${index+1} 步</span><h3>${escape(step.title||'解题步骤')}</h3></div>${labels.length?`<div class="step-uses"><span>这一步用到</span>${labels.map(label=>`<span class="step-concept">${label}</span>`).join('')}</div>`:''}<div class="solution-step-body rich">${step.body_html}</div></li>`;
  }).join('');
  return `<section class="solution-reader" data-solution-reader="${reader}" data-progress="${meta.total}" data-total="${meta.total}"><ol class="solution-steps solution-reader-steps">${body}</ol></section>`;
 }
 const guide=question=>question.comprehensive?question.solution:question.solution.exam&&question.solution.exam.verdict!=='needs-source'?question.solution.exam:question.solution.study||question.solution;
 window.SolutionReader={render,metadata,guide};
})();
