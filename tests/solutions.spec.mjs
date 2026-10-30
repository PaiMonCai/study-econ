import {test,expect} from '@playwright/test';
test('checking presents ordered source steps and knowledge recap for all subjects',async({page},info)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const subject of ['micro','macro','political']){
  await page.goto('/');await page.locator('#day-select').selectOption('1');await page.locator(`[data-action="start-day"][data-sub="${subject}"]`).click();
  await expect(page.locator('#draft')).toHaveCount(0);await expect(page.locator('.solution-steps')).toHaveCount(0);await expect(page.locator('.knowledge-review')).toHaveCount(0);
  await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();await expect(page.getByRole('heading',{name:'规范解题过程',exact:true})).toBeVisible();
  expect(await page.locator('.solution-step').count()).toBeGreaterThan(1);await expect(page.getByRole('heading',{name:'本题知识点',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'把本题再串一遍',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();await page.evaluate(()=>window.scrollTo({top:0}));await page.screenshot({path:info.outputPath(subject+'-solution.png'),fullPage:true});
  const qid=await page.locator('.q-id').textContent();const source=await page.evaluate(qid=>window.STUDY_DATA.subjects.flatMap(s=>s.questions).find(q=>q.id===qid).solution,qid);expect(source.steps.map(s=>s.body_md).join('')).not.toBe('');expect(source.source.preserved).toBe(true);
 }
 expect(errors).toEqual([]);
});
