import {test,expect} from '@playwright/test';
const key='ruc802.practice.v1';
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);

test('guided answers open immediately for all subjects without recording an attempt',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const subject of ['micro','macro','political']){
  await page.goto('/#archive');await page.locator('#group-filter').selectOption('01');
  await page.locator(`[data-action="subject"][data-sub="${subject}"]`).click();await page.locator('[data-action="study-filter"]').click();
  await expect(page.getByRole('heading',{name:'解题步骤',exact:true})).toBeVisible();
  await expect(page.locator('.study-pitfalls,.study-recap')).toHaveCount(2);
  await expect(page.locator('.reading-document details,.solution-reader-controls')).toHaveCount(0);
  expect(await page.locator('.step-concept').count()).toBeGreaterThan(0);
  await expect(page.locator('.self-check')).toHaveCount(0);await expect(page.locator('.photo-answer')).toHaveCount(0);
  const state=await saved(page);expect(state.session.study).toBe(true);expect(state.session.day).toBeNull();expect(state.records).toEqual([]);
 }
 expect(errors).toEqual([]);
});

test('changing questions and resuming keeps answers fully readable',async({page})=>{
 await page.goto('/#archive');await page.locator('#group-filter').selectOption('01');await page.locator('[data-action="study-filter"]').click();
 await expect(page.locator('#study-answer')).toBeVisible();await expect(page.locator('[data-action="study-reveal"]')).toHaveCount(0);
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI002');await expect(page.locator('#study-answer')).toBeVisible();
 await page.getByRole('button',{name:'上一题',exact:true}).click();await expect(page.locator('#study-answer')).toBeVisible();
 await page.reload();await expect(page.locator('.q-id')).toHaveText('MI001');await expect(page.locator('#study-answer')).toBeVisible();
 await page.goto('/#today');await page.getByRole('button',{name:'继续上次跟读',exact:true}).click();await expect(page.locator('#study-answer')).toBeVisible();
 expect((await saved(page)).records).toEqual([]);
});

