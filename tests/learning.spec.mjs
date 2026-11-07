import {test,expect} from '@playwright/test';
const key='ruc802.practice.v1';
const oldBackup=()=>({version:1,start:'2026-10-29',records:[{id:'old-record',qid:'MI001',rating:1,at:1000,updatedAt:1000,seconds:60,day:1}],drafts:{MI001:'保留原来的预算约束'},favorites:['MI001'],session:null});
async function seed(page,value){await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key,value});}
async function upload(page,value){await expect(page.locator('[data-action="import"]')).toBeEnabled();await page.locator('#import-file').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});}

test('removed learning pages return to training and preserve historical progress',async({page})=>{
 const original=oldBackup();original.recallProgress={FM01:{rating:2,at:2000,due:'2026-11-02'}};original.recallDrafts={FM01:'历史回忆'};
 await seed(page,original);await page.goto('/');
 await expect(page.getByRole('navigation',{name:'主导航'}).getByRole('link')).toHaveText(['刷题训练','专题串联','知识导图与拓扑','资料库','设置与备份']);
 for(const name of ['recall','recall-study','review','wrong','favorites','history']){await page.goto('/#'+name);await expect(page).toHaveURL(/#bank$/);}
 const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 expect(stored.records).toEqual(original.records);expect(stored.drafts).toEqual(original.drafts);expect(stored.recallDrafts).toEqual(original.recallDrafts);expect(stored.recallProgress).toEqual(original.recallProgress);
});

test('knowledge explanations show complete text without a recall queue or data writes',async({page})=>{
 await seed(page,oldBackup());await page.goto('/#topics/micro/01');
 const before=await page.evaluate(key=>localStorage.getItem(key),key);
 await page.locator('.topic-card-links [data-action="recall-card"]').first().click();
 await expect(page.getByRole('heading',{name:'知识解释',exact:true})).toBeVisible();
 await expect(page.locator('.exercise-paper .rich').first()).toBeVisible();
 await expect(page.locator('textarea,[data-action="recall-rate"],[data-action="recall-reveal"]')).toHaveCount(0);
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(before);
 await page.getByRole('button',{name:'返回原处',exact:true}).click();await expect(page).toHaveURL(/#topics\/micro\/01$/);
});

test('backup previews recall data and merge never downgrades newer self-assessment',async({page})=>{
 const value=oldBackup();value.recallProgress={FM01:{rating:2,at:2000,due:'2026-11-02'}};value.recallDrafts={FM01:'本地回忆'};
 await seed(page,value);await page.goto('/#settings');
 const incoming=oldBackup();incoming.recallProgress={FM01:{rating:0,at:1000,due:'2026-10-30'},FA01:{rating:1,at:3000,due:'2026-10-31'}};incoming.recallDrafts={FA01:'储蓄投资口径'};
 const before=await page.evaluate(key=>localStorage.getItem(key),key);await upload(page,incoming);await expect(page.getByRole('dialog')).toContainText('2 张背诵自评');await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(before);
 await upload(page,incoming);await page.getByRole('button',{name:'合并导入',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#toast')).toHaveText('已合并备份，共1次作答');
 let result=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);expect(result.recallProgress.FM01.rating).toBe(2);expect(result.recallDrafts.FM01).toBe('本地回忆');expect(result.recallDrafts.FA01).toBe('储蓄投资口径');expect(result.records).toHaveLength(1);
 await upload(page,oldBackup());await page.getByRole('button',{name:'合并导入',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);result=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);expect(Object.keys(result.recallProgress)).toHaveLength(2);
});
test('export retains historical recall state without reintroducing the removed interface',async({page})=>{
 const original=oldBackup();original.recallDrafts={FM01:'导出的历史背诵草稿'};original.recallSession={ids:['FM01'],index:0,revealed:['FM01'],returnTo:'recall'};
 await seed(page,original);await page.goto('/#settings');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出进度备份',exact:true}).click();const stream=await(await pending).createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const backup=JSON.parse(text);
 expect(backup.recallDrafts.FM01).toBe('导出的历史背诵草稿');expect(backup.recallSession.ids).toEqual(['FM01']);expect(backup.drafts.MI001).toBe(original.drafts.MI001);
});
