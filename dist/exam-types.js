'use strict';
(() => {
const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sourceTargets(data,ids){
 const questions=new Map(data.examTypes.questions.map(question=>[question.id,question])),result=new Map();
 for(const id of ids){
  const targets=data.examTypes.integration.aliases[id]||(questions.has(id)?[{case_id:id,part_ids:[]}]:[]);
  for(const target of targets){
   const existing=result.get(target.case_id)||{question:questions.get(target.case_id),part_ids:new Set(),source_ids:new Set()};
   target.part_ids.forEach(part=>existing.part_ids.add(part));existing.source_ids.add(id);result.set(target.case_id,existing);
  }
 }
 return [...result.values()].map(item=>({...item,part_ids:[...item.part_ids].sort((a,b)=>Number(a)-Number(b)),source_ids:[...item.source_ids]}));
}
function sourceLinks(data,ids,{writing=false}={}){
 return sourceTargets(data,ids).map(({question,part_ids,source_ids})=>'<a class="btn" data-exam-link="'+question.id+'" data-source-ids="'+escapeText(source_ids.join(','))+'" data-part-ids="'+part_ids.join(',')+'" href="#exam/'+question.id+(writing?'/write':'')+'">'+escapeText(question.title)+'</a>').join('');
}
function create({data,esc,shell,readingBar,state,save,navigate,persistenceMessage,photos}){
 const banks=data.examTypes.banks,questions=data.examTypes.questions;
 const byId=Object.fromEntries(questions.map(q=>[q.id,q]));
 const chapters=window.ChapterStudy.create({data,esc});
 const names={micro:'微观经济学',macro:'宏观经济学'};
 const url=q=>'#exam/'+q.id;
 const label=priority=>priority==='core'?'重点题型':'延伸题型';
 const queries={micro:'',macro:''},sourceById=new Map(data.examTypes.integration.entries.map(entry=>[entry.source_id,entry]));
 const corpus=new Map(questions.map(question=>[question.id,[question.id,question.title,question.category,...(question.coverage_tags||[])].join(' ')]));
 for(const question of questions){const summary=chapters.summaryFor(question),chapter=chapters.chapterFor(question);corpus.set(question.id,corpus.get(question.id)+' 第'+chapter.number+'章 '+chapter.title+' '+summary.knowledge_points.map(point=>point.body_md).join(' ')+' '+summary.formulas.map(formula=>formula.title).join(' '));}
 for(const entry of sourceById.values())for(const target of data.examTypes.integration.aliases[entry.source_id])corpus.set(target.case_id,corpus.get(target.case_id)+' '+entry.source_id+' '+entry.title);
 function openSource(id,writing=false){
  if(byId[id]){navigate('exam/'+id+(writing?'/write':''));return true;}
  const targets=data.examTypes.integration.aliases[id];if(!targets)return false;
  navigate(targets.length===1?'exam/'+targets[0].case_id+(writing?'/write':''):'merged/'+id+(writing?'/write':''));return true;
 }
 function renderMerged(){
  const [,id,mode]=location.hash.slice(1).split('/'),entry=sourceById.get(id);
  if(!entry){renderIndex();return;}
  const targets=sourceTargets(data,[id]);
  shell('<div class="page-heading"><div><h1>本题涉及的题型</h1><p>'+esc(entry.title)+'</p></div><a class="btn" href="#bank/'+byId[targets[0].question.id].subject+'">返回统一题型目录</a></div><p class="exam-type-intro">这组考法已归入以下题型。相同题型只保留一份，按对应设问继续阅读或作答。</p><section class="paper exam-type-merged-list">'+targets.map(({question,part_ids})=>'<article><h2><a href="'+url(question)+(mode==='write'?'/write':'')+'">'+esc(question.title)+'</a></h2><p>对应第'+part_ids.map(part=>'（'+part+'）').join('、')+'问</p><div class="actions">'+part_ids.map(part=>'<a class="btn" href="'+url(question)+'/part/'+part+'">阅读第（'+part+'）问</a>').join('')+'<a class="btn primary" href="'+url(question)+'/write">独立作答</a></div></article>').join('')+'</section>','bank');
 }
 function renderIndex(subject='micro'){
  if(!banks[subject])subject='micro';
  const bank=banks[subject],study=data.examTypes.chapterStudy[subject],groups=data.subjects.find(item=>item.key===subject).groups;
  const segments=location.hash.slice(1).split('/'),chapterNumber=segments[2]==='chapter'&&study.chapters.some(chapter=>chapter.id===segments[3])?Number(segments[3]):null;
  const group=chapterNumber===null&&groups.some(item=>item.id===segments[2])?segments[2]:'all';
  const query=queries[subject].trim().toLowerCase(),exactId=queries[subject].trim().toUpperCase();
  const exactTargets=data.examTypes.integration.aliases[exactId]||(byId[exactId]?[{case_id:exactId}]:null);
  const visible=chapters.ordered(subject).filter(question=>(group==='all'||question.group===group)&&(exactTargets?exactTargets.some(target=>target.case_id===question.id):!query||corpus.get(question.id).toLowerCase().includes(query)));
  const contents=chapters.chapterList(subject,visible,{chapterNumber,group,query,exactId:!!exactTargets});
  let last='';try{last=sessionStorage.getItem('ruc802.exam-type.last.'+subject)||'';}catch{}
  const resume=state().session?'<button class="btn" data-action="resume">'+(state().session.study?'继续上次跟读':'继续上次练习')+'</button>':'';
  const primary=visible.filter(question=>chapterNumber===null||chapters.summaryFor(question).chapter===chapterNumber).length;
  const linked=chapterNumber===null?0:visible.filter(question=>chapters.summaryFor(question).related_chapters.includes(chapterNumber)).length;
  const filters='<div class="toolbar exam-type-toolbar"><label class="search"><span class="visually-hidden">搜索题型、考法或原题编号</span><input id="exam-type-search" data-subject="'+subject+'" type="search" placeholder="搜索章节、公式名称、考法或原题编号" value="'+esc(queries[subject])+'"></label><label><span class="visually-hidden">筛选教材章节</span><select id="exam-type-chapter" data-subject="'+subject+'"><option value="all">全部教材章节</option>'+study.chapters.map(chapter=>'<option value="'+chapter.id+'" '+(chapterNumber===chapter.number?'selected':'')+'>第'+chapter.number+'章 '+esc(chapter.title)+'</option>').join('')+'</select></label><span class="small muted" role="status">'+(chapterNumber===null?'显示 '+primary+' / '+bank.cases.length+' 个主例':'本章 '+primary+' 个主例，'+linked+' 个跨章关联')+'</span></div>';
  const topicFilter=group==='all'?'':'<p class="chapter-topic-filter">当前沿用专题筛选：'+esc(groups.find(item=>item.id===group).title)+'。<a href="#bank/'+subject+'">查看全部教材章节</a></p>';
  shell('<div class="page-heading"><div><h1>统一题型训练</h1><p>沿教材章节读重要题型和模型，每题完整解答后附知识点与公式总结。</p></div><div class="actions">'+resume+(byId[last]?'<a class="btn" href="'+url(byId[last])+'">继续阅读上次题型</a>':'')+'</div></div><nav class="tabs exam-type-subjects" aria-label="选择科目">'+Object.keys(names).map(key=>'<a class="tab '+(key===subject?'active':'')+'" href="#bank/'+key+'" '+(key===subject?'aria-current="page"':'')+'>'+names[key]+'</a>').join('')+'<a class="tab" href="#bank/political">政治经济学</a></nav><section class="exam-type-intro"><p class="chapter-book">'+esc(chapters.bookLabel(subject))+'</p>'+(chapters.referenceLabel(subject)?'<p class="chapter-reference">参照：'+esc(chapters.referenceLabel(subject))+'</p>':'')+'<p>'+study.chapters.length+'章，'+bank.cases.length+'个题型，'+bank.cases.reduce((sum,q)=>sum+q.parts.length,0)+'个正式分问。按章先看模型，再读解答、整理公式与适用条件。</p><p>每个主例只归一个主章节，跨章联系保留为关联链接；真题、教材方法和重要补充模型分别注明依据。</p></section>'+filters+topicFilter+contents+(!contents?'<section class="paper empty"><h2>没有找到对应题型</h2><p>试试其他考法名称，或清除筛选。</p><button class="btn" data-action="exam-type-clear" data-subject="'+subject+'">显示全部题型</button></section>':'')+'<footer class="exam-type-foot"><p>'+esc(bank.coverage_note)+'</p><p>'+esc(study.editorial_note)+'</p><div class="actions"><a class="btn" href="#topics/'+subject+'">专题串联</a><a class="btn" href="#maps/'+subject+'">知识导图与拓扑</a></div></footer>','bank');
 }
 function renderSources(q){
  const refs=(items,exam)=>items.map(ref=>'<li><p><strong>'+esc(exam?ref.year+'年 '+ref.question:(ref.chapter||ref.exercise||'教材方法'))+'</strong></p><p>'+esc(ref.file)+'，PDF物理页 '+ref.physical_pages.join('、')+'。</p>'+(ref.exercise?'<p>题目／段落：'+esc(ref.exercise)+'</p>':'')+'<p>'+esc(ref.note||'')+'</p></li>').join('');
  const merged=[...sourceById.values()].flatMap(entry=>{const mappings=entry.part_map.filter(part=>part.targets.some(target=>target.case_id===q.id));return mappings.length?[{entry,mappings}]:[];});
  const absorption=merged.length?'<h2>归并的原练习</h2><p>仅换参数的同类任务共用正式主例，独有分支已补入对应设问。原题编号用于查证和历史数据对应。</p><ul>'+merged.map(({entry,mappings})=>'<li><p><strong>'+esc(entry.source_id+' '+entry.title)+'</strong></p><p>'+esc(entry.reason)+'</p><ul>'+mappings.map(part=>'<li>原第（'+part.source_part_id+'）问：'+part.targets.filter(target=>target.case_id===q.id).flatMap(target=>target.part_ids).map(id=>'<a href="'+url(q)+'/part/'+id+'">本型第（'+id+'）问</a>').join('、')+'。'+esc(part.reason)+'</li>').join('')+'</ul></li>').join('')+'</ul>':'';
  shell('<div class="page-heading"><div><h1>题型依据与核查</h1><p>'+esc(q.id+' '+q.title)+'</p></div><a class="btn" href="'+url(q)+'">返回题目与解答</a></div><article class="paper topic-paper exam-type-sources"><p>训练题为编者依真题任务重编；所列真题用于说明考查重点，教材用于说明方法依据。规范解答按本题条件重新推导，不是官方标准答案。</p><h2>真题任务</h2>'+(q.exam_refs.length?'<ul>'+refs(q.exam_refs,true)+'</ul>':'<p>本题作为延伸练习，不计入人大真题考查次数。</p>')+'<h2>教材方法</h2><ul>'+refs(q.textbook_refs,false)+'</ul>'+chapters.sources(q)+absorption+'<h2>本轮核查</h2><ul>'+q.audit.checked.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>'+(q.audit.unresolved.length?'<h2>保留问题</h2><ul>'+q.audit.unresolved.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>':'')+(q.boundary_html?'<h2>适用条件</h2><div class="rich">'+q.boundary_html+'</div>':'')+'</article>','bank');
 }
 function render(){
  const [,id,mode,selectedPart]=location.hash.slice(1).split('/'),q=byId[id];
  if(!q){renderIndex();return;}
  if(mode==='sources'){renderSources(q);return;}
  const writing=mode==='write',bank=banks[q.subject],ordered=chapters.ordered(q.subject),index=ordered.findIndex(item=>item.id===q.id);
  try{sessionStorage.setItem('ruc802.exam-type.last.'+q.subject,q.id);}catch{}
  const partPrompt=part=>'<section class="exam-type-prompt-part"><h2><button data-action="exam-type-part" data-part="'+part.id+'" aria-label="定位第'+part.id+'问规范解答">（'+part.id+'）'+esc(part.title)+'</button></h2><div class="rich">'+part.prompt_html+'</div></section>';
  const prompts='<header class="reading-question"><div class="exercise-meta"><span class="q-id">'+q.id+'</span><span>'+names[q.subject]+'</span><span>'+label(q.priority)+'</span></div>'+chapters.context(q)+'<h1 id="question-heading" tabindex="-1">'+esc(q.title)+'</h1><div class="rich prompt" id="question-prompt">'+q.stem_html+'</div></header>'+q.parts.map(partPrompt).join('');
  const answer='<h2 class="exam-type-answer-label">规范解答</h2>'+q.parts.map(part=>'<section class="exam-type-answer-part" id="exam-type-part-'+part.id+'"><h2 tabindex="-1">（'+part.id+'）'+esc(part.title)+'</h2><div class="rich">'+part.answer_html+'</div>'+(data.examTypes.figures||[]).filter(figure=>figure.qid===q.id&&figure.part_id===part.id).map(figure=>figure.html).join('')+'</section>').join('');
  const notes=q.parts.some(part=>part.notes_html)?'<section class="exam-type-notes"><h2>条件与自查</h2>'+q.parts.filter(part=>part.notes_html).map(part=>'<h3>第（'+part.id+'）问</h3><div class="rich">'+part.notes_html+'</div>').join('')+'</section>':'';
  const draft=writing?'<section class="writing exam-type-writing"><h2>考场作答草稿</h2><p>请按（1）—（'+q.parts.length+'）写出方程、推导和结论。</p><label class="visually-hidden" for="exam-type-draft">本题作答草稿</label><textarea id="exam-type-draft" data-id="'+q.id+'" maxlength="100000" placeholder="（1）\n\n（2）">'+esc(state().drafts[q.id]||'')+'</textarea><p class="small" id="exam-type-draft-status" data-server-save-label role="status">'+esc(persistenceMessage())+'</p><a class="btn primary" href="'+url(q)+'">核对规范解答</a><section class="exam-type-photos">'+photos.render(q.id)+'</section></section>':answer+notes+(q.boundary_html?'<section class="exam-type-boundary"><h2>适用条件</h2><div class="rich">'+q.boundary_html+'</div></section>':'')+chapters.knowledge(q);
  const footer='<footer class="reading-end"><p>编者重编训练题与参考作答</p><div class="actions"><a href="'+url(q)+'/sources">查看真题与教材依据</a><a href="'+url(q)+(writing?'':'/write')+'">'+(writing?'阅读规范解答':'独立作答')+'</a></div></footer>';
  const previous=index?'<a class="btn" href="'+url(ordered[index-1])+'">上一题型</a>':'<a class="btn" href="#bank/'+q.subject+'">题型目录</a>';
  const next=index<bank.cases.length-1?'<a class="btn primary" href="'+url(ordered[index+1])+'">下一题型</a>':'<a class="btn primary" href="#bank/'+q.subject+'">返回目录</a>';
  shell('<div class="practice-layout split-workspace guided-practice reading-document exam-type-reader"><div class="reading-top"><a class="btn flat" href="#bank/'+q.subject+'">返回题型目录</a>'+readingBar()+'</div><nav class="paper question-rail" aria-label="本题分问"><div class="rail-title">'+esc(q.category)+'</div><div class="rail-ids">'+q.parts.map(part=>'<button class="qchip" data-action="exam-type-part" data-part="'+part.id+'">第（'+part.id+'）问</button>').join('')+(!writing?'<button class="qchip knowledge-jump" data-action="exam-type-summary">知识总结</button>':'')+'</div><a href="'+url(q)+(writing?'':'/write')+'">'+(writing?'阅读规范解答':'独立作答')+'</a></nav><div class="question-column reading-flow" tabindex="0" role="region" aria-label="完整题目与分问"><article class="paper question-paper">'+prompts+'</article></div><div class="exercise reading-answer"><article class="paper reading-article">'+draft+footer+'</article></div><nav class="exercise-bottom" aria-label="题型翻页">'+previous+'<span>第 '+(index+1)+' / '+bank.cases.length+' 个题型</span>'+next+'</nav></div>','bank');
  if(writing)photos.refresh(q.id);
  if(mode==='knowledge')requestAnimationFrame(()=>focusKnowledge());
  if(mode==='part'&&q.parts.some(part=>part.id===selectedPart))requestAnimationFrame(()=>{const heading=document.querySelector('#exam-type-part-'+selectedPart+' h2');heading?.scrollIntoView({block:'start'});heading?.focus({preventScroll:true});});
 }
 function focusKnowledge(){const target=document.getElementById('knowledge-summary-title');target?.scrollIntoView({block:'start'});target?.focus({preventScroll:true});}
 function action(button){
  if(button.dataset.action==='exam-type-summary'){focusKnowledge();return true;}
  if(button.dataset.action==='exam-type-clear'){queries[button.dataset.subject]='';navigate('bank/'+button.dataset.subject);return true;}
  if(button.dataset.action!=='exam-type-part')return false;
  const target=document.querySelector('#exam-type-part-'+button.dataset.part+' h2')||document.getElementById('exam-type-draft');
  target?.scrollIntoView({block:'start'});target?.focus({preventScroll:true});return true;
 }
 function input(event){
  if(event.target.id==='exam-type-search'){
   if(event.isComposing)return true;
   const {subject}=event.target.dataset,position=event.target.selectionStart;queries[subject]=event.target.value;renderIndex(subject);
   const input=document.getElementById('exam-type-search');input.focus();try{input.setSelectionRange(position,position);}catch{}return true;
  }
  if(event.target.id!=='exam-type-draft')return false;
  state().drafts[event.target.dataset.id]=event.target.value;
  save();
  document.getElementById('exam-type-draft-status').textContent=persistenceMessage();
  return true;
 }
 function change(event){if(event.target.id==='exam-type-chapter'){const {subject}=event.target.dataset,value=event.target.value;navigate('bank/'+subject+(value==='all'?'':'/chapter/'+value));return true;}if(event.target.id!=='exam-type-group')return false;const {subject}=event.target.dataset;const group=event.target.value;navigate('bank/'+subject+(group==='all'?'':'/'+group));return true;}
 return{renderIndex,render,renderMerged,openSource,action,input,change};
}
window.ExamTypes={create,sourceTargets,sourceLinks};
})();