test('monopoly topic connects its canonical models and keeps reading preferences',async({page},info)=>{
 await page.goto('/#topics/micro/05');await expect(page.getByRole('heading',{name:'从垄断、串联垄断到古诺与 n 厂商',exact:true})).toBeVisible();
 await expect(page.locator('.topic-stages')).toContainText('串联垄断');await expect(page.locator('.topic-stages')).toContainText('n 家古诺');
 await expect(page.locator('.topic-comparison table')).toBeVisible();
 await page.locator('.topic-back [data-action="study-topic"]').click();
 await expect(page).toHaveURL(/#bank\/micro\/05$/);await page.locator('.exam-type-row>a').first().click();await expect(page.locator('.q-id')).toHaveText(/^EMI\d{3}$/);
 await page.getByRole('button',{name:'大字号',exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:'大字号',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('link',{name:'返回题型目录',exact:true}).click();await expect(page).toHaveURL(/#bank\/micro$/);await page.goto('/#topics/micro/05');
 await page.locator('[data-action="topic-section"][data-index="1"]').click();await expect(page.locator('#topic-stage-1 h2')).toBeFocused();
 await page.evaluate(()=>window.scrollTo({top:0}));await page.screenshot({path:info.outputPath('monopoly-topic.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('all active topic pages render with valid math and no page overflow',async({page})=>{
 test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#topics');
 const topics=await page.evaluate(()=>window.createPracticeCatalog(window.STUDY_DATA).topics.map(t=>({subject:t.subject,group:t.group,title:t.title,stages:t.stages.length})));
 expect(topics).toHaveLength(29);
 for(const topic of topics){
  await page.goto('/#topics/'+topic.subject+'/'+topic.group);await expect(page.locator('.topic-paper>h1')).toHaveText(topic.title);
  await expect(page.locator('.topic-stage')).toHaveCount(topic.stages);await expect(page.locator('.math-error,.katex-error')).toHaveCount(0);
  await expect(page.locator('.topic-reader details')).toHaveCount(0);await expect(page.locator('.topic-stage:visible')).toHaveCount(topic.stages);
  expect(await page.locator('.topic-paper .rich').evaluateAll(elements=>elements.some(element=>{const copy=element.cloneNode(true);for(const math of copy.querySelectorAll('.katex'))math.remove();return copy.textContent.includes('$');})),topic.title+' raw math delimiters').toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),topic.title).toBe(true);
 }
 expect(errors).toEqual([]);
});

test('reading can return from knowledge cards and then switch to independent practice',async({page})=>{
 await page.goto('/#archive');await page.locator('#group-filter').selectOption('01');await page.locator('[data-action="study-filter"]').click();
 await page.locator('.exam-related-cards [data-action="recall-card"]').first().click();await expect(page.getByRole('heading',{name:'知识解释',exact:true})).toBeVisible();
 await page.locator('[data-action="knowledge-back"]').click();await expect(page.locator('#study-answer')).toBeVisible();
 await page.getByRole('button',{name:'独立练习本题',exact:true}).click();await expect(page.locator('.photo-answer')).toBeVisible();await expect(page.locator('.solution-steps')).toHaveCount(0);
 await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();await page.getByRole('button',{name:'不熟，有断点',exact:true}).click();
 const state=await saved(page);expect(state.session.study).toBe(false);expect(state.records).toHaveLength(1);expect(state.records[0].day).toBeNull();
});

test('guided study uses audited corrections while the original answer remains available',async({page})=>{
 for(const [subject,id,wrong,correct] of [['micro','MI075','所以这不是无转移的帕累托改善结论','帕累托改进'],['macro','MA025','货币利率下降并未抵消利差上升',/仍(?:然)?下降/]]){
  await page.goto('/#archive');await page.locator(`[data-action="subject"][data-sub="${subject}"]`).click();await page.locator('#search').fill(id);
  await page.getByRole('button',{name:'看规范作答',exact:true}).click();await expect(page.locator('.study-correction')).toBeVisible();await expect(page.locator('.solution-reader-controls')).toHaveCount(0);
  await expect(page.locator('.study-answer .solution-steps')).toContainText(correct);await expect(page.locator('.study-answer .solution-steps')).not.toContainText(wrong);
  await page.getByRole('link',{name:'题源与整理记录',exact:true}).click();await expect(page.getByRole('heading',{name:'查看保留的原解答（含已说明的错误）',exact:true})).toBeVisible();await expect(page.locator('.study-original')).toContainText(wrong);
 }
 expect((await saved(page)).records).toEqual([]);
});

test('topic question and card links return to the current topic across subjects',async({page})=>{
 await page.goto('/#topics/micro/05');await page.locator('.topic-back [data-action="study-topic"]').click();
 await page.goto('/#topics/macro/02');const canonical=page.locator('.topic-all-questions [data-exam-link][data-source-ids*="MA011"]').first();const target=await canonical.getAttribute('data-exam-link');await canonical.click();
 await expect(page.locator('.q-id')).toHaveText(target);await expect(page.locator('#study-answer')).toHaveCount(0);
 await page.goto('/#topics/macro/02');await page.locator('.topic-card-links [data-action="recall-card"]').first().click();
 await page.getByRole('button',{name:'返回原处',exact:true}).click();await expect(page).toHaveURL(/#topics\/macro\/02$/);
 await page.goto('/#archive');await page.locator('[data-action="subject"][data-sub="micro"]').click();await page.locator('#search').fill('MI001');await page.getByRole('button',{name:'看规范作答',exact:true}).click();
 await expect(page.getByRole('link',{name:'本专题总结',exact:true})).toHaveAttribute('href','#topics/micro/01');expect((await saved(page)).session.topicId).toBe('micro-01');expect((await saved(page)).session.ids).toHaveLength(10);
});
