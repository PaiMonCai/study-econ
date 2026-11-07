import {test,expect} from '@playwright/test';
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')));
async function legacy(page){
 await page.goto('/');
 await page.evaluate(()=>{const state=window.RemoteStore.model.fresh();state.schedule={mode:'intensive',start:'2026-11-08',at:1000};state.intensiveProgress={'1:macro:1':{checked:true,at:1000}};state.records=[{id:'legacy-plan',qid:'MI001',day:null,planId:'intensive-15',planDay:1,rating:1,seconds:12,at:1000,updatedAt:1000}];state.session={ids:['MI001','MI002'],index:0,day:null,mode:'旧强化练习',planId:'intensive-15',planDay:1,seconds:12,startedAt:null,revealed:true,hint:false,ratingId:'legacy-plan',work:{MI001:{seconds:12,revealed:true,hint:false,ratingId:'legacy-plan'}}};localStorage.setItem('ruc802.practice.v1',JSON.stringify(state));});
 await page.reload();
}
test('legacy planned sessions resume from the free practice home and return to the bank',async({page})=>{
 await legacy(page);await expect(page.getByRole('heading',{name:'统一题型训练',exact:true})).toBeVisible();
 await expect(page.locator('.plan-switch,#intensive-day-select,#day-select')).toHaveCount(0);
 await page.locator('[data-action="resume"]').click();await expect(page.locator('.q-id')).toHaveText('MI001');await expect(page.locator('.rating.selected')).toContainText('不熟');
 await page.getByRole('button',{name:'返回题库',exact:true}).click();await expect(page).toHaveURL(/#bank$/);
 const state=await saved(page);expect(state.records[0]).toMatchObject({planId:'intensive-15',planDay:1});expect(state.intensiveProgress['1:macro:1'].checked).toBe(true);
});
test('removed plan settings do not erase historical plan dates and checklists in backups',async({page})=>{
 await legacy(page);await page.goto('/#settings');await expect(page.locator('#intensive-start,#start-date')).toHaveCount(0);
 const pending=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const stream=await(await pending).createReadStream();let text='';for await(const chunk of stream)text+=chunk.toString();const backup=JSON.parse(text);
 expect(backup.schedule.start).toBe('2026-11-08');expect(backup.intensiveProgress['1:macro:1'].checked).toBe(true);expect(backup.records[0].planId).toBe('intensive-15');
 await page.evaluate(()=>localStorage.removeItem('ruc802.practice.v1'));await page.reload();await page.locator('#import-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(text)});await page.getByRole('button',{name:'合并导入',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 const state=await saved(page);expect(state.schedule.start).toBe('2026-11-08');expect(state.intensiveProgress['1:macro:1'].checked).toBe(true);expect(state.records).toHaveLength(1);
});
