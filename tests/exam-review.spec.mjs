import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

const prefixes={micro:'MI',macro:'MA',political:'PE'};

for(const subject of Object.keys(prefixes))for(let group=1;group<=10;group++){
 const groupId=String(group).padStart(2,'0');
 test(`exam answers retain complete steps and contained math: ${subject} ${groupId}`,async({page},info)=>{
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#topics/'+subject+'/'+groupId);
  await page.locator('[data-action="study-topic"]').first().click();
  await page.getByRole('button',{name:'大字号',exact:true}).click();
  const results=[];
  for(let index=0;index<10;index++){
   const id=prefixes[subject]+String((group-1)*10+index+1).padStart(3,'0');
   await page.getByRole('button',{name:id,exact:true}).click();
   await expect(page.locator('.q-id')).toHaveText(id);
   await page.locator('[data-action="solution-all"]').click();
   const expected=await page.evaluate(id=>{
    const question=window.STUDY_DATA.subjects.flatMap(s=>s.questions).find(q=>q.id===id),guide=window.SolutionReader.guide(question);
    return {exam:guide.exam,verdict:guide.verdict,review_sha256:guide.source.review_sha256,titles:guide.steps.map(step=>step.title),lines:window.SolutionReader.metadata(guide,10000).total,formulas:guide.steps.reduce((sum,step)=>sum+[...step.body_md.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)].length,0)};
   },id);
   expect(expected.exam,id).toBe(true);expect(expected.verdict,id).not.toBe('needs-source');
   const reader=page.locator('.solution-reader-steps');
   await expect(reader.locator('.step-heading h3')).toHaveText(expected.titles);
   await expect(reader.locator('.solution-line')).toHaveCount(expected.lines);
   await expect(reader.locator('.katex')).toHaveCount(expected.formulas);
   await expect(reader.locator('.math-error,.katex-error')).toHaveCount(0);
   await page.evaluate(()=>document.fonts.ready);
   const layout=await reader.evaluate(element=>{
    const root=document.documentElement;
    const math=[...element.querySelectorAll('.math-block')].map(block=>({width:block.clientWidth,scrollWidth:block.scrollWidth}));
    const plain=[...element.querySelectorAll('.solution-line')].map(line=>{const copy=line.cloneNode(true);for(const math of copy.querySelectorAll('.katex'))math.remove();return copy.textContent;}).join('\n');
    return {pageWidth:root.clientWidth,scrollWidth:root.scrollWidth,mathOverflow:math.filter(block=>block.scrollWidth>block.width+2),markdownResidue:/\*\*|\$\$|\\(?:frac|sqrt|begin)\b/.test(plain),orphanPunctuation:[...element.querySelectorAll('.solution-line p')].some(p=>/^[，；]/.test(p.textContent.trim()))};
   });
   expect(layout.scrollWidth,id).toBeLessThanOrEqual(layout.pageWidth+1);
   expect(layout.markdownResidue,id).toBe(false);expect(layout.orphanPunctuation,id).toBe(false);
   await reader.screenshot({path:info.outputPath(id+'.png'),style:'.reading-bar,.exercise-bottom{visibility:hidden!important}'});
   results.push({id,...expected,...layout});
  }
  const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('ruc802.practice.v1')).records);
  expect(records).toEqual([]);expect(errors).toEqual([]);
  await writeFile(info.outputPath('question-layouts.json'),JSON.stringify({viewport:info.project.name,subject,group:groupId,results},null,2));
 });
}

test('reviewed method, amended prompt and original answer remain distinct',async({page})=>{
 await page.goto('/#bank');await page.locator('[data-action="subject"][data-sub="macro"]').click();await page.locator('#search').fill('MA098');
 await page.getByRole('button',{name:'看规范作答',exact:true}).click();
 await expect(page.locator('#question-prompt')).toContainText('净出口从20降至15');
 await page.getByText('题源与整理说明',{exact:true}).click();
 await page.getByText('查看本题审校记录',{exact:true}).click();await expect(page.locator('.exam-audit')).toContainText('20');
 await page.getByText('查看更正前题干',{exact:true}).click();await expect(page.locator('.exam-original-prompt')).toContainText('净出口从20升至15');
 await page.getByText('查看审校前原解答',{exact:true}).click();await expect(page.locator('.study-original')).toContainText('1000');
});
