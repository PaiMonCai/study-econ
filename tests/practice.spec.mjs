import {test,expect} from '@playwright/test';
test('daily navigation has bounded independent days',async({page})=>{
 await page.goto('/');await page.getByRole('combobox',{name:'选择计划日',exact:true}).selectOption('1');
 await expect(page.getByRole('button',{name:'上一计划日'})).toBeDisabled();
 await page.getByRole('button',{name:'下一计划日'}).click();await expect(page.locator('#day-select')).toHaveValue('2');
 await expect(page.locator('.subject-pills button')).toHaveCount(30);
 await page.locator('#day-select').selectOption('50');await expect(page.getByRole('button',{name:'下一计划日'})).toBeDisabled();
});
test('legacy draft rating and reading survive question changes and reload',async({page})=>{
 await page.addInitScript(()=>{if(!localStorage.getItem('ruc802.practice.v1'))localStorage.setItem('ruc802.practice.v1',JSON.stringify({version:1,start:'2026-10-29',records:[],drafts:{MI001:'先列预算，再验证条件。'},favorites:[],session:null}));});
 await page.goto('/');await page.locator('#day-select').selectOption('1');await page.locator('[data-action="start-day"][data-sub="micro"]').click();
 await expect(page.locator('#draft')).toHaveCount(0);await page.getByText('查看历史文字作答',{exact:true}).click();await expect(page.locator('.legacy-draft pre')).toHaveText('先列预算，再验证条件。');
 await page.getByRole('button',{name:'大字号',exact:true}).click();await page.getByRole('button',{name:'专注阅读',exact:true}).click();
 await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();await page.getByRole('button',{name:'不熟，有断点',exact:true}).click();
 await page.getByRole('button',{name:'已保存，下一题',exact:true}).click();await page.getByRole('button',{name:'上一题',exact:true}).click();
 await page.getByText('查看历史文字作答',{exact:true}).click();await expect(page.locator('.legacy-draft pre')).toHaveText('先列预算，再验证条件。');await expect(page.locator('.rating.selected')).toHaveText('不熟，有断点');
 await page.reload();await expect(page.getByRole('button',{name:'退出专注',exact:true})).toBeVisible();await expect(page.locator('.rating.selected')).toHaveText('不熟，有断点');
 await page.getByRole('button',{name:'会做，已掌握',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')).records.length)).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
});
test('backup import requires preview and cancellation preserves records',async({page})=>{
 const backup={version:1,start:'2026-11-01',records:[],favorites:['MI001'],drafts:{MI001:'备份草稿'},session:null};
 await page.goto('/#settings');
 await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('ruc802.practice.v1'))).toBeNull();
 await expect(page.locator('[data-action="import"]')).toBeEnabled();
 await page.locator('#import-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await page.getByRole('button',{name:'合并导入',exact:true}).click();await expect(page.locator('#start-date')).toHaveValue('2026-11-01');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')).drafts.MI001)).toBe('备份草稿');
});
