import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareConceptMap,conceptDigest,relationNames,basisNames,prepareConceptBridges} from './build-concept-map.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const load=name=>readFile(path.join(here,'content',name+'.json'));
const outputs=[];
const quote=text=>JSON.stringify(text.replace(/\$/g,'').replace(/\n/g,' '));
for(const subject of ['micro','macro']){
 const name=subject==='micro'?'微观':'宏观',source={hashes:{}};
 for(const [key,file] of [[subject,subject],['exam_'+subject,'exam-review-'+subject],['topics_'+subject,'topics-'+subject],['recall','recall'],['training_'+subject,'training-'+subject],['comprehensive_'+subject,'comprehensive-'+subject]])source.hashes[key]=conceptDigest(await load(file));
 for(const [key,file] of [['recall','recall'],['topics','topics-'+subject],['exam','exam-review-'+subject],['training','training-'+subject],['comprehensive','comprehensive-'+subject]])source[key]=JSON.parse(await load(file));
 const original=JSON.parse(await load(subject)),groups=new Map(original.questions.map(q=>[q.id,q.group]));
 const bank=prepareConceptMap(JSON.parse(await load('concept-map-'+subject)),subject,source),nodes=new Map(bank.nodes.map(n=>[n.id,n])),questions=new Map([...source.training.questions,...source.comprehensive.cases].map(q=>[q.id,q]));
 const lines=['# 人大802'+name+'知识导图与拓扑','','本稿与本地练习室共用一份知识底稿。导图看结构，拓扑看前置、推导、对照、条件变化、机制和方法类比；应用路径逐问对应当前训练。','',bank.editorial_note,'','知识点'+bank.summary.nodes+'个；关系'+bank.summary.edges+'条；知识卡'+bank.summary.cards+'张；120道题、'+bank.summary.parts+'个分问。','','## 怎样使用','','1. 从专题问题进入分支，独立解释节点的定义、条件与推导。','2. 沿关系句复述“为什么成立”，将条件变化后的分支另作检查。','3. 先做对应小问，再核对其实际调用节点和关系；认识概念、解释联系、独立解题分别自评。','','来源说明：知识卡、已有专题、专项审校与编者综合题分别标注。摘录可回查当前资料，但不自动视为教材逐字引文。',''];
 for(const t of bank.topics){
  const topicNodes=bank.nodes.filter(n=>n.topic_id===t.id),topicEdges=bank.edges.filter(e=>nodes.get(e.from).topic_id===t.id&&nodes.get(e.to).topic_id===t.id);
  lines.push('## '+t.title,'',t.focus_question_md,'',t.summary_md,'','### 分支导图','','```mermaid','flowchart LR','root['+quote(t.title)+']');
  t.sections.forEach((section,i)=>{lines.push('S'+i+'['+quote(section.title)+']','root --- S'+i);for(const id of section.node_ids)lines.push(id+'['+quote(nodes.get(id).title)+']','S'+i+' --- '+id);});lines.push('```','','### 本专题知识联系','','```mermaid','flowchart TD');
  for(const n of topicNodes)lines.push(n.id+'['+quote(n.title)+']');
  for(const e of topicEdges)lines.push(e.from+(['contrast','analogy'].includes(e.type)?' ---|':' -->|')+quote(e.label)+'| '+e.to);
  topicEdges.forEach((e,i)=>{if(['contrast','analogy'].includes(e.type))lines.push('linkStyle '+i+' stroke-dasharray:5 5');});
  lines.push('```','','关系图中的箭头表示有方向的联系；虚线表示对照或类比。图中只画本专题主归属节点；跨专题关系在逐条命题中列明，可在练习室逐点追踪。具体成立条件以逐条说明为准。','');
  for(const n of topicNodes){lines.push('### '+n.id+' '+n.title,'','身份：'+basisNames[n.basis],'',...(n.aliases.length?['又称：'+n.aliases.join('、'),'']:[]),...(n.other_topic_ids.length?['还用于：'+n.other_topic_ids.map(id=>bank.topics.find(t=>t.id===id).title).join('；'),'']:[]));for(const [field,label] of [['definition','定义与对象'],['trigger','何时调用'],['conditions','适用条件'],['core','核心公式与机制'],['derivation','推导与理由'],['pitfalls','边界与易错']])lines.push('**'+label+'**','',n[field+'_md'],'');lines.push('**整理依据**','',...n.evidence.flatMap(ref=>['- '+ref.kind+' '+ref.id+'：'+ref.excerpt_md.replace(/\n/g,' ')]),'');}
  lines.push('### 关系命题与条件','');
  for(const e of bank.edges.filter(e=>nodes.get(e.from).topic_id===t.id))lines.push('#### '+e.id+' '+nodes.get(e.from).title+' → '+nodes.get(e.to).title,'',relationNames[e.type]+'；'+basisNames[e.basis],'',e.statement_md,'','适用条件：'+e.conditions_md,'','理由：'+e.reason_md,'','依据：'+e.evidence.map(ref=>ref.kind+' '+ref.id+'「'+ref.excerpt_md.replace(/\n/g,' ')+'」').join('；'),'');
  lines.push('### 对应题目分问路径','');
  for(const app of bank.applications.filter(a=>(questions.get(a.question_id).group||groups.get(a.question_id))===t.group)){
   lines.push('#### '+app.question_id,'',app.summary_md,'');
   for(const p of app.parts)lines.push('**第'+p.part_id+'问**','','本问任务：'+p.prompt_md,'',p.explanation_md,'','调用：'+p.node_ids.map(id=>id+' '+nodes.get(id).title).join('；'),'','联系：'+(p.edge_ids.join('、')||p.no_edge_reason_md),'');
  }
 }
 const destinations=[path.join(here,'docs','concept-map-'+subject+'.md')];if(process.argv[2])destinations.push(path.join(path.resolve(process.argv[2]),'人大802'+name+'知识导图与拓扑.md'));
 for(const destination of destinations){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,lines.join('\n')+'\n','utf8');outputs.push(destination);}
}
const banks=await Promise.all(['micro','macro'].map(async subject=>JSON.parse(await load('concept-map-'+subject))));
const hashes=Object.fromEntries(await Promise.all(['micro','macro'].map(async subject=>['concept_map_'+subject,conceptDigest(await load('concept-map-'+subject))])));
const bridges=prepareConceptBridges(JSON.parse(await load('concept-map-bridges')),banks,hashes),nodeById=new Map(banks.flatMap(b=>b.nodes.map(n=>[n.id,n])));
const bridgeLines=['# 人大802宏微观知识跨科联系','',bridges.editorial_note,''];
for(const bridge of bridges.bridges)bridgeLines.push('## '+bridge.id+' '+bridge.label,'',nodeById.get(bridge.from).title+' ↔ '+nodeById.get(bridge.to).title,'',relationNames[bridge.type]+'；'+basisNames[bridge.basis],'',bridge.statement_md,'','**适用条件**','',bridge.conditions_md,'','**理由与差异**','',bridge.reason_md,'','**两科依据**','',...bridge.evidence.flatMap(ref=>['- '+ref.id+' '+nodeById.get(ref.id).title+'：'+ref.excerpt_md.replace(/\n/g,' ')]),'');
const bridgeDestinations=[path.join(here,'docs/concept-map-bridges.md')];if(process.argv[2])bridgeDestinations.push(path.join(path.resolve(process.argv[2]),'人大802宏微观知识跨科联系.md'));
for(const destination of bridgeDestinations){await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bridgeLines.join('\n')+'\n','utf8');outputs.push(destination);}
console.log(JSON.stringify({outputs}));
