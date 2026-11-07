import {test,expect} from '@playwright/test';

test('the added chains and proofs keep every question aligned with its complete answer',async({page},info)=>{
 test.setTimeout(120000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [id,count] of [['EMI065',5],['EMI066',5],['EMI067',5],['EMI068',5],['EMA047',7],['EMI040',6],['EMI024',6]]){
  await page.goto('/#exam/'+id);
  await expect(page.locator('.exam-type-prompt-part')).toHaveCount(count);
  await expect(page.locator('.exam-type-answer-part')).toHaveCount(count);
  for(let number=1;number<=count;number++){
   await expect(page.locator('#exam-type-part-'+number+' h2')).toContainText('（'+number+'）');
   expect((await page.locator('#exam-type-part-'+number+' .rich').innerText()).trim().length).toBeGreaterThan(40);
  }
  await expect(page.locator('.math-error,.katex-error')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),id).toBe(true);
  await expect(page.locator('.exam-type-knowledge')).toContainText('本题怎样调用');
  if(id==='EMI067'){
   await page.locator('.exam-type-figure').scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath('pricing-welfare.png'),fullPage:true});
  }
 }
 await page.goto('/#exam/EMI068');
 await expect(page.locator('#exam-type-part-3')).toContainText('不允许扣留');
 await expect(page.locator('#exam-type-part-4')).toContainText('44');
 await page.emulateMedia({media:'print'});
 await expect(page.locator('#exam-type-part-5')).toBeVisible();
 await expect(page.locator('.exam-type-knowledge')).toBeVisible();
 await expect(page.locator('.exam-type-figure')).toBeVisible();
 await page.emulateMedia({media:'screen'});
 await page.locator('.exam-type-figure').scrollIntoViewIfNeeded();
 await page.screenshot({path:info.outputPath('pollution-institutions.png'),fullPage:true});
 expect(errors).toEqual([]);
});

test('new case drafts persist independently from an existing case and exportable state',async({page})=>{
 await page.goto('/#exam/EMI024/write');
 await page.locator('#exam-type-draft').fill('原题第六问：固定效用后求补偿需求。');
 for(const id of ['EMI065','EMI066','EMI067','EMI068','EMA047']){
  await page.goto('/#exam/'+id+'/write');
  await expect(page.locator('#exam-type-draft')).toHaveValue('');
  await page.locator('#exam-type-draft').fill(id+'（1）起式；（2）核约束；（3）给结论。');
  await page.reload();
  await expect(page.locator('#exam-type-draft')).toHaveValue(id+'（1）起式；（2）核约束；（3）给结论。');
 }
 await page.goto('/#exam/EMI024/write');
 await expect(page.locator('#exam-type-draft')).toHaveValue('原题第六问：固定效用后求补偿需求。');
 const drafts=await page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')).drafts);
 for(const id of ['EMI065','EMI066','EMI067','EMI068','EMA047'])expect(drafts[id]).toContain(id);
});

test('chapter and source routes expose the new complete models with distinct source identities',async({page})=>{
 for(const [subject,chapter,id] of [['micro',12,'EMI065'],['micro',10,'EMI066'],['micro',14,'EMI067'],['micro',19,'EMI068'],['macro',5,'EMA047']]){
  await page.goto('/#bank/'+subject+'/chapter/'+chapter);
  await expect(page.locator('.exam-type-row h3 a[href="#exam/'+id+'"]')).toBeVisible();
  await page.goto('/#exam/'+id+'/sources');
  await expect(page.locator('.exam-type-sources')).toContainText(id==='EMA047'?'教材原书':'章首导读定位');
  await expect(page.locator('.exam-type-sources')).toContainText('PDF物理页');
 }
});
