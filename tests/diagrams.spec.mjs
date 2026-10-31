import {test,expect} from '@playwright/test';
const saved=page=>page.evaluate(()=>localStorage.getItem('ruc802.practice.v1'));
async function openQuestion(page,subject,id){await page.goto('/#bank');await page.locator(`[data-action="subject"][data-sub="${subject}"]`).click();await page.locator('#search').fill(id);await page.locator(`[data-action="single"][data-id="${id}"]`).click();await expect(page.locator('.q-id')).toHaveText(id);}
test('graphs reveal progressively without changing assessments and survive practice redraws',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 const representatives=await page.evaluate(()=>window.STUDY_DATA.subjects.map(s=>({subject:s.key,id:s.questions.find(q=>q.diagrams?.length)?.id})));expect(representatives.every(r=>r.id)).toBeTruthy();
 for(const r of representatives){await openQuestion(page,r.subject,r.id);await expect(page.locator('.diagram-review')).toHaveCount(0);await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();const graph=page.locator('.study-diagram').first();await expect(graph).toBeVisible();await expect(graph.locator('.diagram-frame [data-current-stage]')).toHaveAttribute('data-current-stage','0');const before=await saved(page);
 for(const stage of [1,2,0,2]){const button=graph.locator(`[data-diagram-stage="${stage}"]`);await button.click();await expect(button).toBeFocused();await expect(button).toHaveAttribute('aria-pressed','true');await expect(graph.locator('.diagram-frame [data-current-stage]')).toHaveAttribute('data-current-stage',String(stage));expect(await saved(page)).toBe(before);}
 await page.getByRole('button',{name:'大字号',exact:true}).click();await expect(graph.locator('.diagram-frame [data-current-stage]')).toHaveAttribute('data-current-stage','2');await page.locator('[data-action="favorite"]').click();await expect(page.locator('.study-diagram').first().locator('.diagram-frame [data-current-stage]')).toHaveAttribute('data-current-stage','2');
 await expect(graph.locator('.diagram-frame svg title')).toHaveCount(1);await expect(graph.locator('.diagram-frame svg desc')).toHaveCount(1);await graph.locator('.diagram-text summary').first().click();await expect(graph.locator('.diagram-text').first()).toHaveAttribute('open','');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();await graph.screenshot({path:info.outputPath(r.subject+'-diagram.png')});
 await page.emulateMedia({media:'print'});await expect(graph.locator('.diagram-print')).toBeVisible();await expect(graph.locator('.diagram-controls')).toBeHidden();await expect(graph.locator('.diagram-print [data-current-stage]')).toHaveAttribute('data-current-stage','2');await page.emulateMedia({media:'screen'});
 }
 expect(errors).toEqual([]);
});
test('every diagram stage yields finite SVG geometry within its canvas',async({page})=>{
 await page.goto('/');await page.evaluate(()=>document.fonts.ready);
 const failures=await page.evaluate(()=>{
  const failures=[],host=document.createElement('div');
  host.style.cssText='width:680px;position:absolute;left:0;top:0';document.body.append(host);
  const intersects=(a,b)=>a.x+1<b.x+b.width&&b.x+1<a.x+a.width&&a.y+1<b.y+b.height&&b.y+1<a.y+a.height;
  for(const subject of window.STUDY_DATA.subjects)for(const q of subject.questions)for(const d of q.diagrams||[])for(let stage=0;stage<3;stage++){
   host.innerHTML=window.StudyDiagrams.renderDiagram(d,stage);
   const svg=host.querySelector('.diagram-frame svg');
   for(const el of svg.querySelectorAll('path,circle,rect,text')){
    if(el.closest('defs'))continue;
    if(/NaN|Infinity/.test(el.outerHTML)){failures.push(d.id+': nonfinite');continue;}
    const box=el.getBBox();
    if(box.x< -1||box.y< -1||box.x+box.width>681||box.y+box.height>411)failures.push(d.id+' stage'+stage+' '+el.tagName+': '+JSON.stringify({x:box.x,y:box.y,w:box.width,h:box.height})+' '+el.textContent);
   }
   const labels=[...svg.querySelectorAll('text')];
   for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)if(intersects(labels[i].getBBox(),labels[j].getBBox()))failures.push(d.id+' stage'+stage+' overlapping labels: '+labels[i].textContent+' / '+labels[j].textContent);
   for(const label of svg.querySelectorAll('.diagram-edge-label'))for(const node of svg.querySelectorAll('.diagram-node'))if(intersects(label.getBBox(),node.getBBox()))failures.push(d.id+' edge label overlaps a node: '+label.textContent);
  }
  host.remove();return failures;
 });
 expect(failures).toEqual([]);
});

