import {createHash} from 'node:crypto';
import {questionReviewHash} from './build-exam-review.mjs';

export const trainingClassNames={focused:'专项训练',linked:'连续设问',anchor:'综合锚点'};
export const trainingDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=value=>typeof value==='string'&&value.trim().length>0;
const unique=values=>new Set(values).size===values.length;
const sequential=parts=>parts.every((part,index)=>part.id===String(index+1));

export function structuredPrompt(entry){
 return entry.stem_md+'\n\n'+entry.parts.map(part=>'（'+part.id+'）'+part.prompt_md).join('\n\n');
}

export function prepareTrainingBank(bank,subject,questions,reviews){
 if(bank?.version!==1||bank.subject!==subject||!text(bank.label)||!text(bank.source_note)||!Array.isArray(bank.questions))throw Error('Invalid structured training bank: '+subject);
 const source=new Map(questions.map(question=>[question.id,question]));
 const checked=new Map(reviews.questions.map(review=>[review.id,review]));
 const result=new Map();
 for(const entry of bank.questions){
  const question=source.get(entry.id),review=checked.get(entry.id);
  const fail=reason=>{throw Error('Invalid structured training '+entry.id+': '+reason);};
  if(!question||!review||result.has(entry.id))fail('unknown or duplicate ID');
  if(entry.source_sha256!==questionReviewHash(question)||entry.review_sha256!==trainingDigest(review))fail('source or reviewed answer changed');
  if(!Object.hasOwn(trainingClassNames,entry.classification)||!text(entry.classification_reason)||!text(entry.change_note_md)||!text(entry.stem_md))fail('classification or editorial evidence');
  if(!Array.isArray(entry.parts)||entry.parts.length<2||entry.parts.length>10||!sequential(entry.parts))fail('numbered parts');
  const used=new Set();
  for(const part of entry.parts){
   if(!text(part.prompt_md)||!Array.isArray(part.answer_step_indexes)||!part.answer_step_indexes.length||!unique(part.answer_step_indexes))fail('answer mapping');
   for(const index of part.answer_step_indexes){
    if(!Number.isInteger(index)||index<0||index>=review.steps.length)fail('answer step index');
    used.add(index);
   }
  }
  if(used.size!==review.steps.length)fail('existing answer steps omitted');
  if(!Array.isArray(entry.comprehensive_ids)||!entry.comprehensive_ids.length||!unique(entry.comprehensive_ids)||entry.comprehensive_ids.some(id=>typeof id!=='string'))fail('comprehensive links');
  result.set(entry.id,{...entry,label:bank.label,source_note:bank.source_note,prompt_md:structuredPrompt(entry)});
 }
 if(result.size!==source.size)throw Error('Incomplete structured training bank: '+subject+' '+result.size+'/'+source.size);
 return result;
}

export function comprehensivePrompt(entry){
 return entry.stem_md+'\n\n'+entry.parts.map(part=>'（'+part.id+'）'+part.prompt_md+'（'+part.points+'分）').join('\n\n');
}

