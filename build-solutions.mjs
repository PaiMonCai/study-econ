import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
function sentenceLines(source){
 const chunks=[];let start=0,inline=false,display=false,bold=false;
 for(let i=0;i<source.length;i++){
  if(source[i]==='$'&&source[i-1]!=='\\'){if(source[i+1]==='$'){display=!display;i++;}else if(!display)inline=!inline;continue;}
  if(!inline&&!display&&source.slice(i,i+2)==='**'){bold=!bold;i++;continue;}
  if(!inline&&!display&&!bold&&(source[i]==='。'||source.slice(i,i+2)==='\n\n')){let end=i+1;while(source[end]==='\n')end++;chunks.push(source.slice(start,end));start=end;i=end-1;}
 }
 if(source.slice(start))chunks.push(source.slice(start));return chunks;
}
export function teachingLines(source,{inlineEquations=true,clauseBreaks=true}={}){
 const chunks=[];let start=0,mathStart=-1,display=false,bold=false;
 for(let i=0;i<source.length;i++){
  if(source[i]==='$'&&source[i-1]!=='\\'){
   const pair=source[i+1]==='$';
   if(mathStart<0){mathStart=i;display=pair;if(pair)i++;continue;}
   if(pair!==display)continue;
   const endMath=i+(pair?2:1),expression=source.slice(mathStart+(pair?2:1),i);
   if(!bold&&(display||inlineEquations&&/[=<>]|\\(?:approx|int|sum|frac)\b/.test(expression))){
    if(mathStart>start)chunks.push(source.slice(start,mathStart));
    let end=endMath;while(/[\s，。；、,;:：]/u.test(source[end]||'')&&end<source.length)end++;
    chunks.push(source.slice(mathStart,end));start=end;i=end-1;
   }else if(pair)i++;
   mathStart=-1;display=false;continue;
  }
  if(mathStart>=0)continue;
  if(source.slice(i,i+2)==='**'){bold=!bold;i++;continue;}
  if(!bold&&(source[i]==='。'||source.slice(i,i+2)==='\n\n'||clauseBreaks&&(source[i]==='；'||source[i]===';'||(source[i]==='，'&&/^(?:所以|故|得到|于是|因此|从而|可得|最后|再)/u.test(source.slice(i+1)))))){
   let end=i+1;while(source[end]==='\n')end++;chunks.push(source.slice(start,end));start=end;i=end-1;
  }
 }
 if(start<source.length)chunks.push(source.slice(start));
 const lines=[];let prefix='';
 for(const chunk of chunks){if(!chunk.trim()){if(lines.length)lines[lines.length-1]+=chunk;else prefix+=chunk;}else{lines.push(prefix+chunk);prefix='';}}
 if(prefix&&lines.length)lines[lines.length-1]+=prefix;
 const combined=[];
 for(let i=0;i<lines.length;i++){
  const text=lines[i].trim(),next=lines[i+1];
  if(text.length<=28&&!/[\$。；;]/u.test(text)&&next&&/^\s*\$/.test(next)){combined.push(lines[i]+next);i++;}
  else combined.push(lines[i]);
 }
 return combined;
}
export function splitAnswer(source){
 const markers=[...source.matchAll(/^(?:\*\*[^*\n]{1,100}\*\*|（[一二三四五六七八九十]+）)/gm)].map(m=>m.index);
 let chunks;
 if(markers.length>=2){const starts=[...new Set([0,...markers])];chunks=starts.map((start,i)=>source.slice(start,starts[i+1]??source.length));}
 else chunks=sentenceLines(source);
 const merged=[];for(const chunk of chunks){if(/^\s*\$\$/.test(chunk)&&merged.length)merged[merged.length-1]+=chunk;else merged.push(chunk);}
 return merged.filter(Boolean).map((body_md,index)=>{const lead=body_md.trim().match(/^\*\*([^*\n]+)\*\*/);const political=body_md.trim().match(/^(（[一二三四五六七八九十]+）)/);return{id:'step-'+(index+1),title:lead?lead[1].replace(/。$/,''):political?political[1]+'论证':'解答第'+(index+1)+'步',body_md,lines_md:teachingLines(body_md)};});
}
export function splitOutline(source){
 const parts=[];let start=0,inline=false,display=false;
 for(let i=0;i<source.length;i++){
  if(source[i]==='$'&&source[i-1]!=='\\'){if(source[i+1]==='$'){display=!display;i++;}else if(!display)inline=!inline;continue;}
  if(inline||display)continue;
  if(/[→；;]/u.test(source[i])||source[i]==='。'||(source[i]==='，'&&/^(?:再|最后|然后)/u.test(source.slice(i+1)))){const part=source.slice(start,i+1).trim();if(part)parts.push(part);start=i+1;}
 }
 const tail=source.slice(start).trim();if(tail)parts.push(tail);return parts;
}
function bindKnowledge(steps,knowledge,answer){
 let offset=0;
 for(const step of steps){
  const end=offset+step.body_md.length;
  step.knowledge_indexes=knowledge.flatMap((item,index)=>{
   if(item.source_field!=='answer_md')return [];
   let start=answer.indexOf(item.application_md);
   while(start!==-1){
    if(answer.slice(Math.max(offset,start),Math.min(end,start+item.application_md.length)).trim())return [index];
    start=answer.indexOf(item.application_md,start+1);
   }
   return [];
  });
  offset=end;
 }
 return steps;
}
export function prepareStudyCorrection(question,solution,diagrams){
 const corrections=diagrams.filter(d=>d.erratum).map(d=>({...d.erratum,diagram_id:d.id}));
 if(!corrections.length)return null;
 let answer=question.answer_md;
 for(const correction of corrections){
  if(!correction.original_quote||!correction.explanation||!answer.includes(correction.original_quote))throw Error('Study correction no longer matches source: '+question.id);
  answer=answer.replaceAll(correction.original_quote,correction.explanation);
 }
 const knowledge=solution.knowledge.map(item=>{
  if(item.source_field!=='answer_md')return {...item};
  const start=question.answer_md.indexOf(item.application_md),end=start+item.application_md.length;
  const overlapping=corrections.filter(c=>{const at=question.answer_md.indexOf(c.original_quote);return at<end&&at+c.original_quote.length>start;});
  const application=overlapping.length?overlapping.map(c=>c.explanation).join('\n\n'):item.application_md;
  return {...item,application_md:application,explanation:'**本题用法：** '+application,corrected:overlapping.length>0};
 });
 return {answer_md:answer,steps:bindKnowledge(splitAnswer(answer),knowledge,answer),knowledge,corrections,source:{kind:'依据已有图形勘误整理的作答显示稿',original_answer_sha256:hash(question.answer_md),study_answer_sha256:hash(answer)}};
}
export function prepareSolution(question,subject,recallCards,annotation){
 const steps=splitAnswer(question.answer_md);
 if(annotation?.id!==question.id||!Array.isArray(annotation.knowledge)||annotation.knowledge.length<2||annotation.knowledge.length>5||!annotation.recap_md)throw Error('Missing knowledge review: '+question.id);
 const knowledge=annotation.knowledge.map(item=>{
  if(!item.title||!['outline_md','answer_md','prompt_md'].includes(item.source_field)||!item.application_md||!question[item.source_field].includes(item.application_md)||!Array.isArray(item.card_ids)||item.card_ids.some(id=>!recallCards.some(c=>c.id===id&&c.subject===subject)))throw Error('Invalid knowledge review: '+question.id);
  return{...item,explanation:'**本题用法：** '+item.application_md};
 });
 bindKnowledge(steps,knowledge,question.answer_md);
 return{steps,knowledge,recap_md:annotation.recap_md,source:{answer_sha256:hash(question.answer_md),joined_steps_sha256:hash(steps.map(s=>s.body_md).join('')),knowledge_sha256:hash(JSON.stringify(annotation)),editorial_review:true,preserved:steps.map(s=>s.body_md).join('')===question.answer_md}};
}
