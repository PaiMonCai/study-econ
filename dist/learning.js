'use strict';
(() => {
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const ownObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
const dateAt=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
function clean(input,cards){
 const known=new Set(cards.map(c=>c.id)),result={recallProgress:Object.create(null),recallDrafts:Object.create(null),recallSession:null};
 for(const field of ['recallProgress','recallDrafts']){
  if(input[field]===undefined)continue;
  if(!ownObject(input[field])||Object.keys(input[field]).length>5000)throw Error('背诵备份格式不正确，未导入。');
  for(const [id,value] of Object.entries(input[field])){
   if(!known.has(id))continue;
   if(field==='recallDrafts'){
    if(typeof value!=='string'||value.length>100000)throw Error('背诵草稿无效，未导入。');
    result[field][id]=value;
   }else{
    if(!ownObject(value)||![0,1,2].includes(value.rating)||!Number.isFinite(value.at)||value.at<0||value.at>1e14||!validDate(value.due))throw Error('背诵自评无效，未导入。');
    result[field][id]={rating:value.rating,at:value.at,due:value.due};
   }
  }
 }
 const session=input.recallSession;
 if(session!=null){
  if(!ownObject(session)||!Array.isArray(session.ids)||!session.ids.length||session.ids.length>5000||session.ids.some(id=>!known.has(id))||!Number.isInteger(session.index)||session.index<0||session.index>=session.ids.length)throw Error('背诵练习组无效，未导入。');
  const ids=[...new Set(session.ids)];
  result.recallSession={ids,index:Math.min(session.index,ids.length-1),revealed:Array.isArray(session.revealed)?[...new Set(session.revealed.filter(id=>ids.includes(id)))]:[],returnTo:session.returnTo==='practice'?'practice':'recall'};
 }
 return result;
}
function review(rating,at=Date.now()){
 if(![0,1,2].includes(rating))throw Error('Invalid recall rating');
 const date=dateAt(at),offset=[0,1,3][rating];
 return{rating,at,due:new Date(Date.parse(date+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10)};
}
function merge(current,incoming){
 const result={...current};
 for(const [id,value] of Object.entries(incoming))if(!result[id]||value.at>result[id].at)result[id]=value;
 return result;
}
window.LearningData={clean,review,merge,dateAt};
window.createLearning=function({data,state,canSave,persistenceMessage,save,esc,shell,navigate,readingBar,toast,nowDate,browseGroup,openWrong}){
 const cards=data.recall.cards,byId=Object.fromEntries(cards.map(c=>[c.id,c])),sources=Object.fromEntries(data.recall.sources.map(s=>[s.id,s]));
 const kindName={formula:'公式与计算',concept:'概念与论述',condition:'起笔条件'};
 let filter={subject:'micro',kind:'all',chapter:'all',status:'all',search:'',group:'all',page:1};
 const progress=id=>state().recallProgress[id];
 const isDue=id=>progress(id)&&progress(id).due<=nowDate();
 const statusText=id=>!progress(id)?'未背':isDue(id)?'待复习':progress(id).rating===2?'会背':'不熟';
 const subjectName=key=>data.subjects.find(s=>s.key===key).name;
 const counts=subject=>{
  const subset=cards.filter(c=>!subject||c.subject===subject);
  return{all:subset.length,learned:subset.filter(c=>progress(c.id)).length,due:subset.filter(c=>isDue(c.id)).length,today:subset.filter(c=>progress(c.id)&&dateAt(progress(c.id).at)===nowDate()).length};
 };
 function queue(subject){
  const subset=cards.filter(c=>c.subject===subject);
  const due=subset.filter(c=>isDue(c.id)).sort((a,b)=>progress(a.id).due.localeCompare(progress(b.id).due)||progress(a.id).at-progress(b.id).at);
  return[...due,...subset.filter(c=>!progress(c.id))].slice(0,10).map(c=>c.id);
 }
 function start(ids,returnTo='recall'){
  if(!ids.length){toast('这部分暂时没有待背卡，可换一组筛选。');return;}
  state().recallSession={ids:[...new Set(ids)],index:0,revealed:[],returnTo};save();navigate('recall-study');
 }
 function listed(){
  return cards.filter(c=>c.subject===filter.subject&&(filter.kind==='all'||c.kind===filter.kind)&&(filter.chapter==='all'||c.chapter===filter.chapter)&&(filter.group==='all'||c.groups.includes(filter.group))&&(filter.status==='all'||filter.status==='new'&&!progress(c.id)||filter.status==='due'&&isDue(c.id)||filter.status==='weak'&&progress(c.id)?.rating<2||filter.status==='known'&&progress(c.id)?.rating===2)&&(c.id+' '+c.title+' '+c.chapter+' '+c.body_md).toLowerCase().includes(filter.search.trim().toLowerCase()));
 }
 const tabs=()=>`<div class="tabs" role="group" aria-label="背诵科目">${data.subjects.map(s=>`<button class="tab ${s.key===filter.subject?'active':''}" data-action="recall-subject" data-sub="${s.key}" aria-pressed="${s.key===filter.subject}">${s.name}</button>`).join('')}</div>`;
 function library(){
  const list=listed(),stats=counts(filter.subject),batch=queue(filter.subject),chapters=[...new Set(cards.filter(c=>c.subject===filter.subject).map(c=>c.chapter))],size=16;
  filter.page=Math.max(1,Math.min(filter.page,Math.ceil(list.length/size)||1));
  shell(`<div class="page-heading"><div><h1>公式与背诵</h1><p>先回忆公式、条件或论证，再展开原条目核对。背诵和刷题分别记录。</p></div>${state().recallSession?'<button class="btn ink" data-action="recall-resume">继续上次背诵</button>':''}</div>${tabs()}<section class="recall-summary paper"><div><h2>${subjectName(filter.subject)}知识卡</h2><p>已自评 ${stats.learned}/${stats.all} 张 · 今日自评 ${stats.today} 张 · 待复习 ${stats.due} 张</p><span class="small muted">优先复习到期卡，再加入未背卡，每组最多10张。</span></div><button class="btn primary" data-action="recall-daily" data-sub="${filter.subject}" ${batch.length?'':'disabled'}>${batch.length?'开始今日'+batch.length+'张':'当前没有待背卡'}</button></section>${state().session?'<p class="study-return"><a href="#practice">回到未完成的作答</a></p>':''}<div class="toolbar recall-filters"><label class="search"><span class="visually-hidden">搜索知识卡</span><input type="search" id="recall-search" value="${esc(filter.search)}" placeholder="搜索公式、概念、关键词"></label><label><span class="visually-hidden">背诵类型</span><select id="recall-kind">${[['all','全部类型'],...Object.entries(kindName)].map(([value,label])=>`<option value="${value}" ${filter.kind===value?'selected':''}>${label}</option>`).join('')}</select></label><label><span class="visually-hidden">背诵章节</span><select id="recall-chapter"><option value="all">全部章节</option>${chapters.map(chapter=>`<option value="${esc(chapter)}" ${filter.chapter===chapter?'selected':''}>${esc(chapter)}</option>`).join('')}</select></label><label><span class="visually-hidden">背诵状态</span><select id="recall-status">${[['all','全部状态'],['due','待复习'],['new','未背'],['weak','不会 / 不熟'],['known','会背']].map(([value,label])=>`<option value="${value}" ${filter.status===value?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="bank-meta"><span>找到 ${list.length} 张${filter.group==='all'?'':' · 关联专题：'+esc(data.subjects.find(s=>s.key===filter.subject).groups.find(g=>g.id===filter.group).title)}</span><div class="actions"><button class="btn flat" data-action="recall-clear">清除筛选</button><button class="btn" data-action="recall-filtered" ${list.length?'':'disabled'}>背筛选结果前${Math.min(10,list.length)||10}张</button></div></div><section class="paper"><ul class="question-list">${list.slice((filter.page-1)*size,filter.page*size).map(c=>`<li class="question-row recall-row"><span class="qid">${c.id}</span><div><h3>${esc(c.title)}<span class="status-pill ${progress(c.id)?.rating===2?'good':''}">${statusText(c.id)}</span></h3><p>${kindName[c.kind]} · ${esc(c.chapter)}</p></div><button class="btn" data-action="recall-card" data-id="${c.id}" aria-label="背诵 ${c.id}">开始回忆</button></li>`).join('')}</ul>${list.length?'':'<div class="empty"><h2>没有符合条件的知识卡</h2><p>试试清除筛选，或换一个科目与章节。</p><button class="btn" data-action="recall-clear">清除筛选</button></div>'}</section>${list.length>size?`<div class="pagination"><button class="btn" data-action="recall-page-prev" ${filter.page===1?'disabled':''}>上一页</button><span>${filter.page}/${Math.ceil(list.length/size)}</span><button class="btn" data-action="recall-page-next" ${filter.page*size>=list.length?'disabled':''}>下一页</button></div>`:''}<p class="small muted recall-rule">复习规则：不会当天再看，不熟次日，会背3天后。自评只表示自己的判断，不自动判断答案正确性。</p>`,'recall');
 }
 function study(){
  const session=state().recallSession;if(!session){navigate('recall');return;}
  const card=byId[session.ids[session.index]],revealed=session.revealed.includes(card.id),record=progress(card.id),source=sources[card.source_id];
  const prompt=card.kind==='formula'?'写出核心公式、符号含义、适用条件和边界检查。':card.kind==='condition'?'说出起笔前要先确认什么，并举出容易混淆的条件。':'先说出定义和机制，再补上条件、比较维度或论证边界。';
  shell(`<div class="recall-study"><div class="exercise-top"><button class="btn flat" data-action="recall-back">${session.returnTo==='practice'?'返回正在作答的题':'返回背诵区'}</button><span class="small muted">第 ${session.index+1} / ${session.ids.length} 张</span></div>${readingBar()}<article class="paper exercise-paper"><div class="exercise-meta"><span class="q-id">${card.id}</span><span>${subjectName(card.subject)}</span><span>${kindName[card.kind]}</span><span>${esc(card.chapter)}</span></div><h1 tabindex="-1" id="recall-heading">${esc(card.title)}</h1><p class="recall-prompt">${prompt}</p><section class="writing"><div class="writing-head"><label for="recall-draft">我的回忆</label><span class="saved-label" id="recall-draft-status" ${persistenceMessage?'data-server-save-label':''}>${state().recallDrafts[card.id]?(persistenceMessage?persistenceMessage():'回忆草稿已保存'):'可口述，也可以写下要点'}</span></div><textarea id="recall-draft" maxlength="100000" placeholder="先闭卷回忆，再展开核对；不要求逐字背诵。">${esc(state().recallDrafts[card.id]||'')}</textarea></section><div class="exercise-buttons"><button class="btn primary" data-action="recall-reveal" aria-expanded="${revealed}">${revealed?'收起核对内容':'展开原条目核对'}</button></div>${revealed?`<section class="recall-answer answer-section" id="recall-answer"><span class="answer-label">对照已交付手册，核查漏掉的条件和关键步骤</span><div class="rich">${card.body_html}</div><section class="self-check"><h2>这张卡，你能复现多少？</h2><div class="rating-buttons">${[[0,'不会，今天再看','bad'],[1,'不熟，明天复习','medium'],[2,'会背，3天后复习','']].map(([rating,label,cls])=>`<button class="rating ${cls} ${record?.rating===rating?'selected':''}" aria-pressed="${record?.rating===rating}" data-action="recall-rate" data-rating="${rating}">${label}</button>`).join('')}</div>${record?`<p class="small recall-saved">最近自评：<span ${persistenceMessage?'data-server-save-label':''}>${persistenceMessage?persistenceMessage():(canSave()?'已保存':'尚未写入浏览器')}</span> · 下次复习 ${record.due}</p><button class="btn primary" data-action="recall-next">${session.index===session.ids.length-1?'结束本组，返回背诵区':(canSave()?'已保存，下一张':'下一张')}</button>`:''}</section></section>`:''}<details class="source"><summary>卡片来源与条目</summary><p>${esc(source.file.split('/').pop())}<br>${esc(card.chapter)} / ${esc(card.source_heading)}</p><p>正文摘录已交付手册，保留原条目的条件与来源说明。专题关联用于找练习，不表示每道题与本卡逐式对应。</p></details><aside class="knowledge-bridge"><div><h2>带回题目里用</h2><p>按本卡主题进入相关专题，检验能否调用。</p></div><div class="actions">${card.groups.slice(0,3).map(group=>`<button class="btn" data-action="recall-group" data-sub="${card.subject}" data-group="${group}">${esc(data.subjects.find(s=>s.key===card.subject).groups.find(g=>g.id===group).title)}</button>`).join('')}${card.groups.length>3?`<button class="btn" data-action="recall-group" data-sub="${card.subject}" data-group="all">查看该科全部专题</button>`:''}</div></aside></article><div class="exercise-bottom"><button class="btn" data-action="recall-prev" ${session.index===0?'disabled':''}>上一张</button><span>${esc(card.id)}</span><button class="btn ink" data-action="recall-next">${session.index===session.ids.length-1?'结束本组':'下一张'}</button></div></div>`,'recall-study');
 }
 function homePanel(){
  return `<section class="learning-path" aria-label="学习分区"><a href="#bank"><span class="path-title">刷题训练</span><span>整题作答，核对推导与论证</span></a><a href="#recall"><span class="path-title">公式与背诵</span><span>回忆条件，再把知识用回题目</span></a><a href="#review"><span class="path-title">复盘与记录</span><span>找断点，安排错题与到期复习</span></a></section><section class="home-recall paper"><div><h2>给公式和概念，留一段回忆时间。</h2><p>每科最多10张，优先到期卡；与每日刷题分别记录。</p></div><div class="recall-daily-actions">${data.subjects.map(s=>{const batch=queue(s.key),stats=counts(s.key);return `<button class="btn" data-action="recall-daily" data-sub="${s.key}" ${batch.length?'':'disabled'}>${s.name}背${batch.length}张 <span class="muted">已背${stats.learned}/${stats.all}</span></button>`;}).join('')}</div></section>`;
 }
 function practicePanel(question){const count=cards.filter(c=>c.subject===question.subject&&c.groups.includes(question.group)).length;return `<aside class="knowledge-bridge"><div><h2>本专题知识回查</h2><p>作答后回看公式、条件与概念，再回到当前题。</p></div><button class="btn" data-action="recall-topic" data-sub="${question.subject}" data-group="${question.group}">查看${count}张相关知识卡</button></aside>`;}
 function reviewPage(){
  const latest=id=>[...state().records].reverse().find(r=>r.qid===id),stats=counts();
  shell(`<div class="page-heading"><div><h1>复盘与记录</h1><p>把做题断点和背诵断点放在一起看，再分别处理。</p></div></div><section class="paper review-subjects"><h2>错题复做</h2><p class="muted">按题目最近自评收集“不会”和“不熟”。</p><div class="actions">${data.subjects.map(s=>{const weak=s.questions.filter(q=>{const r=latest(q.id);return r&&r.rating<2;}).length;return `<button class="btn" data-action="review-wrong" data-sub="${s.key}">${s.name}错题 ${weak}</button>`;}).join('')}</div></section><section class="paper review-subjects"><h2>背诵待复习</h2><p>已自评 ${stats.learned}/${stats.all} 张，${stats.due} 张到期。到期卡不会自动改成“不熟”。</p><div class="actions">${data.subjects.map(s=>`<button class="btn" data-action="review-recall" data-sub="${s.key}">${s.name}待复习 ${counts(s.key).due}</button>`).join('')}</div></section><section class="learning-path review-path"><a href="#favorites"><span class="path-title">我的收藏</span><span>${state().favorites.length}道题，留给反复推敲</span></a><a href="#history"><span class="path-title">作答记录</span><span>${state().records.length}次自评，查看用时与计划日</span></a><a href="#settings"><span class="path-title">备份学习进度</span><span>带走刷题、背诵和两类草稿</span></a></section>`,'review');
 }
 function action(button){
  const a=button.dataset.action,session=state().recallSession;
  if(a==='recall-daily'){filter.subject=button.dataset.sub;start(queue(filter.subject));}
  if(a==='recall-resume')navigate('recall-study');
  if(a==='recall-subject'){filter={...filter,subject:button.dataset.sub,chapter:'all',group:'all',page:1};library();}
  if(a==='recall-card')start([button.dataset.id],button.dataset.return==='practice'||filter.group!=='all'&&state().session?'practice':'recall');
  if(a==='recall-filtered')start(listed().slice(0,10).map(c=>c.id));
  if(a==='recall-clear'){filter={...filter,kind:'all',chapter:'all',status:'all',search:'',group:'all',page:1};library();}
  if(a==='recall-topic'){filter={subject:button.dataset.sub,group:button.dataset.group,chapter:'all',kind:'all',status:'all',search:'',page:1};navigate('recall');}
  if(a==='recall-group')browseGroup(button.dataset.sub,button.dataset.group);
  if(a==='recall-back')navigate(session?.returnTo||'recall');
  if(a==='recall-reveal'&&session){const id=session.ids[session.index];session.revealed=session.revealed.includes(id)?session.revealed.filter(x=>x!==id):[...session.revealed,id];save();study();if(session.revealed.includes(id))document.getElementById('recall-answer')?.scrollIntoView({block:'start'});}
  if(a==='recall-rate'&&session&&session.revealed.includes(session.ids[session.index])){state().recallProgress[session.ids[session.index]]=review(Number(button.dataset.rating));const saved=save();study();document.querySelector('.self-check')?.scrollIntoView({block:'center'});toast(persistenceMessage?persistenceMessage():(saved?'背诵自评已保存':'未能保存，请立即导出备份'));}
  if((a==='recall-prev'||a==='recall-next')&&session){const index=session.index+(a==='recall-next'?1:-1);if(index>=session.ids.length){state().recallSession=null;save();navigate('recall');return;}if(index>=0){session.index=index;save();study();window.scrollTo({top:0});document.getElementById('recall-heading')?.focus({preventScroll:true});}}
  if(a==='recall-page-prev'||a==='recall-page-next'){filter.page+=a==='recall-page-next'?1:-1;library();window.scrollTo({top:0});}
  if(a==='review-wrong')openWrong(button.dataset.sub);
  if(a==='review-recall'){filter={subject:button.dataset.sub,group:'all',chapter:'all',kind:'all',status:'due',search:'',page:1};navigate('recall');}
 }
 function input(event){
  if(event.target.id==='recall-draft'&&state().recallSession){state().recallDrafts[state().recallSession.ids[state().recallSession.index]]=event.target.value;const saved=save();document.getElementById('recall-draft-status').textContent=persistenceMessage?persistenceMessage():(saved?'回忆草稿已保存':'未能保存，请导出备份');}
  if(event.target.id==='recall-search'&&!event.isComposing){const position=event.target.selectionStart;filter.search=event.target.value;filter.page=1;library();const element=document.getElementById('recall-search');element.focus();try{element.setSelectionRange(position,position);}catch{}}
 }
 function change(event){const fields={'recall-kind':'kind','recall-chapter':'chapter','recall-status':'status'};if(fields[event.target.id]){filter[fields[event.target.id]]=event.target.value;filter.page=1;library();}}
 return{render:page=>page==='recall'?library():page==='recall-study'?study():reviewPage(),action,input,change,homePanel,practicePanel,counts};
};
})();
