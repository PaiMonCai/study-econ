'use strict';
(() => {
function create({data,esc,shell,readingBar,questionPath=()=>''}) {
 const practiceCatalog=window.createPracticeCatalog(data),topics=practiceCatalog.topics;
 const byId=Object.fromEntries([...data.subjects.flatMap(s=>s.questions.map(q=>({...q,subject:s.key,subjectName:s.name}))),...(data.comprehensive?.questions||[])].map(q=>[q.id,q]));
 const topicById=Object.fromEntries(topics.map(t=>[t.id,t]));
 const topicUrl=topic=>'#topics/'+topic.subject+'/'+topic.group;
 function homePanel(){
  return `<section class="paper guided-home" aria-label="规范作答学习"><div><h2>先看规范作答，顺着思路背。</h2><p>题目直接带着答案读：看条件、认知识点，再沿推导复述。</p><a href="#topics/micro/05">从垄断、串联垄断到 n 厂商古诺</a></div><div class="guided-actions">${data.subjects.map(s=>`<button class="btn primary" data-action="study-day" data-sub="${s.key}">跟读${s.name}今日10题</button>`).join('')}<a class="btn" href="#topics">查看专题串联</a></div></section>`;
 }
 function topicLink(q,label='本题所在专题'){return `<a class="btn" href="${topicUrl(topicById[q.subject+'-'+q.group])}">${label}</a>`;}
 function questionLinks(ids,topic){return `<div class="topic-questions">${data.examTypes.banks[topic.subject]?window.ExamTypes.sourceLinks(data,ids):ids.map(id=>`<button class="btn" data-action="study-single" data-id="${id}" data-topic="${topic.id}" title="${esc(byId[id].title)}">看规范作答 ${id}</button>`).join('')}</div>`;}
 function topicCards(topic){return topic.card_ids.length?`<section class="topic-card-links"><h2>回查公式与概念</h2><div class="actions">${topic.card_ids.map(id=>{const card=data.recall.cards.find(c=>c.id===id);return `<button class="btn" data-action="recall-card" data-id="${id}" data-return="topics/${topic.subject}/${topic.group}">${esc(card.title)}</button>`;}).join('')}</div></section>`:'';}
 function renderTopics(){
  const [,subjectKey,group]=location.hash.slice(1).split('/');
  const subject=data.subjects.find(s=>s.key===subjectKey)||data.subjects[0];
  const topic=topicById[subject.key+'-'+group];
  if(topic){renderTopic(topic);return;}
  shell(`<p><a class="btn primary" href="#methods">宏微观作答速查与闭卷检测</a></p><div class="page-heading"><div><h1>专题串联</h1><p>从一个知识点走到下一种模型，记住条件怎样变，作答怎样接。</p></div><a class="btn" href="#bank">按题找规范作答</a></div><nav class="topic-subjects tabs" aria-label="专题科目">${data.subjects.map(s=>`<a class="tab ${s.key===subject.key?'active':''}" href="#topics/${s.key}" ${s.key===subject.key?'aria-current="page"':''}>${s.name}</a>`).join('')}</nav><section class="paper topic-index">${topics.filter(t=>t.subject===subject.key).map(t=>`<article class="topic-index-row"><div class="topic-index-number">${t.group}</div><div><h2><a href="${topicUrl(t)}">${esc(t.title)}</a></h2><p class="topic-group-title">${esc(t.group_title)}</p><ol class="topic-route">${t.stages.map(stage=>`<li>${esc(stage.title)}</li>`).join('')}</ol></div><a class="btn primary" href="${topicUrl(t)}">阅读专题</a></article>`).join('')}</section><p class="topic-provenance">专题内容为编者基于已交付题库和手册的串联整理；各篇注明补充推导与适用条件。</p>`,'topics');
 }
 function renderTopic(topic){
  const content=
   '<div class="topic-reader reading-topic"><div class="topic-back"><a class="btn flat" href="#topics/'+topic.subject+'">返回专题目录</a><button class="btn" data-action="study-topic" data-id="'+topic.id+'">阅读对应题目</button></div>'+readingBar()+
   '<article class="paper topic-paper"><p class="topic-group-title">'+esc(topic.group_title)+'</p><h1>'+esc(topic.title)+'</h1><div class="rich topic-lead">'+topic.lead_html+'</div>'+
   '<nav class="topic-jumps" aria-label="本专题目录">'+topic.stages.map((stage,index)=>'<button data-action="topic-section" data-index="'+index+'"><span>'+(index+1)+'</span>'+esc(stage.title)+'</button>').join('')+'</nav>'+
   '<ol class="topic-stages">'+topic.stages.map((stage,index)=>'<li class="topic-stage" id="topic-stage-'+index+'"><h2 tabindex="-1"><span>'+(index+1)+'</span>'+esc(stage.title)+'</h2><div class="rich">'+stage.explanation_html+'</div>'+ (stage.question_ids.length?questionLinks(stage.question_ids,topic):'<p class="small muted">补充模型的适用条件见本节正文。</p>')+'</li>').join('')+'</ol>'+
   (topic.comparison_md?'<section class="topic-comparison"><h2>模型对照</h2><div class="rich">'+topic.comparison_html+'</div></section>':'')+
   '<section class="topic-boundaries"><h2>适用条件与边界</h2><div class="rich">'+topic.boundaries_html+'</div></section><section class="topic-recall"><h2>知识主线</h2><div class="rich">'+topic.recall_html+'</div></section>'+topicCards(topic)+
   '<section class="topic-all-questions"><h2>本专题关联题目</h2>'+questionLinks(topic.source_question_ids,topic)+'</section>'+
   '<section class="source reading-source-note"><h2>整理依据</h2><p>'+esc(topic.editorial_note)+'</p><p>'+esc(topic.source_note)+'</p></section></article>'+
   (['micro','macro'].includes(topic.subject)?'<nav class="actions topic-reading-links" aria-label="本专题延伸学习"><a class="btn" href="#maps/'+topic.subject+'/'+topic.group+'/mind">在知识导图中查看本专题</a><a class="btn" href="#methods/'+topic.subject+'/'+topic.group+'">作答速查与闭卷检测</a></nav>':'')+
   '<div class="topic-footer"><a class="btn" href="#topics/'+topic.subject+'">继续选专题</a><button class="btn primary" data-action="study-topic" data-id="'+topic.id+'">阅读对应题目</button></div></div>';
  shell(window.StudyUI.readingContent(content),'topics');
 }
 function reviewCardLinks(guide){return guide.related_card_ids?.length?`<div class="actions exam-related-cards">${guide.related_card_ids.map(id=>`<button class="btn" data-action="recall-card" data-id="${id}" data-return="practice">回查：${esc(data.recall.cards.find(c=>c.id===id).title)}</button>`).join('')}</div>`:'';}
 function applications(q,guide){
  const bodies=new Set(guide.steps.map(step=>step.body_html));
  const extra=(guide.knowledge||[]).filter(item=>item.explanation_html&&!bodies.has(item.explanation_html));
  return (extra.length?'<section class="study-applications"><h2>知识点在本题中的用法</h2><ul class="knowledge-list">'+extra.map(item=>'<li><h3>'+item.title_html+'</h3><div class="rich">'+item.explanation_html+'</div></li>').join('')+'</ul></section>':'')+reviewCardLinks(guide);
 }
 function renderQuestion(q,s){
  const topic=topicById[s.topicId]||topicById[q.subject+'-'+q.group],guide=window.SolutionReader.guide(q);
  const corrections=guide.corrections?'<aside class="study-correction"><h2>本题勘误</h2>'+guide.corrections.map(c=>'<p><strong>'+esc(c.title)+'</strong><br>'+esc(c.explanation)+'</p>').join('')+'</aside>':'';
  const question='<header class="reading-question"><div class="exercise-meta"><span class="q-id">'+q.id+'</span><span>'+q.subjectName+'</span><span>'+esc(q.group_title||topic.title)+'</span></div><h1 id="question-heading" tabindex="-1">'+esc(q.title)+'</h1><div class="rich prompt" id="question-prompt">'+(q.training?.prompt_html||guide.prompt_html||q.prompt_html)+'</div>'+(window.ExamReview?.promptNote(q)||'')+corrections+'</header>';
  const rail='<nav class="paper question-rail" aria-label="本组题目"><div class="rail-title">'+esc(topic.title)+'</div><div class="rail-ids">'+s.ids.map((id,index)=>'<button class="qchip '+(s.index===index?'current':'')+'" data-action="jump" data-index="'+index+'" '+(s.index===index?'aria-current="step"':'')+' title="'+esc(byId[id].title)+'">'+id+'</button>').join('')+'</div><div class="rail-meta">第 '+(s.index+1)+' / '+s.ids.length+' 题</div></nav>';
  const answer='<section class="study-outline" id="study-outline"><h2>解题思路</h2><div class="rich">'+(guide.method_html||q.outline_html)+'</div></section><section id="study-answer" class="study-answer"><h2>解题步骤</h2>'+window.SolutionReader.render(q,{guide,readerId:'guided'})+applications(q,guide)+'<section class="study-pitfalls"><h2>条件与易错</h2><div class="rich">'+(guide.pitfalls_html||q.pitfalls_html)+'</div></section><section class="study-recap knowledge-chain"><h2>整题主线</h2><div class="rich">'+(guide.recap_html||q.solution.recap_html)+'</div></section>'+questionPath(q.id)+'</section>';
  const end='<footer class="reading-end"><p>AI编写的参考作答 · 阅读与翻页不计作答完成</p><div class="actions"><a href="#sources/'+q.id+'">题源与整理记录</a><a href="'+topicUrl(topic)+'">本专题总结</a><button data-action="study-independent">独立练习本题</button></div></footer>';
  shell('<div class="practice-layout split-workspace guided-practice reading-document"><div class="reading-top"><a class="btn flat" href="#bank">返回题库</a>'+readingBar()+'</div>'+rail+'<div class="question-column reading-flow" tabindex="0" role="region" aria-label="题目与辅助图形，可滚动查看"><article class="paper question-paper">'+question+'</article>'+window.StudyDiagrams.renderPanel(q,{revealed:true,reading:true})+'</div><div class="exercise reading-answer"><article class="paper reading-article">'+answer+end+'</article></div><nav class="exercise-bottom" aria-label="题目翻页"><button class="btn" data-action="prev" '+(s.index===0?'disabled':'')+'>上一题</button><span>'+(s.index+1)+' / '+s.ids.length+' 题</span><button class="btn ink" data-action="next">'+(s.index===s.ids.length-1?'读完本组':'下一题')+'</button></nav></div>','practice');
 }
 function renderSources(id,current=false){
  const q=byId[id];if(!q)return false;
  if(!practiceCatalog.isActive(q)){renderRemoved();return true;}
  const references=(q.source_refs||[]).map(ref=>'<p><strong>'+esc(ref.exam_id)+'</strong>；'+esc(ref.source)+'，PDF物理页 '+esc(ref.pages)+'。<br>'+esc(ref.note)+'</p>').join('');
  const back=current?'<a class="btn" href="#practice">返回当前题目</a>':'<button class="btn" data-action="study-single" data-id="'+q.id+'">阅读本题</button>';
  shell('<div class="source-reader"><div class="page-heading"><div><h1>题源与整理记录</h1><p>'+esc(q.id+' '+q.title)+'</p></div>'+back+'</div>'+readingBar()+'<article class="paper topic-paper"><section><h2>题目来源</h2>'+references+'</section>'+window.StudyUI.readingContent(window.ExamReview.source(q))+window.StudyDiagrams.renderPanel(q,{revealed:true,reading:true,reference:true})+'</article></div>','sources');
  return true;
 }
 function action(button){
  if(button.dataset.action!=='topic-section')return false;
  const heading=document.getElementById('topic-stage-'+Number(button.dataset.index))?.querySelector('h2');
  heading?.scrollIntoView({block:'start'});heading?.focus({preventScroll:true});return true;
 }
 function renderRemoved(){shell('<section class="paper empty"><h1>政经现仅保留计算题</h1><p>这道论述题已移出练习目录。已有作答、草稿和照片仍随学习备份保留。</p><a class="btn primary" href="#bank/political">选择政经计算题</a></section>','political');}
 return {homePanel,topicLink,renderTopics,renderQuestion,renderSources,renderRemoved,applications,action};
}
window.StudyGuide={create};
})();
