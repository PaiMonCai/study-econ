import {test,expect} from '@playwright/test';

test('the active catalog has one canonical row per type and no parallel old catalog',async({page})=>{
 await page.goto('/#bank');
 await expect(page.getByRole('heading',{name:'统一题型训练',exact:true})).toBeVisible();
 for(const subject of ['micro','macro']){
  await page.goto('/#bank/'+subject);
  const ids=await page.evaluate(subject=>window.STUDY_DATA.examTypes.chapterStudy[subject].ordered_case_ids,subject);
  await expect(page.locator('.exam-type-row')).toHaveCount(ids.length);
  expect(await page.locator('.exam-type-row h3>a').evaluateAll(links=>links.map(link=>link.hash))).toEqual(ids.map(id=>'#exam/'+id));
  await expect(page.locator('.exam-type-foot a[href^="#legacy"],.exam-type-foot a[href^="#archive"],.exam-type-foot a[href^="#integrated"]')).toHaveCount(0);
 }
 const summary=await page.evaluate(()=>window.STUDY_DATA.examTypes.integration.summary);
 expect(summary.micro.source_questions+summary.macro.source_questions).toBe(240);
 expect(summary.micro.source_parts+summary.macro.source_parts).toBe(708);
});

test('incoming old catalog links enter the unified catalog while political economy stays independent',async({page})=>{
 for(const [from,to] of [['legacy/micro','bank/micro'],['legacy/macro','bank/macro'],['integrated/micro','bank/micro'],['integrated/macro','bank/macro'],['papers','bank']]){
  await page.goto('/#'+from);await expect(page).toHaveURL(new RegExp('#'+to+'$'));
  await expect(page.getByRole('heading',{name:'统一题型训练',exact:true})).toBeVisible();
 }
 await page.goto('/#legacy/political');await expect(page).toHaveURL(/#bank\/political$/);
 await expect(page.getByRole('heading',{name:'政治经济学计算题',exact:true})).toBeVisible();
 await expect(page.locator('.question-row .qid').first()).toHaveText('PE003');
 await page.locator('[data-action="subject"][data-sub="micro"]').click();
 await expect(page).toHaveURL(/#bank\/micro$/);await expect(page.locator('.exam-type-row').first()).toBeVisible();
});

test('searching an old identifier finds exactly its canonical destinations',async({page})=>{
 for(const [subject,id] of [['micro','MI049'],['micro','CMI15'],['macro','MA091'],['macro','CMA20']]){
  await page.goto('/#bank/'+subject);
  const expected=await page.evaluate(id=>window.STUDY_DATA.examTypes.integration.aliases[id].map(target=>target.case_id),id);
  await page.locator('#exam-type-search').fill(id);
  await expect(page.locator('.exam-type-row')).toHaveCount(expected.length);
  const actual=await page.locator('.exam-type-row h3>a').evaluateAll(links=>links.map(link=>link.hash.split('/')[1]));
  expect(new Set(actual)).toEqual(new Set(expected));
  await page.locator('#exam-type-search').fill('没有这种考法xyz');await expect(page.getByRole('heading',{name:'没有找到对应题型',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'显示全部题型',exact:true}).click();await expect(page.locator('.exam-type-row').first()).toBeVisible();
 }
});

test('old composite cases lead to concrete numbered parts across the canonical types',async({page})=>{
 await page.goto('/#bank');
 const samples=await page.evaluate(()=>{
  const integration=window.STUDY_DATA.examTypes.integration;
  return ['duplicate','supplemented','independent'].flatMap(disposition=>['specialist','comprehensive'].map(kind=>integration.entries.find(entry=>entry.disposition===disposition&&entry.source_kind===kind))).filter(Boolean).map(entry=>({id:entry.source_id,targets:integration.aliases[entry.source_id]}));
 });
 expect(samples.length).toBeGreaterThanOrEqual(3);
 for(const sample of samples){
  await page.goto('/#merged/'+sample.id);
  await expect(page.getByRole('heading',{name:'本题涉及的题型',exact:true})).toBeVisible();
  await expect(page.locator('.exam-type-merged-list article')).toHaveCount(sample.targets.length);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const first=sample.targets[0];
  await page.locator('.exam-type-merged-list a[href="#exam/'+first.case_id+'/part/'+first.part_ids[0]+'"]').click();
  await expect(page.locator('#exam-type-part-'+first.part_ids[0]+' h2')).toBeFocused();
 }
});

test('topic and method links use deduplicated canonical types instead of starting old sessions',async({page})=>{
 await page.goto('/#topics/micro/05');
 const links=page.locator('.topic-all-questions [data-exam-link]');await expect(links.first()).toBeVisible();
 const ids=await links.evaluateAll(links=>links.map(link=>link.dataset.examLink));expect(new Set(ids).size).toBe(ids.length);
 await links.first().click();await expect(page).toHaveURL(/#exam\/EMI\d{3}$/);
 await expect(page.locator('.exam-type-answer-part').first()).toBeVisible();await expect(page.locator('#study-answer')).toHaveCount(0);
 await page.goto('/#methods/macro/01');
 const writing=page.locator('.method-return [data-exam-link]').first();await expect(writing).toBeVisible();await writing.click();
 await expect(page).toHaveURL(/#exam\/EMA\d{3}\/write$/);await expect(page.locator('#exam-type-draft')).toBeVisible();
});

test('knowledge-path practice and evidence links open the canonical models',async({page})=>{
 await page.goto('/#maps/micro/01/path/MI001/1');
 const read=page.locator('.map-practice-actions [data-exam-link]').first();await expect(read).toBeVisible();await read.click();
 await expect(page).toHaveURL(/#exam\/EMI\d{3}$/);await expect(page.locator('.exam-type-answer-part').first()).toBeVisible();
 await page.goto('/#maps/micro/01/path/MI001/1');
 await page.locator('.map-unified-practice a[href$="/write"]').first().click();
 await expect(page).toHaveURL(/#exam\/EMI\d{3}\/write$/);await expect(page.locator('#exam-type-draft')).toBeVisible();
});

test('the source record names absorbed questions and its part links reach formal answers',async({page})=>{
 await page.goto('/#bank');
 const target=await page.evaluate(()=>window.STUDY_DATA.examTypes.integration.aliases.MI001[0]);
 await page.goto('/#exam/'+target.case_id+'/sources');
 await expect(page.getByRole('heading',{name:'归并的原练习',exact:true})).toBeVisible();
 await expect(page.locator('.exam-type-sources')).toContainText('MI001');
 await page.locator('.exam-type-sources a[href="#exam/'+target.case_id+'/part/'+target.part_ids[0]+'"]').first().click();
 await expect(page.locator('#exam-type-part-'+target.part_ids[0]+' h2')).toBeFocused();
});

test('archived drafts and new model drafts coexist without reassignment',async({page})=>{
 await page.goto('/#bank');
 await page.evaluate(()=>{const old=window.createStateModel(window.STUDY_DATA).fresh();old.drafts.MI001='旧题原参数作答';old.drafts.CMA01='旧综合作答';localStorage.setItem('ruc802.practice.v1',JSON.stringify(old));});
 await page.goto('/#exam/EMI001/write');await page.reload();
 await page.locator('#exam-type-draft').fill('统一题型第（1）问作答');await page.reload();
 await expect(page.locator('#exam-type-draft')).toHaveValue('统一题型第（1）问作答');
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')));
 expect(state.drafts.MI001).toBe('旧题原参数作答');expect(state.drafts.CMA01).toBe('旧综合作答');expect(state.records).toEqual([]);
 await page.goto('/#archive/micro');await page.locator('#search').fill('MI001');
 await page.getByRole('button',{name:'看规范作答',exact:true}).click();await expect(page.locator('.q-id')).toHaveText('MI001');
});
