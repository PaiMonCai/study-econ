'use strict';
(() => {
function create({data,esc}){
 const studies=data.examTypes.chapterStudy,byId=new Map(data.examTypes.questions.map(question=>[question.id,question]));
 const summaries=new Map(Object.values(studies).flatMap(study=>study.summaries.map(summary=>[summary.case_id,summary])));
 const chapterUrl=(subject,number)=>'#bank/'+subject+'/chapter/'+number;
 const questionUrl=id=>'#exam/'+id;
 const bookLabel=subject=>{const book=studies[subject].book;return book.author+'《'+book.title+'》第'+book.edition+'版';};
 const referenceLabel=subject=>(studies[subject].reference_books||[]).map(book=>book.author+'《'+book.title+'》第'+book.edition+'版').join('；');
 const summaryFor=question=>summaries.get(question.id);
 const chapterFor=question=>studies[question.subject].chapters[summaryFor(question).chapter-1];
 const ordered=subject=>studies[subject].ordered_case_ids.map(id=>byId.get(id));
 function context(question){
  const chapter=chapterFor(question);
  return '<p class="exam-type-chapter-context"><a href="'+chapterUrl(question.subject,chapter.number)+'">第'+chapter.number+'章 '+esc(chapter.title)+'</a><span>'+esc(bookLabel(question.subject))+'</span></p>';
 }
 function knowledge(question){
  const summary=summaryFor(question),study=studies[question.subject];
  const related=summary.related_chapters.map(number=>{const chapter=study.chapters[number-1];return '<a href="'+chapterUrl(question.subject,number)+'">第'+number+'章 '+esc(chapter.title)+'</a>';}).join('、');
  return '<section class="exam-type-knowledge" id="knowledge-summary" aria-labelledby="knowledge-summary-title">'+
   '<header><p class="small muted">做完这一题，再整理能迁移的方法。</p><h2 id="knowledge-summary-title" tabindex="-1">知识总结</h2>'+context(question)+'</header>'+
   '<section><h3>核心知识点</h3><ul class="knowledge-points">'+summary.knowledge_points.map(point=>'<li class="rich">'+point.body_html+'</li>').join('')+'</ul></section>'+
   '<section><h3>公式整理</h3><div class="knowledge-formulas">'+summary.formulas.map(formula=>'<article class="knowledge-formula"><h4>'+esc(formula.title)+'</h4><div class="rich">'+formula.formula_html+'</div><dl><dt>符号</dt><dd class="rich">'+formula.symbols_html+'</dd><dt>适用条件</dt><dd class="rich">'+formula.conditions_html+'</dd><dt>本题用法</dt><dd class="rich">'+formula.use_html+'</dd></dl></article>').join('')+'</div></section>'+
   '<section><h3>条件与分支</h3><div class="rich">'+summary.conditions_html+summary.branches_html+'</div></section>'+
   '<section><h3>易混与易错</h3><div class="rich">'+summary.pitfalls_html+'</div></section>'+
   '<section class="knowledge-transfer"><h3>本题怎样调用</h3><div class="rich">'+summary.application_html+'</div></section>'+
   (related?'<p class="knowledge-related">跨章联系：'+related+'</p>':'')+
   '<div class="knowledge-provenance rich">'+summary.provenance_html+'</div></section>';
 }
 function sources(question){
  const study=studies[question.subject],ref=study.book.toc_reference;
  const reference=(study.reference_books||[]).map(book=>'<p>参照教材：'+esc(book.author+'《'+book.title+'》第'+book.edition+'版')+'。目录来源：'+esc(book.toc_reference.file)+'，PDF物理页 '+book.toc_reference.physical_pages.join('、')+'。</p><p>'+esc(book.toc_reference.note)+'</p>').join('');
  return '<section class="chapter-source-record"><h2>章节与知识总结</h2>'+context(question)+'<p>目录核对来源：'+esc(ref.file)+'，PDF物理页 '+ref.physical_pages.join('、')+'。</p><p>'+esc(ref.note)+'</p>'+reference+readingReferences(question.subject,chapterFor(question))+'<div class="rich">'+summaryFor(question).provenance_html+'</div><p>各题原有真题任务与教材方法引用保留。章节导读和本节公式整理不增加未经核准的真题考查次数。</p></section>';
 }
 function readingReferences(subject,chapter){
  const study=studies[subject];
  if(!chapter.reading_refs?.length)return '';
  return '<div class="chapter-reading-refs"><h4>教材阅读位置</h4><ul>'+chapter.reading_refs.map(reading=>{
   const primary=reading.book_key==='primary',book=primary?study.book:study.reference_books.find(book=>book.key===reading.book_key),range=reading.physical_page_range;
   return '<li><strong>'+(primary?'主线：':'参照：')+esc(book.author)+'第'+book.edition+'版，第'+reading.chapter+'章 '+esc(reading.title)+'</strong><span>本地配套资料 · PDF物理第'+range[0]+'—'+range[1]+'页，作为本章阅读范围。</span></li>';
  }).join('')+'</ul></div>';
 }
 function chapterList(subject,visible,{chapterNumber=null,group='all',query='',exactId=false}={}){
  const study=studies[subject],visibleIds=new Set(visible.map(question=>question.id)),result=[];
  const row=question=>'<li class="exam-type-row"><span class="exam-type-order">'+question.id+'</span><div><h3><a href="'+questionUrl(question.id)+'">'+esc(question.title)+'</a></h3><p><span class="exam-type-priority '+question.priority+'">'+(question.priority==='core'?'重点题型':'延伸题型')+'</span> · '+question.parts.length+'问 · 建议'+question.minutes+'分钟</p><p class="exam-type-reason">'+esc(question.priority_reason)+'</p></div><a class="btn primary" href="'+questionUrl(question.id)+'">阅读题目与解答</a></li>';
  let part='';
  for(const chapter of study.chapters){
   if(chapterNumber!==null&&chapter.number!==chapterNumber)continue;
   const primary=chapter.case_ids.filter(id=>visibleIds.has(id));
   const related=chapter.related_case_ids.filter(id=>visibleIds.has(id));
   const guideMatch=!exactId&&query&&[chapter.title,chapter.model_title].join(' ').toLowerCase().includes(query);
   if((query||group!=='all')&&!primary.length&&!related.length&&!guideMatch)continue;
   if(chapter.part!==part){part=chapter.part;result.push('<h2 class="chapter-part">'+(subject==='micro'?'学习分区：':'')+esc(part)+'</h2>');}
   const expanded=chapterNumber!==null||guideMatch||(!chapter.case_ids.length&&!chapter.related_case_ids.length);
   const guide=expanded?'<div class="chapter-model"><h3>'+esc(chapter.model_title)+'</h3><div class="rich">'+chapter.model_html+chapter.formula_html+'</div><p class="small muted">'+esc(chapter.selection_note_md)+'</p>'+readingReferences(subject,chapter)+(chapter.quick_check?'<section class="chapter-quick-check"><h4>补充模型小例</h4><div class="rich">'+chapter.quick_check.prompt_html+'</div><h4>参考分析</h4><div class="rich">'+chapter.quick_check.answer_html+'</div></section>':'')+'</div>':'<p class="chapter-model-brief">重点模型：'+esc(chapter.model_title)+'</p>';
   const links=(expanded?related:related.slice(0,3)).map(id=>'<a class="chapter-related-link" href="'+questionUrl(id)+'">'+esc(byId.get(id).title)+'</a>').join('');
   result.push('<section class="paper exam-type-list exam-chapter" data-chapter="'+chapter.number+'"><header class="exam-chapter-head"><div><p>第'+chapter.number+'章</p><h2><a href="'+chapterUrl(subject,chapter.number)+'">'+esc(chapter.title)+'</a></h2></div><a class="btn flat" href="'+chapterUrl(subject,chapter.number)+'">本章模型与练习</a></header>'+guide+(primary.length?'<ol>'+primary.map(id=>row(byId.get(id))).join('')+'</ol>':'<p class="chapter-no-primary">本章先读模型，再通过跨章题型练习。'+(!related.length&&chapter.quick_check?'本章补充小例已含参考分析。':'')+'</p>')+(links?'<div class="chapter-related"><h3>跨章关联题型</h3><div>'+links+'</div>'+(!expanded&&related.length>3?'<a href="'+chapterUrl(subject,chapter.number)+'">查看本章全部'+related.length+'个关联题型</a>':'')+'</div>':'')+'</section>');
  }
  return result.join('');
 }
 return {bookLabel,referenceLabel,summaryFor,chapterFor,ordered,context,knowledge,sources,chapterList,chapterUrl};
}
window.ChapterStudy={create};
})();
