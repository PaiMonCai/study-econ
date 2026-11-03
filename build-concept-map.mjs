import {createHash} from 'node:crypto';

export const relationNames={prerequisite:'前置',derives:'推导',contrast:'对照',changes:'条件变化',mechanism:'机制',analogy:'方法类比'};
export const basisNames={source_summary:'既有资料概括',editorial_derivation:'编者推导',editorial_analogy:'编者类比'};
export const conceptDigest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const text=(value,label)=>{if(typeof value!=='string'||!value.trim())throw Error('Concept map missing text: '+label);};
const unique=(values,label)=>{if(!Array.isArray(values)||new Set(values).size!==values.length)throw Error('Concept map duplicate/invalid list: '+label);};
const strings=value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings):value&&typeof value==='object'?Object.values(value).flatMap(strings):[];

export function prepareConceptMap(bank,subject,sources){
 const fail=message=>{throw Error(subject+' concept map: '+message);};
 if(bank.version!==1||bank.subject!==subject)fail('version or subject');
 text(bank.editorial_note,'editorial note');
 for(const key of [subject,'exam_'+subject,'topics_'+subject,'recall','training_'+subject,'comprehensive_'+subject])if(bank.source_hashes?.[key]!==sources.hashes[key])fail('stale source '+key);
 if(!Array.isArray(bank.topics)||bank.topics.length!==10||!Array.isArray(bank.nodes)||!bank.nodes.length||!Array.isArray(bank.edges)||!Array.isArray(bank.applications))fail('incomplete catalog');
 if(!Array.isArray(bank.audit?.checked)||!bank.audit.checked.length||bank.audit.checked.some(item=>typeof item!=='string'||!item.trim())||!Array.isArray(bank.audit.unresolved)||bank.audit.unresolved.length)fail('audit incomplete');
 const topics=new Map(sources.topics.topics.map(t=>[t.id,t]));
 const cards=new Map(sources.recall.cards.filter(c=>c.subject===subject).map(c=>[c.id,c]));
 const reviews=new Map(sources.exam.questions.map(q=>[q.id,q]));
 const cases=new Map(sources.comprehensive.cases.map(q=>[q.id,q]));
 const nodeById=new Map(bank.nodes.map(n=>[n.id,n]));
 const edgeById=new Map(bank.edges.map(e=>[e.id,e]));
 if(nodeById.size!==bank.nodes.length||edgeById.size!==bank.edges.length)fail('duplicate ids');
 const prefix=subject==='micro'?'MI':'MA',coveredCards=new Set(),titles=new Set();
 function evidence(item){
  if(!Array.isArray(item.evidence)||!item.evidence.length)fail('no evidence '+item.id);
  for(const ref of item.evidence){
   const source=ref.kind==='card'?cards.get(ref.id)?.body_md:ref.kind==='review'?reviews.get(ref.id):ref.kind==='topic'?topics.get(ref.id):ref.kind==='case'?cases.get(ref.id):null;
   if(!source||typeof ref.excerpt_md!=='string'||ref.excerpt_md.trim().length<8||!strings(source).some(t=>t.includes(ref.excerpt_md)))fail('invalid evidence '+item.id+' '+ref.id);
   if(ref.kind==='card'&&nodeById.has(item.id))coveredCards.add(ref.id);
  }
 }
 for(const n of bank.nodes){
  if(!new RegExp('^K'+prefix+'\\d{3}$').test(n.id)||!topics.has(n.topic_id))fail('invalid node '+n.id);
  for(const field of ['title','definition_md','trigger_md','conditions_md','core_md','derivation_md','pitfalls_md'])text(n[field],n.id+' '+field);
  if(titles.has(n.title.trim()))fail('duplicate title '+n.title);titles.add(n.title.trim());
  if(!['concept','model','method','result','boundary'].includes(n.kind)||!Object.hasOwn(basisNames,n.basis))fail('invalid node kind/basis '+n.id);
  unique(n.aliases,n.id+' aliases');unique(n.other_topic_ids,n.id+' other topics');unique(n.card_ids,n.id+' cards');
  if(n.aliases.some(alias=>typeof alias!=='string'||!alias.trim()))fail('invalid alias '+n.id);
  if(n.other_topic_ids.some(id=>!topics.has(id)||id===n.topic_id)||n.card_ids.some(id=>!cards.has(id)))fail('invalid node references '+n.id);
  evidence(n);
 }
 for(const id of cards.keys())if(!coveredCards.has(id))fail('card has no node evidence '+id);
 const appearances=new Map(),topicIds=new Set();
 for(const t of bank.topics){
  if(!topics.has(t.id)||topicIds.has(t.id))fail('invalid topic '+t.id);topicIds.add(t.id);
  text(t.focus_question_md,t.id+' focus');text(t.summary_md,t.id+' summary');
  if(!Array.isArray(t.sections)||!t.sections.length)fail('empty sections '+t.id);
  for(const s of t.sections){text(s.title,t.id+' section');unique(s.node_ids,t.id+' section nodes');if(!s.node_ids.length)fail('empty section '+t.id);
   for(const id of s.node_ids){if(nodeById.get(id)?.topic_id!==t.id)fail('section primary topic '+id);appearances.set(id,(appearances.get(id)||0)+1);}
  }
 }
 for(const id of nodeById.keys())if(appearances.get(id)!==1)fail('node needs one primary section '+id);
 const pairs=new Set(),adj=new Map(bank.nodes.map(n=>[n.id,[]]));
 for(const e of bank.edges){
  if(!new RegExp('^E'+prefix+'\\d{3}$').test(e.id)||!nodeById.has(e.from)||!nodeById.has(e.to)||e.from===e.to||!Object.hasOwn(relationNames,e.type)||!Object.hasOwn(basisNames,e.basis))fail('invalid relation '+e.id);
  if(e.type==='analogy'&&e.basis!=='editorial_analogy')fail('analogy identity '+e.id);
  for(const field of ['label','statement_md','conditions_md','reason_md'])text(e[field],e.id+' '+field);
  const ends=['contrast','analogy'].includes(e.type)?[e.from,e.to].sort():[e.from,e.to],pair=[...ends,e.type].join('|');
  if(pairs.has(pair))fail('duplicate relation '+e.id);pairs.add(pair);evidence(e);
  if(e.type==='prerequisite')adj.get(e.from).push(e.to);
 }
 const active=new Set(),done=new Set();
 function visit(id){if(active.has(id))fail('prerequisite cycle '+id);if(done.has(id))return;active.add(id);for(const next of adj.get(id))visit(next);active.delete(id);done.add(id);}
 for(const id of nodeById.keys())visit(id);
 const questions=new Map([...sources.training.questions,...sources.comprehensive.cases].map(q=>[q.id,q]));
 if(bank.applications.length!==questions.size||new Set(bank.applications.map(q=>q.question_id)).size!==questions.size)fail('question coverage');
 for(const app of bank.applications){
  const q=questions.get(app.question_id);if(!q)fail('unknown application '+app.question_id);text(app.summary_md,app.question_id+' summary');
  if(!Array.isArray(app.parts)||JSON.stringify(app.parts.map(p=>p.part_id))!==JSON.stringify(q.parts.map(p=>p.id)))fail('part coverage '+app.question_id);
  for(const p of app.parts){
   unique(p.node_ids,app.question_id+' nodes');unique(p.edge_ids,app.question_id+' relations');
   if(!p.node_ids.length||p.node_ids.length>8||p.node_ids.some(id=>!nodeById.has(id))||p.edge_ids.length>10||p.edge_ids.some(id=>!edgeById.has(id)))fail('part references '+app.question_id+'/'+p.part_id);
   for(const id of p.edge_ids){const e=edgeById.get(id);if(!p.node_ids.includes(e.from)||!p.node_ids.includes(e.to))fail('path missing endpoints '+id);}
   text(p.explanation_md,app.question_id+'/'+p.part_id);if(!p.edge_ids.length)text(p.no_edge_reason_md,app.question_id+' no relation reason');
  }
 }
 return {...bank,topics:bank.topics.map(t=>({...t,title:topics.get(t.id).title,group:topics.get(t.id).group})),applications:bank.applications.map(app=>({...app,parts:app.parts.map(part=>({...part,prompt_md:questions.get(app.question_id).parts.find(p=>p.id===part.part_id).prompt_md}))})),summary:{topics:bank.topics.length,nodes:bank.nodes.length,edges:bank.edges.length,cards:coveredCards.size,questions:bank.applications.length,parts:bank.applications.reduce((s,q)=>s+q.parts.length,0)}};
}

