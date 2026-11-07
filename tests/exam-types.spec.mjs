import {test,expect} from '@playwright/test';

test('main training starts with one representative per type and removed menus stay absent',async({page})=>{
 await page.goto('/#bank');
 await expect(page.getByRole('heading',{name:'统一题型训练',exact:true})).toBeVisible();
 for(const subject of ['micro','macro']){
  await page.goto('/#bank/'+subject);
  const cases=await page.evaluate(subject=>window.STUDY_DATA.examTypes.banks[subject].cases,subject);
  await expect(page.locator('.exam-type-row')).toHaveCount(cases.length);
  const links=await page.locator('.exam-type-row h3 a').evaluateAll(items=>items.map(item=>item.getAttribute('href')));
  const ordered=await page.evaluate(subject=>window.STUDY_DATA.examTypes.chapterStudy[subject].ordered_case_ids,subject);expect(links).toEqual(ordered.map(id=>'#exam/'+id));
 }
 await expect(page.locator('.nav')).not.toContainText('公式与背诵');
 await expect(page.locator('.nav')).not.toContainText('复盘与记录');
 for(const route of ['recall','recall-study','review','wrong','favorites','history']){
  await page.goto('/#'+route);await expect(page).toHaveURL(/#bank$/);
  await expect(page.getByRole('heading',{name:'统一题型训练',exact:true})).toBeVisible();
 }
});

test('all cases show matching question and answer numbers with complete visible text',async({page},info)=>{
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/#bank');
 const cases=await page.evaluate(()=>window.STUDY_DATA.examTypes.questions.map(q=>({id:q.id,parts:q.parts.length,title:q.title})));
 for(const q of cases){
  await page.evaluate(id=>{location.hash='exam/'+id;},q.id);
  await expect(page.locator('#question-heading')).toHaveText(q.title);
  await expect(page.locator('.exam-type-prompt-part')).toHaveCount(q.parts);
  await expect(page.locator('.exam-type-answer-part')).toHaveCount(q.parts);
  await expect(page.locator('.exam-type-knowledge')).toHaveCount(1);
  expect(await page.locator('.knowledge-formula').count()).toBeGreaterThanOrEqual(2);
  const headings=await page.locator('.exam-type-answer-part h2').allTextContents();
  expect(headings.every((text,index)=>text.startsWith('（'+(index+1)+'）'))).toBe(true);
  expect(await page.locator('.exam-type-answer-part').evaluateAll(items=>items.every(item=>getComputedStyle(item).display!=='none'&&item.querySelector('.rich').textContent.trim().length>0))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),q.id+' page overflow').toBe(true);
  await expect(page.locator('.katex-error,.math-error')).toHaveCount(0);
  expect(await page.locator('.exam-type-reader .rich').evaluateAll(items=>items.every(item=>!item.innerText.includes('$'))),q.id+' raw formula delimiter').toBe(true);
 }
 expect(errors).toEqual([]);
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:info.outputPath('exam-type-complete-reading.png'),fullPage:true});
});

test('drawing tasks show their own figures and preserve the stated model boundaries',async({page})=>{
 await page.goto('/#exam/EMI022');
 await expect(page.locator('#exam-type-part-1 .exam-type-figure')).toHaveCount(1);
 await expect(page.locator('#exam-type-part-1 svg')).toBeVisible();
 await page.goto('/#exam/EMI001');
 await expect(page.locator('#exam-type-part-6 .exam-type-figure')).toContainText('不是本题CD效用');
 await page.goto('/#exam/EMI014');
 await expect(page.locator('#exam-type-part-6 .exam-type-figure')).toContainText('只展示后弯分支');
 await page.goto('/#exam/EMA001');
 await expect(page.locator('#exam-type-part-6 .exam-type-figure')).toHaveCount(2);
 await expect(page.locator('#exam-type-part-6 .exam-type-figure').first()).toContainText('n=g=0');
});

