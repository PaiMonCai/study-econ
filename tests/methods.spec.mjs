import {test,expect} from '@playwright/test';
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')));
const entry=page=>page.locator('[data-method-check="MI01-D1"]');

test('topic summaries open the matching method sheet without changing the main navigation',async({page})=>{
 await page.goto('/#topics/micro/01');await page.getByRole('link',{name:'作答速查与闭卷检测',exact:true}).click();await expect(page.getByRole('heading',{name:'消费选择、需求与补偿',exact:true})).toBeVisible();
 await expect(page.locator('.nav>a')).toHaveCount(7);await expect(page.locator('.nav>a[aria-current="page"]')).toHaveText('专题串联');await expect(page.locator('[data-method-page]')).toHaveCount(2);
 await page.goto('/#topics/macro/09');await page.getByRole('link',{name:'作答速查与闭卷检测',exact:true}).click();await expect(page.getByRole('heading',{name:'开放经济、汇率制度与外部冲击',exact:true})).toBeVisible();
});

test('all twenty sheets and all sixty-six hidden diagnostics render on desktop and mobile',async({page},info)=>{
 test.setTimeout(90000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/#methods');
 const catalog=await page.evaluate(()=>window.STUDY_DATA.methodSheets.sheets.map(sheet=>({subject:sheet.subject,group:sheet.group,title:sheet.title,checks:sheet.checks.length})));let total=0;
 for(const sheet of catalog){await page.goto('/#methods/'+sheet.subject+'/'+sheet.group);await expect(page.getByRole('heading',{name:sheet.title,exact:true})).toBeVisible();await expect(page.locator('.method-decision')).toHaveCount(4);await expect(page.locator('.method-starter')).toBeVisible();await expect(page.locator('.method-starter .katex')).not.toHaveCount(0);await expect(page.locator('.method-memory li')).toHaveCount(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.getByRole('link',{name:'开始闭卷检测（'+sheet.checks+'题）',exact:true}).click();await expect(page.locator('.method-check')).toHaveCount(sheet.checks);await expect(page.locator('.method-feedback:visible')).toHaveCount(0);await expect(page.locator('.method-prompt')).not.toHaveCount(0);total+=sheet.checks;
 }
 expect(total).toBe(66);expect(errors).toEqual([]);
 await page.goto('/#methods/macro/01');if(!await page.locator('.reading-options').evaluate(el=>el.open))await page.locator('.reading-options>summary').click();await page.getByRole('button',{name:'大字号',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('methods-'+info.project.name+'.png'),fullPage:true});
});

test('closed attempt saves drafts, reveals reference on submission and keeps self-rating separate from original work',async({page})=>{
 await page.goto('/#methods/micro/01/checks');const check=entry(page);await expect(check.locator('.method-feedback')).toBeHidden();await check.getByLabel('我的条件、起式与结论',{exact:true}).fill('比较单位支出效用；阈值相等，整条预算线最优。');await page.reload();await expect(entry(page).locator('textarea')).toHaveValue(/整条预算线/);
 await entry(page).getByRole('button',{name:'交卷核对',exact:true}).click();await expect(entry(page).locator('.method-feedback')).toBeVisible();await expect(entry(page).locator('.method-feedback h3')).toBeFocused();await entry(page).getByRole('button',{name:'能完整复现',exact:true}).click();
 let state=await saved(page);expect(state.methodProgress['MI01-D1']).toMatchObject({rating:2,revealed:true,round:1,assisted:false});expect(state.methodProgress['MI01-D1'].history).toHaveLength(1);expect(state.records).toEqual([]);expect(state.conceptProgress).toEqual({});expect(state.intensiveProgress).toEqual({});
 await entry(page).locator('textarea').fill('核对后补写非负约束。');await expect(entry(page).locator('[aria-pressed="true"]')).toHaveCount(0);state=await saved(page);expect(state.methodProgress['MI01-D1']).toMatchObject({rating:null,assisted:true});await entry(page).getByRole('button',{name:'有断点，需复测',exact:true}).click();await expect(entry(page)).toContainText('核对后订正');
 await entry(page).getByRole('button',{name:'开始新一轮闭卷',exact:true}).click();await expect(entry(page).locator('textarea')).toBeEmpty();await expect(entry(page).locator('.method-feedback')).toBeHidden();state=await saved(page);expect(state.methodProgress['MI01-D1']).toMatchObject({rating:null,revealed:false,round:2});expect(state.methodProgress['MI01-D1'].history).toHaveLength(1);await page.reload();await expect(entry(page).locator('.method-feedback')).toBeHidden();
});

test('diagnostic backup preview and import preserve drafts, attempts and original study settings',async({page})=>{
 await page.goto('/#methods/micro/01/checks');await entry(page).locator('textarea').fill('备份用草稿');await entry(page).getByRole('button',{name:'交卷核对',exact:true}).click();await entry(page).getByRole('button',{name:'有断点，需复测',exact:true}).click();await page.goto('/#settings');
 const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const stream=await(await pending).createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const backup=JSON.parse(text);expect(backup.methodProgress['MI01-D1'].draft).toBe('备份用草稿');expect(backup.records).toEqual([]);
 await page.evaluate(()=>localStorage.removeItem('ruc802.practice.v1'));await page.reload();await page.locator('#import-file').setInputFiles({name:'methods.json',mimeType:'application/json',buffer:Buffer.from(text)});await expect(page.getByRole('dialog')).toContainText('1 道选法检测记录');await page.getByRole('button',{name:'合并导入',exact:true}).click();await page.goto('/#methods/micro/01/checks');await expect(entry(page).locator('textarea')).toHaveValue('备份用草稿');await expect(entry(page).locator('[data-rating="1"]')).toHaveAttribute('aria-pressed','true');expect((await saved(page)).start).toBe('2026-10-29');
});

test('print sheet has two bounded pages and downloadable offline files while diagnostic print hides answers',async({page,request})=>{
 await page.goto('/#methods/micro/01');await page.emulateMedia({media:'print'});await expect(page.locator('.method-page')).toHaveCount(2);await expect(page.locator('.method-back')).toBeHidden();expect(await page.locator('.method-page').evaluateAll(pages=>pages.every(page=>page.scrollHeight<=page.clientHeight+2))).toBeTruthy();
 await page.goto('/#methods/micro/01/checks');await expect(page.locator('.method-prompt').first()).toBeVisible();await expect(page.locator('.method-feedback').first()).toBeHidden();await expect(page.locator('.method-print-space').first()).toBeVisible();await expect(page.locator('textarea').first()).toBeHidden();
 for(const file of ['method-sheets.html','method-sheets.pdf','method-checks.md','method-check-answers.md']){const response=await request.get('/materials/'+file);expect(response.ok()).toBeTruthy();}
});

test('all twenty-six supplementary nodes open their own closed diagnostic without changing study ratings',async({page})=>{
 test.setTimeout(90000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/#methods');
 const checks=await page.evaluate(()=>window.STUDY_DATA.methodSheets.sheets.flatMap(sheet=>sheet.checks.filter(check=>check.kind==='supplement').map(check=>({subject:sheet.subject,group:sheet.group,id:check.id,node:check.node_ids[0],title:window.STUDY_DATA.conceptMaps[sheet.subject].nodes.find(node=>node.id===check.node_ids[0]).title}))));
 expect(checks).toHaveLength(26);
 for(const check of checks){await page.goto('/#maps/'+check.subject+'/'+check.group+'/network/'+check.node);await expect(page.locator('#map-node-heading')).toHaveText(check.title);await page.getByRole('link',{name:'做补充检测：'+check.title,exact:true}).click();const target=page.locator('[data-method-check="'+check.id+'"]');await expect(target.locator('textarea')).toBeFocused();await expect(target.locator('.method-feedback')).toBeHidden();await expect(target).toContainText(check.title);}
 const state=await saved(page);expect(state?.records||[]).toEqual([]);expect(state?.conceptProgress||{}).toEqual({});expect(state?.methodProgress||{}).toEqual({});expect(errors).toEqual([]);
});

test('a partial method asset stops startup and preserves the previous diagnostic draft until recovery',async({page})=>{
 await page.goto('/#methods/micro/01/checks');await entry(page).locator('textarea').fill('保留这份未交卷草稿');const before=await page.evaluate(()=>localStorage.getItem('ruc802.practice.v1'));
 await page.route('**/method-data.js',route=>route.fulfill({contentType:'application/javascript',body:'window.STUDY_DATA.methodSheets={sheets:Array.from({length:20},()=>({checks:[]}))};'}));await page.reload();await expect(page.locator('#app')).toContainText('作答速查资料未完整加载');expect(await page.evaluate(()=>localStorage.getItem('ruc802.practice.v1'))).toBe(before);
 await page.unroute('**/method-data.js');await page.reload();await expect(entry(page).locator('textarea')).toHaveValue('保留这份未交卷草稿');await expect(entry(page).locator('.method-feedback')).toBeHidden();
});

