import {createHash} from 'node:crypto';
import {teachingLines} from './build-solutions.mjs';

const sha256=value=>createHash('sha256').update(value).digest('hex');
const text=value=>typeof value==='string'&&value.trim().length>0;

export function questionReviewHash(question){
 return sha256(JSON.stringify([question.prompt_md,question.answer_md,question.outline_md,question.pitfalls_md]));
}

export function prepareExamBank(bank,subject,questions){
 if(bank?.version!==1||bank.subject!==subject||!text(bank.label)||!Array.isArray(bank.questions))throw Error('Invalid exam review bank: '+subject);
 const expected=new Map(questions.map(q=>[q.id,q])),entries=new Map();
 for(const entry of bank.questions){
  const question=expected.get(entry.id);
  if(!question||entries.has(entry.id))throw Error('Unknown or duplicate exam review: '+entry.id);
  entries.set(entry.id,prepareExamReview(question,entry,bank.label));
 }
 if(entries.size!==expected.size)throw Error('Incomplete exam review bank: '+subject+' '+entries.size+'/'+expected.size);
 return entries;
}

export function prepareExamReview(question,entry,label='编者逐题考试作答审校'){
 const fail=reason=>{throw Error('Invalid exam review '+question.id+': '+reason);};
 if(entry.id!==question.id||entry.source_sha256!==questionReviewHash(question))fail('source hash changed');
 if(!['revised','confirmed','needs-source'].includes(entry.verdict))fail('verdict');
 for(const field of ['method_md','pitfalls_md','recap_md'])if(!text(entry[field]))fail(field);
 if(!Array.isArray(entry.steps)||entry.steps.length<2)fail('steps');
 if(new Set(entry.steps.map(step=>step.title)).size!==entry.steps.length)fail('duplicate step titles');
 if(!entry.audit||!Array.isArray(entry.audit.checked)||entry.audit.checked.length<2||!entry.audit.checked.every(text)||!Array.isArray(entry.audit.changes)||!entry.audit.changes.length||!entry.audit.changes.every(text)||!Array.isArray(entry.audit.unresolved)||!entry.audit.unresolved.every(text))fail('audit evidence');
 if((entry.verdict==='needs-source')!==!!entry.audit.unresolved.length)fail('unresolved status');
 if(entry.prompt_md!==undefined&&!text(entry.prompt_md))fail('corrected prompt');
 const steps=entry.steps.map((step,index)=>{
  if(!text(step.title)||!text(step.body_md)||!Array.isArray(step.uses)||!step.uses.length||!step.uses.every(text))fail('step '+(index+1));
  if(/运用.+完成本问|^解答第.+步$/.test(step.title)||step.body_md.includes('****')||step.body_md.trimStart().startsWith('**'+step.title))fail('unfinished step layout '+(index+1));
  if(/(?:^|\n)\s*[，；]/.test(step.body_md))fail('orphan punctuation '+(index+1));
  return {id:'exam-step-'+(index+1),title:step.title,uses:step.uses,body_md:step.body_md,lines_md:teachingLines(step.body_md,{inlineEquations:false,clauseBreaks:false}),knowledge_indexes:[index]};
 });
 const answer_md=steps.map(step=>'**'+step.title+'**\n\n'+step.body_md).join('\n\n');
 return {exam:true,label,verdict:entry.verdict,method_md:entry.method_md,pitfalls_md:entry.pitfalls_md,recap_md:entry.recap_md,...(entry.prompt_md===undefined?{}:{prompt_md:entry.prompt_md}),steps,audit:entry.audit,source:{kind:label,source_sha256:entry.source_sha256,original_answer_sha256:sha256(question.answer_md),review_sha256:sha256(JSON.stringify(entry)),answer_sha256:sha256(answer_md)}};
}
