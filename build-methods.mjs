import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const fail=message=>{throw Error('Method sheets: '+message);};
const unique=values=>Array.isArray(values)&&new Set(values).size===values.length;
export function prepareMethodSheets(input,banks,subjects){
 if(input?.version!==1||input.sheets?.length!==20||!input.editorial_note)fail('twenty editorial sheets required');
 const nodes=new Map(Object.values(banks).flatMap(bank=>bank.nodes).map(node=>[node.id,node]));
 const used=new Set(Object.values(banks).flatMap(bank=>bank.applications.flatMap(app=>app.parts.flatMap(part=>part.node_ids))));
 const supplements=new Set([...nodes.keys()].filter(id=>!used.has(id))),tested=new Set(),ids=new Set();
 const catalog=new Map(subjects.flatMap(subject=>subject.questions.map(question=>[question.id,{...question,subject:subject.key}])));
 if(!unique(input.sheets.map(sheet=>sheet.id)))fail('duplicate sheet');
 for(const [subject,bank] of Object.entries(banks)){
  const file='concept-map-'+subject+'.json';
  if(input.source_hashes?.[file]!==createHash('sha256').update(bank.raw).digest('hex'))fail('stale source '+file);
 }
 for(const sheet of input.sheets){
  if(!['micro','macro'].includes(sheet.subject)||!banks[sheet.subject].topics.some(topic=>topic.id===sheet.id)||sheet.id!==sheet.subject+'-'+sheet.group)fail('invalid topic');
  if(!sheet.title||!sheet.lead_md||!sheet.starter_md||sheet.decisions?.length!==4||sheet.memory?.length!==3||sheet.comparison?.length<3)fail('incomplete summary '+sheet.id);
  for(const row of sheet.decisions)if(['when_md','start_md','branch_md','check_md'].some(key=>typeof row[key]!=='string'||!row[key].trim()))fail('incomplete decision');
  if(sheet.comparison.some(row=>row.length!==3||row.some(value=>typeof value!=='string'||!value.trim())))fail('invalid comparison');
  if(!unique(sheet.node_ids)||sheet.node_ids.some(id=>nodes.get(id)?.topic_id!==sheet.id))fail('invalid node reference');
  if(!unique(sheet.reference_node_ids)||sheet.reference_node_ids.some(id=>!nodes.has(id)||!id.startsWith(sheet.subject==='micro'?'KMI':'KMA'))||sheet.node_ids.some(id=>!sheet.reference_node_ids.includes(id)))fail('invalid source reference');
  if(!unique(sheet.question_ids)||sheet.question_ids.length!==2||sheet.question_ids.some(id=>catalog.get(id)?.subject!==sheet.subject||catalog.get(id)?.group!==sheet.group))fail('invalid full-work reference '+sheet.id);
  if(!sheet.checks?.some(check=>check.kind==='selection')||!sheet.checks.some(check=>check.kind==='variant'))fail('selection and changed-condition check required');
  for(const check of sheet.checks){
   if(ids.has(check.id)||!/^M[IA](?:0[1-9]|10)-D[1-9]\d?$/.test(check.id)||!['selection','variant','supplement'].includes(check.kind)||!check.prompt_md||!check.answer_md||check.criteria?.length!==3)fail('invalid diagnostic');
   ids.add(check.id);
   if(!unique(check.node_ids)||!check.node_ids.length||check.node_ids.some(id=>!nodes.has(id)||!id.startsWith(sheet.subject==='micro'?'KMI':'KMA')))fail('invalid diagnostic node');
   if(check.evidence?.length!==check.node_ids.length)fail('missing evidence');
   for(const evidence of check.evidence)if(!check.node_ids.includes(evidence.node_id)||evidence.excerpt_md!==nodes.get(evidence.node_id).core_md||evidence.source_file!=='concept-map-'+sheet.subject+'.json')fail('source excerpt mismatch');
   if(check.kind==='supplement')for(const id of check.node_ids){if(!supplements.has(id))fail('supplement already had a direct original part');tested.add(id);}
  }
 }
 if(supplements.size!==tested.size||[...supplements].some(id=>!tested.has(id)))fail('supplement detection gap');
 const result=structuredClone(input);for(const sheet of result.sheets)sheet.references=sheet.reference_node_ids.map(id=>({id,topic_id:nodes.get(id).topic_id,title:nodes.get(id).title}));
 return{...result,summary:{sheets:20,checks:ids.size,supplements:tested.size,decisions:input.sheets.reduce((n,s)=>n+s.decisions.length,0)}};
}

