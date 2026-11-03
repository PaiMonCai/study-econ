import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {prepareExamBank} from './build-exam-review.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const lines=['# 人大802逐题考试作答审校总稿','','本稿覆盖练习室三科300道编者训练题，逐题列出选法理由、完整作答、条件与易错、背诵主线和审校记录。作答为编者审校，不是官方评分答案；来源PDF用于追溯题型，参数与条件以当前题干为准。原题库与审校前答案保留。','','## 阅读方法','','先读题干并遮住正文，说清本题为何选这个方法；再逐步对照列式和论证。最后只看步骤标题独立复现，逐项核对设问与结论。',''];
let count=0;
for(const [key,name] of [['micro','微观'],['macro','宏观'],['political','政经']]){
 const source=JSON.parse(await readFile(path.join(here,'content',key+'.json'),'utf8'));
 const bank=JSON.parse(await readFile(path.join(here,'content','exam-review-'+key+'.json'),'utf8'));
 const reviews=prepareExamBank(bank,key,source.questions);
 lines.push('## '+name,'');
 for(const question of source.questions){
  const review=reviews.get(question.id);count++;
  lines.push('### '+question.id+' '+question.title,'','#### 题目','',review.prompt_md||question.prompt_md,'');
  if(review.prompt_md)lines.push('题干有文字更正，更正前题干与依据见本题审校记录及保留原题库。','');
  lines.push('#### 为什么用这个方法','',review.method_md,'','#### 规范作答','');
  for(const [index,step] of review.steps.entries())lines.push('##### '+(index+1)+' '+step.title,'','所用知识：'+step.uses.join('、'),' ',step.body_md,'');
  lines.push('#### 条件与易错','',review.pitfalls_md,'','#### 背诵主线','',review.recap_md,'','#### 审校记录','',...review.audit.checked.map(item=>'- 核验：'+item),...review.audit.changes.map(item=>'- 修改或确认：'+item),'','#### 题型来源','',...question.source_refs.map(ref=>'- '+ref.exam_id+'；'+ref.source+'，PDF物理页'+ref.pages+'。'+ref.note),'');
 }
}
if(count!==300)throw Error('Expected 300 reviewed answers');
const outputs=[path.join(here,'docs','exam-review-guide.md')];
if(process.argv[2])outputs.push(path.resolve(process.argv[2]));
for(const output of new Set(outputs)){
 if(path.extname(output).toLowerCase()!=='.md')throw Error('Output must be Markdown');
 await mkdir(path.dirname(output),{recursive:true});await writeFile(output,lines.join('\n'),'utf8');
}
console.log(JSON.stringify({questions:count,outputs}));
