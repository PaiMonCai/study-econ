import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../serve.mjs';

const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')));
async function openCase(page,id='CMI01',url='/'){
 await page.goto(url+'#integrated/'+(id.startsWith('CMI')?'micro':'macro'));
 await page.locator('[data-action="single"][data-id="'+id+'"]').click();
 await expect(page.locator('.q-id')).toHaveText(id);
}
async function reveal(page){await page.locator('[data-action="reveal"]').click();await expect(page.locator('.case-score-panel')).toBeVisible();}
async function score(page,half=false){
 const inputs=page.locator('[data-score-part]');
 for(let i=0;i<await inputs.count();i++)await inputs.nth(i).fill(String(Number(await inputs.nth(i).getAttribute('max'))-(half&&i===0?0.5:0)));
 await page.locator('[data-action="case-score"]').click();
 await expect(page.locator('#case-score-total')).toContainText('已保存 '+(half?'24.5':'25')+'/25');
}
async function picture(page){
 const data=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=120;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,240,120);ctx.fillStyle='black';ctx.fillText('Independent answer',15,45);return canvas.toDataURL('image/png');});
 return {name:'answer.png',mimeType:'image/png',buffer:Buffer.from(data.split(',')[1],'base64')};
}
async function backup(page){
 const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();
 const stream=await(await pending).createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();return JSON.parse(text);
}

test('structured specialist prompts retain their original wording for comparison',async({page})=>{
 await page.goto('/#bank');await page.locator('#search').fill('MI001');await page.locator('[data-action="single"][data-id="MI001"]').click();
 const expected=await page.evaluate(()=>window.STUDY_DATA.subjects[0].questions[0].training.parts.length);
 await expect(page.locator('#question-prompt')).toContainText('（'+expected+'）');
 await page.locator('details.source>summary').click();await page.locator('.training-source-prompt>summary').click();
 await expect(page.locator('.training-source-prompt .rich')).not.toBeEmpty();
 await page.locator('[data-action="reveal"]').click();await expect(page.locator('.training-next-level')).toBeVisible();
 expect((await saved(page)).records).toEqual([]);
});

test('all forty comprehensive cases render complete questions and answers at large type',async({page})=>{
 test.setTimeout(240000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/#integrated');const cases=await page.evaluate(()=>window.STUDY_DATA.comprehensive.questions.map(q=>({id:q.id,parts:q.parts.length})));
 expect(cases).toHaveLength(40);
 for(const q of cases){
  await openCase(page,q.id);if(!await page.locator('.reading-options').evaluate(el=>el.open))await page.locator('.reading-options>summary').click();await page.getByRole('button',{name:'大字号',exact:true}).click();
  await expect(page.locator('#question-prompt')).toContainText('（'+q.parts+'）');await reveal(page);
  await page.locator('[data-action="solution-all"]').click();
  await expect(page.locator('[data-score-part]')).toHaveCount(q.parts);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),q.id+' page overflow').toBe(true);
  await expect(page.locator('.math-error,.katex-error')).toHaveCount(0);
 }
 expect((await saved(page)).records).toEqual([]);expect(errors).toEqual([]);
});

test('comprehensive guide mode retains progressive position without creating a score',async({page})=>{
 await page.goto('/#integrated/macro');await page.locator('[data-action="study-single"][data-id="CMA01"]').click();
 await expect(page.locator('#study-answer')).toBeVisible();await page.locator('[data-action="solution-next"]').click();
 const count=(await saved(page)).session.solutionLines;expect(count).toBeGreaterThan(1);
 await page.reload();await expect(page.locator('#study-answer')).toBeVisible();expect((await saved(page)).session.solutionLines).toBe(count);
 await page.getByRole('button',{name:'遮住答案，按主线复述',exact:true}).click();await expect(page.locator('#study-answer')).toBeHidden();
 expect((await saved(page)).records).toEqual([]);
});

test('scores and comprehensive photos survive reload and full backup import',async({page,browser})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'刷题训练',exact:true})).toBeVisible();await page.evaluate(()=>{const state=window.RemoteStore.model.fresh();state.schedule.mode='legacy';state.records=[{id:'legacy',qid:'MI001',rating:2,at:1000,updatedAt:1000,seconds:10,day:1}];localStorage.setItem('ruc802.practice.v1',JSON.stringify(state));});await page.reload();await expect(page.getByRole('heading',{name:'刷题训练',exact:true})).toBeVisible();
 await openCase(page);await page.locator('input[data-photo-input][multiple]').setInputFiles(await picture(page));
 await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');await reveal(page);await score(page,true);
 await page.reload();await expect(page.locator('#case-score-total')).toContainText('已保存 24.5/25');await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
 await page.goto('/#settings');const data=await backup(page);expect(data.records).toHaveLength(2);expect(data.photos.items[0].qid).toBe('CMI01');
 const context=await browser.newContext({baseURL:new URL(page.url()).origin});try{
  const other=await context.newPage();await other.goto('/#settings');
  await other.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await other.getByRole('dialog').getByRole('button',{name:'合并导入',exact:true}).click();await expect(other.getByRole('dialog')).toHaveCount(0);
  expect((await saved(other)).records.find(r=>r.qid==='CMI01').score).toBe(24.5);expect((await saved(other)).records.find(r=>r.id==='legacy').rating).toBe(2);
  await openCase(other);await expect(other.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
 }finally{await context.close();}
});

