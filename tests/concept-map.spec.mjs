import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../serve.mjs';
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')));
async function hash(page,value){await page.evaluate(value=>{location.hash=value;},value);}
for(const subject of ['micro','macro'])for(let number=1;number<=10;number++){
 const group=String(number).padStart(2,'0');
 test(`${subject} ${group}: every node, relation neighborhood and question part can be read`,async({page})=>{
  test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#maps/'+subject+'/'+group+'/mind');await expect(page.locator('.map-node-detail')).toBeVisible();
  const expected=await page.evaluate(({subject,group})=>{
   const d=window.STUDY_DATA,b=d.conceptMaps[subject],questions=[...d.subjects.find(s=>s.key===subject).questions,...d.comprehensive.questions.filter(q=>q.subject===subject)],ids=new Set(questions.filter(q=>q.group===group).map(q=>q.id));
   return{nodes:b.nodes.filter(n=>n.topic_id===subject+'-'+group).map(n=>({id:n.id,title:n.title,neighbors:b.edges.filter(e=>e.from===n.id||e.to===n.id).map(e=>e.id)})),apps:b.applications.filter(a=>ids.has(a.question_id)).map(a=>({id:a.question_id,parts:a.parts.map(p=>({id:p.part_id,nodes:p.node_ids,edges:p.edge_ids}))}))};
  },{subject,group});
  await expect(page.locator('.map-node')).toHaveCount(expected.nodes.length);
  for(const node of expected.nodes){
   await hash(page,`#maps/${subject}/${group}/mind/${node.id}`);await expect(page.locator('#map-node-heading')).toHaveText(node.title);await expect(page.locator('.map-node-content>section')).toHaveCount(6);
   await hash(page,`#maps/${subject}/${group}/network/${node.id}`);await expect(page.locator('#map-node-heading')).toHaveText(node.title);await expect(page.locator('.map-svg-edge')).toHaveCount(node.neighbors.length);await expect(page.locator('.map-edge-list [data-edge-id]')).toHaveCount(node.neighbors.length);
   expect(await page.locator('.map-network').evaluate(svg=>{const v=svg.viewBox.baseVal;return [...svg.querySelectorAll('.map-svg-node rect')].every(r=>{const b=r.getBBox();return b.x>=v.x&&b.y>=v.y&&b.x+b.width<=v.x+v.width&&b.y+b.height<=v.y+v.height;});})).toBe(true);
  }
  expect(expected.apps).toHaveLength(12);
  for(const app of expected.apps)for(const part of app.parts){
   await hash(page,`#maps/${subject}/${group}/path/${app.id}/${part.id}`);await expect(page.locator('.map-path>h2')).toContainText(app.id);await expect(page.locator('.map-part-tabs [aria-current="step"]')).toHaveText('第'+part.id+'问');
   await expect(page.locator('.map-used-nodes>li')).toHaveCount(part.nodes.length);await expect(page.locator('.map-path [data-edge-id]')).toHaveCount(part.edges.length);await expect(page.locator('.map-path-reason')).not.toBeEmpty();
   await expect(page.locator('.katex-error,.math-error')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  expect(errors).toEqual([]);expect((await saved(page))?.records||[]).toEqual([]);
 });
}
test('search, relationship recall, zoom, source-card return and self-assessment work together',async({page})=>{
 await page.goto('/#maps/micro');await page.locator('#map-search').fill('预算');await expect(page.locator('.map-search-list')).toContainText('预算');
 await page.locator('.map-search-list a').first().click();await expect(page.locator('#map-node-heading')).toBeVisible();
 const node=await page.locator('.map-node.is-selected').getAttribute('data-node-id');
 await page.locator('.map-node-detail>a').click();await expect(page.locator('.map-network')).toBeVisible();
 await page.locator('[data-action="map-zoom"]').click();await expect(page.locator('.map-graph-scroll')).toHaveClass(/is-zoomed/);await page.locator('[data-action="map-zoom"]').click();
 await page.locator('[data-action="map-quiz"]').click();await expect(page.locator('[data-action="map-reveal"]').first()).toBeVisible();await page.locator('[data-action="map-reveal"]').first().click();await expect(page.locator('.map-edge-tags').first()).toBeVisible();
 for(const [layer,rating] of [['concept',2],['relation',1],['application',0]])await page.locator(`[data-action="map-rate"][data-layer="${layer}"][data-rating="${rating}"]`).click();
 await page.reload();await expect(page.locator('[data-action="map-rate"][data-layer="concept"][aria-pressed="true"]')).toHaveText('能复现');
 const progress=(await saved(page)).conceptProgress;expect(progress[node+':concept'].rating).toBe(2);expect(progress[node+':relation'].rating).toBe(1);expect(progress[node+':application'].rating).toBe(0);expect((await saved(page)).records).toEqual([]);
 const returnTo=page.url();await page.locator('.map-node-detail>.map-evidence>summary').click();await page.locator('.map-node-detail [data-action="recall-card"]').first().click();await page.locator('[data-action="knowledge-back"]').click();await expect(page).toHaveURL(returnTo);
});
test('knowledge self-assessment survives backup import while legacy work is retained',async({page,browser})=>{
 await page.goto('/#maps/micro/01/mind');const id=await page.locator('.map-node.is-selected').getAttribute('data-node-id');await page.locator('[data-action="map-rate"][data-layer="concept"][data-rating="2"]').click();
 await page.goto('/#settings');const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const stream=await(await pending).createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const backup=JSON.parse(text);expect(backup.conceptProgress[id+':concept'].rating).toBe(2);
 const context=await browser.newContext();try{const other=await context.newPage();await other.goto('/');await other.evaluate(()=>{const state={version:1,start:'2026-10-29',records:[{id:'legacy',qid:'MI001',rating:1,seconds:20,at:100,day:null}],drafts:{MI001:'retained draft'},favorites:['MI001']};localStorage.setItem('ruc802.practice.v1',JSON.stringify(state));});await other.reload();await other.goto('/#settings');
  await other.locator('[data-action="import"]').click();await other.locator('#import-file').setInputFiles({name:'knowledge.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await other.getByRole('dialog').getByRole('button',{name:'合并导入',exact:true}).click();await expect(other.getByRole('dialog')).toHaveCount(0);
  const state=await saved(other);expect(state.conceptProgress[id+':concept'].rating).toBe(2);expect(state.records.find(r=>r.id==='legacy')).toBeTruthy();expect(state.drafts.MI001).toBe('retained draft');expect(state.favorites).toContain('MI001');
 }finally{await context.close();}
});
test('question paths appear after answer reveal and stay hidden in an unsubmitted paper',async({page})=>{
 await page.goto('/#archive');await page.locator('#search').fill('MI001');await page.locator('[data-action="single"][data-id="MI001"]').click();await expect(page.locator('a[href*="/path/MI001"]')).toHaveCount(0);await page.locator('[data-action="reveal"]').click();await expect(page.locator('a[href*="/path/MI001"]')).toHaveCount(1);
 await page.goto('/#archive-papers');await page.locator('[data-action="paper-start"][data-id="P01"]').click();await expect(page.locator('a[href*="/path/"]')).toHaveCount(0);
 await page.locator('.paper-session-status [data-action="paper-submit"]').click();await expect(page.locator('a[href*="/path/"]')).toHaveCount(1);
});
const serverTest=test.extend({site:async({},use)=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'ruc802-concept-')),server=await createApp({basePath:'/802',dataDir,access:{password:'concept-test-password'}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await use(`http://127.0.0.1:${server.address().port}/802/`);}finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await rm(dataDir,{recursive:true,force:true});}
}});
async function login(page,site){await page.goto(site);await page.getByLabel('访问密码',{exact:true}).fill('concept-test-password');const ready=page.waitForResponse(response=>response.url()===site+'api/state'&&response.request().method()==='GET'&&response.ok());await page.getByRole('button',{name:'进入练习室',exact:true}).click();await ready;await expect(page.locator('.local-status')).toHaveText('服务器已保存');}
serverTest('server saves separate knowledge layers and restores them in another browser',async({page,browser,site})=>{
 await login(page,site);await page.goto(site+'#maps/macro/01/mind');const id=await page.locator('.map-node.is-selected').getAttribute('data-node-id');await page.locator('[data-action="map-rate"][data-layer="concept"][data-rating="2"]').click();await expect(page.locator('.local-status')).toHaveText('服务器已保存');
 const context=await browser.newContext();try{const other=await context.newPage();await login(other,site);await other.goto(site+'#maps/macro/01/mind');await expect(other.locator('[data-action="map-rate"][data-layer="concept"][aria-pressed="true"]')).toHaveText('能复现');await other.locator('[data-action="map-rate"][data-layer="relation"][data-rating="1"]').click();await expect(other.locator('.local-status')).toHaveText('服务器已保存');
  await page.reload();await expect(page.locator('[data-action="map-rate"][data-layer="relation"][aria-pressed="true"]')).toHaveText('不熟');const state=(await(await page.request.get(site+'api/state')).json()).state;expect(state.conceptProgress[id+':concept'].rating).toBe(2);expect(state.conceptProgress[id+':relation'].rating).toBe(1);
 }finally{await context.close();}
});

test('opposite feedback edges keep distinct curves and relationship labels',async({page})=>{
 await page.goto('/#maps/macro');const pairs=await page.evaluate(()=>{const b=window.STUDY_DATA.conceptMaps.macro;return b.edges.filter(e=>e.type==='mechanism').flatMap(e=>{const r=b.edges.find(r=>r.type==='mechanism'&&r.from===e.to&&r.to===e.from&&r.id>e.id);return r?[{a:e.id,b:r.id,node:e.from,group:b.nodes.find(n=>n.id===e.from).topic_id.split('-')[1]}]:[];});});expect(pairs.length).toBeGreaterThan(0);
 for(const pair of pairs){await hash(page,`#maps/macro/${pair.group}/network/${pair.node}`);await expect(page.locator(`[data-graph-edge-id="${pair.a}"]`)).toBeVisible();const coords=await page.evaluate(pair=>[pair.a,pair.b].map(id=>{const e=document.querySelector(`[data-graph-edge-id="${id}"]`),p=e.querySelector('path'),t=e.querySelector('text'),mid=p.getPointAtLength(p.getTotalLength()/2);return{x:Number(t.getAttribute('x')),y:Number(t.getAttribute('y')),mid:{x:mid.x,y:mid.y}};}),pair);expect(Math.hypot(coords[0].x-coords[1].x,coords[0].y-coords[1].y)).toBeGreaterThan(20);expect(Math.hypot(coords[0].mid.x-coords[1].mid.x,coords[0].mid.y-coords[1].mid.y)).toBeGreaterThan(5);}
});
test('an incomplete knowledge download leaves existing browser records untouched',async({page})=>{
 const old={version:1,start:'2026-10-29',records:[{id:'keep',qid:'MI001',rating:2,at:100,seconds:10,day:null}],drafts:{MI001:'keep this'},favorites:['MI001'],conceptProgress:{'KMA001:concept':{rating:2,at:200}}};
 await page.addInitScript(value=>localStorage.setItem('ruc802.practice.v1',JSON.stringify(value)),old);await page.route('**/concept-data-macro.js',route=>route.abort());await page.goto('/#archive');await expect(page.locator('#app')).toContainText('知识图资料未能加载');expect(await saved(page)).toEqual(old);await expect(page.locator('[data-action="start-day"],[data-action="map-rate"]')).toHaveCount(0);
});
