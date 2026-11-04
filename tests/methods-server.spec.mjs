import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../serve.mjs';
const password='test-only-methods-password';
let server,dataDir,url;
async function start(){server=await createApp({basePath:'/802',dataDir,access:{password}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}/802/`;}
async function stop(){await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
test.beforeEach(async()=>{dataDir=await mkdtemp(path.join(os.tmpdir(),'ruc802-method-ui-'));await start();});
test.afterEach(async()=>{if(server?.listening)await stop();await rm(dataDir,{recursive:true,force:true});});
async function login(page){await page.goto(url);await page.getByLabel('访问密码',{exact:true}).fill(password);const ready=page.waitForResponse(response=>response.url()===url+'api/state'&&response.request().method()==='GET'&&response.ok());await page.getByRole('button',{name:'进入练习室',exact:true}).click();await ready;await expect(page.locator('.local-status')).toHaveText('服务器已保存');}
test('diagnostic drafts and retest ratings persist on the server, another browser and restart',async({page,browser})=>{
 await login(page);await page.goto(url+'#methods/macro/09/checks');const check=page.locator('[data-method-check="MA09-D1"]');await check.locator('textarea').fill('先固定汇率与世界利率，货币供给内生。');await check.getByRole('button',{name:'交卷核对',exact:true}).click();await check.getByRole('button',{name:'能完整复现',exact:true}).click();await expect(page.locator('.local-status')).toHaveText('服务器已保存');
 await expect(check.locator('[data-method-save]')).toHaveText('服务器已保存');
 const stored=(await(await page.request.get(url+'api/state')).json()).state;expect(stored.methodProgress['MA09-D1']).toMatchObject({rating:2,round:1,revealed:true});expect(stored.records).toEqual([]);
 const context=await browser.newContext();try{const other=await context.newPage();await login(other);await other.goto(url+'#methods/macro/09/checks');await expect(other.locator('[data-method-check="MA09-D1"] textarea')).toHaveValue(/货币供给内生/);await expect(other.locator('[data-method-check="MA09-D1"] [data-rating="2"]')).toHaveAttribute('aria-pressed','true');}finally{await context.close();}
 await stop();await start();const after=await browser.newContext();try{const fresh=await after.newPage();await login(fresh);await fresh.goto(url+'#methods/macro/09/checks');await expect(fresh.locator('[data-method-check="MA09-D1"] textarea')).toHaveValue(/货币供给内生/);await fresh.goto(url+'#settings');const pending=fresh.waitForEvent('download');await fresh.locator('[data-action="export"]').click();const stream=await(await pending).createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();expect(JSON.parse(text).methodProgress['MA09-D1'].history).toHaveLength(1);}finally{await after.close();}
});