test('each visible direction is named and flow connectors avoid unrelated nodes',async({page})=>{
 await page.goto('/');await page.evaluate(()=>document.fonts.ready);
 const failures=await page.evaluate(()=>{
  const failures=[],host=document.createElement('div');host.style.cssText='width:680px;position:absolute;left:0;top:0';document.body.append(host);
  for(const subject of window.STUDY_DATA.subjects)for(const q of subject.questions)for(const d of q.diagrams||[])for(let stage=0;stage<3;stage++){
   host.innerHTML=window.StudyDiagrams.renderDiagram(d,stage);
   const frame=host.querySelector('.diagram-frame'),svg=frame.querySelector('svg');
   const directions=d.kind==='flow'?d.edges||[]:d.arrows||[];
   for(const [index,item] of directions.entries()){
    const shown=(item.stage??0)<=stage&&item.label;
    const list=frame.querySelector(`[data-direction-item="${index}"]`),label=svg.querySelector(`[${d.kind==='flow'?'data-relation-index':'data-direction-label'}="${index}"]`);
    if(shown){
     if(!list?.textContent.includes(item.label)||!label||list.querySelector('.diagram-direction-key')?.textContent!==label.textContent)failures.push(d.id+' stage'+stage+' unnamed or mismatched direction '+index);
    }else if(list||label)failures.push(d.id+' stage'+stage+' reveals a future direction '+index);
   }
   if(d.kind==='flow')for(const edge of svg.querySelectorAll('[data-edge-index]')){
    const points=[...edge.getAttribute('d').matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(p=>[Number(p[1]),Number(p[2])]);
    if(points.length<2)failures.push(d.id+' empty flow connection');
    for(const node of svg.querySelectorAll('.diagram-node')){
     const r=node.getBBox();
     for(let i=1;i<points.length;i++){
      const [a,b]=[points[i-1],points[i]];
      const crosses=a[0]===b[0]?a[0]>r.x+1&&a[0]<r.x+r.width-1&&Math.max(a[1],b[1])>r.y+1&&Math.min(a[1],b[1])<r.y+r.height-1:a[1]>r.y+1&&a[1]<r.y+r.height-1&&Math.max(a[0],b[0])>r.x+1&&Math.min(a[0],b[0])<r.x+r.width-1;
      if(crosses)failures.push(d.id+' stage'+stage+' connection enters a node');
     }
    }
   }
  }
  host.remove();return failures;
 });
 expect(failures).toEqual([]);
});
test('questions without graphs keep complete source answers',async({page})=>{await page.goto('/');const r=await page.evaluate(()=>{for(const s of window.STUDY_DATA.subjects){const q=s.questions.find(q=>!q.diagrams?.length);if(q)return{subject:s.key,id:q.id};}});expect(r).toBeTruthy();await openQuestion(page,r.subject,r.id);await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();await expect(page.locator('.solution-steps')).toBeVisible();await expect(page.locator('.diagram-review')).toHaveCount(0);});

test('complete diagram answers fit the page at large reading size for every illustrated question',async({page})=>{
 test.setTimeout(120000);await page.goto('/#bank');
 const questions=await page.evaluate(()=>window.STUDY_DATA.subjects.flatMap(s=>s.questions.filter(q=>q.diagrams?.length).map(q=>({subject:s.key,id:q.id}))));
 test.setTimeout(Math.max(120000,30000+questions.length*800));
 const failures=[];let previousSubject;
 for(const [index,q] of questions.entries()){
  if(index)await page.getByRole('link',{name:'刷题训练',exact:true}).click();
  if(q.subject!==previousSubject){await page.locator(`[data-action="subject"][data-sub="${q.subject}"]`).click();previousSubject=q.subject;}
  await page.locator('#search').fill(q.id);await page.locator(`[data-action="single"][data-id="${q.id}"]`).click();await expect(page.locator('.q-id')).toHaveText(q.id);
  if(index===0)await page.getByRole('button',{name:'大字号',exact:true}).click();
  await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();
  for(const button of await page.locator('.diagram-controls [data-diagram-stage="2"]').all())await button.click();
  const width=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
  if(width.page>width.viewport)failures.push({id:q.id,...width});
 }
 expect(failures).toEqual([]);
});

test('textbook diagrams enlarge the selected stage and restore keyboard focus without saving progress',async({page},info)=>{
 await openQuestion(page,'micro','MI001');
 await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();
 const graph=page.locator('[data-diagram-id="MI001-graph"]');
 await graph.locator('[data-diagram-stage="2"]').click();
 const before=await saved(page),trigger=graph.getByRole('button',{name:'放大图形',exact:true});
 await trigger.click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('[data-current-stage]')).toHaveAttribute('data-current-stage','2');
 await expect(dialog.locator('[data-projection]')).toHaveCount(3);
 await expect(dialog.getByRole('button',{name:'关闭大图',exact:true})).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await dialog.screenshot({path:info.outputPath('consumer-choice-enlarged.png')});
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(trigger).toBeFocused();
 expect(await saved(page)).toBe(before);
 await trigger.click();
 await page.getByRole('button',{name:'关闭大图',exact:true}).click();
 await expect(trigger).toBeFocused();
 await graph.locator('.diagram-textbook summary').click();
 await expect(graph.locator('.diagram-textbook')).toContainText('PDF物理页');
 await expect(graph.locator('.diagram-textbook')).toContainText('核查');
 expect(await saved(page)).toBe(before);
});

