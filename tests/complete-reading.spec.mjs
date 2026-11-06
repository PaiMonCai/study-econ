import {test,expect} from '@playwright/test';
const storageKey='ruc802.practice.v1';
const records=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).records,storageKey);
async function beginReading(page){
 await page.goto('/');await page.locator('#group-filter').selectOption('01');
 await page.locator('[data-action="study-filter"]').click();
 await expect(page.locator('.q-id')).toHaveText('MI001');
}
async function completeAnswer(page){
 await expect(page.locator('.q-id')).toHaveCount(1);
 const expected=await page.evaluate(()=>{
  const id=document.querySelector('.q-id').textContent;
  const question=[...window.STUDY_DATA.subjects.flatMap(s=>s.questions),...window.STUDY_DATA.comprehensive.questions].find(q=>q.id===id);
  return window.SolutionReader.guide(question).steps.map(step=>{const template=document.createElement('template');template.innerHTML=step.body_html;return template.innerHTML;});
 });
 const bodies=page.locator('.solution-step-body');await expect(bodies).toHaveCount(expected.length);
 expect(await bodies.evaluateAll(elements=>elements.map(element=>element.innerHTML))).toEqual(expected);
 await expect(page.locator('.solution-reader-controls,[data-action="solution-next"],[data-action="solution-all"],[data-action="solution-reset"]')).toHaveCount(0);
}

test('reading displays complete steps and explanations before and after question changes',async({page})=>{
 await beginReading(page);await completeAnswer(page);
 await expect(page.locator('.reading-document details,[data-action="study-reveal"]')).toHaveCount(0);
 await expect(page.locator('.study-pitfalls,.study-recap')).toHaveCount(2);
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI002');await completeAnswer(page);
 await page.getByRole('button',{name:'上一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI001');await completeAnswer(page);
 await page.reload();await completeAnswer(page);expect(await records(page)).toEqual([]);
});

test('independent checking displays its complete answer only after finishing the attempt',async({page})=>{
 await page.goto('/');await page.locator('#group-filter').selectOption('01');await page.locator('[data-action="start-filter"]').click();
 await expect(page.locator('.solution-step-body')).toHaveCount(0);
 await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();await completeAnswer(page);
 await expect(page.locator('.knowledge-review')).toBeVisible();
 await expect(page.locator('.self-check')).toBeVisible();expect(await records(page)).toEqual([]);
});

test('corrected answers and preserved original answers have separate complete pages',async({page})=>{
 for(const [subject,id,wrong] of [['micro','MI075','所以这不是无转移的帕累托改善结论'],['macro','MA025','货币利率下降并未抵消利差上升']]){
  await page.goto('/#bank');await page.locator(`[data-action="subject"][data-sub="${subject}"]`).click();await page.locator('#search').fill(id);
  await page.getByRole('button',{name:'看规范作答',exact:true}).click();await completeAnswer(page);
  await expect(page.locator('.solution-reader')).not.toContainText(wrong);
  await expect(page.locator('.reading-document')).not.toContainText(wrong);
  await page.locator('.reading-diagrams [data-diagram-enlarge]').first().click();await expect(page.getByRole('dialog').locator('details')).toHaveCount(0);await expect(page.getByRole('dialog')).not.toContainText(wrong);await page.keyboard.press('Escape');
  await page.getByRole('link',{name:'题源与整理记录',exact:true}).click();
  await expect(page.locator('.source-reader details')).toHaveCount(0);await expect(page.locator('.study-original')).toContainText(wrong);
  await expect(page.locator('.exam-source-note')).toContainText('不是教材原解');
  await page.getByRole('link',{name:'返回当前题目',exact:true}).click();await completeAnswer(page);
 }
 expect(await records(page)).toEqual([]);
});

test('all topic sections, comparison and boundaries are available without expanding',async({page})=>{
 await page.goto('/#topics/micro/05');
 const count=await page.evaluate(()=>window.STUDY_DATA.topics.find(topic=>topic.id==='micro-05').stages.length);
 await expect(page.locator('.topic-stage:visible')).toHaveCount(count);
 await expect(page.locator('.topic-comparison table')).toBeVisible();
 await expect(page.locator('.topic-boundaries,.topic-recall')).toHaveCount(2);
 await expect(page.locator('.topic-reader details,[data-action="topic-next"],[data-action="topic-expand-all"]')).toHaveCount(0);
 await page.locator('[data-action="topic-section"][data-index="3"]').click();await expect(page.locator('#topic-stage-3 h2')).toBeFocused();
 await expect(page.locator('.topic-stage:visible')).toHaveCount(count);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('insurance answer retains stacked fractions, aligned equations and printable complete steps',async({page},info)=>{
 await page.goto('/#bank');await page.locator('#search').fill('MI021');await page.getByRole('button',{name:'看规范作答',exact:true}).click();await completeAnswer(page);
 const reader=page.locator('.solution-reader-steps');expect(await reader.locator('.mfrac').count()).toBeGreaterThan(5);expect(await reader.locator('.sqrt').count()).toBeGreaterThan(1);await expect(reader.locator('.katex-error,.math-error')).toHaveCount(0);
 const rendered=await reader.locator('[data-typeset-tex],annotation[encoding="application/x-tex"]').evaluateAll(els=>els.map(el=>el.getAttribute('data-typeset-tex')||el.textContent));
 expect(rendered.some(tex=>tex.includes('\\begin{aligned}')&&tex.includes('W_L'))).toBe(true);
 expect(rendered.some(tex=>/q(?:\^\*)?=\\frac\{114\}\{11\}/.test(tex))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.emulateMedia({media:'print'});await expect(reader).toBeVisible();await expect(page.locator('.exercise-bottom')).toBeHidden();await completeAnswer(page);
 await page.emulateMedia({media:'screen'});await reader.screenshot({path:info.outputPath('complete-insurance-answer.png')});
});

test('reading zoom shows the complete graph and restores focus on close',async({page})=>{
 await beginReading(page);
 const diagram=page.locator('.reading-diagrams .study-diagram').first();
 await expect(diagram.locator('.diagram-frame [data-current-stage]')).toHaveAttribute('data-current-stage','2');
 await expect(diagram.locator('details,.diagram-controls')).toHaveCount(0);
 const trigger=diagram.getByRole('button',{name:'放大图形',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog');await expect(dialog.locator('[data-current-stage]')).toHaveAttribute('data-current-stage','2');
 await expect(dialog.locator('details')).toHaveCount(0);await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
 expect(await records(page)).toEqual([]);
});
