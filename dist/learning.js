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
  result.recallSession={ids,index:Math.min(session.index,ids.length-1),revealed:Array.isArray(session.revealed)?[...new Set(session.revealed.filter(id=>ids.includes(id)))]:[],returnTo:session.returnTo==='practice'||/^(?:topics\/(?:micro|macro|political)\/(?:0[1-9]|10)|maps\/(?:micro|macro)\/(?:0[1-9]|10)\/(?:mind|network|path)(?:\/[A-Za-z0-9]+){0,2})$/.test(session.returnTo)?session.returnTo:'recall'};
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
window.createLearning=function({data,esc,shell,navigate}){
 const cards=data.recall.cards;
 let returnTo='bank';
 function explain(ids,back){
  returnTo=back&&/^(practice|topics|maps)(\/|$)/.test(back)?back:'bank';
  const selected=cards.filter(card=>ids.includes(card.id));
  shell(`<div class="page-heading"><div><h1>知识解释</h1><p>查阅公式、概念与适用条件，再带回题目中使用。</p></div><button class="btn" data-action="knowledge-back">返回原处</button></div>${selected.map(card=>`<article class="paper exercise-paper"><div class="exercise-meta"><span>${esc(card.id)}</span><span>${esc(card.chapter)}</span></div><h2>${esc(card.title)}</h2><div class="rich">${card.body_html}</div><p class="small muted">来源条目：${esc(card.source_heading)}</p></article>`).join('')}`,'topics');
 }
 function action(button){
  if(button.dataset.action==='knowledge-back'){navigate(returnTo);return;}
  if(button.dataset.action==='recall-card')explain([button.dataset.id],button.dataset.return||'practice');
  if(button.dataset.action==='recall-topic')explain(cards.filter(c=>c.subject===button.dataset.sub&&c.groups.includes(button.dataset.group)).map(c=>c.id),'practice');
 }
 return {action,render:()=>navigate('bank'),input:()=>{},change:()=>{},homePanel:()=>'',practicePanel:question=>`<aside class="knowledge-bridge"><div><h2>本专题知识解释</h2><p>查阅公式、条件与概念。</p></div><button class="btn" data-action="recall-topic" data-sub="${question.subject}" data-group="${question.group}">回查知识解释</button></aside>`};
};
})();
