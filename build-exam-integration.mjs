import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const partHash=part=>createHash('sha256').update(JSON.stringify({prompt_md:part.prompt_md,answer_md:part.answer_md})).digest('hex');
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const text=value=>typeof value==='string'&&value.trim().length>0;

export async function loadIntegrationInputs(directory){
 const sources={},hashes={};
 for(const subject of ['micro','macro']){
  const files={};
  for(const name of [subject,'training-'+subject,'exam-review-'+subject,'comprehensive-'+subject]){
   const file=name+'.json',raw=await readFile(path.join(directory,'content',file));
   files[name]=JSON.parse(raw);hashes[file]=hash(raw);
  }
  const original=new Map(files[subject].questions.map(question=>[question.id,question]));
  sources[subject]=[
   ...files['training-'+subject].questions.map(question=>({id:question.id,kind:'specialist',title:original.get(question.id).title,parts:question.parts})),
   ...files['comprehensive-'+subject].cases.map(question=>({...question,kind:'comprehensive'})),
  ];
 }
 return{sources,hashes};
}

export function prepareExamIntegration(input,banks,legacy){
 const fail=message=>{throw Error('Invalid unified exam integration: '+message);};
 if(input?.version!==1||!Array.isArray(input.entries)||!input.baseline||!input.legacy_source_hashes)fail('header');
 if(JSON.stringify(Object.keys(input.legacy_source_hashes).sort())!==JSON.stringify(Object.keys(legacy.hashes).sort()))fail('source file set');
 for(const [file,digest] of Object.entries(legacy.hashes))if(input.legacy_source_hashes[file]!==digest)fail('stale source '+file);
 const byCase=new Map(Object.entries(banks).flatMap(([subject,bank])=>bank.cases.map(question=>[question.id,{...question,subject}])));
 const bySource=new Map(Object.entries(legacy.sources).flatMap(([subject,questions])=>questions.map(question=>[question.id,{...question,subject}])));
 const aliases={},seen=new Set(),summary={};
 for(const subject of ['micro','macro'])summary[subject]={source_questions:legacy.sources[subject].length,source_parts:legacy.sources[subject].reduce((n,q)=>n+q.parts.length,0),duplicate:0,supplemented:0,independent:0};
 for(const entry of input.entries){
  const source=bySource.get(entry.source_id);
  if(!source||seen.has(entry.source_id)||entry.source_kind!==source.kind||entry.title!==source.title||!text(entry.reason)||!['duplicate','supplemented','independent'].includes(entry.disposition))fail('source identity '+entry.source_id);
  seen.add(entry.source_id);
  if(!Array.isArray(entry.part_map)||entry.part_map.length!==source.parts.length)fail('missing source parts '+entry.source_id);
  const partIds=new Set(),targets=new Map();let added=false,independent=false;
  for(const mapping of entry.part_map){
   if(partIds.has(mapping.source_part_id)||!source.parts.some(part=>part.id===mapping.source_part_id)||!['covered','added','new_type'].includes(mapping.decision)||!text(mapping.reason)||!Array.isArray(mapping.targets)||!mapping.targets.length)fail('source part '+entry.source_id+'/'+mapping.source_part_id);
   partIds.add(mapping.source_part_id);let changedTarget=false,newTarget=false;
   for(const target of mapping.targets){
    const question=byCase.get(target.case_id);
    if(!question||question.subject!==source.subject||!Array.isArray(target.part_ids)||!target.part_ids.length||new Set(target.part_ids).size!==target.part_ids.length)fail('target '+entry.source_id+'/'+mapping.source_part_id);
    const baseline=input.baseline[question.id];
    newTarget||=!baseline;
    for(const id of target.part_ids){
     const part=question.parts.find(part=>part.id===id);
     if(!part)fail('unknown formal target '+question.id+'/'+id);
     changedTarget||=baseline?.[id]!==partHash(part);
    }
    const ids=targets.get(question.id)||new Set();target.part_ids.forEach(id=>ids.add(id));targets.set(question.id,ids);
   }
   if(mapping.decision==='added'&&!changedTarget)fail('addition has no changed formal answer '+entry.source_id+'/'+mapping.source_part_id);
   if(mapping.decision==='new_type'&&!newTarget)fail('independent type was not added '+entry.source_id+'/'+mapping.source_part_id);
   added||=mapping.decision==='added';independent||=mapping.decision==='new_type';
  }
  const disposition=independent?'independent':added?'supplemented':'duplicate';
  if(entry.disposition!==disposition)fail('incorrect disposition '+entry.source_id);
  aliases[entry.source_id]=[...targets].map(([case_id,ids])=>({case_id,part_ids:[...ids].sort((a,b)=>Number(a)-Number(b))})).sort((a,b)=>byCase.get(a.case_id).order-byCase.get(b.case_id).order);
  summary[source.subject][disposition]++;
 }
 if(seen.size!==bySource.size)fail('unmapped old questions '+[...bySource.keys()].filter(id=>!seen.has(id)).join(','));
 return{...input,summary,aliases};
}