export function compileConceptMap(bank,render){
 function checkDelimiters(md,label){
  let open=null;
  for(let i=0;i<md.length;i++){
   if(md[i]!=='$')continue;
   let slashes=0;for(let p=i-1;p>=0&&md[p]==='\\';p--)slashes++;
   if(slashes%2)continue;
   const delimiter=md[i+1]==='$'?'$$':'$';if(delimiter==='$$')i++;
   if(open===null)open=delimiter;else if(open===delimiter)open=null;else throw Error('Mismatched math delimiters: '+label);
  }
  if(open!==null)throw Error('Unclosed math delimiter: '+label);
 }
 function compile(value,label='concept'){
  if(Array.isArray(value))return value.map((item,i)=>compile(item,label+'/'+i));
  if(!value||typeof value!=='object')return value;
  const result={};for(const [key,item] of Object.entries(value)){result[key]=compile(item,label+'/'+key);if(key.endsWith('_md')){checkDelimiters(item,label+'/'+key);result[key.slice(0,-3)+'_html']=render(item);}}
  return result;
 }
 return compile(bank);
}

export function prepareConceptBridges(bank,banks,hashes){
 if(bank.version!==1||!Array.isArray(bank.bridges))throw Error('Invalid cross-subject concept bridges');
 text(bank.editorial_note,'bridge editorial note');
 for(const subject of ['micro','macro'])if(bank.source_hashes?.['concept_map_'+subject]!==hashes['concept_map_'+subject])throw Error('Stale bridge source '+subject);
 const nodes=new Map(banks.flatMap(b=>b.nodes.map(n=>[n.id,{node:n,subject:b.subject}]))),ids=new Set(),pairs=new Set();
 for(const bridge of bank.bridges){
  const a=nodes.get(bridge.from),b=nodes.get(bridge.to),pair=[bridge.from,bridge.to].sort().join('|');
  if(!/^B\d{3}$/.test(bridge.id)||ids.has(bridge.id)||!a||!b||a.subject===b.subject||pairs.has(pair))throw Error('Invalid bridge endpoints '+bridge.id);
  ids.add(bridge.id);pairs.add(pair);
  if(!['contrast','analogy'].includes(bridge.type)||!Object.hasOwn(basisNames,bridge.basis)||bridge.type==='analogy'&&bridge.basis!=='editorial_analogy')throw Error('Invalid bridge relation '+bridge.id);
  for(const field of ['label','statement_md','conditions_md','reason_md'])text(bridge[field],bridge.id+' '+field);
  const covered=new Set();
  if(!Array.isArray(bridge.evidence))throw Error('Missing bridge evidence '+bridge.id);
  for(const ref of bridge.evidence){
   const source=nodes.get(ref.id)?.node;
   if(ref.kind!=='node'||![bridge.from,bridge.to].includes(ref.id)||!source||typeof ref.excerpt_md!=='string'||ref.excerpt_md.trim().length<8||!strings(source).some(s=>s.includes(ref.excerpt_md)))throw Error('Invalid bridge evidence '+bridge.id);
   covered.add(ref.id);
  }
  if(covered.size!==2)throw Error('Bridge needs evidence for both subjects '+bridge.id);
 }
 return bank;
}
