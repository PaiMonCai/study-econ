import {test,expect} from '@playwright/test';

test('the textbook chapter directory retains one canonical row per question',async({page})=>{
 for(const [subject,count,book] of [['micro',19,'尼科尔森'],['macro',19,'曼昆']]){
  await page.goto('/#bank/'+subject);
  await expect(page.locator('.chapter-book')).toContainText(book);
  if(subject==='micro')await expect(page.locator('.chapter-reference')).toContainText('高鸿业');
  await expect(page.locator('.exam-chapter')).toHaveCount(count);
  const order=await page.evaluate(subject=>window.STUDY_DATA.examTypes.chapterStudy[subject].ordered_case_ids,subject);
  expect(await page.locator('.exam-type-row h3 a').evaluateAll(links=>links.map(link=>link.hash.split('/')[1]))).toEqual(order);
  await expect(page.locator('#exam-type-chapter option')).toHaveCount(count+1);
 }
});

test('all 38 chapter views show models, correct primary links and complete cross references',async({page})=>{
 test.setTimeout(120000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/#bank');
 const chapters=await page.evaluate(()=>Object.entries(window.STUDY_DATA.examTypes.chapterStudy).flatMap(([subject,study])=>study.chapters.map(chapter=>({subject,number:chapter.number,title:chapter.title,primary:chapter.case_ids,related:chapter.related_case_ids}))));
 for(const chapter of chapters){
  await page.goto('/#bank/'+chapter.subject+'/chapter/'+chapter.number);
  await expect(page.locator('.exam-chapter')).toHaveCount(1);
  await expect(page.locator('.exam-chapter-head h2')).toHaveText(chapter.title);
  await expect(page.locator('.chapter-model h3')).toBeVisible();
  if(chapter.subject==='micro'){
   await expect(page.locator('.chapter-reading-refs')).toContainText('尼科尔森');
   await expect(page.locator('.chapter-reading-refs')).toContainText('高鸿业');
  }
  expect(await page.locator('.exam-type-row h3 a').evaluateAll(links=>links.map(link=>link.hash.split('/')[1]))).toEqual(chapter.primary);
  expect(await page.locator('.chapter-related-link').evaluateAll(links=>links.map(link=>link.hash.split('/')[1]))).toEqual(chapter.related);
  await expect(page.locator('.math-error,.katex-error')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),chapter.subject+'/'+chapter.number).toBe(true);
 }
 expect(errors).toEqual([]);
 await page.goto('/#bank/micro/chapter/4');await expect(page.locator('.chapter-quick-check')).toContainText('参考分析');
});

test('chapter selection and old topic or source identifiers remain compatible',async({page})=>{
 await page.goto('/#bank/micro');await page.locator('#exam-type-chapter').selectOption('5');
 await expect(page).toHaveURL(/#bank\/micro\/chapter\/5$/);await expect(page.locator('.exam-type-row h3 a[href="#exam/EMI001"]')).toBeVisible();
 await page.reload();await expect(page.locator('#exam-type-chapter')).toHaveValue('5');
 await page.goto('/#bank/micro/05');await expect(page.locator('.chapter-topic-filter')).toBeVisible();
 const ids=await page.locator('.exam-type-row h3 a').evaluateAll(links=>links.map(link=>link.hash.split('/')[1]));
 expect(await page.evaluate(ids=>ids.every(id=>window.STUDY_DATA.examTypes.questions.find(question=>question.id===id).group==='05'),ids)).toBe(true);
 await page.goto('/#bank/macro');await page.locator('#exam-type-search').fill('MA091');
 const expected=await page.evaluate(()=>window.STUDY_DATA.examTypes.integration.aliases.MA091.map(target=>target.case_id));
 expect(new Set(await page.locator('.exam-type-row h3 a').evaluateAll(links=>links.map(link=>link.hash.split('/')[1])))).toEqual(new Set(expected));
});

test('knowledge follows complete answers and exposes formulas, conditions and case use',async({page},info)=>{
 for(const id of ['EMI001','EMI019','EMA004','EMA029','EMA038']){
  await page.goto('/#exam/'+id);
  await page.getByRole('button',{name:'知识总结',exact:true}).click();
  await expect(page.locator('#knowledge-summary-title')).toBeFocused();
  await expect(page.locator('.knowledge-formula').first()).toBeVisible();
  await expect(page.locator('.exam-type-knowledge')).toContainText('适用条件');
  await expect(page.locator('.exam-type-knowledge')).toContainText('本题怎样调用');
  await expect(page.locator('.knowledge-provenance')).toContainText('编者');
  expect(await page.evaluate(()=>!!(document.querySelector('.exam-type-answer-part:last-of-type')||document.querySelector('.exam-type-answer-part'))&&(document.querySelector('.exam-type-answer-part').compareDocumentPosition(document.querySelector('.exam-type-knowledge'))&Node.DOCUMENT_POSITION_FOLLOWING)>0)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.screenshot({path:info.outputPath('knowledge-summary.png'),fullPage:true});
 await page.emulateMedia({media:'print'});await expect(page.locator('.exam-type-knowledge')).toBeVisible();
 await page.emulateMedia({media:'screen'});
 await page.goto('/#exam/EMI001/knowledge');await expect(page.locator('#knowledge-summary-title')).toBeFocused();
 await page.goto('/#exam/EMI001/sources');
 await expect(page.locator('.chapter-source-record')).toContainText('尼科尔森');
 await expect(page.locator('.chapter-source-record')).toContainText('高鸿业');
 await expect(page.locator('.chapter-source-record')).toContainText('本地配套资料');
});

test('chapter order drives next and previous without changing question identifiers or source categories',async({page})=>{
 await page.goto('/#bank/macro');
 const order=await page.evaluate(()=>window.STUDY_DATA.examTypes.chapterStudy.macro.ordered_case_ids);
 await page.goto('/#exam/'+order[0]);await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(new RegExp('#exam/'+order[1]+'$'));
 await page.keyboard.press('ArrowLeft');await expect(page).toHaveURL(new RegExp('#exam/'+order[0]+'$'));
 await page.getByRole('link',{name:'查看真题与教材依据',exact:true}).click();
 await expect(page.getByRole('heading',{name:'章节与知识总结',exact:true})).toBeVisible();
 await expect(page.locator('.chapter-source-record')).toContainText('PDF物理页');
 await expect(page.locator('.chapter-source-record')).toContainText('编者');
 await expect(page.getByRole('heading',{name:'真题任务',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'教材方法',exact:true})).toBeVisible();
});

test('a missing chapter renderer produces a clear loading failure and keeps saved drafts',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('ruc802.practice.v1',JSON.stringify({version:1,drafts:{PE001:'历史草稿'}})));
 await page.route('**/chapter-study.js',route=>route.abort());
 await page.goto('/');
 await expect(page.locator('#app')).toContainText('章节与知识总结未完整加载');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')).drafts.PE001)).toBe('历史草稿');
});
