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
  result.recallSession={ids,index:Math.min(session.index,ids.length-1),revealed:Array.isArray(session.revealed)?[...new Set(session.revealed.filter(id=>ids.includes(id)))]:[],returnTo:session.returnTo==='practice'?'practice':'recall'};
 }
 return result;
}
function createStateModel(D){
const byId=Object.assign(Object.create(null),Object.fromEntries(D.subjects.flatMap(s=>s.questions.map(q=>[q.id,q]))));
const readingDefaults=()=>({size:19,face:'serif',focus:false});
const fresh=()=>({version:1,start:D.plan.start,records:[],drafts:{},favorites:[],session:null,reading:readingDefaults(),...cleanRecall({},D.recall.cards)});
function cleanWork(w,qid,records){return {seconds:Math.max(0,Math.min(604800,Number(w?.seconds)||0)),revealed:!!w?.revealed,hint:!!w?.hint,ratingId:records.some(r=>r.id===w?.ratingId&&r.qid===qid)?w.ratingId:null};}
function validate(input) {
 if (!input || input.version!==1 || !validDate(input.start) || !Array.isArray(input.records) || input.records.length>20000 || !Array.isArray(input.favorites) || !input.drafts || typeof input.drafts!=='object') throw new Error('备份格式不正确，请选择本网站导出的JSON文件。');
 const result=fresh(); result.start=input.start;
 if(input.reading)result.reading={size:[17,19,21].includes(input.reading.size)?input.reading.size:19,face:input.reading.face==='sans'?'sans':'serif',focus:!!input.reading.focus};
 result.records=input.records.map(r=>{
  if (!r || !byId[r.qid] || typeof r.id!=='string' || r.id.length>100 || ![0,1,2].includes(r.rating) || !Number.isFinite(r.at) || r.at<0 || r.at>1e14 || !Number.isFinite(r.seconds) || r.seconds<0 || r.seconds>604800 || (r.day!==null && (!Number.isInteger(r.day)||r.day<1||r.day>50))) throw new Error('备份中存在无效练习记录，未导入。');
  return {id:r.id,qid:r.qid,rating:r.rating,at:r.at,updatedAt:Number.isFinite(r.updatedAt)&&r.updatedAt>=r.at&&r.updatedAt<=1e14?r.updatedAt:r.at,seconds:r.seconds,day:r.day};
 });
 result.records=[...new Map(result.records.map(r=>[r.id,r])).values()].sort((a,b)=>a.at-b.at);
 result.favorites=[...new Set(input.favorites.filter(id=>typeof id==='string'&&byId[id]))];
 for(const [id,text] of Object.entries(input.drafts)){if(byId[id]&&typeof text==='string'&&text.length<=100000) result.drafts[id]=text;else throw new Error('备份中的草稿无效，未导入。');}
 if(input.session && Array.isArray(input.session.ids) && input.session.ids.length && input.session.ids.length<=300 && input.session.ids.every(id=>byId[id]) && Number.isInteger(input.session.index) && input.session.index>=0 && input.session.index<input.session.ids.length){
  const s=input.session; result.session={ids:[...new Set(s.ids)],index:s.index,mode:String(s.mode||'自由练习').slice(0,40),day:Number.isInteger(s.day)&&s.day>=1&&s.day<=50?s.day:null,seconds:Math.max(0,Math.min(604800,Number(s.seconds)||0)),startedAt:null,revealed:!!s.revealed,hint:!!s.hint,ratingId:typeof s.ratingId==='string'?s.ratingId:null};
  if(result.session.index>=result.session.ids.length) result.session.index=0;
  result.session.work=Object.create(null);
  for(const id of result.session.ids){if(input.session.work?.[id])result.session.work[id]=cleanWork(input.session.work[id],id,result.records);}
  Object.assign(result.session,cleanWork(result.session,result.session.ids[result.session.index],result.records));
 }
 Object.assign(result,cleanRecall(input,D.recall.cards));
 return result;
}
const keyed=['drafts','recallDrafts','recallProgress'];
function diff(before,after){
 const changes=[];
 for(const field of ['start','reading','session','recallSession'])if(!same(before[field],after[field]))changes.push({path:[field],before:before[field]??null,after:after[field]??null});
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
  if(['start','reading','session','recallSession'].includes(field)&&change.path.length===1){next[field]=change.after;continue;}
  if(change.path.length!==2)throw Error('同步修改字段不正确');
  if(keyed.includes(field)){
   const now=next[field]?.[id];
   if(['drafts','recallDrafts'].includes(field)&&checkConflicts&&!same(now,change.before)&&!same(now,change.after)){conflicts.push(change.path);continue;}
   if(field==='recallProgress'&&now&&change.after&&now.at>change.after.at)continue;
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
 return validate({...current,start:a.start,reading:a.reading,records:[...records.values()],favorites:[...new Set([...current.favorites,...a.favorites])],drafts:{...current.drafts,...a.drafts},recallProgress:progress,recallDrafts:{...current.recallDrafts,...a.recallDrafts},session:current.session||a.session,recallSession:current.recallSession||a.recallSession});
}
return{fresh,validate,cleanWork,diff,apply,merge};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createStateModel};else scope.createStateModel=createStateModel;
})(globalThis);