test('drafts survive refresh and keep previous question and recall data intact',async({page})=>{
 await page.goto('/#bank');
 const id=await page.evaluate(()=>{
  const state=window.createStateModel(window.STUDY_DATA).fresh();
  state.drafts.MI001='保留原题草稿';state.recallDrafts.FM01='保留历史背诵草稿';
  localStorage.setItem('ruc802.practice.v1',JSON.stringify(state));
  return window.STUDY_DATA.examTypes.questions[0].id;
 });
 await page.goto('/#exam/'+id+'/write');await page.reload();
 await page.locator('#exam-type-draft').fill('（1）由预算约束和最优条件得……\n（2）比较边界解。');
 await page.reload();
 await expect(page.locator('#exam-type-draft')).toHaveValue('（1）由预算约束和最优条件得……\n（2）比较边界解。');
 const encoded=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=100;canvas.height=60;const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,100,60);context.fillStyle='black';context.fillText('x+y=10',5,20);return canvas.toDataURL('image/png').split(',')[1];});
 await page.locator('input[data-photo-input][multiple]').setInputFiles({name:'answer.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});
 await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
 await page.reload();await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')));
 expect(state.drafts.MI001).toBe('保留原题草稿');expect(state.recallDrafts.FM01).toBe('保留历史背诵草稿');expect(state.records).toEqual([]);
 await page.getByRole('link',{name:'核对规范解答',exact:true}).click();
 await expect(page.locator('.exam-type-answer-part').first()).toBeVisible();
});

test('reading preserves two columns on desktop and stacks naturally on narrow screens',async({page},info)=>{
 await page.goto('/#bank');
 const id=await page.evaluate(()=>window.STUDY_DATA.examTypes.questions[0].id);
 await page.goto('/#exam/'+id);
 const left=page.locator('.question-column'),right=page.locator('.reading-answer');
 await expect(left).toBeVisible();await expect(right).toBeVisible();
 const a=await left.boundingBox(),b=await right.boundingBox();
 if(info.project.name==='desktop'){expect(b.x).toBeGreaterThan(a.x+a.width);expect(Math.abs(a.y-b.y)).toBeLessThan(5);}
 else{expect(b.y).toBeGreaterThan(a.y+a.height-2);expect(Math.abs(a.x-b.x)).toBeLessThan(3);}
 await page.locator('[data-action="exam-type-part"][data-part="2"]').first().click();
 await expect(page.locator('#exam-type-part-2 h2')).toBeFocused();
 await page.getByRole('link',{name:'查看真题与教材依据',exact:true}).click();
 await expect(page.getByRole('heading',{name:'题型依据与核查',exact:true})).toBeVisible();
 await expect(page.locator('.exam-type-sources')).toContainText('PDF物理页');
 await page.getByRole('link',{name:'返回题目与解答',exact:true}).click();
 await page.emulateMedia({media:'print'});
 await expect(page.locator('.exam-type-answer-part').first()).toBeVisible();
 await expect(page.locator('.question-column')).toHaveCSS('overflow','visible');
});

test('type navigation restores reading position separately from the writing workspace',async({page})=>{
 await page.goto('/#bank');
 const ids=await page.evaluate(()=>window.STUDY_DATA.examTypes.chapterStudy.macro.ordered_case_ids.slice(0,2));
 await page.goto('/#exam/'+ids[0]);
 await page.evaluate(()=>scrollTo(0,900));await page.waitForTimeout(220);
 await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(new RegExp('#exam/'+ids[1]+'$'));
 await page.keyboard.press('ArrowLeft');await expect(page).toHaveURL(new RegExp('#exam/'+ids[0]+'$'));
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(700);
 await page.goto('/#exam/'+ids[0]+'/write');
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
 await page.locator('#exam-type-draft').fill('（1）独立作答');
 await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(new RegExp('#exam/'+ids[0]+'/write$'));
 await page.getByRole('link',{name:'核对规范解答',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(700);
});

test('archived subject selection survives favorites and page refresh',async({page})=>{
 await page.goto('/#archive/micro');
 for(const [subject,firstId] of [['macro','MA001'],['political','PE003'],['micro','MI001']]){
  await page.locator('[data-action="subject"][data-sub="'+subject+'"]').click();
  await expect(page).toHaveURL(new RegExp('#archive/'+subject+'$'));
  await expect(page.locator('.question-row .qid').first()).toHaveText(firstId);
  await page.locator('.question-row .star').first().click();
  await expect(page.locator('.question-row .qid').first()).toHaveText(firstId);
  await page.reload();
  await expect(page.locator('.question-row .qid').first()).toHaveText(firstId);
  await expect(page.locator('.question-row .star').first()).toHaveAttribute('aria-pressed','true');
 }
});