export function prepareComprehensiveBank(bank,subject,questions,groups){
 if(bank?.version!==1||bank.subject!==subject||!text(bank.editorial_note)||!Array.isArray(bank.cases)||bank.cases.length!==20)throw Error('Invalid comprehensive bank: '+subject);
 const source=new Map(questions.map(question=>[question.id,question]));
 const knownGroups=new Set(groups.map(group=>group.id)),seen=new Set(),counts=new Map();
 const prefix=subject==='micro'?'CMI':'CMA';
 const result=[];
 for(const entry of bank.cases){
  const fail=reason=>{throw Error('Invalid comprehensive case '+entry.id+': '+reason);};
  if(!new RegExp('^'+prefix+'(?:0[1-9]|1[0-9]|20)$').test(entry.id)||seen.has(entry.id)||!knownGroups.has(entry.group))fail('ID or group');
  seen.add(entry.id);counts.set(entry.group,(counts.get(entry.group)||0)+1);
  for(const field of ['title','source_note_md','stem_md','method_md','pitfalls_md','recap_md','connections_md','diagram_decision_md'])if(!text(entry[field]))fail(field);
  if(!Number.isInteger(entry.minutes)||entry.minutes<15||entry.minutes>90)fail('training time');
  if(!Array.isArray(entry.source_question_ids)||!entry.source_question_ids.length||!unique(entry.source_question_ids)||entry.source_question_ids.some(id=>!source.has(id)))fail('source anchors');
  if(!entry.source_question_ids.some(id=>source.get(id).group===entry.group))fail('no anchor from its topic');
  if(!Array.isArray(entry.parts)||entry.parts.length<4||entry.parts.length>6||!sequential(entry.parts))fail('four to six connected parts');
  let points=0;
  for(const part of entry.parts){
   if(!text(part.prompt_md)||!text(part.answer_md)||!Number.isInteger(part.points)||part.points<1)fail('part content or points');
   if(part.title!==undefined&&!text(part.title))fail('part title');
   if(part.uses!==undefined&&(!Array.isArray(part.uses)||!part.uses.length||!part.uses.every(text)))fail('part concepts');
   if(!Array.isArray(part.rubric)||!part.rubric.length||part.rubric.some(row=>!Number.isInteger(row.points)||row.points<1||!text(row.criterion_md)))fail('part rubric');
   if(part.rubric.reduce((sum,row)=>sum+row.points,0)!==part.points)fail('rubric does not match part points');
   points+=part.points;
  }
  if(points!==25)fail('case must total 25 training points');
  if(!Array.isArray(entry.figure_references))fail('figure decisions');
  for(const reference of entry.figure_references){
   if(!source.has(reference.question_id)||!text(reference.scope_md)||!Array.isArray(reference.part_ids)||!reference.part_ids.length||!unique(reference.part_ids)||reference.part_ids.some(id=>!entry.parts.some(part=>part.id===id)))fail('figure scope');
  }
  if(!entry.audit||!Array.isArray(entry.audit.checked)||entry.audit.checked.length<2||!entry.audit.checked.every(text)||!Array.isArray(entry.audit.unresolved)||!entry.audit.unresolved.every(text))fail('audit evidence');
  if(entry.audit.unresolved.length)fail('unresolved content review');
  result.push({...entry,subject,points,group_title:groups.find(group=>group.id===entry.group).title,editorial_note:bank.editorial_note,prompt_md:comprehensivePrompt(entry)});
 }
 if(knownGroups.size!==counts.size||[...counts.values()].some(count=>count!==2))throw Error('Each topic needs two comprehensive cases: '+subject);
 return result;
}

export function prepareTrainingPapers(bank,cases){
 if(bank?.version!==1||!text(bank.editorial_note)||!Array.isArray(bank.papers)||bank.papers.length!==3)throw Error('Invalid timed training papers');
 const questions=new Map(cases.map(question=>[question.id,question])),seen=new Set(),used=new Set();
 return bank.papers.map(paper=>{
  const fail=reason=>{throw Error('Invalid timed paper '+paper.id+': '+reason);};
  if(!/^P0[1-3]$/.test(paper.id)||seen.has(paper.id)||!text(paper.title)||!text(paper.instructions_md)||!Number.isInteger(paper.minutes)||paper.minutes<30||paper.minutes>240)fail('metadata');
  seen.add(paper.id);
  if(!Array.isArray(paper.question_ids)||paper.question_ids.length!==4||!unique(paper.question_ids)||paper.question_ids.some(id=>!questions.has(id)))fail('four known cases');
  const selected=paper.question_ids.map(id=>questions.get(id));
  if(selected.filter(question=>question.subject==='micro').length!==2||selected.filter(question=>question.subject==='macro').length!==2||selected.reduce((sum,question)=>sum+question.points,0)!==100)fail('two cases per subject and 100 points');
  for(const id of paper.question_ids){if(used.has(id))fail('case repeated across diagnostic papers');used.add(id);}
  return {...paper,points:100,editorial_note:bank.editorial_note};
 });
}
