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
export function splitAnswer(source){
 const markers=[...source.matchAll(/^(?:\*\*[^*\n]{1,100}\*\*|（[一二三四五六七八九十]+）)/gm)].map(m=>m.index);
 let chunks;
 if(markers.length>=2){const starts=[...new Set([0,...markers])];chunks=starts.map((start,i)=>source.slice(start,starts[i+1]??source.length));}
 else chunks=sentenceLines(source);
 const merged=[];for(const chunk of chunks){if(/^\s*\$\$/.test(chunk)&&merged.length)merged[merged.length-1]+=chunk;else merged.push(chunk);}
 return merged.filter(Boolean).map((body_md,index)=>{const lead=body_md.trim().match(/^\*\*([^*\n]+)\*\*/);const political=body_md.trim().match(/^(（[一二三四五六七八九十]+）)/);return{id:'step-'+(index+1),title:lead?lead[1].replace(/。$/,''):political?political[1]+'论证':'解答第'+(index+1)+'步',body_md,lines_md:sentenceLines(body_md)};});
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
export function prepareSolution(question,subject,recallCards,annotation){
 const steps=splitAnswer(question.answer_md);
 if(annotation?.id!==question.id||!Array.isArray(annotation.knowledge)||annotation.knowledge.length<2||annotation.knowledge.length>5||!annotation.recap_md)throw Error('Missing knowledge review: '+question.id);
 const knowledge=annotation.knowledge.map(item=>{
  if(!item.title||!['outline_md','answer_md','prompt_md'].includes(item.source_field)||!item.application_md||!question[item.source_field].includes(item.application_md)||!Array.isArray(item.card_ids)||item.card_ids.some(id=>!recallCards.some(c=>c.id===id&&c.subject===subject)))throw Error('Invalid knowledge review: '+question.id);
  return{...item,explanation:'**本题用法：** '+item.application_md};
 });
 return{steps,knowledge,recap_md:annotation.recap_md,source:{answer_sha256:hash(question.answer_md),joined_steps_sha256:hash(steps.map(s=>s.body_md).join('')),knowledge_sha256:hash(JSON.stringify(annotation)),editorial_review:true,preserved:steps.map(s=>s.body_md).join('')===question.answer_md}};
}
