'use strict';
(() => {
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const entries=window.STUDY_EXAM_REVIEWS||{};
 for(const subject of window.STUDY_DATA.subjects)for(const question of subject.questions){
  const review=entries[question.id];
  if(!review)continue;
  review.knowledge=review.steps.map(step=>({title:step.uses.join('、'),title_html:escape(step.uses.join('、')),explanation_html:step.body_html,card_ids:[]}));
  review.related_card_ids=[...new Set(question.solution.knowledge.flatMap(item=>item.card_ids))];
  if(question.solution.study?.corrections)review.corrections=question.solution.study.corrections;
  question.solution.exam=review;
 }
 function source(question){
  const review=question.solution.exam;
  if(!review)return '';
  const originalLabel=review.corrections?'查看保留的原解答（含已说明的错误）':'查看审校前原解答';
  return `<p class="exam-source-note">作答正文为编者逐题考试作答审校稿，按本题条件整理；不是官方评分答案或教材逐字引文。</p><details class="exam-audit"><summary>查看本题审校记录</summary><h3>核验</h3><ul>${review.audit.checked.map(item=>`<li>${escape(item)}</li>`).join('')}</ul><h3>修改与确认</h3><ul>${review.audit.changes.map(item=>`<li>${escape(item)}</li>`).join('')}</ul>${review.audit.unresolved.length?`<p>${review.audit.unresolved.map(escape).join('；')}</p>`:''}</details>${review.prompt_md?`<details class="exam-original-prompt"><summary>查看更正前题干</summary><div class="rich">${question.prompt_html}</div></details>`:''}<details class="study-original"><summary>${originalLabel}</summary><div class="rich">${question.answer_html}</div></details>`;
 }
 function promptNote(question){return question.solution.exam?.prompt_md?'<p class="exam-prompt-note">题干文字已据本题条件更正，原题干与修改说明保留在题源说明中。</p>':'';}
 function note(guide){return guide.exam?'作答已按本题设问逐步审校。先说清所用条件，再沿推导复述。':guide.corrections?'作答正文已按既有勘误更正，原稿可在题源说明中对照。':'作答正文来自既有题库。';}
 window.ExamReview={source,promptNote,note};
})();