test('timed papers keep answers hidden until submission and score all four cases as one attempt',async({page})=>{
 test.setTimeout(90000);await page.goto('/#papers');await page.locator('[data-action="paper-start"][data-id="P01"]').click();
 await expect(page.locator('.paper-session-status')).toContainText('独立作答中');
 await expect(page.locator('[data-action="reveal"],[data-action="hint"],.source,.knowledge-bridge,.diagram-panel,.study-entry')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'暂停计时',exact:true})).toBeVisible();
 const attempt=(await saved(page)).session.paperAttempt;
 await page.getByRole('button',{name:'暂停计时',exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:'开始计时',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'开始计时',exact:true}).click();
 await page.locator('[data-action="jump"][data-index="3"]').click();await expect(page.locator('.q-id')).toHaveText('CMA05');
 await page.locator('.exercise-bottom [data-action="paper-submit"]').click();await expect(page.locator('.paper-session-status')).toContainText('已交卷');
 await expect(page.locator('[data-action="timer"]')).toBeDisabled();await expect(page.locator('.case-score-panel')).toBeVisible();
 for(let i=0;i<4;i++){await page.locator('[data-action="jump"][data-index="'+i+'"]').click();await score(page);}
 await expect(page.locator('.paper-session-status')).toContainText('全卷 100/100');
 const state=await saved(page);expect(state.records.filter(r=>r.paperAttempt===attempt)).toHaveLength(4);expect(state.session.paperSubmitted).toBe(true);
 await page.reload();await expect(page.locator('.paper-session-status')).toContainText('全卷 100/100');
 await page.goto('/#papers');await expect(page.locator('.timed-paper-list>article').first()).toContainText('最近完整自评分：100/100');
 await page.locator('[data-action="paper-start"][data-id="P01"]').click();expect((await saved(page)).session.paperAttempt).not.toBe(attempt);
 await expect(page.locator('.paper-session-status')).toContainText('独立作答中');await expect(page.locator('.case-score-panel')).toHaveCount(0);
});

test('timed paper preview prints only its four questions',async({page})=>{
 await page.goto('/#papers/P02');await expect(page.locator('.paper-question-sheet')).toHaveCount(4);
 await page.emulateMedia({media:'print'});await expect(page.locator('.paper-question-sheet').first()).toBeVisible();
 await expect(page.locator('.paper-preview-toolbar')).toBeHidden();await expect(page.locator('.solution-reader,.case-score-panel')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

const serverTest=test.extend({site:async({},use)=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'ruc802-comprehensive-'));
 const server=await createApp({basePath:'/802',dataDir,access:{password:'training-test-password'}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await use(`http://127.0.0.1:${server.address().port}/802/`);}finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await rm(dataDir,{recursive:true,force:true});}
}});
async function login(page,url){await page.goto(url);await page.getByLabel('访问密码',{exact:true}).fill('training-test-password');await page.getByRole('button',{name:'进入练习室',exact:true}).click();await expect(page.locator('.local-status')).toHaveText('服务器已保存');}
serverTest('server accepts comprehensive scores and photos and restores them in another browser',async({page,browser,site})=>{
 await login(page,site);await openCase(page,'CMA01',site);await page.locator('input[data-photo-input][multiple]').setInputFiles(await picture(page));
 await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');await reveal(page);await score(page,true);await expect(page.locator('.local-status')).toHaveText('服务器已保存');
 const state=(await(await page.request.get(site+'api/state')).json()).state;expect(state.records[0].score).toBe(24.5);
 const context=await browser.newContext();try{
  const other=await context.newPage();await login(other,site);await other.goto(site+'#practice');
  await expect(other.locator('.q-id')).toHaveText('CMA01');await expect(other.locator('#case-score-total')).toContainText('已保存 24.5/25');await expect(other.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
  await other.goto(site+'#settings');const data=await backup(other);expect(data.photos.items[0].qid).toBe('CMA01');expect(data.records[0].partScores).toEqual(state.records[0].partScores);
 }finally{await context.close();}
});
