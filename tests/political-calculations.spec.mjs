import {test,expect} from '@playwright/test';

const key='ruc802.practice.v1';
const selected=page=>page.evaluate(()=>window.STUDY_DATA.practiceSelection.subjects.political.question_ids);

test('political listing, search and sequential practice contain only the 40 calculations',async({page},info)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/#bank/political');
 await expect(page.getByRole('heading',{name:'政治经济学计算题',exact:true})).toBeVisible();
 await expect(page.locator('.bank-meta')).toContainText('找到 40 道题');
 const expected=await selected(page),listed=[];
 listed.push(...await page.locator('.question-row .qid').allTextContents());
 await page.getByRole('button',{name:'下一页',exact:true}).click();
 listed.push(...await page.locator('.question-row .qid').allTextContents());
 expect(listed).toEqual(expected);
 expect(await page.locator('#group-filter option').evaluateAll(options=>options.map(option=>option.value))).not.toContain('09');
 await page.locator('#search').fill('PE001');await expect(page.locator('.question-row')).toHaveCount(0);
 await page.locator('#search').fill('PE003');await expect(page.locator('.question-row .qid')).toHaveText('PE003');
 await page.locator('[data-action="study-single"]').click();
 await expect(page.locator('.q-id')).toHaveText('PE003');await expect(page.locator('#study-answer')).toBeVisible();
 expect(await page.locator('.question-rail .qchip').allTextContents()).toEqual(['PE003','PE006']);
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('PE006');
 await page.screenshot({path:info.outputPath('political-calculation-answer.png'),fullPage:true});
 await page.goto('/#bank/political');await page.locator('#search').fill('');
 await page.getByRole('button',{name:'按顺序练习',exact:true}).click();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).session.ids,key)).toEqual(expected);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});

test('political random practice and all topic links exclude essays',async({page},info)=>{
 await page.goto('/#bank/political');const allowed=await selected(page);
 await page.getByRole('button',{name:'随机练10题',exact:true}).click();
 const random=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).session.ids,key);
 expect(random).toHaveLength(10);expect(random.every(id=>allowed.includes(id))).toBe(true);
 await page.goto('/#topics/political');
 await expect(page.locator('.topic-index-row')).toHaveCount(9);
 const links=await page.locator('.topic-index-row h2 a').evaluateAll(links=>links.map(link=>link.hash));
 for(const link of links){
  await page.goto('/'+link);await expect(page.locator('.topic-paper>h1')).toBeVisible();
  const ids=await page.locator('.topic-questions [data-action="study-single"]').evaluateAll(buttons=>buttons.map(button=>button.dataset.id));
  expect(ids.length).toBeGreaterThan(0);expect(ids.every(id=>allowed.includes(id))).toBe(true);
 }
 await page.goto('/#topics/political/04');await page.locator('.topic-back [data-action="study-topic"]').click();
 expect(new Set(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).session.ids,key))).toEqual(new Set(allowed.filter(id=>/^PE03[2-9]$|^PE040$/.test(id))));
 await page.goto('/#bank/political');await page.screenshot({path:info.outputPath('political-calculation-index.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('resuming mixed old sessions skips essays while preserving their saved work',async({page})=>{
 await page.goto('/#bank/political');
 const fixture=await page.evaluate(()=>{
  const state=window.createStateModel(window.STUDY_DATA).fresh();
  state.drafts.PE001='原论述题草稿';state.drafts.PE003='计算题草稿';state.favorites=['PE001'];
  state.records=[{id:'essay-record',qid:'PE001',at:Date.now(),seconds:10,rating:1,day:null}];
  state.session={ids:['PE001','PE003','PE006'],index:0,mode:'旧跟读',study:true,day:null,seconds:0,startedAt:null,revealed:true,hint:false,ratingId:null,solutionLines:1,work:{}};
  return state;
 });
 await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key,state:fixture});
 await page.goto('/?fixture=mixed-political#practice');await expect(page.locator('.q-id')).toHaveText('PE003');
 const state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 expect(state.session.ids).toEqual(['PE003','PE006']);expect(state.drafts.PE001).toBe('原论述题草稿');
 expect(state.drafts.PE003).toBe('计算题草稿');expect(state.favorites).toEqual(['PE001']);expect(state.records[0].qid).toBe('PE001');
 await page.goto('/#sources/PE001');await expect(page.getByRole('heading',{name:'政经现仅保留计算题',exact:true})).toBeVisible();
 await expect(page.locator('.study-original,.source-reader')).toHaveCount(0);
 await page.getByRole('link',{name:'选择政经计算题',exact:true}).click();await expect(page).toHaveURL(/#bank\/political$/);
 await page.goto('/#sources/PE003');await expect(page.getByRole('heading',{name:'题源与整理记录',exact:true})).toBeVisible();
});

test('essay-only old sessions show the calculation entry without deleting historical state',async({page})=>{
 await page.goto('/#bank/political');
 const before=await page.evaluate(()=>{
  const state=window.createStateModel(window.STUDY_DATA).fresh();state.drafts.PE001='保存的论述草稿';
  state.session={ids:['PE001'],index:0,mode:'旧练习',day:null,seconds:0,startedAt:null,revealed:false,hint:false,ratingId:null,solutionLines:1,work:{}};
  return window.createStateModel(window.STUDY_DATA).validate(state);
 });
 await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key,state:before});
 await page.goto('/?fixture=old-political#practice');await expect(page.getByRole('heading',{name:'政经现仅保留计算题',exact:true})).toBeVisible();
 await expect(page.locator('#question-prompt')).toHaveCount(0);
 const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 expect(after.drafts).toEqual(before.drafts);expect(after.session).toEqual(before.session);
});
