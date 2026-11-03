import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareTrainingBank,prepareComprehensiveBank,prepareTrainingPapers,trainingClassNames,comprehensivePrompt} from './build-training.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const read=name=>readFile(path.join(here,'content',name+'.json'),'utf8').then(JSON.parse);
const subjects=[];
for(const [key,name] of [['micro','微观'],['macro','宏观']]){
 const [source,reviews,structured,bank]=await Promise.all([read(key),read('exam-review-'+key),read('training-'+key),read('comprehensive-'+key)]);
 subjects.push({key,name,source,structured:prepareTrainingBank(structured,key,source.questions,reviews),cases:prepareComprehensiveBank(bank,key,source.questions,source.groups)});
}
const cases=subjects.flatMap(subject=>subject.cases),paperBank=await read('training-papers'),papers=prepareTrainingPapers(paperBank,cases),byId=new Map(cases.map(question=>[question.id,question]));
const workbook=['# 人大802宏微观综合大题训练','','本稿含微观、宏观各20道编者综合题，覆盖每科10个专题。每题25分，评分只用于保守学习自评，不是学校试题或评分细则。题目集中列在前部，参考作答与评分在后部。原200道专项题及旧答案独立保留。','','## 题目区',''];
for(const subject of subjects){
 workbook.push('### '+subject.name,'');
 for(const question of subject.cases)workbook.push('#### '+question.id+' '+question.title,'',question.parts.length+'问；25分；建议'+question.minutes+'分钟。','',comprehensivePrompt(question),'');
}
workbook.push('## 参考作答与评分区','');
for(const subject of subjects){
 workbook.push('### '+subject.name+'参考作答','');
 for(const question of subject.cases){
  workbook.push('#### '+question.id+' '+question.title,'','**起笔与解题主线**','',question.method_md,'');
  for(const part of question.parts){
   workbook.push('##### 第'+part.id+'问 '+(part.title||'参考作答')+'（'+part.points+'分）','',part.answer_md,'','评分参考：','',...part.rubric.map(row=>'- '+row.points+'分：'+row.criterion_md),'');
  }
  workbook.push('**条件与易错**','',question.pitfalls_md,'','**整题复现主线**','',question.recap_md,'','**与专项题的联系**','',question.connections_md,'','对应专项题：'+question.source_question_ids.join('、')+'。','','**来源与图形边界**','',question.source_note_md,'',question.diagram_decision_md,'');
  for(const reference of question.figure_references)workbook.push('- '+reference.question_id+'的配图，限第'+reference.part_ids.join('、')+'问：'+reference.scope_md);
  workbook.push('');
 }
}
const classification=['# 宏微观200题分层与结构化设问记录','','分类按题目实际任务判断：专项训练集中练模型或边界；连续设问在同一框架下串联多项任务；综合锚点已有较完整的推导、比较或证据分析。分类不表示学校难度评级或命中概率。原题、有效题干更正、既有规范作答均保持独立来源。',''];
for(const subject of subjects){
 classification.push('## '+subject.name,'','| 题号 | 分层 | 判断依据 | 综合训练 |','|---|---|---|---|');
 for(const entry of subject.structured.values())classification.push('| '+[entry.id,trainingClassNames[entry.classification],entry.classification_reason,entry.comprehensive_ids.join('、')].map(value=>value.replaceAll('|','／').replaceAll('\n',' ')).join(' | ')+' |');
 classification.push('');
}
const paperLines=['# 宏微观限时训练卷','',paperBank.editorial_note,'','各卷均可从网站打印仅含题目的版本。未预看参考作答时用于诊断；已做过题目时用于复现与配时，不能据熟题成绩直接推断陌生考试得分。',''];
for(const paper of papers){
 paperLines.push('## '+paper.id+' '+paper.title,'',paper.instructions_md,'');
 for(const [index,id] of paper.question_ids.entries()){
  const question=byId.get(id);
  paperLines.push('### 第'+(index+1)+'题 '+(question.subject==='micro'?'微观':'宏观')+'（25分）','',comprehensivePrompt(question),'');
 }
 paperLines.push('参考作答与逐问评分：见综合大题训练总稿中的'+paper.question_ids.join('、')+'。','');
}
const outputs=[];
for(const [name,studyName,lines] of [['comprehensive-guide.md','人大802宏微观综合大题训练与评分.md',workbook],['training-classification.md','人大802宏微观200题分层记录.md',classification],['timed-papers.md','人大802宏微观限时训练卷.md',paperLines]]){
 const destinations=[path.join(here,'docs',name)];if(process.argv[2])destinations.push(path.join(path.resolve(process.argv[2]),studyName));
 for(const destination of destinations){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,lines.join('\n').replace(/[\t ]+$/gm,'')+'\n','utf8');outputs.push(destination);}
}
console.log(JSON.stringify({structured:200,cases:cases.length,papers:papers.length,outputs}));