export function compileMethodSheets(input,render){
 const visit=value=>Array.isArray(value)?value.map(visit):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).flatMap(([key,item])=>key.endsWith('_md')?[[key,item],[key.replace(/_md$/,'_html'),render(item)]]:[[key,visit(item)]])):value;
 const result=visit(input);
 for(const sheet of result.sheets){sheet.comparison_html=sheet.comparison.map(row=>row.map(render));sheet.memory_html=sheet.memory.map(render);}
 return result;
}

export function methodMarkdown(input,{answers=false,checks=false}={}){
 const out=[`# 宏微观${checks?'闭卷选法与变式检测':'作答速查'}`,'',input.editorial_note,'',checks?'先闭卷写条件、起式和结论，再核对参考。基础检测每专题2题；补充检测按断点选做。检测不替代完整专项、综合题或限时卷，不自动计入原题完成。':'每专题两页打印速查。先遮住资料重建模型，有断点再查；与当天两科各85分钟模型、代表题与筛查结合使用，不额外增加必做时长。',''];
 for(const sheet of input.sheets){out.push(`## ${sheet.subject==='micro'?'微观':'宏观'}${sheet.group} ${sheet.title}`,'',sheet.lead_md,'');
  if(checks){for(const check of sheet.checks){out.push(`### ${check.id} ${check.kind==='selection'?'选法':check.kind==='variant'?'条件变式':'补充知识检测'}`,'',check.prompt_md,'');if(answers)out.push('参考推导：',check.answer_md,'','自查要点：',...check.criteria.map(text=>'- '+text),'',`来源节点：${check.node_ids.join('、')}`,'');}}
  else{out.push('### 典型起笔（先核前提）','',sheet.starter_md,'','| 题干信号 | 起笔与选法 | 条件分支 | 结果检验 |','|---|---|---|---|',...sheet.decisions.map(row=>'| '+[row.when_md,row.start_md,row.branch_md,row.check_md].join(' | ')+' |'),'','### 易混模型对照','','| 情形 | 起笔或判据 | 不能混用 |','|---|---|---|',...sheet.comparison.map(row=>'| '+row.join(' | ')+' |'),'','### 必须闭卷重建','',...sheet.memory.map(text=>'- '+text),'',`完整作答回练：${sheet.question_ids.join('、')}；本专题检测：${sheet.checks.map(check=>check.id).join('、')}。`,'',`来源节点：${sheet.reference_node_ids.join('、')}。完整条件与依据回查知识导图，速查只压缩常用决策，不覆盖每个模型的一切分支。`,'');}
 }
 return out.join('\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const here=path.dirname(fileURLToPath(import.meta.url)),read=async name=>JSON.parse(await readFile(path.join(here,'content',name+'.json'),'utf8'));
 const banks={};for(const subject of ['micro','macro']){const raw=await readFile(path.join(here,'content','concept-map-'+subject+'.json'));banks[subject]={...JSON.parse(raw),raw};}
 const prepared=prepareMethodSheets(await read('method-sheets'),banks,await Promise.all(['micro','macro'].map(async key=>({key,...await read(key)}))));
 await mkdir(path.join(here,'dist/materials'),{recursive:true});
 for(const [file,options] of [['method-sheets.md',{}],['method-checks.md',{checks:true}],['method-check-answers.md',{checks:true,answers:true}]])await writeFile(path.join(here,'dist/materials',file),methodMarkdown(prepared,options),'utf8');
 console.log(JSON.stringify(prepared.summary));
}
