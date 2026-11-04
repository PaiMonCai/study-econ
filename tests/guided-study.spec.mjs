import {test,expect} from '@playwright/test';
const key='ruc802.practice.v1';
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);

test('guided answers open immediately for all subjects without recording an attempt',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const subject of ['micro','macro','political']){
  await page.goto('/');await page.getByRole('button',{name:'原50天三科计划',exact:true}).click();await page.locator('#day-select').selectOption('1');
  await page.locator(`[data-action="study-day"][data-sub="${subject}"]`).click();
  await expect(page.getByRole('heading',{name:'规范作答',exact:true})).toBeVisible();
  await expect(page.locator('.study-applications')).toBeVisible();
  expect(await page.locator('.step-concept').count()).toBeGreaterThan(0);
  await expect(page.locator('.self-check')).toHaveCount(0);await expect(page.locator('.photo-answer')).toHaveCount(0);
  const state=await saved(page);expect(state.session.study).toBe(true);expect(state.session.day).toBeNull();expect(state.records).toEqual([]);
 }
 expect(errors).toEqual([]);
});

test('covering an answer, changing questions and resuming preserve reading position',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'原50天三科计划',exact:true}).click();await page.locator('#day-select').selectOption('1');await page.locator('[data-action="study-day"][data-sub="micro"]').click();
 await page.getByRole('button',{name:'遮住答案，按主线复述',exact:true}).click();await expect(page.locator('#study-answer')).toBeHidden();
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI002');await expect(page.locator('#study-answer')).toBeVisible();
 await page.getByRole('button',{name:'上一题',exact:true}).click();await expect(page.locator('#study-answer')).toBeHidden();
 await page.reload();await expect(page.locator('.q-id')).toHaveText('MI001');await expect(page.locator('#study-answer')).toBeHidden();
 await page.goto('/#today');await page.getByRole('button',{name:'继续上次跟读',exact:true}).click();await expect(page.locator('#study-answer')).toBeHidden();
 await page.getByRole('button',{name:'再看规范作答',exact:true}).click();await expect(page.locator('#study-answer')).toBeVisible();
 expect((await saved(page)).records).toEqual([]);
});

test('monopoly topic connects the common models to guided applications',async({page},info)=>{
 await page.goto('/#topics/micro/05');await expect(page.getByRole('heading',{name:'从垄断、串联垄断到古诺与 n 厂商',exact:true})).toBeVisible();
 await expect(page.locator('.topic-stages')).toContainText('串联垄断');await expect(page.locator('.topic-stages')).toContainText('n 家古诺');
 await page.locator('.topic-comparison summary').click();await expect(page.locator('.topic-comparison table')).toBeVisible();
 await page.getByRole('button',{name:'按主线跟读本专题题目',exact:true}).click();
 await expect(page.locator('.q-id')).toHaveText('MI043');expect((await saved(page)).session.topicId).toBe('micro-05');
 await page.getByRole('button',{name:'大字号',exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:'大字号',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('link',{name:'返回专题串联',exact:true}).click();await expect(page).toHaveURL(/#topics\/micro\/05$/);
 await page.locator('[data-action="topic-section"][data-index="1"]').click();await expect(page.locator('#topic-stage-1 h2')).toBeFocused();
 await page.evaluate(()=>window.scrollTo({top:0}));await page.screenshot({path:info.outputPath('monopoly-topic.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('all 30 topic pages render with valid math and no page overflow',async({page})=>{
 test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#topics');
 const topics=await page.evaluate(()=>window.STUDY_DATA.topics.map(t=>({subject:t.subject,group:t.group,title:t.title,stages:t.stages.length})));
 expect(topics).toHaveLength(30);
 for(const topic of topics){
  await page.goto('/#topics/'+topic.subject+'/'+topic.group);await expect(page.locator('.topic-paper>h1')).toHaveText(topic.title);
  await expect(page.locator('.topic-stage')).toHaveCount(topic.stages);await expect(page.locator('.math-error,.katex-error')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),topic.title).toBe(true);
 }
 expect(errors).toEqual([]);
});

test('reading can return from knowledge cards and then switch to independent practice',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'原50天三科计划',exact:true}).click();await page.locator('#day-select').selectOption('1');await page.locator('[data-action="study-day"][data-sub="micro"]').click();
 await page.locator('.study-applications summary').click();await page.locator('.study-applications [data-action="recall-card"]').first().click();await expect(page).toHaveURL(/#recall-study$/);
 await page.locator('[data-action="recall-back"]').click();await expect(page.locator('#study-answer')).toBeVisible();
 await page.getByRole('button',{name:'独立做这道题',exact:true}).click();await expect(page.locator('.photo-answer')).toBeVisible();await expect(page.locator('.solution-steps')).toHaveCount(0);
 await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();await page.getByRole('button',{name:'不熟，有断点',exact:true}).click();
 const state=await saved(page);expect(state.session.study).toBe(false);expect(state.records).toHaveLength(1);expect(state.records[0].day).toBeNull();
});

test('guided study uses audited corrections while the original answer remains available',async({page})=>{
 for(const [subject,id,wrong,correct] of [['micro','MI075','所以这不是无转移的帕累托改善结论','帕累托改进'],['macro','MA025','货币利率下降并未抵消利差上升',/仍(?:然)?下降/]]){
  await page.goto('/#bank');await page.locator(`[data-action="subject"][data-sub="${subject}"]`).click();await page.locator('#search').fill(id);
  await page.getByRole('button',{name:'看规范作答',exact:true}).click();await expect(page.locator('.study-correction')).toBeVisible();await page.locator('[data-action="solution-all"]').click();
  await expect(page.locator('.study-answer .solution-steps')).toContainText(correct);await expect(page.locator('.study-answer .solution-steps')).not.toContainText(wrong);
  await page.getByText('题源与整理说明',{exact:true}).click();await page.getByText('查看保留的原解答（含已说明的错误）',{exact:true}).click();await expect(page.locator('.study-original')).toContainText(wrong);
 }
 expect((await saved(page)).records).toEqual([]);
});

test('topic question and card links return to the current topic across subjects',async({page})=>{
 await page.goto('/#topics/micro/05');await page.getByRole('button',{name:'按主线跟读本专题题目',exact:true}).click();
 await page.goto('/#topics/macro/02');await page.locator('[data-action="topic-expand-all"]').click();await page.locator('[data-action="study-single"][data-id="MA011"]').first().click();
 await expect(page.locator('.q-id')).toHaveText('MA011');await expect(page.getByRole('link',{name:'返回专题串联',exact:true})).toHaveAttribute('href','#topics/macro/02');expect((await saved(page)).session.topicId).toBe('macro-02');
 await page.getByRole('link',{name:'返回专题串联',exact:true}).click();await page.locator('.topic-card-links [data-action="recall-card"]').first().click();
 await page.reload();await page.getByRole('button',{name:'返回专题串联',exact:true}).click();await expect(page).toHaveURL(/#topics\/macro\/02$/);
 await page.goto('/#bank');await page.locator('[data-action="subject"][data-sub="micro"]').click();await page.locator('#search').fill('MI001');await page.getByRole('button',{name:'看规范作答',exact:true}).click();
 await expect(page.getByRole('link',{name:'返回专题串联',exact:true})).toHaveAttribute('href','#topics/micro/01');expect((await saved(page)).session.topicId).toBeNull();
});
