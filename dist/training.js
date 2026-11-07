'use strict';
(() => {
 function create({data,state,save,latest,esc,shell,start,recordScore,submitPaper,elapsed,clockText,toast}){
  const catalog=data.comprehensive||{questions:[],papers:[]};
  const cases=catalog.questions,byId=new Map(cases.map(question=>[question.id,question]));
  const subjectName=subject=>data.subjects.find(item=>item.key===subject)?.name||'';
  const navigation=active=>cases.length?`<nav class="training-navigation" aria-label="训练层次"><a href="#bank" ${active==='bank'?'aria-current="page"':''}>统一题型训练</a><a href="#archive-integrated" ${active==='integrated'?'aria-current="page"':''}>历史综合原稿</a><a href="#archive-papers" ${active==='papers'?'aria-current="page"':''}>历史训练卷</a></nav>`:'';
  function homePanel(){
   if(!cases.length)return '';
   const scored=cases.filter(question=>latest(question.id)?.score!==undefined).length;
   return `<section class="paper integrated-home"><div><h2>把专题连成一整道题。</h2><p>宏微观40道综合大题，沿同一情境逐问推导；再用限时卷检验独立作答。</p><p class="small muted">综合题已评分 ${scored}/40，单独统计。</p></div><div class="actions"><a class="btn primary" href="#archive-integrated">进入综合大题</a><a class="btn" href="#archive-papers">选择限时卷</a></div></section>`;
  }
  function renderList(){
   const subject=location.hash.split('/')[1]==='macro'?'macro':'micro';
   const source=data.subjects.find(item=>item.key===subject),questions=cases.filter(question=>question.subject===subject);
   shell(`<div class="page-heading"><div><h1>历史综合原稿</h1><p>保留原题条件和历史作答核对。日常学习请使用已经归并去重的统一题型。</p></div><a class="btn" href="#archive-papers">进入限时卷</a></div>${navigation('integrated')}<nav class="tabs" aria-label="综合题科目">${['micro','macro'].map(key=>`<a class="tab ${key===subject?'active':''}" href="#archive-integrated/${key}" ${key===subject?'aria-current="page"':''}>${subjectName(key)}</a>`).join('')}</nav><p class="training-introduction">${subjectName(subject)}10个专题，每专题2道综合题。专项题继续保留原编号；展开各专题的“专项题分层”，可以按薄弱环节回练。</p><section class="paper integrated-index">${source.groups.map(group=>`<article class="integrated-topic"><header><span class="topic-index-number">${group.id}</span><h2>${esc(group.title)}</h2></header><ul class="integrated-case-list">${questions.filter(question=>question.group===group.id).map(question=>{
    const record=latest(question.id);
    return `<li><div><h3><span class="qid">${question.id}</span> ${esc(question.title)}</h3><p>${question.parts.length}个连续设问 · 25分 · 建议${question.minutes}分钟${record?.score!==undefined?' · 最近自评 '+record.score+'/25':''}</p></div><div class="row-buttons"><button class="btn" data-action="study-single" data-id="${question.id}">看规范作答</button><button class="btn primary" data-action="single" data-id="${question.id}">开始作答</button></div></li>`;
   }).join('')}</ul><details class="training-classification"><summary>本专题10道专项题的分层与用途</summary><ul>${source.questions.filter(question=>question.group===group.id).map(question=>`<li><div><strong>${question.id} · ${esc(question.training?.classification_label||'专项训练')}</strong><p>${esc(question.title)}</p><p class="small muted">${esc(question.training?.classification_reason||'')}</p></div><button class="btn" data-action="single" data-id="${question.id}">回练 ${question.id}</button></li>`).join('')}</ul></details></article>`).join('')}</section><p class="small muted">综合题情境、参数、参考作答及评分由编者设计；专项题与历史资料用于方法追溯，不表示这些题是原卷题目。</p>`,'integrated');
  }
  function lastPaperScore(paper){
   const attempts=new Map();
   for(const record of state().records.filter(record=>record.paperId===paper.id&&record.score!==undefined)){
    if(!attempts.has(record.paperAttempt))attempts.set(record.paperAttempt,new Map());
    const rows=attempts.get(record.paperAttempt),prior=rows.get(record.qid);
    if(!prior||(record.updatedAt||record.at)>(prior.updatedAt||prior.at))rows.set(record.qid,record);
   }
   return [...attempts.values()].filter(rows=>paper.question_ids.every(id=>rows.has(id))).sort((a,b)=>Math.max(...[...b.values()].map(record=>record.updatedAt||record.at))-Math.max(...[...a.values()].map(record=>record.updatedAt||record.at)))[0];
  }
  function renderPapers(){
   const paper=catalog.papers.find(item=>item.id===location.hash.split('/')[1]);
   if(paper){renderPaper(paper);return;}
   shell(`<div class="page-heading"><div><h1>限时训练卷</h1><p>每卷微观、宏观各两道综合题，共100分，建议120分钟。交卷后再展开参考作答。卷内题已收入统一题型；看过相同条件或答案时，仅用于熟题复现与配时。</p></div>${state().session?.paperId?'<a class="btn primary" href="#practice">继续当前训练卷</a>':''}</div>${navigation('papers')}<section class="paper timed-paper-list">${catalog.papers.map(paper=>{
    const previous=lastPaperScore(paper),score=previous?[...previous.values()].reduce((sum,record)=>sum+record.score,0):null;
    return `<article><div><p class="small muted">${paper.id} · ${paper.minutes}分钟 · ${paper.points}分</p><h2>${esc(paper.title)}</h2><p>${score===null?'尚无完整逐问自评分':'最近完整自评分：'+score+'/100'}</p></div><div class="row-buttons"><a class="btn" href="#archive-papers/${paper.id}">查看或打印题目</a><button class="btn primary" data-action="paper-start" data-id="${paper.id}">开始本卷</button></div></article>`;
   }).join('')}</section><p class="training-provenance">${esc(catalog.editorial_note||'')}</p>`,'papers');
  }
  function renderPaper(paper){
   shell(`<div class="page-heading paper-preview-toolbar"><div><h1>${esc(paper.title)}</h1><p>${paper.minutes}分钟 · 微观50分、宏观50分</p></div><div class="actions"><a class="btn" href="#archive-papers">返回选卷</a><button class="btn" data-action="paper-print">打印题目</button><button class="btn primary" data-action="paper-start" data-id="${paper.id}">开始本卷</button></div></div><section class="paper paper-instructions"><h2>作答要求</h2><div class="rich">${paper.instructions_html}</div><p class="small muted">题量、分值及配时为编者训练安排。</p></section><div class="timed-paper-preview">${paper.question_ids.map((id,index)=>{
    const question=byId.get(id);
    return `<article class="paper paper-question-sheet"><div class="exercise-meta"><span>第${index+1}题</span><span>${question.subjectName}</span><span>25分</span></div><h2>${esc(question.title)}</h2><div class="rich prompt">${question.prompt_html}</div></article>`;
   }).join('')}</div>`,'papers');
  }
  function relatedPanel(question){
   const ids=question.training?.comprehensive_ids||[];
   return ids.length?`<aside class="training-next-level"><h3>把本题方法放进综合题</h3><div class="actions">${ids.map(id=>`<button class="btn" data-action="single" data-id="${id}">${id} ${esc(byId.get(id)?.title||'')}</button>`).join('')}</div></aside>`:'';
  }
  function scorePanel(question,record){
   if(!question.comprehensive)return relatedPanel(question);
   const draft=state().session?.scoreDrafts?.[question.id]||record?.partScores||{},score=question.parts.reduce((sum,part)=>sum+(Number(draft[part.id])||0),0);
   return `<section class="case-score-panel" aria-labelledby="case-score-heading"><h3 id="case-score-heading">逐问保守自评</h3><p>先核对本问的条件、推导和结论，再填写得分。允许半分；这是编者训练评分。</p><details class="case-rubric"><summary>查看各问评分依据</summary>${question.scoring_parts.map(part=>`<section><h4>第${part.id}问 · ${part.points}分</h4><ul>${part.rubric.map(row=>`<li><span>${row.points}分</span><div class="rich">${row.criterion_html}</div></li>`).join('')}</ul></section>`).join('')}</details><div class="case-score-inputs">${question.parts.map(part=>`<label>第${part.id}问 <span>/${part.points}分</span><input type="number" min="0" max="${part.points}" step="0.5" inputmode="decimal" data-score-part="${part.id}" value="${draft[part.id]??0}" aria-label="第${part.id}问得分，满分${part.points}分"></label>`).join('')}</div><p class="case-score-total" id="case-score-total" aria-live="polite">本题合计 ${score}/25分${record?.score!==undefined?' · 已保存 '+record.score+'/25':''}</p><button class="btn primary" data-action="case-score" data-id="${question.id}">保存本题评分</button></section>`;
  }
  function paperElapsed(){
   const session=state().session;if(!session?.paperId)return 0;
   return session.ids.reduce((sum,id,index)=>sum+(index===session.index?elapsed():session.work?.[id]?.seconds||0),0);
  }
  function paperPanel(){
   const session=state().session,paper=catalog.papers.find(item=>item.id===session?.paperId);if(!paper)return '';
   const scored=paper.question_ids.map(id=>state().records.find(record=>record.id===session.work?.[id]?.ratingId)).filter(record=>record?.score!==undefined&&record.paperId===paper.id&&record.paperAttempt===session.paperAttempt),sum=scored.reduce((total,record)=>total+record.score,0);
   return `<aside class="paper-session-status" aria-label="本卷进度"><div><strong>${esc(paper.title)}</strong><p>建议${paper.minutes}分钟 · 已用 <span id="paper-timer">${clockText(paperElapsed())}</span>${session.paperSubmitted?' · 已交卷':' · 独立作答中'}</p></div>${session.paperSubmitted?`<p>已评分 ${scored.length}/4题 · ${sum}/${scored.length*25}分${scored.length===4?'，全卷 '+sum+'/100':''}</p>`:'<button class="btn" data-action="paper-submit">交卷核对本卷</button>'}</aside>`;
  }
  function input(event){
   const element=event.target;if(!element.matches('[data-score-part]'))return false;
   const session=state().session,question=byId.get(session?.ids[session.index]);if(!question||!session.revealed)return true;
   if(!element.checkValidity())return true;
   const part=question.parts.find(part=>part.id===element.dataset.scorePart),value=Number(element.value||0);
   if(!part||!Number.isFinite(value)||value<0||value>part.points)return true;
   const record=state().records.find(record=>record.id===session.ratingId);
   session.scoreDrafts??={};session.scoreDrafts[question.id]??=Object.fromEntries(question.parts.map(part=>[part.id,record?.partScores?.[part.id]??0]));
   session.scoreDrafts[question.id][part.id]=value;save();
   const total=Object.values(session.scoreDrafts[question.id]).reduce((sum,value)=>sum+value,0),label=document.getElementById('case-score-total');if(label)label.textContent='本题合计 '+total+'/25分 · 尚未保存为作答记录';
   return true;
  }
  function action(button){
   const action=button.dataset.action;
   if(action==='paper-start'){
    const paper=catalog.papers.find(item=>item.id===button.dataset.id);if(paper)start(paper.question_ids,paper.title,null,0,false,null,paper);return true;
   }
   if(action==='paper-submit'){submitPaper();return true;}
   if(action==='paper-print'){window.print();return true;}
   if(action==='case-score'){
    const question=byId.get(button.dataset.id);if(!question)return true;
    const inputs=[...document.querySelectorAll('[data-score-part]')];
    if(inputs.length!==question.parts.length||inputs.some(input=>!input.reportValidity()))return true;
    const scores=Object.fromEntries(inputs.map(input=>[input.dataset.scorePart,Number(input.value||0)]));
    recordScore(question,scores);return true;
   }
   return false;
  }
  return {navigation,homePanel,renderList,renderPapers,scorePanel,relatedPanel,paperElapsed,paperPanel,input,action};
 }
 window.IntegratedTraining={create};
})();
