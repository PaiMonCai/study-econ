import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../serve.mjs';

const password='test-only-long-password',token='test_only_url_token_0123456789abcdef';
let server,dataDir,url;
test.beforeEach(async()=>{dataDir=await mkdtemp(path.join(tmpdir(),'ruc802-ui-data-'));server=await createApp({basePath:'/802',dataDir,access:{password,token}});await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}/802/`;});
test.afterEach(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections();});await rm(dataDir,{recursive:true,force:true});});
const loaded=page=>page.waitForResponse(r=>r.url()===url+'api/state'&&r.request().method()==='GET'&&r.ok());
async function login(page){await page.goto(url);await page.getByLabel('访问密码或令牌',{exact:true}).fill(password);const ready=loaded(page);await page.getByRole('button',{name:'进入练习室',exact:true}).click();await ready;await expect(page.locator('.local-status')).toHaveText('服务器已保存');}
async function practice(page){await page.locator('#day-select').selectOption('1');await page.locator('[data-action="start-day"][data-sub="micro"]').click();await expect(page.locator('[data-photo-status]')).toHaveText('尚未添加图片');}
async function picture(page){const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,200,100);x.fillStyle='#000';x.fillText('x + y = 10',10,30);return c.toDataURL('image/png');});return{name:'answer.png',mimeType:'image/png',buffer:Buffer.from(data.split(',')[1],'base64')};}
async function backup(page){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出进度备份',exact:true}).click();const stream=await(await pending).createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();return JSON.parse(text);}

test('password gate protects the app and logout revokes access',async({page},info)=>{
 await page.goto(url);await expect(page.getByRole('heading',{name:'继续你的复习。'})).toBeVisible();await page.screenshot({path:info.outputPath('access-login.png'),fullPage:true});
 await page.getByLabel('访问密码或令牌',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:'进入练习室',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('访问口令不正确，请重新输入。');
 await page.getByLabel('访问密码或令牌',{exact:true}).fill(password);const ready=loaded(page);await page.getByRole('button',{name:'进入练习室',exact:true}).click();await ready;await expect(page.locator('.local-status')).toHaveText('服务器已保存');
 await page.getByRole('button',{name:'退出访问',exact:true}).click();await expect(page.getByText('已退出访问，学习数据仍保留。',{exact:true})).toBeVisible();expect((await page.request.get(url+'api/state')).status()).toBe(401);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('fragment and query tokens enter and leave a clean URL',async({page,browser})=>{
 const ready=loaded(page);await page.goto(url+'#token='+token);await ready;await expect(page.locator('.local-status')).toHaveText('服务器已保存');expect(page.url()).not.toContain(token);expect(page.url()).not.toContain('token=');
 const context=await browser.newContext();try{const other=await context.newPage(),ready=loaded(other);await other.goto(url+'?token='+token);await ready;await expect(other.locator('.local-status')).toHaveText('服务器已保存');expect(other.url()).not.toContain('token=');}finally{await context.close();}
});
test('new browser loads server progress and photos and backup contains both',async({page,browser},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await login(page);await practice(page);
 await page.locator('input[data-photo-input][multiple]').setInputFiles(await picture(page));await expect(page.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');
 await page.getByRole('button',{name:'收藏 MI001',exact:true}).click();await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();await page.getByRole('button',{name:'不熟，有断点',exact:true}).click();await expect(page.locator('.local-status')).toHaveText('服务器已保存');
 const context=await browser.newContext({viewport:page.viewportSize()});try{const other=await context.newPage();await login(other);await other.goto(url+'#practice');await expect(other.locator('[data-photo-status]')).toHaveText('已保存 1/3 张');await expect(other.locator('.rating.selected')).toHaveText('不熟，有断点');await expect(other.getByRole('button',{name:'取消收藏 MI001',exact:true})).toBeVisible();await other.screenshot({path:info.outputPath('server-photo-restored.png'),fullPage:true});}finally{await context.close();}
 await page.goto(url+'#settings');const data=await backup(page);expect(data.records).toHaveLength(1);expect(data.photos.items).toHaveLength(1);expect(data.favorites).toContain('MI001');await page.screenshot({path:info.outputPath('server-settings.png'),fullPage:true});expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('offline changes are marked unsaved and recover after reload',async({page})=>{
 await login(page);await practice(page);await expect(page.locator('.local-status')).toHaveText('服务器已保存');
 await page.route('**/api/state',route=>route.request().method()==='PATCH'?route.abort():route.continue());await page.getByRole('button',{name:'收藏 MI001',exact:true}).click();await expect(page.locator('.local-status')).toHaveText('未保存到服务器，请重试');await expect(page.getByRole('button',{name:'重试保存',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('ruc802.server-recovery.')))).toBe(true);
 await page.unroute('**/api/state');await page.reload();await expect(page.locator('.local-status')).toHaveText('服务器已保存');expect(await page.evaluate(()=>window.RemoteStore.state.favorites)).toContain('MI001');
});
test('saving waits for acknowledgement and preserves the running practice timer',async({page})=>{
 await login(page);await practice(page);await page.getByRole('button',{name:'开始计时',exact:true}).click();await expect(page.locator('.local-status')).toHaveText('服务器已保存');
 let release;const gate=new Promise(resolve=>release=resolve);await page.route('**/api/state',async route=>{if(route.request().method()==='PATCH')await gate;await route.continue();});
 await page.getByRole('button',{name:'收藏 MI001',exact:true}).click();await expect(page.locator('.local-status')).toHaveText('正在保存到服务器');await expect(page.getByRole('button',{name:'暂停计时',exact:true})).toBeVisible();release();await expect(page.locator('.local-status')).toHaveText('服务器已保存');
 await expect(page.getByRole('button',{name:'暂停计时',exact:true})).toBeVisible();await page.getByRole('button',{name:'暂停计时',exact:true}).click();await expect(page.locator('.local-status')).toHaveText('服务器已保存');
});
test('legacy browser progress and photos migrate only after confirmation',async({page})=>{
 await login(page);const image=await picture(page);await page.evaluate(async encoded=>{localStorage.setItem('ruc802.practice.v1',JSON.stringify({version:1,start:'2026-11-01',records:[],favorites:['MI001'],drafts:{MI001:'旧版草稿'},session:null}));const blob=new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'image/png'});await new Promise((resolve,reject)=>{const r=indexedDB.open('ruc802.photos.v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id:'legacy-photo',qid:'MI001',createdAt:123,blob});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},image.buffer.toString('base64'));
 await page.goto(url+'#settings');await page.getByRole('button',{name:'检查并迁移本机旧数据',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('1 张作答照片');await page.getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(()=>window.RemoteStore.state.favorites)).toEqual([]);
 await page.getByRole('button',{name:'检查并迁移本机旧数据',exact:true}).click();await page.getByRole('button',{name:'合并导入',exact:true}).click();await expect(page.locator('#toast')).toContainText('已合并到服务器');const data=await backup(page);expect(data.photos.items).toHaveLength(1);expect(data.drafts.MI001).toBe('旧版草稿');expect(data.favorites).toContain('MI001');expect(await page.evaluate(()=>localStorage.getItem('ruc802.practice.v1'))).toContain('旧版草稿');
});
test('same recall draft conflict requires an explicit choice and preserves both until resolved',async({page,browser})=>{
 await login(page);const context=await browser.newContext();try{const other=await context.newPage();await login(other);for(const target of [page,other]){await target.goto(url+'#recall');await target.getByRole('button',{name:'背诵 FM02',exact:true}).click();}
 await page.locator('#recall-draft').fill('第一台设备的回忆');await expect(page.locator('.local-status')).toHaveText('服务器已保存');await other.locator('#recall-draft').fill('第二台设备的回忆');await expect(other.locator('.local-status')).toHaveText('草稿有冲突，请处理');await expect(other.locator('#recall-draft')).toHaveValue('第二台设备的回忆');
 await other.getByRole('button',{name:'使用服务器版本',exact:true}).click();await other.getByRole('dialog').getByRole('button',{name:'确认使用服务器版本',exact:true}).click();await expect(other.locator('#recall-draft')).toHaveValue('第一台设备的回忆');await expect(other.locator('.local-status')).toHaveText('服务器已保存');
 }finally{await context.close();}
});
