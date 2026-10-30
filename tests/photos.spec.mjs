import {test,expect} from '@playwright/test';
async function practice(page){await page.goto('/');await page.locator('#day-select').selectOption('1');await page.locator('[data-action="start-day"][data-sub="micro"]').click();await expect(page.locator('[data-photo-status]')).toHaveText('尚未添加图片');}
async function picture(page){const url=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,200,100);x.fillStyle='#000';x.fillText('x + y = 10',10,30);return c.toDataURL('image/png');});return{name:'answer.png',mimeType:'image/png',buffer:Buffer.from(url.split(',')[1],'base64')};}
test('photo answers persist across reload and question changes and can be viewed or removed',async({page},info)=>{
 await practice(page);await page.locator('input[data-photo-input][multiple]').setInputFiles(await picture(page));await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
 await page.screenshot({path:info.outputPath('photo-answer.png'),fullPage:true});
 await page.getByRole('button',{name:'放大作答图片1',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'关闭图片',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.locator('[data-photo-status]')).toHaveText('尚未添加图片');await page.getByRole('button',{name:'上一题',exact:true}).click();await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');await page.reload();await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
 await page.getByRole('button',{name:'删除图片1',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('删除这张作答照片');await page.getByRole('dialog').getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.locator('[data-photo-status]')).toHaveText('尚未添加图片');
});
test('photo answers reject invalid images and more than three images without partial writes',async({page})=>{
 await practice(page);const input=page.locator('input[data-photo-input][multiple]');await input.setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await expect(page.locator('#toast')).toContainText(/图片|编码|source/i);await expect(page.locator('.photo-grid img')).toHaveCount(0);
 const image=await picture(page);await input.setInputFiles([image,image,image,image]);await expect(page.locator('#toast')).toHaveText('每题最多保存3张图片');await expect(page.locator('.photo-grid img')).toHaveCount(0);
});
test('progress export includes photo payload and canceled import preserves photo answers',async({page})=>{
 await practice(page);await page.locator('input[data-photo-input][multiple]').setInputFiles(await picture(page));await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');await page.goto('/#settings');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出进度备份',exact:true}).click();const download=await pending,stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const backup=JSON.parse(text);expect(backup.photos.items).toHaveLength(1);expect(backup.photos.items[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
 await page.locator('#import-file').setInputFiles({name:'photo-backup.json',mimeType:'application/json',buffer:Buffer.from(text)});await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.goto('/#practice');await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
});

test('photo backup restores deleted photos and repeated imports do not duplicate them',async({page})=>{
 await practice(page);await page.locator('input[data-photo-input][multiple]').setInputFiles(await picture(page));await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');await page.goto('/#settings');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出进度备份',exact:true}).click();const stream=await (await pending).createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();
 await page.goto('/#practice');await page.getByRole('button',{name:'删除图片1',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('删除这张作答照片');await page.getByRole('dialog').getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.locator('[data-photo-status]')).toHaveText('尚未添加图片');
 for(let round=0;round<2;round++){
  await page.goto('/#settings');await page.locator('#import-file').setInputFiles({name:'photos.json',mimeType:'application/json',buffer:Buffer.from(text)});await expect(page.getByRole('dialog')).toContainText('1 张作答照片');await page.getByRole('button',{name:'合并导入',exact:true}).click();await expect(page.locator('#toast')).toContainText('已合并备份');
  await page.goto('/#practice');await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');await expect(page.locator('.photo-grid img')).toHaveCount(1);
 }
 await page.reload();await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');expect(await page.locator('.photo-grid img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
});

test('a photo finishes saving to its original question after navigating away',async({page})=>{
 await page.addInitScript(()=>{const original=window.createImageBitmap;window.createImageBitmap=async(...args)=>{await new Promise(resolve=>window.releasePhotoDecode=resolve);return original(...args);};});
 await practice(page);await page.locator('input[data-photo-input][multiple]').setInputFiles(await picture(page));await expect(page.locator('[data-photo-status]')).toHaveText('正在处理并保存图片…');
 await page.getByRole('button',{name:'下一题',exact:true}).click();await page.evaluate(()=>window.releasePhotoDecode());await expect(page.locator('#toast')).toHaveText('作答图片已保存');await expect(page.locator('[data-photo-status]')).toHaveText('尚未添加图片');
 await page.getByRole('button',{name:'上一题',exact:true}).click();await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
 await page.locator('[data-action="recall-topic"]').click();
 await page.getByRole('button',{name:'背诵 FM02',exact:true}).click();await page.locator('[data-action="recall-back"]').click();await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
});

test('unavailable photo storage reports failure and permits an explicit progress-only export',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{value:{open(){throw new DOMException('Blocked','SecurityError');}}});});
 await page.goto('/');await page.locator('#day-select').selectOption('1');await page.locator('[data-action="start-day"][data-sub="micro"]').click();await expect(page.locator('[data-photo-status]')).toContainText('无法读取图片存储');
 await page.goto('/#settings');await page.getByRole('button',{name:'导出进度备份',exact:true}).click();await expect(page.locator('#toast')).toContainText('照片存储无法读取');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'仅导出学习进度（不含照片）',exact:true}).click();const download=await pending;expect(download.suggestedFilename()).toContain('不含照片');const stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const backup=JSON.parse(text);expect(backup.photosExcluded).toBe(true);expect(backup.photos).toBeUndefined();expect(backup.session.ids[0]).toBe('MI001');
});

test('import reports unsaved progress when photos persist but local storage is full',async({page})=>{
 await practice(page);await page.locator('input[data-photo-input][multiple]').setInputFiles(await picture(page));await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');await page.goto('/#settings');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出进度备份',exact:true}).click();const stream=await (await pending).createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const backup=JSON.parse(text);backup.favorites=['MA001'];
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};});
 await page.locator('#import-file').setInputFiles({name:'photos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.getByRole('button',{name:'合并导入',exact:true}).click();await expect(page.locator('#toast')).toHaveText('照片已导入，学习进度未能保存，请立即导出备份');await expect(page.locator('.local-status')).toContainText('未能保存');
 const exporting=page.waitForEvent('download');await page.getByRole('button',{name:'导出进度备份',exact:true}).click();const exported=await (await exporting).createReadStream();let saved='';for await(const chunk of exported)saved+=chunk.toString();const recovered=JSON.parse(saved);expect(recovered.favorites).toContain('MA001');expect(recovered.photos.items).toHaveLength(1);
});
