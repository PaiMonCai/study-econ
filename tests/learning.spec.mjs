import {test,expect} from '@playwright/test';
const key='ruc802.practice.v1';
const oldBackup=()=>({version:1,start:'2026-10-29',records:[{id:'old-record',qid:'MI001',rating:1,at:1000,updatedAt:1000,seconds:60,day:1}],drafts:{MI001:'保留原来的预算约束'},favorites:['MI001'],session:null});
async function seed(page,value){await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key,value});}
async function upload(page,value){await page.locator('#import-file').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});}
test('six functional areas preserve legacy progress and question day counts',async({page})=>{
 await seed(page,oldBackup());await page.goto('/');
 await expect(page.getByRole('navigation',{name:'主导航'}).getByRole('link')).toHaveCount(6);
 await page.locator('#day-select').selectOption('1');await expect(page.locator('.subject-pills button')).toHaveCount(30);
 await page.getByRole('button',{name:/微观背10张/}).click();await expect(page.locator('#recall-heading')).toBeVisible();
 const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 expect(stored.records).toHaveLength(1);expect(stored.drafts.MI001).toBe('保留原来的预算约束');expect(stored.favorites).toEqual(['MI001']);expect(stored.recallSession.ids).toHaveLength(10);
});
test('recall hides answer until reveal and restores drafts assessment and current card',async({page})=>{
 await page.goto('/#recall');await page.getByRole('button',{name:'背诵 FM01',exact:true}).click();
 await expect(page.locator('.recall-answer')).toHaveCount(0);await page.getByRole('textbox',{name:'我的回忆',exact:true}).fill('先写适用条件，再写弹性。');
 await page.getByRole('button',{name:'展开原条目核对',exact:true}).click();await expect(page.locator('.recall-answer .katex').first()).toBeVisible();
 await page.getByRole('button',{name:'会背，3天后复习',exact:true}).click();await page.reload();
 await expect(page.getByRole('textbox',{name:'我的回忆',exact:true})).toHaveValue('先写适用条件，再写弹性。');await expect(page.locator('.rating.selected')).toHaveText('会背，3天后复习');
 await page.getByRole('button',{name:'不熟，明天复习',exact:true}).click();
 const result=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);expect(Object.keys(result.recallProgress)).toHaveLength(1);expect(result.recallProgress.FM01.rating).toBe(1);expect(result.records).toHaveLength(0);
 await page.getByRole('button',{name:'结束本组，返回背诵区',exact:true}).click();await expect(page.getByRole('heading',{name:'公式与背诵',exact:true})).toBeVisible();expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).recallSession,key)).toBeNull();
});
test('topic bridge restores the legacy question draft and links back to the selected topic',async({page})=>{
 const value=oldBackup();value.drafts.MI001='题目中先列原预算。';await seed(page,value);
 await page.goto('/');await page.locator('#day-select').selectOption('1');await page.locator('[data-action="start-day"][data-sub="micro"]').click();
 await page.getByRole('button',{name:'MI001',exact:true}).click();
 await expect(page.locator('#draft')).toHaveCount(0);
 await page.getByRole('button',{name:/查看\d+张相关知识卡/}).click();await expect(page.locator('.bank-meta')).toContainText('关联专题');
 await page.getByRole('button',{name:'背诵 FM02',exact:true}).click();await page.getByRole('button',{name:'消费选择与需求证明',exact:true}).click();
 await expect(page.locator('#group-filter')).toHaveValue('01');await expect(page.locator('.question-row')).toHaveCount(10);
 await page.goto('/#practice');await page.getByText('查看历史文字作答',{exact:true}).click();await expect(page.locator('.legacy-draft pre')).toHaveText('题目中先列原预算。');
});
test('daily recall prioritizes overdue cards and excludes future cards',async({page})=>{
 const value=oldBackup();value.recallProgress={FM01:{rating:2,at:1000,due:'2099-01-01'},FM53:{rating:1,at:1000,due:'2020-01-01'}};
 await seed(page,value);await page.goto('/');await page.getByRole('button',{name:/微观背10张/}).click();
 await expect(page.locator('#recall-heading')).toHaveText('圆周空间竞争：差异化、进入与社会品种数');
 const session=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).recallSession,key);expect(session.ids[0]).toBe('FM53');expect(session.ids).not.toContain('FM01');expect(session.ids).toHaveLength(10);
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
test('exported backup includes recall session and both kinds of drafts',async({page})=>{
 await page.goto('/#recall');await page.getByRole('button',{name:'背诵 FM01',exact:true}).click();await page.getByRole('textbox',{name:'我的回忆',exact:true}).fill('导出的背诵草稿');await page.goto('/#settings');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出进度备份',exact:true}).click();const download=await downloadPromise;const stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const backup=JSON.parse(text);expect(backup.recallDrafts.FM01).toBe('导出的背诵草稿');expect(backup.recallSession.ids).toEqual(['FM01']);expect(backup.drafts).toEqual({});
});
test('learning lists and long formulas fit screen and reading settings',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.screenshot({path:testInfo.outputPath('today.png'),fullPage:true});
 await page.getByRole('link',{name:'公式与背诵',exact:true}).first().click();await expect(page.locator('.recall-row')).toHaveCount(16);await page.screenshot({path:testInfo.outputPath('recall-list.png'),fullPage:true});
 await page.getByRole('button',{name:'背诵 FM03',exact:true}).click();await page.getByRole('button',{name:'大字号',exact:true}).click();await page.getByRole('button',{name:'展开原条目核对',exact:true}).click();
 await expect(page.locator('.recall-answer strong').first()).toHaveText('题干触发。');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();await page.evaluate(()=>window.scrollTo({top:0}));await page.screenshot({path:testInfo.outputPath('recall-card.png'),fullPage:true});
 await page.getByRole('button',{name:'专注阅读',exact:true}).click();await expect(page.locator('.sidebar')).toBeHidden();await page.reload();await expect(page.getByRole('button',{name:'退出专注',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'退出专注',exact:true}).click();await page.goto('/#review');await expect(page.getByRole('heading',{name:'复盘与记录',exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test('storage failure reports unsaved recall drafts and self-assessments',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
 await page.goto('/#recall');await page.getByRole('button',{name:'背诵 FM01',exact:true}).click();await page.getByRole('textbox',{name:'我的回忆',exact:true}).fill('仍能导出的临时草稿');await expect(page.locator('#recall-draft-status')).toHaveText('未能保存，请导出备份');
 await page.getByRole('button',{name:'展开原条目核对',exact:true}).click();await page.getByRole('button',{name:'会背，3天后复习',exact:true}).click();await expect(page.locator('#toast')).toHaveText('未能保存，请立即导出备份');await expect(page.locator('.recall-saved')).toContainText('尚未写入浏览器');expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
});
