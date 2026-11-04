import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const site=import.meta.dirname,require=createRequire(path.join(site,'package.json'));
const {chromium}=require('@playwright/test');
const qaRoot=path.resolve(process.argv[2]||path.join(site,'qa/method-print'));await fs.mkdir(qaRoot,{recursive:true});
const context={window:{STUDY_DATA:{}}};vm.createContext(context);
vm.runInContext(await fs.readFile(path.join(site,'dist/method-data.js'),'utf8'),context);
vm.runInContext(await fs.readFile(path.join(site,'dist/methods.js'),'utf8'),context);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=context.window.STUDY_DATA,renderer=context.MethodSheets.create({data,esc}),all=data.methodSheets.sheets;
let fonts=await fs.readFile(path.join(site,'dist/vendor/katex.min.css'),'utf8');
const fontUrls=[...new Set([...fonts.matchAll(/url\((fonts\/[^)]+)\)/g)].map(match=>match[1]))];
for(const file of fontUrls){const ext=path.extname(file),mime=ext==='.woff2'?'font/woff2':ext==='.woff'?'font/woff':'font/ttf';fonts=fonts.split('url('+file+')').join('url(data:'+mime+';base64,'+(await fs.readFile(path.join(site,'dist/vendor',file))).toString('base64')+')');}
const styles=await fs.readFile(path.join(site,'dist/methods.css'),'utf8');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>宏微观20专题作答速查</title><style>${fonts}\n${styles}\n:root{--ink:#183347;--accent:#a14534;--muted:#536672;--line:#cad5dc;--reading-size:18px}*{box-sizing:border-box}body{margin:0;background:#edf1f2;color:#183347;font-family:'Noto Serif CJK SC','Source Han Serif SC','SimSun',serif}a{color:#135776}p{line-height:1.7}.offline-head{max-width:1050px;margin:30px auto;padding:20px}.offline-head h1{font-size:30px}.offline-head nav{display:grid;grid-template-columns:1fr 1fr;gap:10px}.offline-sheet{max-width:1050px;margin:24px auto;background:white}.btn{font:inherit;color:inherit;border:1px solid #bcc9d1;background:white;padding:7px 10px;display:inline-block}.method-page .rich p{margin:0 0 7px}.method-page a{overflow-wrap:anywhere}@media(max-width:700px){.offline-head{margin:12px}.offline-head nav{grid-template-columns:1fr}}@media print{body{background:white;margin:0}.offline-head{display:none}.offline-sheet{margin:0;max-width:none;background:white;break-after:page}.offline-sheet:last-child{break-after:auto}.method-source{font-size:10px}.method-source p{line-height:1.5}.method-page{height:265mm}.method-page .rich{font-size:14px}.method-page .method-footnote{font-size:10px}}</style></head><body><header class="offline-head"><h1>宏微观20专题作答速查</h1><p>每专题两页，共40页。第1页识别信号、选法起笔与条件分支；第2页易混对照、闭卷重建与整题回练。编者基于已有知识底稿压缩整理，具体条件和来源回查完整知识总稿。检测题与参考另见配套文件。</p><nav>${all.map(sheet=>`<a href="#${sheet.id}">${sheet.subject==='micro'?'微观':'宏观'}${sheet.group} ${esc(sheet.title)}</a>`).join('')}</nav></header>${all.map(sheet=>`<article class="offline-sheet method-sheet" id="${sheet.id}">${renderer.sheetPages(sheet).replace('<details class="method-source">','<details class="method-source" open>').replace(/<button\b[^>]*>(MI\d{3}|MA\d{3})<\/button>/g,'<span>$1</span>').replace(/<a href="#maps\/[^"<>]+">([^<]+)<\/a>/g,'<span>$1</span>')}</article>`).join('')}</body></html>`;
const target=path.join(site,'dist/materials/method-sheets.html');await fs.writeFile(target,html);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1240,height:1600}});
 await page.goto(pathToFileURL(target).href);await page.evaluate(()=>document.fonts.ready);await page.emulateMedia({media:'print'});
 const bounds=await page.locator('.method-page').evaluateAll(pages=>pages.map((page,index)=>{const box=page.getBoundingClientRect(),footer=page.querySelector('.method-footnote').getBoundingClientRect();const children=[...page.querySelectorAll('h1,h2,h3,dl,table,ol,.method-source,.method-return')].map(el=>({tag:el.tagName,bottom:el.getBoundingClientRect().bottom-box.top})),contentBottom=Math.max(...children.map(c=>c.bottom)),footerTop=footer.top-box.top;return{index:index+1,height:box.height,contentBottom,footerTop,footerOverlap:contentBottom+10>footerTop,overflow:children.filter(c=>c.bottom>box.height+1)};}));
 await fs.writeFile(path.join(qaRoot,'print-layout.json'),JSON.stringify(bounds,null,2));
 if(bounds.some(page=>page.overflow.length||page.footerOverlap))throw Error('Print page overflow or footer collision: '+JSON.stringify(bounds.filter(page=>page.overflow.length||page.footerOverlap)));
 await page.pdf({path:path.join(site,'dist/materials/method-sheets.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
 await page.emulateMedia({media:'screen'});await page.locator('#micro-01').screenshot({path:path.join(qaRoot,'offline-sheet-desktop.png')});
 await page.setViewportSize({width:390,height:844});await page.locator('#micro-01').screenshot({path:path.join(qaRoot,'offline-sheet-mobile.png')});
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),files={};
 for(const file of ['method-sheets.html','method-sheets.pdf'])files[file]=digest(await fs.readFile(path.join(site,'dist/materials',file)));
 await fs.writeFile(path.join(site,'dist/materials/method-artifacts.json'),JSON.stringify({source_sha256:digest(await fs.readFile(path.join(site,'content/method-sheets.json'))),pages:bounds.length,files},null,2)+'\n');
 console.log(JSON.stringify({pages:bounds.length,overflows:0,html:target,pdf:path.join(site,'dist/materials/method-sheets.pdf')}));
}finally{await browser.close();}
