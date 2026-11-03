import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const readJSON=async name=>JSON.parse(await readFile(path.join(here,'content',name),'utf8'));
const cards=(await readJSON('recall.json')).cards;
const subjects=[['micro','微观经济学'],['macro','宏观经济学'],['political','政治经济学']];
const lines=[
 '# 人大802专题知识串联总稿',
 '',
 '本文汇集练习室已有的30篇专题总结。内容为编者依据既有题库、知识应用注释和配套手册作出的串联整理；其中明示的补充模型与推导不属于教材逐字引用，也不冒充原卷题目。各式适用条件、参数和来源身份以对应专题及原题说明为准。',
 '',
 '建议按“先读一个环节 → 对照规范作答 → 遮住复述”的顺序学习：先说清这一环节解决什么问题，再沿对应题目的规范过程确认知识点怎样应用，最后只看阶段标题或背诵主线复述。',
 '',
 '本稿保留原专题Markdown公式与对照表；题号、题名和卡片标题用于回到练习室查阅。',
 ''
];
let topicCount=0,stageCount=0;
for(const [key,name] of subjects){
 const bank=await readJSON(key+'.json');
 const summary=await readJSON('topics-'+key+'.json');
 const questions=new Map(bank.questions.map(q=>[q.id,q]));
 const subjectCards=new Map(cards.filter(c=>c.subject===key).map(c=>[c.id,c]));
 const questionLabel=id=>{
  const q=questions.get(id);if(!q)throw Error('Unknown question '+id);
  return `${id}：${q.title}`;
 };
 lines.push(`## ${name}`,'',summary.editorial_note,'');
 for(const topic of summary.topics){
  topicCount++;
  lines.push(`### 专题${topic.group} ${topic.title}`,'',topic.lead_md,'');
  for(const [index,stage] of topic.stages.entries()){
   stageCount++;
   lines.push(`#### 第${index+1}环节 ${stage.title}`,'',stage.explanation_md,'');
   if(stage.question_ids.length)lines.push('对应规范作答：','',...stage.question_ids.map(id=>'- '+questionLabel(id)),'');
  }
  if(topic.comparison_md)lines.push('#### 模型与概念对照','',topic.comparison_md,'');
  lines.push('#### 条件与易错','',topic.boundaries_md,'','#### 背诵主线','',topic.recall_md,'','#### 对应题目','',...topic.source_question_ids.map(id=>'- '+questionLabel(id)),'');
  if(topic.card_ids.length){
   lines.push('#### 配套知识卡','',...topic.card_ids.map(id=>{
    const card=subjectCards.get(id);if(!card)throw Error('Unknown card '+id);
    return `- ${id}：${card.title}`;
   }),'');
  }
  lines.push('#### 来源与编制说明','',topic.source_note,'');
 }
}
if(topicCount!==30)throw Error('Expected 30 topics, got '+topicCount);
const text=lines.join('\n');
const outputs=[path.join(here,'docs','topic-guide.md')];
if(process.argv[2])outputs.push(path.resolve(process.argv[2]));
for(const target of new Set(outputs)){
 if(path.extname(target).toLowerCase()!=='.md')throw Error('Output must be a Markdown file');
 await mkdir(path.dirname(target),{recursive:true});
 await writeFile(target,text,'utf8');
}
console.log(JSON.stringify({topics:topicCount,stages:stageCount,characters:text.length,chineseCharacters:(text.match(/\p{Script=Han}/gu)||[]).length,outputs:[...new Set(outputs)]}));
