import {test,expect} from '@playwright/test';
const state=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')));
const panel=page=>page.locator('.diagram-panel-disclosure');
async function openPanel(page){if(!await panel(page).evaluate(el=>el.open))await panel(page).locator(':scope>summary').click();}

test('compact question navigation shares the workspace with diagrams after checking',async({page},info)=>{
 await page.goto('/#archive');await page.locator('#group-filter').selectOption('06');
 await page.locator('[data-action="start-filter"]').click();
 await expect(page.locator('.q-id')).toHaveText('MI051');await expect(page.locator('.question-rail .qchip')).toHaveCount(10);
 await expect(page.locator('.diagram-panel,.diagram-review')).toHaveCount(0);
 const before=await page.locator('.question-rail').boundingBox();expect(before.height).toBeLessThan(120);
 await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();
 await openPanel(page);await expect(page.locator('.diagram-panel .study-diagram').first()).toBeVisible();await page.evaluate(()=>scrollTo(0,0));
 await expect(page.locator('.sidebar')).toBeHidden();
 const rail=await page.locator('.question-rail').boundingBox(),question=await page.locator('.question-paper').boundingBox(),graph=await page.locator('.diagram-panel').boundingBox(),answer=await page.locator('.exercise').boundingBox();
 if(info.project.name==='desktop'){
  expect(graph.x+graph.width).toBeLessThanOrEqual(answer.x);expect(rail.width).toBeGreaterThan(answer.width);
  expect(Math.abs(question.y-answer.y)).toBeLessThan(2);expect(graph.y).toBeGreaterThanOrEqual(question.y+question.height);await expect(page.locator('.question-column #question-prompt')).toBeVisible();await expect(page.locator('.exercise #answer')).toBeVisible();
 }else{expect(question.y).toBeGreaterThanOrEqual(rail.y+rail.height);expect(graph.y).toBeGreaterThanOrEqual(question.y+question.height);expect(answer.y).toBeGreaterThanOrEqual(graph.y+graph.height);}
 const graphStep=page.locator('.diagram-panel [data-diagram-stage="2"]').first();await graphStep.click();
 await page.getByRole('button',{name:'大字号',exact:true}).click();
 await expect(panel(page)).toHaveAttribute('open','');await expect(page.locator('.diagram-frame [data-current-stage]').first()).toHaveAttribute('data-current-stage','2');
 expect((await state(page)).records).toEqual([]);
 await page.locator('[data-action="jump"][data-index="1"]').click();await expect(page.locator('.q-id')).toHaveText('MI052');
 await expect(page.locator('.diagram-panel,.diagram-review')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('reading keeps questions and complete diagrams beside the answer on desktop, including focus mode',async({page},info)=>{
 await page.goto('/#archive');await page.locator('#group-filter').selectOption('06');await page.locator('[data-action="study-filter"]').click();
 await page.locator('[data-action="jump"][data-index="9"]').click();await expect(page.locator('.q-id')).toHaveText('MI060');
 const current=await page.locator('.question-rail .qchip.current').boundingBox(),ids=await page.locator('.rail-ids').boundingBox();expect(current.x).toBeGreaterThanOrEqual(ids.x);expect(current.x+current.width).toBeLessThanOrEqual(ids.x+ids.width);
 await page.locator('[data-action="jump"][data-index="0"]').click();await expect(page.locator('.q-id')).toHaveText('MI051');
 await expect(panel(page)).toHaveCount(0);await expect(page.locator('.reading-document details')).toHaveCount(0);
 for(const focused of [false,true]){
  if(focused){await page.getByRole('button',{name:'专注阅读',exact:true}).click();await expect(page.locator('.question-rail')).toBeHidden();}
  await page.evaluate(()=>scrollTo(0,0));
  await expect(page.locator('.diagram-panel')).toBeVisible();await expect(page.locator('.diagram-panel .study-diagram').first()).toBeVisible();
  const question=await page.locator('.question-paper').boundingBox(),graph=await page.locator('.diagram-panel').boundingBox(),answer=await page.locator('.reading-article').boundingBox();
  expect(graph.y).toBeGreaterThanOrEqual(question.y+question.height);
  if(info.project.name==='desktop'){
   expect(question.x+question.width).toBeLessThanOrEqual(answer.x);expect(graph.x+graph.width).toBeLessThanOrEqual(answer.x);
   expect(Math.abs(question.y-answer.y)).toBeLessThan(2);
   await expect(page.locator('.question-column')).toHaveAttribute('role','region');
  }else expect(answer.y).toBeGreaterThanOrEqual(graph.y+graph.height);
 }
 await expect(page.locator('.diagram-frame [data-current-stage]').first()).toHaveAttribute('data-current-stage','2');
 await expect(page.locator('#study-answer')).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:info.outputPath('guided-graph-workspace.png'),fullPage:true});
 expect((await state(page)).records).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('reading prints complete final charts and all answer steps',async({page})=>{
 await page.goto('/#archive');await page.locator('#search').fill('MI051');await page.getByRole('button',{name:'看规范作答',exact:true}).click();
 await expect(panel(page)).toHaveCount(0);
 await page.emulateMedia({media:'print'});
 await expect(page.locator('.diagram-panel .diagram-print').first()).toBeVisible();
 await expect(page.locator('.diagram-panel .diagram-controls')).toHaveCount(0);await expect(page.locator('.solution-reader-steps')).toBeVisible();
 await expect(page.locator('.diagram-panel .diagram-print [data-current-stage]').first()).toHaveAttribute('data-current-stage','2');
 await page.emulateMedia({media:'screen'});
});