test('reviewed source corrections are revealed before the retained original solution',async({page})=>{
 await page.goto('/');
 const questions=await page.evaluate(()=>window.STUDY_DATA.subjects.flatMap(s=>s.questions.filter(q=>q.diagrams?.some(d=>d.erratum)).map(q=>({subject:s.key,id:q.id,errata:q.diagrams.filter(d=>d.erratum).map(d=>d.erratum)}))));
 expect(questions.map(q=>q.id)).toEqual(expect.arrayContaining(['MI075','MA025']));
 for(const q of questions){
  await openQuestion(page,q.subject,q.id);await expect(page.locator('.diagram-correction')).toHaveCount(0);
  await page.getByRole('button',{name:'作答结束，核对解答',exact:true}).click();
  const note=page.locator('.diagram-correction').first();await expect(note).toBeVisible();
  await expect(note).toContainText(q.errata[0].explanation);
  expect(await note.evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('.solution-steps'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBeTruthy();
  await note.locator('summary').click();await expect(note).toContainText(q.errata[0].original_quote);
  const retained=await page.locator('.solution-steps').evaluate(el=>{
   const copy=el.cloneNode(true);
   for(const formula of copy.querySelectorAll('.katex')){
    const tex=formula.querySelector('annotation[encoding="application/x-tex"]');
    if(tex)formula.replaceWith(document.createTextNode('$'+tex.textContent+'$'));
   }
   return copy.textContent.replace(/\s+/g,' ');
  });
  expect(retained).toContain(q.errata[0].original_quote.replace(/\s+/g,' '));
 }
});
