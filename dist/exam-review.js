'use strict';
(() => {
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const entries=window.STUDY_EXAM_REVIEWS||{};
 for(const question of window.STUDY_DATA.comprehensive?.questions||[]){
  question.solution.knowledge=question.solution.steps.map(step=>({title:step.uses.join('、'),title_html:escape(step.uses.join('、')),explanation_html:step.body_html,card_ids:[]}));
 }
 for(const subject of window.STUDY_DATA.subjects)for(const question of subject.questions){
  const review=entries[question.id];
  if(!review)continue;
  review.knowledge=review.steps.map(step=>({title:step.uses.join('、'),title_html:escape(step.uses.join('、')),explanation_html:step.body_html,card_ids:[]}));
  review.related_card_ids=[...new Set(question.solution.knowledge.flatMap(item=>item.card_ids))];
  if(question.solution.study?.corrections)review.corrections=question.solution.study.corrections;
  question.solution.exam=review;
 }
 function source(question){
  if(question.comprehensive)return `<p class="exam-source-note">本题为编者综合训练，参考作答与分项评分用于学习自评，不是官方试题或评分细则。</p><div class="rich">${question.source_note_html}</div><details><summary>综合题与专项训练的联系</summary><div class="rich">${question.connections_html}</div><p>${question.source_question_ids.map(escape).join('、')}</p></details><details><summary>本题图形适用范围</summary><div class="rich">${question.diagram_decision_html}</div></details>`;
  const review=question.solution.exam;
  if(!review)return '';
  const originalLabel=review.corrections?'查看保留的原解答（含已说明的错误）':'查看审校前原解答';
  return `<p class="exam-source-note">作答正文由AI依据本题条件编写、推导并审校，属于编者参考作答。教材与手册提供知识依据，但本稿未完成逐题教材页码核对，不是教材原解或官方评分答案。</p>${question.training?`<details class="training-source-prompt"><summary>查看结构化整理前题干</summary><div class="rich">${review.prompt_html||question.prompt_html}</div><p>${escape(question.training.change_note_md)}</p></details>`:''}<details class="exam-audit"><summary>查看本题审校记录</summary><h3>核验</h3><ul>${review.audit.checked.map(item=>`<li>${escape(item)}</li>`).join('')}</ul><h3>修改与确认</h3><ul>${review.audit.changes.map(item=>`<li>${escape(item)}</li>`).join('')}</ul>${review.audit.unresolved.length?`<p>${review.audit.unresolved.map(escape).join('；')}</p>`:''}</details>${review.prompt_md?`<details class="exam-original-prompt"><summary>查看更正前题干</summary><div class="rich">${question.prompt_html}</div></details>`:''}<details class="study-original"><summary>${originalLabel}</summary><div class="rich">${question.answer_html}</div></details>`;
 }
 function promptNote(question){return question.solution.exam?.prompt_md?'<p class="exam-prompt-note">题干文字已据本题条件更正，原题干与修改说明保留在题源说明中。</p>':'';}
 function note(guide){return guide.comprehensive?'参考作答按编号小问展开。评分点用于保守自评，必要条件和边界也须写清。':guide.exam?'以下为编者参考作答。先说清所用条件，再沿推导复述；来源说明可在题源说明中查看。':guide.corrections?'作答正文已按既有勘误更正，原稿可在题源说明中对照。':'作答正文来自既有题库。';}
 window.ExamReview={source,promptNote,note};
})();
