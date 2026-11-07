(function(scope){
'use strict';
const PLAN_ID='intensive-15';
function reviewQueue(plan,records,day){
 const dueDays=[1,3,7].map(lag=>day-lag).filter(n=>n>=1&&n<=10);
 const latest=new Map();for(const record of records)if(/^(?:C)?M[IA]\d{2,3}$/.test(record.qid))latest.set(record.qid,record);
 const wrong=[...latest.values()].filter(r=>r.rating<2).sort((a,b)=>a.rating-b.rating||a.at-b.at).map(r=>r.qid);
 const due=dueDays.flatMap(n=>['micro','macro'].map(subject=>plan.days[n-1][subject].required_refs[0]));
 return{dueDays,wrong,ids:[...new Set([...wrong,...due])].slice(0,6)};
}
function paperSummary(paper,records){
 const attempts=records.filter(r=>r.paperId===paper.id&&r.paperAttempt);
 if(!attempts.length)return{count:0,total:null,micro:0,macro:0,attempt:null};
 const attempt=attempts.reduce((a,b)=>b.at>=a.at?b:a).paperAttempt;
 const latest=new Map();for(const r of attempts.filter(r=>r.paperAttempt===attempt))if(!latest.has(r.qid)||(r.updatedAt||r.at)>=(latest.get(r.qid).updatedAt||latest.get(r.qid).at))latest.set(r.qid,r);
 const scored=paper.question_ids.map(id=>latest.get(id)).filter(r=>r&&Number.isFinite(r.score)&&r.maxScore===25);
 const sum=prefix=>scored.filter(r=>r.qid.startsWith(prefix)).reduce((n,r)=>n+r.score,0);
 return{attempt,count:scored.length,total:scored.length===paper.question_ids.length?scored.reduce((n,r)=>n+r.score,0):null,micro:sum('CMI'),macro:sum('CMA')};
}
function create({data:D,state,save,esc,shell,start,home,toast,nowDate,validDate,dayDelta}){
 const plan=D.intensivePlan,byId=Object.fromEntries([...D.subjects.flatMap(s=>s.questions),...D.comprehensive.questions].map(q=>[q.id,q]));
 const names={micro:'微观',macro:'宏观'};
 const today=()=>Math.max(1,Math.min(15,dayDelta(nowDate(),state().schedule.start)+1));
 let selected=today();
 const dateFor=day=>new Date(Date.parse(state().schedule.start+'T00:00:00Z')+(day-1)*86400000).toISOString().slice(0,10);
 const record=(id,day=selected)=>[...state().records].reverse().find(r=>r.qid===id&&r.planId===PLAN_ID&&r.planDay===day);
 const context=()=>({planId:PLAN_ID,planDay:selected});
 const practice=(ids,label,index=0,paper=null)=>start(ids,label,null,index,false,null,paper,context());
 function switcher(){return `<div class="plan-switch" role="group" aria-label="选择学习安排"><button class="btn ${state().schedule.mode==='intensive'?'primary':''}" data-action="int-mode" data-mode="intensive" aria-pressed="${state().schedule.mode==='intensive'}">宏微观15天强化</button><button class="btn ${state().schedule.mode==='legacy'?'primary':''}" data-action="int-mode" data-mode="legacy" aria-pressed="${state().schedule.mode==='legacy'}">原50天三科计划</button></div>`;}
 function dates(){return `<div class="settings-row"><label for="intensive-start">15天开始日期</label><input id="intensive-start" type="date" min="2020-01-01" max="2100-12-31" value="${state().schedule.start}"><button class="btn" data-action="int-date">保存强化日期</button></div><p class="small muted">${state().schedule.start} 至 ${dateFor(15)}。调整日期只移动日历；自查、作答与旧50天记录保留。</p>`;}
 function settingsPanel(){return `<section class="paper settings-panel"><h2>宏微观15天强化</h2><p>20个专题，4小时必做，额外0–2小时修补。两套120分钟训练卷用于最后两天验收。过关自查与实际作答分别记录。</p>${switcher()}${dates()}</section>`;}
 function questionButtons(ids,kind){return `<div class="int-question-list">${ids.map(id=>{const r=record(id);return `<button class="int-question ${r?'rated':''}" data-action="int-question" data-id="${id}" data-kind="${kind}"><span>${id}</span><span>${esc(byId[id].title)}</span><small>${byId[id].minutes}分钟${r?' · '+(r.rating===2?'会做':r.rating===1?'不熟':'不会'):''}</small></button>`;}).join('')}</div>`;}
 function subjectPanel(day,subject){const block=day[subject],count=block.required_refs.filter(id=>record(id)).length;
  return `<section class="paper int-subject" aria-labelledby="int-${subject}-heading"><div class="int-subject-heading"><span>${names[subject]}</span><h3 id="int-${subject}-heading">${esc(block.title)}</h3></div><ul class="int-focus">${block.focus.map(text=>`<li>${esc(text)}</li>`).join('')}</ul><h4>${day.paper_id?'本卷两题':'完整闭卷作答'}</h4>${day.paper_id?`<p class="small muted">${block.required_refs.join('、')}。请从整卷入口开始，交卷前隐藏答案与提示。</p>`:questionButtons(block.required_refs,'required')}<div class="int-subject-action"><span class="small muted">本计划日已自评 ${count}/${block.required_refs.length}题</span>${!day.paper_id?`<button class="btn primary" data-action="int-required" data-sub="${subject}">开始${names[subject]}必做</button>`:''}</div>${block.screen_refs.length?`<details class="int-screen"><summary>其余${block.screen_refs.length}题：条件、选法与边界筛查</summary><p>逐题遮住答案，只列约束、选法与边界。有断点就补整题；筛查不计完整作答。</p>${questionButtons(block.screen_refs,'screen')}</details>`:''}${block.extra_refs.length?`<details class="int-extra"><summary>额外加练候选 · 按断点择做</summary><p>先补待做与错点，再从候选中选择；两科合计最多120分钟，不默认全部完成。</p>${questionButtons(block.extra_refs,'extra')}</details>`:''}<div class="int-checks"><h4>本科过关自查</h4>${block.checks.map((text,index)=>{const key=selected+':'+subject+':'+index;return `<label><input type="checkbox" data-intensive-check="${key}" ${state().intensiveProgress[key]?.checked?'checked':''}><span>${esc(text)}</span></label>`;}).join('')}<p class="small muted">勾选是你的闭卷自查，不自动替代题目评分。</p></div><div class="actions int-topic-links">${block.groups.map(group=>`<a href="#methods/${subject}/${group}">作答速查${group}</a><a href="#methods/${subject}/${group}/checks">闭卷检测${group}</a><a href="#topics/${subject}/${group}">${names[subject]}专题${group}</a><a href="#maps/${subject}/${group}/path">解题路径${group}</a>`).join('')}</div></section>`;
 }
 function assessment(day){if(!day.paper_id)return'';const paper=D.comprehensive.papers.find(p=>p.id===day.paper_id),summary=paperSummary(paper,state().records),seen=paper.question_ids.filter(id=>state().records.some(r=>r.qid===id));
  return `<section class="paper int-assessment"><h3>${day.paper_id} · 120分钟整卷验收</h3><p>微观两题、宏观两题，各科50分，共100分。整卷作答期间隐藏解答、提示与核对图形，交卷后逐问评分。</p><p class="int-score">${summary.total===null?`最近一次已核分 ${summary.count}/4题`:`最近一次 ${summary.total}/100 · 微观 ${summary.micro}/50 · 宏观 ${summary.macro}/50`}</p><p class="small muted">目标：两科各50/50。训练分值和时限由编者设定。${seen.length?'这些题已有作答记录，请区分首次作答与熟题复现。':'目前没有这些题的作答记录；是否曾读过题干或答案，仍需自行确认。'}分数展示最近一次整卷，未核分不算0分，也不拼接不同轮次得分。</p><button class="btn ink" data-action="int-paper">${summary.attempt?'重新开始本卷':'开始120分钟验收'}</button></section>`;
 }
 function render(){const day=plan.days[selected-1],queue=reviewQueue(plan,state().records,selected),checked=Object.values(state().intensiveProgress).filter(x=>x.checked).length,raw=dayDelta(nowDate(),state().schedule.start)+1;
  shell(`<div class="page-heading"><div><h1 class="intensive-heading">宏微观15天，<span>按满分要求训练。</span></h1><p>先闭卷建立模型，再逐项核对条件、推导与边界。每天4小时必做，加练0–2小时；用作答与复测验收。</p></div>${state().session?`<button class="btn ink" data-action="resume">${state().session.study?'继续上次跟读':'继续上次练习'}</button>`:''}</div>${switcher()}<section class="int-plan-summary"><p><strong>20个专题全部覆盖</strong>：40道专项代表题完整作答，160道专项题逐一筛查；第11–13天综合应用，第14–15天限时验收。</p><p>P02、P03留到最后两天检验配时。卷内题已并入统一题型，未打开卷页不代表未见题；读过相同条件或答案时，成绩只用于熟题复现。<a href="materials/intensive-15-day-plan.md" download>下载完整15天安排</a></p></section><section class="paper int-day"><div class="today-head"><div class="day-select"><div><div class="day-number">第 ${selected} 天<span>/ 15天</span></div><div class="phase">${esc(day.phase)}</div></div><div class="int-day-controls"><button class="day-step" data-action="int-prev" aria-label="上一强化日" ${selected===1?'disabled':''}>‹</button><select id="intensive-day-select" aria-label="选择强化日">${plan.days.map(d=>`<option value="${d.day}" ${selected===d.day?'selected':''}>第${d.day}天</option>`).join('')}</select><button class="day-step" data-action="int-next" aria-label="下一强化日" ${selected===15?'disabled':''}>›</button></div></div><div class="date-control"><span>${dateFor(selected)}</span><button class="btn flat" data-action="int-today">回到强化今天</button></div></div><div class="int-day-body"><h2>${esc(day.title)}</h2><p>${esc(day.note)}</p><ol class="int-time-budget" aria-label="4小时必做安排">${day.blocks.map(b=>`<li><strong>${b.minutes}<small>分钟</small></strong><span>${esc(b.label)}</span></li>`).join('')}</ol></div></section>${assessment(day)}<div class="int-subject-grid">${['micro','macro'].map(s=>subjectPanel(day,s)).join('')}</div><section class="paper int-review"><h2>到期复测与错点修补</h2><p>按1、3、7天间隔抽检${queue.dueDays.length?'第'+queue.dueDays.join('、')+'天的专题':'；第一天先诊断已学模型'}。30分钟先回忆关键关系，再复现一个最早断点；需要完整重写的题放进加练。</p>${queue.ids.length?`<div class="int-review-list">${queue.ids.map(id=>`<button class="btn" data-action="int-question" data-id="${id}" data-kind="review">${queue.wrong.includes(id)?'错点':'到期'} ${id}</button>`).join('')}</div>`:'<p class="small muted">还没有宏微观错题记录。先做今日代表题，有断点的题会按最近一次自评进入候选。</p>'}<p class="small muted">显示最多6道候选，不要求在30分钟内全部写完；优先“不会”，再处理“不熟”。只纳入宏观、微观。</p></section><details class="paper int-overview"><summary>查看15天路线与满分验收口径</summary><p>${esc(plan.target)}</p><ol class="int-overview-list">${plan.days.map(d=>`<li><button data-action="int-day" data-day="${d.day}" ${d.day===selected?'aria-current="date"':''}><span>第${d.day}天</span><strong>${esc(d.title)}</strong><small>${esc(d.phase)}</small></button></li>`).join('')}</ol><ul>${plan.acceptance.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><p class="small muted">${esc(plan.editorial_note)}</p></details><section class="paper int-progress"><h2>按证据判断，按断点继续</h2><p>每日过关自查已勾选 ${checked}/90项。题目自评、综合题分问得分和自查分开保存；完成天数或读过答案不自动算掌握。</p><p>${raw<1?'强化尚未开始，可以先做第1天诊断。':raw>15?'已超过15天；可选择任意一天补断点与复测，旧记录保留。':'按开始日期，今天是第'+today()+'天。'}第15天仍有失分点或超时，就延长修补与隔日复测。</p><details><summary>调整15天开始日期</summary>${dates()}</details></section>`,'today');
 }
 function change(e){if(e.target.id==='intensive-day-select'){selected=Number(e.target.value);render();document.getElementById('intensive-day-select')?.focus();return true;}
  const key=e.target.dataset.intensiveCheck;if(!key)return false;
  state().intensiveProgress[key]={checked:e.target.checked,at:Date.now()};save();render();document.querySelector('[data-intensive-check="'+key+'"]')?.focus({preventScroll:true});return true;
 }
 function action(button){const a=button.dataset.action;if(!a?.startsWith('int-'))return false;
  if(a==='int-mode'){state().schedule={...state().schedule,mode:button.dataset.mode,at:Date.now()};save();if(location.hash==='#settings')shellSettings();else home();}
  if(a==='int-prev'||a==='int-next'){selected=Math.max(1,Math.min(15,selected+(a==='int-next'?1:-1)));render();}
  if(a==='int-today'){selected=today();render();}
  if(a==='int-day'){selected=Number(button.dataset.day);render();document.querySelector('.int-day')?.scrollIntoView({block:'start'});}
  if(a==='int-required'){const subject=button.dataset.sub,ids=plan.days[selected-1][subject].required_refs;practice(ids,names[subject]+'15天强化必做',Math.max(0,ids.findIndex(id=>!record(id))));}
  if(a==='int-question'){if(byId[button.dataset.id])practice([button.dataset.id],'15天强化'+({review:'复测',screen:'筛查升级整题',extra:'加练',required:'必做'}[button.dataset.kind]||'练习'));}
  if(a==='int-paper'){const day=plan.days[selected-1],paper=D.comprehensive.papers.find(p=>p.id===day.paper_id);if(paper)practice(paper.question_ids,paper.title,0,paper);}
  if(a==='int-date'){const value=document.getElementById('intensive-start').value;if(!validDate(value)||value<'2020-01-01'||value>'2100-12-31'){toast('请选择2020至2100年之间的有效日期');return true;}state().schedule={...state().schedule,start:value,at:Date.now()};selected=today();save();if(location.hash==='#settings')shellSettings();else render();toast('强化日期已更新，练习与自查保留');}
  if(['int-mode','int-prev','int-next','int-today'].includes(a))scope.StudyUI.restoreFocus(button,'#main h1');
  return true;
 }
 let shellSettings=()=>{};
 return{render,change,action,switcher,settingsPanel,active:()=>state().schedule.mode==='intensive',reset:()=>{selected=today();},setSettingsRenderer:fn=>{shellSettings=fn;},record};
}
const api={create,reviewQueue,paperSummary};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.IntensivePlan=api;
})(globalThis);
