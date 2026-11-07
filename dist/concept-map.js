(function(){
'use strict';
const relations={prerequisite:'前置',derives:'推导',contrast:'对照',changes:'条件变化',mechanism:'机制',analogy:'方法类比'};
const bases={source_summary:'既有资料概括',editorial_derivation:'编者推导',editorial_analogy:'编者类比'};
const layers={concept:'认识概念',relation:'解释联系',application:'独立解题'};
const kinds={concept:'概念',model:'模型',method:'方法',result:'结论',boundary:'边界'};
const mapUrl=(subject,group='',view='mind',selection='',part='')=>'#maps/'+[subject,group,view,selection,part].filter(Boolean).join('/');
function create({data,state,save,esc,shell,readingBar,start,toast,persistenceMessage,openQuestion}){
 const banks=data.conceptMaps||{},questions=new Map([...data.subjects.flatMap(s=>s.questions.map(q=>({...q,subject:s.key}))),...(data.comprehensive?.questions||[])].map(q=>[q.id,q]));
 let query='',relationFilter='all',quiz=false,revealed=new Set();
 const subjectName=subject=>subject==='micro'?'微观':'宏观';
 const allNodes=()=>Object.values(banks).flatMap(b=>b.nodes);
 const bankForNode=id=>Object.values(banks).find(b=>b.nodes.some(n=>n.id===id));
 function current(){
  const [,rawSubject,group,rawView,selection,part]=location.hash.slice(1).split('/');
  const subject=banks[rawSubject]?rawSubject:'micro',bank=banks[subject];
  const topic=bank?.topics.find(t=>t.group===group),view=['mind','network','path'].includes(rawView)?rawView:'mind';
  return{subject,bank,topic,view,selection,part};
 }
 function nodeLink(id,view='mind',label){const b=bankForNode(id),n=b?.nodes.find(n=>n.id===id);return n?`<a href="${mapUrl(b.subject,n.topic_id.split('-')[1],view,id)}">${esc(label||n.title)}</a>`:'';}
 function questionLink(qid,label='查看本题知识路径'){
  const q=questions.get(qid),b=banks[q?.subject];return b?.applications.some(a=>a.question_id===qid)?`<a class="btn" href="${mapUrl(q.subject,q.group,'path',qid)}">${esc(label)}</a>`:'';
 }
 function homePanel(){return `<section class="map-home"><div><h2>把知识点接成一条思路</h2><p>先看导图，再解释联系，最后用小问检验。</p></div><div class="actions"><a class="btn" href="#maps/micro">微观知识图</a><a class="btn" href="#maps/macro">宏观知识图</a></div></section>`;}
 function subjectTabs(subject){return `<nav class="tabs map-subjects" aria-label="知识图科目">${['micro','macro'].map(key=>`<a class="tab ${subject===key?'active':''}" href="#maps/${key}" ${subject===key?'aria-current="page"':''}>${subjectName(key)}</a>`).join('')}</nav>`;}
 function search(){return `<div class="map-search"><label for="map-search">查找知识点</label><input type="search" id="map-search" value="${esc(query)}" placeholder="输入概念、模型或别名"><div id="map-search-results" aria-live="polite">${searchResults()}</div></div>`;}
 function searchResults(){
  if(!query.trim())return'';
  const term=query.trim().toLowerCase(),nodes=allNodes().filter(n=>[n.title,...n.aliases].some(t=>t.toLowerCase().includes(term)));
  return `<p class="small muted">找到 ${nodes.length} 个知识点</p><ul class="map-search-list">${nodes.map(n=>`<li>${nodeLink(n.id)}<span>${subjectName(bankForNode(n.id).subject)}</span></li>`).join('')}</ul>${nodes.length?'':'<p>试试另一种名称，或从专题目录进入。</p>'}`;
 }
 function bridgesPanel(nodeId){
  const bank=data.conceptBridges,items=bank?.bridges.filter(e=>!nodeId||e.from===nodeId||e.to===nodeId)||[];
  if(!items.length)return'';
  return `<details class="map-bridges"><summary>${nodeId?'这个点怎样跨到另一科':'宏微观怎样相互连接'}（${items.length}条）</summary><p class="small muted">${esc(bank.editorial_note)}</p>${items.map(e=>`<article class="map-bridge relation-${e.type}" data-bridge-id="${e.id}"><h3>${nodeLink(e.from)} <span>${esc(e.label)}</span> ${nodeLink(e.to)}</h3><p class="small muted">${relations[e.type]} · ${bases[e.basis]}</p><div class="rich">${e.statement_html}</div><details><summary>查看条件、理由与两科依据</summary><h4>条件</h4><div class="rich">${e.conditions_html}</div><h4>理由与差异</h4><div class="rich">${e.reason_html}</div>${e.evidence.map(ref=>`<div class="map-bridge-source">${nodeLink(ref.id)}<blockquote class="rich">${ref.excerpt_html}</blockquote></div>`).join('')}</details></article>`).join('')}</details>`;
 }
 function progressMark(n){const progress=state().conceptProgress||{};return `<span class="map-node-progress" aria-label="三层自评">${Object.keys(layers).map(layer=>`<i class="rating-${progress[n.id+':'+layer]?.rating??'new'}" title="${layers[layer]}：${['不会','不熟','能复现'][progress[n.id+':'+layer]?.rating]||'未自评'}"></i>`).join('')}</span>`;}
 function overview(ctx){
  const {subject,bank}=ctx;
  const rated=bank.nodes.filter(n=>Object.keys(layers).some(layer=>state().conceptProgress?.[n.id+':'+layer])).length;
  shell(`<div class="page-heading"><div><h1>${subjectName(subject)}知识导图与拓扑</h1><p>从一章的结构走到一个知识点，再用实际题目检验联系。</p></div></div>${subjectTabs(subject)}${search()}<p class="map-summary">10个专题 · ${bank.nodes.length}个知识点 · ${bank.edges.length}条有条件的联系 · 已自评${rated}个知识点</p><div class="paper map-topic-index">${bank.topics.map(t=>{const nodes=bank.nodes.filter(n=>n.topic_id===t.id);return `<article><div><h2><a href="${mapUrl(subject,t.group)}">${esc(t.title)}</a></h2><div class="rich map-focus">${t.focus_question_html}</div><p class="small muted">${nodes.length}个知识点 · ${t.sections.map(s=>esc(s.title)).join(' / ')}</p></div><div class="actions"><a class="btn primary" href="${mapUrl(subject,t.group)}">打开导图</a><a class="btn" href="${mapUrl(subject,t.group,'network')}">看知识联系</a></div></article>`;}).join('')}</div>${bridgesPanel()}<p class="map-provenance">${esc(bank.editorial_note)} 图上的三层状态均为自评，阅读、展开和浏览路径不会自动判定掌握。</p>`,'maps');
 }
 function nodeButton(n,topic,selected,view){return `<a class="map-node ${n.id===selected?'is-selected':''}" data-node-id="${n.id}" href="${mapUrl(banks[n.id.startsWith('KMI')?'micro':'macro'].subject,topic.group,view,n.id)}" ${n.id===selected?'aria-current="true"':''}><span>${esc(n.title)}</span><small>${kinds[n.kind]}</small>${progressMark(n)}</a>`;}
 function mind(ctx,selected){
  const {bank,topic}=ctx,reused=bank.nodes.filter(n=>n.other_topic_ids.includes(topic.id));
  return `<section class="map-branches" aria-label="${esc(topic.title)}知识导图"><div class="map-root"><strong>${esc(topic.title)}</strong><div class="rich">${topic.focus_question_html}</div></div><div class="map-branch-groups">${topic.sections.map(section=>`<section class="map-branch"><h2>${esc(section.title)}</h2><div class="map-branch-nodes">${section.node_ids.map(id=>nodeButton(bank.nodes.find(n=>n.id===id),topic,selected,'mind')).join('')}</div></section>`).join('')}${reused.length?`<section class="map-branch"><h2>跨专题复用</h2><div class="map-branch-nodes">${reused.map(n=>`<div>${nodeLink(n.id)}<p class="small muted">主归属：${esc(bank.topics.find(t=>t.id===n.topic_id).title)}</p></div>`).join('')}</div></section>`:''}</div></section>`;
 }
 function lineText(text,max=11){const tokens=text.match(/[A-Za-z0-9]+|[^\x00-\x7f]|./g)||[],lines=[];let line='',width=0;for(const token of tokens){const size=/^[A-Za-z0-9]+$/.test(token)?token.length*.55:1;if(width+size>max&&line){lines.push(line);line='';width=0;}line+=token;width+=size;}if(line)lines.push(line);return lines;}
 function diagram(ctx,center,edges,allowedNodes){
  const {bank,topic}=ctx,byId=new Map(bank.nodes.map(n=>[n.id,n]));
  const incoming=[],outgoing=[];
  for(const e of edges)if(e.to===center.id&&!incoming.includes(e.from))incoming.push(e.from);
  for(const e of edges)if(e.from===center.id&&!incoming.includes(e.to)&&!outgoing.includes(e.to))outgoing.push(e.to);
  for(const id of allowedNodes||[])if(id!==center.id&&!incoming.includes(id)&&!outgoing.includes(id))outgoing.push(id);
  const onlyOneSide=!incoming.length||!outgoing.length,width=onlyOneSide?650:840;
  const height=Math.max(270,Math.max(incoming.length,outgoing.length)*110+65),centerX=onlyOneSide?(incoming.length?525:125):420,positions=new Map([[center.id,{x:centerX,y:height/2}]]);
  for(const [ids,x] of [[incoming,115],[outgoing,onlyOneSide?525:725]])ids.forEach((id,index)=>positions.set(id,{x,y:(index+1)*height/(ids.length+1)}));
  const paths=edges.map((e,index)=>{
   const a=positions.get(e.from),b=positions.get(e.to);if(!a||!b)return'';
   const sameColumn=a.x===b.x,side=a.x>=centerX?1:-1,forward=b.x>a.x,ax=a.x+(sameColumn?side*100:forward?100:-100),bx=b.x+(sameColumn?side*100:forward?-100:100),mid=sameColumn?a.x+side*145:(ax+bx)/2;
   const parallel=edges.filter(other=>other.from===e.from&&other.to===e.to||other.from===e.to&&other.to===e.from),offset=(parallel.indexOf(e)-(parallel.length-1)/2)*34;
   const d=`M${ax},${a.y} C${mid},${a.y+offset} ${mid},${b.y+offset} ${bx},${b.y}`,symmetric=['contrast','analogy'].includes(e.type),label=quiz&&!revealed.has(e.id)?'补出关系':e.label;
   return `<a href="${mapUrl(ctx.subject,topic.group,'network',e.id)}" class="map-svg-edge relation-${e.type}" data-graph-edge-id="${e.id}" aria-label="${esc(byId.get(e.from).title+' '+(quiz&&!revealed.has(e.id)?'待回忆关系':e.label)+' '+byId.get(e.to).title)}"><title>${esc(quiz&&!revealed.has(e.id)?'先说出关系和成立条件':e.statement_md)}</title><path d="${d}" ${symmetric?'':`marker-end="url(#map-arrow-${e.type})"`}/><rect x="${mid-45}" y="${(a.y+b.y)/2+offset-12}" width="90" height="24" rx="4"/><text x="${mid}" y="${(a.y+b.y)/2+offset+4}">${esc(label.length>7?label.slice(0,6)+'…':label)}</text></a>`;
  }).join('');
  const boxes=[...positions].map(([id,p])=>{const n=byId.get(id),lines=lineText(n.title);return `<a data-node-id="${id}" href="${mapUrl(ctx.subject,n.topic_id.split('-')[1],'network',id)}" class="map-svg-node ${id===center.id?'is-selected':''}" aria-label="查看知识点 ${esc(n.title)}"><title>${esc(n.title)}</title><rect x="${p.x-100}" y="${p.y-36}" width="200" height="72" rx="8"/><text x="${p.x}" y="${p.y-(Math.min(lines.length,3)-1)*9}">${lines.slice(0,3).map((line,i)=>`<tspan x="${p.x}" dy="${i?19:0}">${esc(line)}</tspan>`).join('')}</text></a>`;}).join('');
  const sideways=edges.some(e=>positions.get(e.from)?.x===positions.get(e.to)?.x),padding=sideways?80:0;
  return `<button class="btn map-zoom" data-action="map-zoom" aria-pressed="false">放大关系图</button><div class="map-graph-scroll" tabindex="0" role="region" aria-label="知识关系图，放大后可横向滚动；文字关系列表在图后"><svg class="map-network" viewBox="${-padding} 0 ${width+2*padding} ${height}" width="${width+2*padding}" height="${height}" role="group" aria-label="以${esc(center.title)}为中心的知识联系"><defs>${Object.keys(relations).map(type=>`<marker id="map-arrow-${type}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="relation-${type}"/></marker>`).join('')}</defs>${paths}${boxes}</svg></div><p class="small muted map-graph-help">实线箭头从起点指向去向；虚线无箭头表示对照或类比。选中节点可换中心；每条联系的完整命题与条件见文字列表。</p>`;
 }
 function evidence(refs){
  return `<details class="map-evidence"><summary>回查整理依据（${refs.length}处）</summary>${refs.map(ref=>{
   const q=questions.get(ref.id),label={card:'知识卡',review:'专项审校',topic:'专题串联',case:'编者综合题'}[ref.kind];
   let link='';if(ref.kind==='card')link=`<button class="btn" data-action="recall-card" data-id="${ref.id}" data-return="${esc(location.hash.slice(1))}">打开知识卡 ${ref.id}</button>`;
   if(ref.kind==='topic'){const [s,g]=ref.id.split('-');link=`<a class="btn" href="#topics/${s}/${g}">打开专题串联</a>`;}
   if(q)link=`<button class="btn" data-action="map-study-question" data-id="${q.id}">阅读对应统一题型</button>`;
   return `<div class="map-evidence-item"><p><strong>${label} ${esc(ref.id)}</strong></p><blockquote class="rich">${ref.excerpt_html}</blockquote>${link}</div>`;
  }).join('')}<p class="small muted">摘录来自当前已交付的资料，用于追溯本次编者整理；不据此标为教材逐字原文。</p></details>`;
 }
 function edgeDetail(ctx,e){
  const bank=ctx.bank,from=bank.nodes.find(n=>n.id===e.from),to=bank.nodes.find(n=>n.id===e.to),hidden=quiz&&!revealed.has(e.id);
  return `<article class="map-edge-detail relation-${e.type}" id="relation-${e.id}" data-edge-id="${e.id}"><h3>${nodeLink(from.id,'network')} <span>${hidden?'□':esc(e.label)}</span> ${nodeLink(to.id,'network')}</h3>${hidden?`<p>请说明两者怎样联系、在什么条件下成立，再展开核对。</p><button class="btn" data-action="map-reveal" data-id="${e.id}">核对这条联系</button>`:`<div class="map-edge-tags"><span>${relations[e.type]}</span><span>${bases[e.basis]}</span></div><div class="rich">${e.statement_html}</div><details><summary>为什么成立，怎样使用</summary><h4>适用条件</h4><div class="rich">${e.conditions_html}</div><h4>理由与推导</h4><div class="rich">${e.reason_html}</div>${evidence(e.evidence)}</details>`}</article>`;
 }
 function network(ctx,selected){
  const center=ctx.bank.nodes.find(n=>n.id===selected),edges=ctx.bank.edges.filter(e=>(e.from===selected||e.to===selected)&&(relationFilter==='all'||e.type===relationFilter));
  return `<section class="map-network-area"><div class="map-network-tools"><label>关系类型 <select id="map-relation-filter">${[['all','全部关系'],...Object.entries(relations)].map(([key,label])=>`<option value="${key}" ${key===relationFilter?'selected':''}>${label}</option>`).join('')}</select></label><button class="btn" data-action="map-quiz" aria-pressed="${quiz}">${quiz?'显示关系词':'遮住关系词，练复述'}</button></div><h2>围绕“${esc(center.title)}”看联系</h2>${diagram(ctx,center,edges)}<div class="map-edge-list" aria-label="所选知识点的完整关系">${edges.length?edges.map(e=>edgeDetail(ctx,e)).join(''):'<p>当前筛选下没有联系，试试选择其他关系类型。</p>'}</div><details class="map-all-relations"><summary>本专题的全部关系</summary>${ctx.bank.edges.filter(e=>[e.from,e.to].some(id=>ctx.bank.nodes.find(n=>n.id===id).topic_id===ctx.topic.id)).map(e=>`<p><a href="${mapUrl(ctx.subject,ctx.topic.group,'network',e.id)}">${esc(ctx.bank.nodes.find(n=>n.id===e.from).title)} · ${esc(e.label)} · ${esc(ctx.bank.nodes.find(n=>n.id===e.to).title)}</a></p>`).join('')}</details></section>`;
 }
 function rating(node){return `<section class="map-self-check" aria-label="知识点三层自评"><h3>这一个点，能走到哪一步？</h3>${Object.entries(layers).map(([layer,label])=>{const record=state().conceptProgress?.[node.id+':'+layer];return `<fieldset><legend>${label}</legend>${[[0,'不会'],[1,'不熟'],[2,'能复现']].map(([value,text])=>`<button class="btn ${record?.rating===value?'selected':''}" data-action="map-rate" data-id="${node.id}" data-layer="${layer}" data-rating="${value}" aria-pressed="${record?.rating===value}">${text}</button>`).join('')}</fieldset>`;}).join('')}<p class="small muted">三层分别记录。自评会随学习备份保存，浏览不自动计为掌握。</p></section>`;}
 function methodCheck(node){
  const sheet=data.methodSheets?.sheets.find(sheet=>sheet.checks.some(check=>check.kind==='supplement'&&check.node_ids.includes(node.id))),check=sheet?.checks.find(check=>check.kind==='supplement'&&check.node_ids.includes(node.id));
  return check?`<section class="map-method-check"><h3>补充知识直接检测</h3><p>原专项与综合题之外的新编短检测，先闭卷作答再核对；记录与原题完成度分别保存。</p><a class="btn" href="#methods/${sheet.subject}/${sheet.group}/checks/${check.id}">做补充检测：${esc(node.title)}</a></section>`:'';
 }
 function nodeDetail(ctx,node){
  const applications=ctx.bank.applications.flatMap(app=>{const parts=app.parts.filter(p=>p.node_ids.includes(node.id));return parts.length?[{...app,parts}]:[];});
  return `<aside class="paper map-node-detail" aria-label="知识点详情"><div class="map-node-caption"><span>${kinds[node.kind]}</span><span>${bases[node.basis]}</span></div><h2 id="map-node-heading" tabindex="-1">${esc(node.title)}</h2><p class="map-node-topics">主归属：<a href="${mapUrl(ctx.subject,node.topic_id.split('-')[1])}">${esc(ctx.bank.topics.find(t=>t.id===node.topic_id).title)}</a>${node.other_topic_ids.length?'<br>还用于：'+node.other_topic_ids.map(id=>`<a href="${mapUrl(ctx.subject,id.split('-')[1])}">${esc(ctx.bank.topics.find(t=>t.id===id).title)}</a>`).join('、'):''}</p><div class="map-node-content">${[['definition','它是什么'],['trigger','什么时候想到它'],['conditions','适用条件'],['core','核心公式与机制'],['derivation','为什么这样得到'],['pitfalls','边界与易错']].map(([field,title])=>`<section><h3>${title}</h3><div class="rich">${node[field+'_html']}</div></section>`).join('')}</div><a class="btn" href="${mapUrl(ctx.subject,node.topic_id.split('-')[1],ctx.view==='network'?'mind':'network',node.id)}">${ctx.view==='network'?'回到导图看归属':'看这个点的前后联系'}</a>${rating(node)}${bridgesPanel(node.id)}${methodCheck(node)}<details class="map-node-applications"><summary>原例中的知识调用（${applications.length}条）</summary><ul>${applications.map(app=>`<li><strong>${esc(app.question_id)} ${esc(questions.get(app.question_id).title)}</strong><div class="actions">${app.parts.map(p=>`<a href="${mapUrl(ctx.subject,questions.get(app.question_id).group,'path',app.question_id,p.part_id)}">第${esc(p.part_id)}问路径</a>`).join('')}</div></li>`).join('')}</ul>${applications.length?'':'<p>原专项与综合题尚未设置直接检验此节点的分问；本页新增的补充知识检测另行记录。</p>'}</details>${evidence(node.evidence)}</aside>`;
 }
 function pathView(ctx){
  const {bank,topic}=ctx,apps=bank.applications.filter(app=>questions.get(app.question_id).group===topic.group),app=apps.find(app=>app.question_id===ctx.selection)||apps[0];
  const q=questions.get(app.question_id),part=app.parts.find(p=>p.part_id===ctx.part)||app.parts[0],qpart=(q.training?.parts||q.parts).find(p=>p.id===part.part_id),nodes=part.node_ids.map(id=>bank.nodes.find(n=>n.id===id)),edges=part.edge_ids.map(id=>bank.edges.find(e=>e.id===id));
  const center=nodes.slice().sort((a,b)=>edges.filter(e=>[e.from,e.to].includes(b.id)).length-edges.filter(e=>[e.from,e.to].includes(a.id)).length)[0];
  return `<section class="paper map-path"><label for="map-question">查看本专题原例的知识路径</label><select id="map-question">${apps.map(a=>`<option value="${a.question_id}" ${a===app?'selected':''}>${a.question_id} ${esc(questions.get(a.question_id).title)}</option>`).join('')}</select><h2>${esc(q.id)} ${esc(q.title)}</h2><div class="rich">${app.summary_html}</div><nav class="map-part-tabs" aria-label="按分问查看知识路径">${app.parts.map(p=>`<a class="btn ${p===part?'primary':''}" href="${mapUrl(ctx.subject,topic.group,'path',q.id,p.part_id)}" ${p===part?'aria-current="step"':''}>第${esc(p.part_id)}问</a>`).join('')}</nav><div class="map-part-prompt"><details class="map-full-prompt"><summary>回看完整题干与全部分问</summary><div class="rich">${q.training?.prompt_html||q.prompt_html}</div></details><h3>本问任务</h3><div class="rich">${part.prompt_html||qpart.prompt_html||esc(qpart.prompt_md)}</div></div><h3>为什么调用这些知识点</h3><div class="rich map-path-reason">${part.explanation_html}</div><ul class="map-used-nodes">${nodes.map(n=>`<li>${nodeLink(n.id,'network')}<span>${kinds[n.kind]}</span></li>`).join('')}</ul>${diagram(ctx,center,edges,part.node_ids)}${edges.length?edges.map(e=>edgeDetail(ctx,e)).join(''):`<div class="rich map-no-edge">${part.no_edge_reason_html}</div>`}<section class="map-unified-practice"><h3>对应的统一题型</h3><div class="actions map-practice-actions">${window.ExamTypes.sourceLinks(data,[q.id])}</div><p class="small muted">独立作答</p><div class="actions">${window.ExamTypes.sourceLinks(data,[q.id],{writing:true})}</div></section><p class="small muted">路径为编者对当前题目分问的分析；需要按本问题干的条件使用，并不保证换题后仍沿同一条线。</p></section>`;
 }
 function render(){
  const ctx=current();if(!ctx.bank){shell('<div class="empty"><h1>知识图尚未加载</h1><p>请刷新页面重新读取资料。</p></div>','maps');return;}
  if(!ctx.topic){overview(ctx);return;}
  let selected=ctx.bank.nodes.find(n=>n.id===ctx.selection)?.id;
  const edge=ctx.bank.edges.find(e=>e.id===ctx.selection);if(edge)selected=edge.from;
  selected??=ctx.topic.sections[0].node_ids[0];const node=ctx.bank.nodes.find(n=>n.id===selected);
  shell(`<div class="map-reader"><div class="map-back"><a href="#maps/${ctx.subject}">返回${subjectName(ctx.subject)}知识图</a><a href="#topics/${ctx.subject}/${ctx.topic.group}">对照专题串联正文</a><button class="btn" data-action="map-print">打印当前视图</button></div><h1>${esc(ctx.topic.title)}</h1><div class="rich map-lead">${ctx.topic.summary_html}</div>${readingBar()}<nav class="map-view-tabs" aria-label="知识图阅读方式">${[['mind','知识导图'],['network','知识拓扑'],['path','解题路径']].map(([view,label])=>`<a class="btn ${ctx.view===view?'primary':''}" href="${mapUrl(ctx.subject,ctx.topic.group,view,view==='path'?'':selected)}" ${ctx.view===view?'aria-current="page"':''}>${label}</a>`).join('')}</nav>${search()}${ctx.view==='path'?pathView(ctx):`<div class="map-workspace"><div class="paper map-canvas">${ctx.view==='mind'?mind(ctx,selected):network(ctx,selected)}</div>${nodeDetail(ctx,node)}</div>`}<p class="map-provenance">${esc(ctx.bank.editorial_note)}</p></div>`,'maps');
  if(edge)requestAnimationFrame(()=>document.getElementById('relation-'+edge.id)?.scrollIntoView({block:'center'}));
  if(ctx.selection&&ctx.view==='mind'&&matchMedia('(max-width:1100px)').matches)requestAnimationFrame(()=>document.querySelector('.map-node-detail')?.scrollIntoView({block:'start'}));
 }
 function action(button){
  const a=button.dataset.action;if(!a?.startsWith('map-'))return false;
  if(a==='map-print')window.print();
  if(a==='map-zoom'){const graph=button.nextElementSibling,zoomed=graph.classList.toggle('is-zoomed');button.setAttribute('aria-pressed',String(zoomed));button.textContent=zoomed?'适应栏宽':'放大关系图';}
  if(a==='map-quiz'){quiz=!quiz;revealed.clear();render();}
  if(a==='map-reveal'){revealed.add(button.dataset.id);const y=window.scrollY;render();window.scrollTo({top:y});}
  if(a==='map-rate'){
   const id=button.dataset.id,layer=button.dataset.layer,rating=Number(button.dataset.rating);
   if(bankForNode(id)&&Object.hasOwn(layers,layer)&&[0,1,2].includes(rating)){
    state().conceptProgress??={};state().conceptProgress[id+':'+layer]={rating,at:Date.now()};save();
    const y=window.scrollY;render();window.scrollTo({top:y});document.querySelector(`[data-action="map-rate"][data-id="${id}"][data-layer="${layer}"][data-rating="${rating}"]`)?.focus({preventScroll:true});toast(persistenceMessage());
   }
  }
  if(['map-study-question','map-practice'].includes(a)){const q=questions.get(button.dataset.id);if(q&&!openQuestion?.(q.id,a==='map-practice'))start([q.id],a==='map-practice'?'知识图独立训练':'知识图规范作答跟读',null,0,a!=='map-practice');}
  return true;
 }
 function input(event){if(event.target.id!=='map-search'||event.isComposing)return false;query=event.target.value;document.getElementById('map-search-results').innerHTML=searchResults();return true;}
 function change(event){
  if(event.target.id==='map-relation-filter'){relationFilter=event.target.value;const y=window.scrollY;render();window.scrollTo({top:y});document.getElementById('map-relation-filter').focus({preventScroll:true});return true;}
  if(event.target.id==='map-question'){const ctx=current();location.hash=mapUrl(ctx.subject,ctx.topic.group,'path',event.target.value);return true;}return false;
 }
 return{render,action,input,change,homePanel,questionLink};
}
window.ConceptMap={create,mapUrl};
})();
