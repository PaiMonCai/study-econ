import {test,expect} from '@playwright/test';
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')));
async function day(page,value='1'){await page.goto('/');await page.locator('#intensive-day-select').selectOption(value);}

test('intensive home has fifteen bounded days, two subjects and a four-hour budget',async({page})=>{
 await day(page);await expect(page.getByRole('heading',{name:/宏微观15天，\s*按满分要求训练。/})).toBeVisible();
 await expect(page.locator('#intensive-day-select option')).toHaveCount(15);await expect(page.locator('.int-subject')).toHaveCount(2);await expect(page.locator('.int-subject input[type=checkbox]')).toHaveCount(6);
 await expect(page.getByRole('button',{name:'上一强化日'})).toBeDisabled();await page.getByRole('button',{name:'下一强化日'}).click();await expect(page.locator('#intensive-day-select')).toHaveValue('2');
 await page.locator('#intensive-day-select').selectOption('15');await expect(page.getByRole('button',{name:'下一强化日'})).toBeDisabled();await expect(page.locator('.int-assessment')).toContainText('P03');
 expect(await page.locator('.int-time-budget strong').allTextContents()).toEqual(['120分钟','60分钟','30分钟','20分钟','10分钟']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
 await expect(page.locator('.int-subject-grid')).not.toContainText('政治经济学');
});

test('intensive checklist and ratings survive reload and remain separate from legacy day records',async({page})=>{
 await day(page);await page.locator('[data-intensive-check="1:micro:0"]').check();await page.locator('[data-action="int-required"][data-sub="micro"]').click();
 await expect(page.locator('.q-id')).toHaveText('MI001');await expect(page.locator('.rail-title')).toContainText('强化第1天');
 await page.locator('[data-action="reveal"]').click();await page.getByRole('button',{name:'不熟，有断点',exact:true}).click();
 let state=await saved(page);expect(state.records).toHaveLength(1);expect(state.records[0]).toMatchObject({qid:'MI001',day:null,planId:'intensive-15',planDay:1,rating:1});
 await page.reload();await expect(page.locator('.rating.selected')).toContainText('不熟');await page.getByRole('button',{name:'返回计划',exact:true}).click();await page.locator('#intensive-day-select').selectOption('1');await expect(page.locator('[data-intensive-check="1:micro:0"]')).toBeChecked();
 await expect(page.locator('.int-subject').first()).toContainText('本计划日已自评 1/2题');await expect(page.locator('.int-review')).toContainText('错点 MI001');
 await page.getByRole('button',{name:'原50天三科计划',exact:true}).click();await page.locator('#day-select').selectOption('1');await expect(page.locator('.subject-pills button')).toHaveCount(30);await expect(page.locator('.study-footer')).toContainText('0/30题');
 await page.reload();await expect(page.locator('#day-select')).toBeVisible();state=await saved(page);expect(state.records[0].planId).toBe('intensive-15');expect(state.schedule.mode).toBe('legacy');
});

test('intensive dates and checklist backup roundtrip preserve legacy dates and history',async({page})=>{
 await day(page);await page.locator('[data-intensive-check="1:macro:1"]').check();await page.goto('/#settings');
 await page.getByRole('button',{name:'原50天三科计划',exact:true}).click();await expect(page).toHaveURL(/#settings$/);await expect(page.locator('#intensive-start')).toBeVisible();await page.getByRole('button',{name:'宏微观15天强化',exact:true}).click();await expect(page.locator('#start-date')).toBeVisible();
 await page.locator('#intensive-start').fill('2026-11-08');await page.getByRole('button',{name:'保存强化日期',exact:true}).click();await expect(page.locator('#intensive-start')).toHaveValue('2026-11-08');await expect(page.locator('#start-date')).toHaveValue('2026-10-29');
 const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const download=await pending,stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const backup=JSON.parse(text);
 expect(backup.schedule.start).toBe('2026-11-08');expect(backup.intensiveProgress['1:macro:1'].checked).toBe(true);
 await page.evaluate(()=>localStorage.removeItem('ruc802.practice.v1'));await page.reload();await page.locator('#import-file').setInputFiles({name:'intensive.json',mimeType:'application/json',buffer:Buffer.from(text)});await page.getByRole('button',{name:'合并导入',exact:true}).click();
 await expect(page.locator('#intensive-start')).toHaveValue('2026-11-08');await expect(page.locator('#start-date')).toHaveValue('2026-10-29');expect((await saved(page)).intensiveProgress['1:macro:1'].checked).toBe(true);
});

test('final-day paper remains locked until submission and keeps its intensive attribution and score',async({page})=>{
 await day(page,'14');await page.getByRole('button',{name:'开始120分钟验收',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('CMI09');await expect(page.locator('[data-action="reveal"]')).toHaveCount(0);await expect(page.locator('[data-action="hint"]')).toHaveCount(0);
 await page.reload();await expect(page.locator('[data-action="reveal"]')).toHaveCount(0);await page.locator('[data-action="paper-submit"]').first().click();
 const inputs=page.locator('[data-score-part]');for(let i=0;i<await inputs.count();i++)await inputs.nth(i).fill(await inputs.nth(i).getAttribute('max'));await page.locator('[data-action="case-score"]').click();
 const state=await saved(page);expect(state.records[0]).toMatchObject({qid:'CMI09',planId:'intensive-15',planDay:14,paperId:'P02',day:null,score:25});
 await page.getByRole('button',{name:'返回计划',exact:true}).click();await page.locator('#intensive-day-select').selectOption('14');await expect(page.locator('.int-score')).toContainText('1/4题');await expect(page.locator('.int-score')).not.toContainText('100/100');
});

test('all fifteen days render their tasks, screening stays distinct, and the offline guide is downloadable',async({page,request})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await day(page);
 for(let n=1;n<=15;n++){await page.locator('#intensive-day-select').selectOption(String(n));await expect(page.locator('.int-subject')).toHaveCount(2);await expect(page.locator('.int-day-body h2')).not.toBeEmpty();}
 await page.locator('#intensive-day-select').selectOption('1');await page.locator('.int-screen summary').first().click();await expect(page.locator('.int-screen').first()).toContainText('筛查不计完整作答');await expect(page.locator('.int-screen').first().locator('.int-question')).toHaveCount(8);
 const guide=await request.get('/materials/intensive-15-day-plan.md');expect(guide.ok()).toBeTruthy();expect(await guide.text()).toContain('第15天：第二次限时验收');expect(errors).toEqual([]);
});
