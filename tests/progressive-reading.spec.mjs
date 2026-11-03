import {test,expect} from '@playwright/test';
const storageKey='ruc802.practice.v1';
const visibleLines=page=>page.locator('.solution-line:visible');
const records=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).records,storageKey);
async function beginReading(page){
 await page.goto('/');await page.locator('#day-select').selectOption('1');
 await page.locator('[data-action="study-day"][data-sub="micro"]').click();
 await expect(page.locator('.q-id')).toHaveText('MI001');
}

test('guided reading reveals one line at a time and resumes each question',async({page})=>{
 await beginReading(page);await expect(visibleLines(page)).toHaveCount(1);
 const next=page.locator('[data-action="solution-next"]');
 await expect(next).toContainText(/下一行|进入第/);await next.click();await expect(visibleLines(page)).toHaveCount(2);
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI002');await expect(visibleLines(page)).toHaveCount(1);
 await page.getByRole('button',{name:'上一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI001');await expect(visibleLines(page)).toHaveCount(2);
 await page.reload();await expect(visibleLines(page)).toHaveCount(2);
 const state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);expect(state.session.solutionLines).toBe(2);expect(state.records).toEqual([]);
 await page.locator('[data-action="solution-all"]').click();expect(await visibleLines(page).count()).toBeGreaterThan(2);
 await expect(page.locator('[data-action="solution-next"]')).toHaveCount(0);
 await page.locator('[data-action="solution-reset"]').click();await expect(visibleLines(page)).toHaveCount(1);expect(await records(page)).toEqual([]);
});

test('independent checking uses the same progressive answer reader',async({page})=>{
 await page.goto('/');await page.locator('#day-select').selectOption('1');await page.locator('[data-action="start-day"][data-sub="micro"]').click();
 await expect(page.locator('.solution-lines')).toHaveCount(0);
 await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();await expect(visibleLines(page)).toHaveCount(1);
 await page.locator('[data-action="solution-next"]').click();await expect(visibleLines(page)).toHaveCount(2);
 await page.locator('[data-action="solution-all"]').click();expect(await visibleLines(page).count()).toBeGreaterThan(2);
 await expect(page.locator('.self-check')).toBeVisible();expect(await records(page)).toEqual([]);
});

test('progressive answers use corrections and retain erroneous source only in source details',async({page})=>{
 for(const [subject,id,wrong] of [['micro','MI075','所以这不是无转移的帕累托改善结论'],['macro','MA025','货币利率下降并未抵消利差上升']]){
  await page.goto('/#bank');await page.locator(`[data-action="subject"][data-sub="${subject}"]`).click();await page.locator('#search').fill(id);
  await page.getByRole('button',{name:'看规范作答',exact:true}).click();await page.locator('[data-action="solution-all"]').click();
  expect((await page.locator('.solution-lines').allTextContents()).join('')).not.toContain(wrong);
  await page.getByText('题源与整理说明',{exact:true}).click();await page.getByText('查看保留的原解答（含已说明的错误）',{exact:true}).click();
  await expect(page.locator('.study-original')).toContainText(wrong);
 }
 expect(await records(page)).toEqual([]);
});

test('topic stages advance individually and comparison is folded until requested',async({page})=>{
 await page.goto('/#topics/micro/05');await expect(page.locator('.topic-stage:visible')).toHaveCount(1);
 await expect(page.locator('#topic-stage-0')).toBeVisible();await expect(page.locator('.topic-comparison table')).toBeHidden();
 await page.locator('[data-action="topic-next"]').click();await expect(page.locator('.topic-stage:visible')).toHaveCount(1);await expect(page.locator('#topic-stage-1')).toBeVisible();
 await page.locator('[data-action="topic-prev"]').click();await expect(page.locator('#topic-stage-0')).toBeVisible();
 await page.locator('[data-action="topic-section"][data-index="3"]').click();await expect(page.locator('#topic-stage-3')).toBeVisible();await expect(page.locator('.topic-stage:visible')).toHaveCount(1);
 await page.locator('[data-action="topic-expand-all"]').click();expect(await page.locator('.topic-stage:visible').count()).toBeGreaterThan(3);
 await page.locator('.topic-comparison summary').click();await expect(page.locator('.topic-comparison table')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('insurance answer uses readable Markdown math with stacked fractions and aligned equations',async({page},info)=>{
 await page.goto('/#bank');await page.locator('#search').fill('MI021');await page.getByRole('button',{name:'看规范作答',exact:true}).click();await page.locator('[data-action="solution-all"]').click();
 const reader=page.locator('.solution-reader-steps');expect(await reader.locator('.mfrac').count()).toBeGreaterThan(5);expect(await reader.locator('.sqrt').count()).toBeGreaterThan(1);await expect(reader.locator('.katex-error,.math-error')).toHaveCount(0);
 const rendered=await reader.locator('[data-typeset-tex]').evaluateAll(els=>els.map(el=>el.getAttribute('data-typeset-tex')));
 expect(rendered.some(tex=>tex.includes('\\begin{aligned}')&&tex.includes('W_L'))).toBe(true);expect(rendered).toContain('q=\\frac{114}{11}');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await reader.screenshot({path:info.outputPath('markdown-insurance-answer.png')});
});

