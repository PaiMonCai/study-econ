import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../serve.mjs';

const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')));
async function openReading(page,id='MI005',base=''){
 await page.goto(base+'/#bank');await page.locator('#search').fill(id);
 await page.getByRole('button',{name:'看规范作答',exact:true}).click();
 await expect(page.locator('.q-id')).toHaveText(id);
}
async function footerIsReachable(page){
 const footer=page.getByRole('navigation',{name:'题目翻页'});
 await expect(footer).toHaveCount(1);
 const box=await footer.boundingBox(),viewport=page.viewportSize();
 expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1);
 expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width+1);
 const next=footer.locator('button').last();
 expect(await next.evaluate(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
}

test('a single question entry continues through its topic without recording mastery',async({page})=>{
 await openReading(page);await footerIsReachable(page);
 expect((await saved(page)).session.ids).toHaveLength(10);
 await expect(page.getByRole('navigation',{name:'题目翻页'})).toContainText('5 / 10 题');
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI006');
 await expect(page.locator('#question-heading')).toBeFocused();
 await page.getByRole('button',{name:'上一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI005');
 expect((await saved(page)).records).toEqual([]);
});

test('next is reachable at the start middle and end of a complete answer without covering the last content',async({page},info)=>{
 await openReading(page,'MI021');await footerIsReachable(page);
 await expect(page.locator('.solution-reader-controls')).toHaveCount(0);
 for(const portion of [0,.5,1]){
  await page.evaluate(portion=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*portion),portion);
  await footerIsReachable(page);
 }
 const summary=page.locator('.reading-end'),footer=page.locator('.exercise-bottom');
 expect((await summary.boundingBox()).y+(await summary.boundingBox()).height).toBeLessThanOrEqual((await footer.boundingBox()).y);
 await page.screenshot({path:info.outputPath('reading-bottom-clearance.png')});
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI022');
 await page.getByRole('button',{name:'上一题',exact:true}).click();
 const reader=page.locator('.solution-reader');expect(await reader.getAttribute('data-progress')).toBe(await reader.getAttribute('data-total'));
 await page.reload();await footerIsReachable(page);expect((await saved(page)).records).toEqual([]);
});

test('old partial single-question reading restores with its complete answer and a next question',async({page})=>{
 await openReading(page);
 await page.evaluate(()=>{const key='ruc802.practice.v1',state=JSON.parse(localStorage.getItem(key));Object.assign(state.session,{ids:['MI005'],index:0,topicId:null,solutionLines:2,revealed:false});localStorage.setItem(key,JSON.stringify(state));});
 await page.reload();await expect(page.locator('.q-id')).toHaveText('MI005');
 const reader=page.locator('.solution-reader');expect(await reader.getAttribute('data-progress')).toBe(await reader.getAttribute('data-total'));await expect(page.locator('#study-answer')).toBeVisible();
 expect((await saved(page)).session.solutionLines).toBe(2);
 expect((await saved(page)).session.index).toBe(4);
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI006');
 expect((await saved(page)).records).toEqual([]);
});

test('switching an existing practice group to reading keeps its selected queue',async({page})=>{
 await page.goto('/');
 await page.locator('#group-filter').selectOption('01');await page.locator('[data-action="start-filter"]').click();
 const ids=(await saved(page)).session.ids;
 await page.getByRole('button',{name:'直接看规范作答',exact:true}).click();
 expect((await saved(page)).session.ids).toEqual(ids);
 await footerIsReachable(page);expect((await saved(page)).records).toEqual([]);
});

test('reading restores its scroll position after flipping, refreshing and returning from sources',async({page})=>{
 await openReading(page);const view=page.viewportSize().width<1000?'narrow':'wide';
 await page.evaluate(()=>document.fonts.ready);
 const position=await page.evaluate(()=>Math.min(1400,document.documentElement.scrollHeight-innerHeight));expect(position).toBeGreaterThan(500);
 await page.evaluate(top=>scrollTo(0,top),position);
 await expect.poll(()=>page.evaluate(key=>Number(sessionStorage.getItem(key)),`ruc802.reader-offset.MI005:19:serif:${view}`)).toBe(position);
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI006');
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
 await page.getByRole('button',{name:'上一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI005');
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(position);
 await page.reload();await expect(page.locator('.q-id')).toHaveText('MI005');await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(position);
 await page.evaluate(()=>location.hash='sources/MI005');await expect(page.locator('.source-reader')).toBeVisible();
 await page.getByRole('link',{name:'返回当前题目',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI005');await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(position);
 expect((await saved(page)).records).toEqual([]);
});

test('arrow keys flip reading questions while controls, selected text and charts retain their own input',async({page})=>{
 await openReading(page);await page.locator('#question-heading').focus();
 await page.keyboard.press('ArrowRight');await expect(page.locator('.q-id')).toHaveText('MI006');
 await page.keyboard.press('ArrowLeft');await expect(page.locator('.q-id')).toHaveText('MI005');
 await page.getByRole('button',{name:'大字号',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(page.locator('.q-id')).toHaveText('MI005');
 await page.locator('#question-heading').focus();await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.getElementById('question-prompt'));getSelection().removeAllRanges();getSelection().addRange(range);});
 await page.keyboard.press('ArrowRight');await expect(page.locator('.q-id')).toHaveText('MI005');
 const canvas=page.locator('.diagram-frame .diagram-canvas').first();await canvas.focus();await page.keyboard.press('ArrowRight');await expect(page.locator('.q-id')).toHaveText('MI005');
 expect((await saved(page)).records).toEqual([]);
});

test('comprehensive reading continues to the other case in the topic and finishes cleanly',async({page})=>{
 await page.goto('/#integrated/macro');await page.locator('[data-action="study-single"][data-id="CMA01"]').click();
 await expect(page.locator('.q-id')).toHaveText('CMA01');await footerIsReachable(page);
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('CMA02');
 await page.getByRole('button',{name:'读完本组',exact:true}).click();await expect(page).toHaveURL(/#integrated\/macro$/);
 expect((await saved(page)).records).toEqual([]);
});

test('direct reading settings and page controls fit a 320px screen and retain preferences',async({page})=>{
 await page.setViewportSize({width:320,height:700});await openReading(page,'MI001');
 await expect(page.getByRole('button',{name:'大字号',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'大字号',exact:true}).click();
 await expect(page.locator('.reading-options')).toHaveCount(0);await page.locator('#reading-face').selectOption('sans');
 await page.getByRole('button',{name:'专注阅读',exact:true}).click();
 await footerIsReachable(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'下一题',exact:true}).click();await page.reload();
 await expect(page.locator('.q-id')).toHaveText('MI002');await footerIsReachable(page);
 expect((await saved(page)).reading).toMatchObject({size:21,face:'sans',focus:true});
 await page.emulateMedia({media:'print'});await expect(page.locator('.exercise-bottom')).toBeHidden();
});

test('server restores an old single-question session and synchronizes the reading queue to another browser',async({page,browser})=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'ruc802-reading-nav-')),password='reading-nav-test-password';
 const server=await createApp({basePath:'/802',dataDir,access:{password}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/802`;
 async function login(target){await target.goto(base+'/');await target.getByLabel('访问密码',{exact:true}).fill(password);await target.getByRole('button',{name:'进入练习室',exact:true}).click();await expect(target.locator('.local-status')).toHaveText('服务器已保存');}
 try{
  await login(page);await openReading(page,'MI005',base);await expect(page.locator('.local-status')).toHaveText('服务器已保存');
  const current=(await(await page.request.get(base+'/api/state')).json()).state;
  const legacy={...current.session,ids:['MI005'],index:0,topicId:null,solutionLines:2,work:{}};
  const status=await(await page.request.get(base+'/_access/status')).json();
  const response=await page.request.patch(base+'/api/state',{headers:{'X-Ruc802-CSRF':status.csrfToken},data:{changes:[{path:['session'],before:current.session,after:legacy},{path:['favorites','MI001'],before:false,after:true}]}});
  expect(response.status()).toBe(200);
  await page.reload();await expect(page.locator('.q-id')).toHaveText('MI005');
  const reader=page.locator('.solution-reader');expect(await reader.getAttribute('data-progress')).toBe(await reader.getAttribute('data-total'));
  await expect.poll(async()=>{const state=(await(await page.request.get(base+'/api/state')).json()).state;return state.session.ids.length;}).toBe(10);
  const context=await browser.newContext();try{
   const other=await context.newPage();await login(other);await other.goto(base+'/#practice');
   await expect(other.locator('.q-id')).toHaveText('MI005');await footerIsReachable(other);
   const reader=other.locator('.solution-reader');expect(await reader.getAttribute('data-progress')).toBe(await reader.getAttribute('data-total'));await expect(other.locator('.reading-document details')).toHaveCount(0);
   const state=(await(await other.request.get(base+'/api/state')).json()).state;
   expect(state.favorites).toContain('MI001');expect(state.records).toEqual([]);expect(state.session.index).toBe(4);
  }finally{await context.close();}
 }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await rm(dataDir,{recursive:true,force:true});}
});
