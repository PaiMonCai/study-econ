import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const hash=text=>createHash('sha256').update(text).digest('hex');
const sources=[],cards=[];
const microGroups=[['01','02'],['01','02'],['03'],['04'],['04','02'],['05'],['06'],['07'],['08'],['09'],['10'],['01','02','03','04','08','09','10']];
const macroGroups=[['08','10'],['07','06'],['01'],['03'],['04','05'],['09'],['02'],['02'],['07','08','10'],['06','03','09']];
function formulaGroups(subject,number){
 if(subject==='micro'){
  if(number===1)return['01','02'];if(number<=12)return number===10?['02']:['01'];if(number<=17)return['03'];if(number<=26)return['04'];if(number===27)return['02'];if(number<=31)return['05'];if(number<=37)return['06'];if(number<=39)return['07'];if(number<=41)return['08'];if(number===42)return['09'];if(number<=44)return['02','08'];if(number<=47)return['09'];if(number<=52)return['10'];return['06'];
 }
 if(number===1)return['08','10'];if(number===2)return['10'];if(number===3)return['06'];if(number===4)return['08'];if(number<=7)return['07'];if(number===8)return['06'];if(number<=18)return['01'];if(number===19)return['03','08'];if(number<=23)return['03'];if(number===24)return['04','07'];if(number<=26)return['04'];if(number<=30)return['05'];if(number<=35)return['09'];if(number<=40)return['02'];if(number<=42)return['08'];if(number===43)return['07'];if(number===44)return['10'];if(number===45)return['07','08'];if(number===46)return['06'];if(number===47)return['04','05'];return['09'];
}
function sections(text){
 const lines=text.replace(/\r\n/g,'\n').split('\n'),result=[];let chapter='',current=null;
 for(let i=0;i<lines.length;i++){
  const match=/^(#{1,4}) (.+)$/.exec(lines[i]);
  if(match){if(current){current.body=current.lines.join('\n').trim();result.push(current);current=null;}if(match[1]==='##')chapter=match[2];if(match[1]==='###')current={heading:match[2],chapter,line:i+1,lines:[]};}
  else if(current)current.lines.push(lines[i]);
 }
 if(current){current.body=current.lines.join('\n').trim();result.push(current);}return result;
}
async function source(file,subject,pick){
 const raw=await readFile(path.join(root,file)),text=raw.toString('utf8'),sourceId='S'+(sources.length+1);
 sources.push({id:sourceId,file,sha256:hash(raw)});
 for(const section of sections(text)){const selected=pick(section);if(!selected)continue;
  if(!section.body||/!\[/.test(section.body))throw Error('Empty or image-dependent source: '+section.heading);
  cards.push({...selected,subject,chapter:section.chapter,source_id:sourceId,source_heading:section.heading,source_line:section.line,body_md:section.body,body_sha256:hash(section.body)});
 }
}
const chapterNumber=s=>{const names=['一','二','三','四','五','六','七','八','九','十','十一','十二'];const m=/^第(.+?)章/.exec(s.chapter);return m?names.indexOf(m[1])+1:0;};
await source('微观/01_复习手册/02_背诵与公式/人大802微观基础与公式手册.md','micro',s=>{const m=/^(M\d{2}) (.+)$/.exec(s.heading);return m?{id:'F'+m[1],title:m[2],kind:'formula',groups:formulaGroups('micro',Number(m[1].slice(1)))}:null;});
await source('宏观/01_复习手册/人大802宏观基础与公式手册.md','macro',s=>{const m=/^([AK]\d{2}) (.+)$/.exec(s.heading);if(!m)return null;return{id:(m[1][0]==='A'?'F':'C')+m[1],title:m[2],kind:m[1][0]==='A'?'formula':'condition',groups:m[1][0]==='K'?['01','02','03','04','05','06','07','08','09','10']:formulaGroups('macro',Number(m[1].slice(1)))};});
const microComparisons=[['01','02'],['01'],['01'],['04'],['04'],['08'],['02','08','09'],['03'],['02','08'],['10'],['09']];
let microConcept=0;
await source('微观/01_复习手册/02_背诵与公式/人大802微观背诵手册.md','micro',s=>{const chapter=chapterNumber(s);if(!chapter||/^M\d+/.test(s.heading))return null;return{id:'MC'+String(++microConcept).padStart(2,'0'),title:s.heading.replace(/^可直接背诵：/,''),kind:'concept',groups:chapter===12?microComparisons[microConcept-12]:microGroups[chapter-1]};});
let macroConcept=0;
await source('宏观/01_复习手册/人大802宏观背诵手册.md','macro',s=>s.heading==='本章可直接背诵'?{id:'AC'+String(++macroConcept).padStart(2,'0'),title:s.chapter.replace(/^第.+?章 /,''),kind:'concept',groups:macroGroups[chapterNumber(s)-1]}:null);
await source('政经/01_复习手册/人大802政治经济学背诵手册.md','political',s=>{
 const m=/^(计算)?(\d+)\.(\d+) (.+)$/.exec(s.heading);if(!m)return null;const chapter=Number(m[2]);
 const groups=chapter===0?['01','08']:chapter===11?['10']:chapter===6?['06','07']:chapter===7?['06','07']:[String(chapter).padStart(2,'0')];
 return{id:(m[1]?'PF':'PC')+m[2]+'_'+m[3],title:m[4],kind:m[1]?'formula':'concept',groups};
});
if(new Set(cards.map(c=>c.id)).size!==cards.length)throw Error('Duplicate card ID');
for(const card of cards)if(!card.groups?.length||card.groups.some(g=>!/^0[1-9]$|^10$/.test(g)))throw Error('Invalid group mapping: '+card.id);
const result={version:1,description:'已交付手册原条目摘录；专题关联由编者整理，不表示每题逐式对应。',sources,cards};
await writeFile(path.join(here,'content/recall.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cards:cards.length,subjects:Object.fromEntries(['micro','macro','political'].map(s=>[s,cards.filter(c=>c.subject===s).length])),kinds:Object.fromEntries(['formula','condition','concept'].map(k=>[k,cards.filter(c=>c.kind===k).length]))}));
