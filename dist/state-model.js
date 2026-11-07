(function(scope){
'use strict';
const clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const ownObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
function cleanRecall(input,cards){
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
function createStateModel(D){
const byId=Object.assign(Object.create(null),Object.fromEntries([...D.subjects.flatMap(s=>s.questions),...(D.comprehensive?.questions||[]),...(D.examTypes?.questions||[])].map(q=>[q.id,q])));
const catalogSize=Object.keys(byId).length;
const conceptKeys=new Set(Object.values(D.conceptMaps||{}).flatMap(bank=>bank.nodes.flatMap(node=>['concept','relation','application'].map(layer=>node.id+':'+layer))));
function cleanConceptProgress(input={}){
 if(!ownObject(input)||Object.keys(input).length>15000)throw Error('知识图自评格式不正确，未导入。');
 const result=Object.create(null);
 for(const [id,value] of Object.entries(input)){
  const subject=id.startsWith('KMI')?'micro':id.startsWith('KMA')?'macro':null;
  if(subject&&!D.conceptMaps?.[subject]?.nodes?.length)throw Error('知识图目录未完整加载，原学习记录未改动。');
  if(!conceptKeys.has(id))continue;
  if(!ownObject(value)||![0,1,2].includes(value.rating)||!Number.isFinite(value.at)||value.at<0||value.at>1e14)throw Error('知识图自评无效，未导入。');
  result[id]={rating:value.rating,at:value.at};
 }
 return result;
}
function mergeConceptProgress(a={},b={}){const result={...a};for(const [id,value] of Object.entries(b))if(!result[id]||value.at>=result[id].at)result[id]=value;return cleanConceptProgress(result);}
const methodKeys=new Set((D.methodSheets?.sheets||[]).flatMap(sheet=>sheet.checks.map(check=>check.id)));
function cleanMethodProgress(input={}){
 if(!ownObject(input)||Object.keys(input).length>500)throw Error('选法检测记录格式不正确，未导入。');
 if(Object.keys(input).length&&!methodKeys.size)throw Error('作答速查目录未完整加载，原检测记录未改动。');
 const result=Object.create(null),time=t=>Number.isFinite(t)&&t>=0&&t<=1e14;
 for(const [id,value] of Object.entries(input)){
  if(!methodKeys.has(id))throw Error('选法检测题号无效，未导入。');
  if(!ownObject(value)||typeof value.draft!=='string'||value.draft.length>20000||typeof value.revealed!=='boolean'||typeof value.assisted!=='boolean'||![null,0,1,2].includes(value.rating)||!Number.isInteger(value.round)||value.round<1||value.round>100000||!time(value.at)||!Array.isArray(value.history)||value.history.length>20)throw Error('选法检测草稿或自评无效，未导入。');
  if(value.rating!==null&&!value.revealed)throw Error('选法检测须核对后自评，未导入。');
  const rounds=new Set();
  for(const item of value.history){if(!ownObject(item)||!Number.isInteger(item.round)||item.round<1||item.round>value.round||rounds.has(item.round)||![0,1,2].includes(item.rating)||!time(item.at)||typeof item.assisted!=='boolean')throw Error('选法检测复测历史无效，未导入。');rounds.add(item.round);}
  result[id]={draft:value.draft,revealed:value.revealed,assisted:value.assisted,rating:value.rating,round:value.round,at:value.at,history:value.history.map(item=>({round:item.round,rating:item.rating,at:item.at,assisted:item.assisted}))};
 }
 return result;
}
function mergeMethodProgress(a={},b={}){const result={...a};for(const [id,item] of Object.entries(b))if(!result[id]||item.at>=result[id].at)result[id]=item;return cleanMethodProgress(result);}
const papers=new Map((D.comprehensive?.papers||[]).map(paper=>[paper.id,paper]));
function cleanScores(qid,scores){
 const question=byId[qid],parts=question?.scoring_parts||question?.parts;
 if(!question?.comprehensive||!Array.isArray(parts)||!ownObject(scores)||Object.keys(scores).length!==parts.length)throw Error('综合题评分格式不正确，未导入。');
 const result=Object.create(null);
 for(const part of parts){const value=scores[part.id];if(!Number.isFinite(value)||value<0||value>part.points||Math.round(value*2)!==value*2)throw Error('综合题分问评分超出范围，未导入。');result[part.id]=value;}
 return result;
}
const readingDefaults=()=>({size:19,face:'serif',focus:false});
const scheduleDefaults=()=>({mode:'intensive',start:D.intensivePlan?.start||'2026-11-04',at:0});
const intensiveIds=new Set([...D.subjects.filter(s=>['micro','macro'].includes(s.key)).flatMap(s=>s.questions.map(q=>q.id)),...(D.comprehensive?.questions||[]).filter(q=>/^CM[IA]\d{2}$/.test(q.id)).map(q=>q.id)]);
function cleanSchedule(value=scheduleDefaults()){
 if(!ownObject(value)||!['intensive','legacy'].includes(value.mode)||!validDate(value.start)||value.start<'2020-01-01'||value.start>'2100-12-31'||!Number.isFinite(value.at)||value.at<0||value.at>1e14)throw Error('强化计划设置无效，未导入。');
 return{mode:value.mode,start:value.start,at:value.at};
}
function cleanIntensiveProgress(value={}){
 if(!ownObject(value)||Object.keys(value).length>90)throw Error('强化计划自查格式不正确，未导入。');
 const result=Object.create(null);
 for(const [key,item] of Object.entries(value)){
  if(!/^(?:[1-9]|1[0-5]):(?:micro|macro):[0-2]$/.test(key)||!ownObject(item)||typeof item.checked!=='boolean'||!Number.isFinite(item.at)||item.at<0||item.at>1e14)throw Error('强化计划自查无效，未导入。');
  result[key]={checked:item.checked,at:item.at};
 }
 return result;
}
function mergeIntensiveProgress(a={},b={}){const result={...a};for(const [key,item] of Object.entries(b))if(!result[key]||item.at>=result[key].at)result[key]=item;return cleanIntensiveProgress(result);}
function planContext(value,qids){
 if(value.planId===undefined&&value.planDay===undefined)return{};
 if(value.planId!=='intensive-15'||!Number.isInteger(value.planDay)||value.planDay<1||value.planDay>15||value.day!==null||value.study||qids.some(id=>!intensiveIds.has(id)))throw Error('强化计划作答记录无效，未导入。');
 return{planId:value.planId,planDay:value.planDay};
}
const fresh=()=>({version:1,start:D.plan.start,records:[],drafts:{},favorites:[],session:null,reading:readingDefaults(),conceptProgress:cleanConceptProgress(),methodProgress:cleanMethodProgress(),schedule:scheduleDefaults(),intensiveProgress:cleanIntensiveProgress(),...cleanRecall({},D.recall.cards)});
function cleanWork(w,qid,records){return {seconds:Math.max(0,Math.min(604800,Number(w?.seconds)||0)),revealed:!!w?.revealed,hint:!!w?.hint,solutionLines:Number.isInteger(w?.solutionLines)?Math.max(1,Math.min(1000,w.solutionLines)):1,ratingId:records.some(r=>r.id===w?.ratingId&&r.qid===qid)?w.ratingId:null};}
function validate(input) {
 if (!input || input.version!==1 || !validDate(input.start) || !Array.isArray(input.records) || input.records.length>20000 || !Array.isArray(input.favorites) || !input.drafts || typeof input.drafts!=='object') throw new Error('备份格式不正确，请选择本网站导出的JSON文件。');
 const result=fresh(); result.start=input.start;result.schedule=cleanSchedule(input.schedule);result.intensiveProgress=cleanIntensiveProgress(input.intensiveProgress);
 if(input.reading)result.reading={size:[17,19,21].includes(input.reading.size)?input.reading.size:19,face:input.reading.face==='sans'?'sans':'serif',focus:!!input.reading.focus};
 result.records=input.records.map(r=>{
  if (!r || !byId[r.qid] || typeof r.id!=='string' || r.id.length>100 || ![0,1,2].includes(r.rating) || !Number.isFinite(r.at) || r.at<0 || r.at>1e14 || !Number.isFinite(r.seconds) || r.seconds<0 || r.seconds>604800 || (r.day!==null && (!Number.isInteger(r.day)||r.day<1||r.day>50))) throw new Error('备份中存在无效练习记录，未导入。');
  const record={id:r.id,qid:r.qid,rating:r.rating,at:r.at,updatedAt:Number.isFinite(r.updatedAt)&&r.updatedAt>=r.at&&r.updatedAt<=1e14?r.updatedAt:r.at,seconds:r.seconds,day:r.day};
  Object.assign(record,planContext(r,[r.qid]));
  if(r.score!==undefined||r.maxScore!==undefined||r.partScores!==undefined){
   const partScores=cleanScores(r.qid,r.partScores),score=Object.values(partScores).reduce((sum,value)=>sum+value,0);
   if(r.maxScore!==25||r.score!==score)throw Error('综合题总分与分问不一致，未导入。');
   Object.assign(record,{score,maxScore:25,partScores});
  }
  if(r.paperId!==undefined||r.paperAttempt!==undefined){
   if(!papers.get(r.paperId)?.question_ids.includes(r.qid)||typeof r.paperAttempt!=='string'||!/^[-\w]{1,100}$/.test(r.paperAttempt)||r.day!==null)throw Error('限时卷记录格式不正确，未导入。');
   Object.assign(record,{paperId:r.paperId,paperAttempt:r.paperAttempt});
  }
  return record;
 });
 result.records=[...new Map(result.records.map(r=>[r.id,r])).values()].sort((a,b)=>a.at-b.at);
 result.favorites=[...new Set(input.favorites.filter(id=>typeof id==='string'&&byId[id]))];
 for(const [id,text] of Object.entries(input.drafts)){if(byId[id]&&typeof text==='string'&&text.length<=100000) result.drafts[id]=text;else throw new Error('备份中的草稿无效，未导入。');}
 if(input.session && Array.isArray(input.session.ids) && input.session.ids.length && input.session.ids.length<=catalogSize && input.session.ids.every(id=>byId[id]&&!byId[id].exam_type) && Number.isInteger(input.session.index) && input.session.index>=0 && input.session.index<input.session.ids.length){
  const s=input.session; result.session={ids:[...new Set(s.ids)],index:s.index,mode:String(s.mode||'自由练习').slice(0,40),day:Number.isInteger(s.day)&&s.day>=1&&s.day<=50?s.day:null,seconds:Math.max(0,Math.min(604800,Number(s.seconds)||0)),startedAt:null,revealed:!!s.revealed,hint:!!s.hint,ratingId:typeof s.ratingId==='string'?s.ratingId:null};
  result.session.solutionLines=s.solutionLines;
  if(result.session.index>=result.session.ids.length) result.session.index=0;
  result.session.study=s.study===true;
  Object.assign(result.session,planContext(s,result.session.ids));
  result.session.topicId=result.session.study&&D.topics?.some(t=>t.id===s.topicId&&result.session.ids.every(id=>t.source_question_ids.includes(id)))?s.topicId:null;
  result.session.work=Object.create(null);
  for(const id of result.session.ids){if(input.session.work?.[id])result.session.work[id]=cleanWork(input.session.work[id],id,result.records);}
  Object.assign(result.session,cleanWork(result.session,result.session.ids[result.session.index],result.records));
  if(result.session.planId){
   const belongs=id=>result.records.some(r=>r.id===id&&r.planId===s.planId&&r.planDay===s.planDay);
   if(!belongs(result.session.ratingId))result.session.ratingId=null;
   for(const work of Object.values(result.session.work))if(!belongs(work.ratingId))work.ratingId=null;
  }
  if(s.scoreDrafts!==undefined){
   if(!ownObject(s.scoreDrafts))throw Error('综合题评分草稿格式不正确，未导入。');
   result.session.scoreDrafts=Object.create(null);
   for(const [qid,scores] of Object.entries(s.scoreDrafts)){if(!result.session.ids.includes(qid))throw Error('综合题评分草稿题号不正确，未导入。');result.session.scoreDrafts[qid]=cleanScores(qid,scores);}
  }
  if(s.paperId!==undefined){
   const paper=papers.get(s.paperId);
   if(!paper||JSON.stringify(paper.question_ids)!==JSON.stringify(result.session.ids)||typeof s.paperAttempt!=='string'||!/^[-\w]{1,100}$/.test(s.paperAttempt)||result.session.day!==null||result.session.study)throw Error('限时训练卷不完整，未导入。');
   Object.assign(result.session,{paperId:paper.id,paperAttempt:s.paperAttempt,paperSubmitted:s.paperSubmitted===true,paperRunning:s.paperSubmitted!==true&&s.paperRunning===true});
   const belongsToAttempt=id=>result.records.some(record=>record.id===id&&record.paperId===paper.id&&record.paperAttempt===s.paperAttempt);
   if(!belongsToAttempt(result.session.ratingId))result.session.ratingId=null;
   for(const work of Object.values(result.session.work))if(!belongsToAttempt(work.ratingId))work.ratingId=null;
   if(!result.session.paperSubmitted){
    Object.assign(result.session,{revealed:false,hint:false,solutionLines:1});
    for(const work of Object.values(result.session.work))Object.assign(work,{revealed:false,hint:false,solutionLines:1});
   }
  }
 }
 Object.assign(result,cleanRecall(input,D.recall.cards));
 result.conceptProgress=cleanConceptProgress(input.conceptProgress);
 result.methodProgress=cleanMethodProgress(input.methodProgress);
 return result;
}
const keyed=['drafts','recallDrafts','recallProgress','conceptProgress','intensiveProgress','methodProgress'];
function diff(before,after){
 const changes=[];
 for(const field of ['start','reading','session','recallSession','schedule'])if(!same(before[field],after[field]))changes.push({path:[field],before:before[field]??null,after:after[field]??null});
 for(const field of keyed)for(const id of new Set([...Object.keys(before[field]||{}),...Object.keys(after[field]||{})]))if(!same(before[field]?.[id],after[field]?.[id]))changes.push({path:[field,id],before:before[field]?.[id]??null,after:after[field]?.[id]??null});
 const oldRecords=new Map(before.records.map(r=>[r.id,r])),newRecords=new Map(after.records.map(r=>[r.id,r]));
 for(const [id,record] of newRecords)if(!same(oldRecords.get(id),record))changes.push({path:['records',id],before:oldRecords.get(id)??null,after:record});
 const oldFav=new Set(before.favorites),newFav=new Set(after.favorites);
 for(const id of new Set([...oldFav,...newFav]))if(oldFav.has(id)!==newFav.has(id))changes.push({path:['favorites',id],before:oldFav.has(id),after:newFav.has(id)});
 return changes;
}
function apply(current,changes,{checkConflicts=true}={}){
 if(!Array.isArray(changes)||changes.length>25000)throw Error('同步修改格式不正确');
 const next=clone(current),records=new Map(next.records.map(r=>[r.id,r])),favorites=new Set(next.favorites),conflicts=[];
 for(const change of changes){
  if(!change||!Array.isArray(change.path)||change.path.length<1||change.path.length>2||change.path.some(p=>typeof p!=='string'||p.length>100))throw Error('同步修改路径不正确');
  const [field,id]=change.path;
  if(['start','reading','session','recallSession','schedule'].includes(field)&&change.path.length===1){if(field==='schedule'&&next.schedule?.at>change.after?.at)continue;next[field]=change.after;continue;}
  if(change.path.length!==2)throw Error('同步修改字段不正确');
  if(keyed.includes(field)){
   const now=next[field]?.[id];
   if(['drafts','recallDrafts'].includes(field)&&checkConflicts&&!same(now,change.before)&&!same(now,change.after)){conflicts.push(change.path);continue;}
   if(field==='methodProgress'&&checkConflicts&&now?.draft!==change.before?.draft&&now?.draft!==change.after?.draft){conflicts.push(change.path);continue;}
   if(['recallProgress','conceptProgress','intensiveProgress','methodProgress'].includes(field)&&(field!=='methodProgress'||checkConflicts)&&now&&change.after&&now.at>change.after.at)continue;
   if(change.after===null)delete next[field][id];else next[field][id]=change.after;
  }else if(field==='records'){
   if(!change.after||change.after.id!==id)throw Error('作答记录不能通过同步删除');
   const old=records.get(id);if(!old||(change.after.updatedAt||change.after.at)>=(old.updatedAt||old.at))records.set(id,change.after);
  }else if(field==='favorites'){
   if(typeof change.after!=='boolean')throw Error('收藏修改无效');
   if(change.after)favorites.add(id);else favorites.delete(id);
  }else throw Error('同步修改字段不正确');
 }
 if(conflicts.length)throw Object.assign(Error('另一端修改了同一份草稿，请选择保留哪一份'),{status:409,conflicts});
 next.records=[...records.values()].sort((a,b)=>a.at-b.at);next.favorites=[...favorites];return validate(next);
}
function merge(current,incoming){
 const a=validate(incoming),records=new Map(current.records.map(r=>[r.id,r]));
 for(const r of a.records){const old=records.get(r.id);if(!old||(r.updatedAt||r.at)>(old.updatedAt||old.at))records.set(r.id,r);}
 const progress={...current.recallProgress};for(const [id,r] of Object.entries(a.recallProgress))if(!progress[id]||r.at>progress[id].at)progress[id]=r;
 return validate({...current,start:a.start,reading:a.reading,records:[...records.values()],favorites:[...new Set([...current.favorites,...a.favorites])],drafts:{...current.drafts,...a.drafts},recallProgress:progress,recallDrafts:{...current.recallDrafts,...a.recallDrafts},session:current.session||a.session,recallSession:current.recallSession||a.recallSession,conceptProgress:mergeConceptProgress(current.conceptProgress,a.conceptProgress),methodProgress:mergeMethodProgress(current.methodProgress,a.methodProgress),schedule:a.schedule.at>=current.schedule.at?a.schedule:current.schedule,intensiveProgress:mergeIntensiveProgress(current.intensiveProgress,a.intensiveProgress)});
}
return{fresh,validate,cleanWork,diff,apply,merge,mergeConceptProgress,mergeIntensiveProgress,mergeMethodProgress};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createStateModel};else scope.createStateModel=createStateModel;
})(globalThis);
