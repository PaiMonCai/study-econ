import {createHash} from 'node:crypto';

const text=value=>typeof value==='string'&&value.trim().length>0;
export function chapterQuestionDigest(question){
 const parts=question.parts.map(({id,title,prompt_md,answer_md,notes_md})=>({id,title,prompt_md,answer_md,notes_md}));
 return createHash('sha256').update(JSON.stringify({stem_md:question.stem_md,parts})).digest('hex');
}

export function prepareChapterStudy(input,bank,subject){
 const fail=message=>{throw Error('Invalid chapter study '+subject+': '+message);};
 const count=19,edition=subject==='micro'?11:10;
 if(input?.version!==1||input.subject!==subject||!text(input.editorial_note)||!text(input.book?.title)||!text(input.book?.author)||input.book.edition!==edition||input.chapters?.length!==count||input.summaries?.length!==bank.cases.length)fail('header');
 const ref=input.book.toc_reference;
 if(!text(ref?.file)||!['textbook','textbook-companion'].includes(ref.kind)||!Array.isArray(ref.physical_pages)||!ref.physical_pages.length||ref.physical_pages.some(page=>!Number.isInteger(page)||page<1)||!/^[a-f0-9]{64}$/.test(ref.sha256)||!text(ref.note))fail('table of contents reference');
 const referenceBooks=input.reference_books||[];
 if(subject==='micro'){
  const reference=referenceBooks[0],toc=reference?.toc_reference;
  if(input.book.key!=='nicholson11'||!input.book.author.includes('尼科尔森')||referenceBooks.length!==1||reference?.key!=='gao8'||reference.edition!==8||reference.chapter_count!==11||!text(reference.title)||!text(reference.author))fail('Nicholson baseline and Gao reference');
  if(!text(toc?.file)||toc.kind!=='textbook-companion'||!Array.isArray(toc.physical_pages)||!toc.physical_pages.length||toc.physical_pages.some(page=>!Number.isInteger(page)||page<1)||!/^[a-f0-9]{64}$/.test(toc.sha256)||!text(toc.note))fail('reference book table of contents');
 }
 const known=new Map(bank.cases.map(question=>[question.id,question])),summaries=new Map();
 for(const item of input.summaries){
  const question=known.get(item.case_id);
  if(!question||summaries.has(item.case_id)||item.question_digest!==chapterQuestionDigest(question))fail('missing, repeated or stale summary '+item.case_id);
  if(!Number.isInteger(item.chapter)||item.chapter<1||item.chapter>count||!Array.isArray(item.related_chapters)||new Set(item.related_chapters).size!==item.related_chapters.length||item.related_chapters.some(chapter=>!Number.isInteger(chapter)||chapter<1||chapter>count||chapter===item.chapter))fail('chapter assignment '+item.case_id);
  if(!Array.isArray(item.knowledge_points)||item.knowledge_points.length<2||item.knowledge_points.some(point=>!text(point.body_md)))fail('knowledge points '+item.case_id);
  if(!Array.isArray(item.formulas)||item.formulas.length<2||item.formulas.some(formula=>!['title','formula_md','symbols_md','conditions_md','use_md'].every(key=>text(formula[key]))||!/^\$\$[\s\S]+\$\$$/.test(formula.formula_md)))fail('formulas and conditions '+item.case_id);
  if(!['conditions_md','branches_md','pitfalls_md','application_md','provenance_md'].every(key=>text(item[key])))fail('incomplete summary '+item.case_id);
  summaries.set(item.case_id,item);
 }
 const order=[];
 for(const [index,chapter] of input.chapters.entries()){
  if(chapter.number!==index+1||chapter.id!==String(index+1)||!['title','part','model_title','model_md','formula_md','selection_note_md'].every(key=>text(chapter[key]))||!Array.isArray(chapter.case_ids)||!Array.isArray(chapter.related_case_ids))fail('chapter '+(index+1));
  if(new Set(chapter.case_ids).size!==chapter.case_ids.length||new Set(chapter.related_case_ids).size!==chapter.related_case_ids.length)fail('repeated chapter links '+chapter.id);
  if(subject==='micro'){
   if(!Array.isArray(chapter.reading_refs)||chapter.reading_refs.length<2)fail('chapter reading references '+chapter.id);
   const unique=new Set();
   for(const reading of chapter.reading_refs){
    const primary=reading.book_key==='primary',book=primary?input.book:referenceBooks.find(book=>book.key===reading.book_key),range=reading.physical_page_range,key=reading.book_key+'/'+reading.chapter;
    if(!book||unique.has(key)||!Number.isInteger(reading.chapter)||reading.chapter<1||reading.chapter>(primary?count:book.chapter_count)||!text(reading.title)||!Array.isArray(range)||range.length!==2||range.some(page=>!Number.isInteger(page)||page<1)||range[1]<range[0]||range[1]>(primary?323:133))fail('invalid chapter reading reference '+chapter.id);
    if(primary&&(reading.chapter!==chapter.number||reading.title!==chapter.title))fail('primary reading chapter '+chapter.id);
    unique.add(key);
   }
   if(chapter.reading_refs.filter(reading=>reading.book_key==='primary').length!==1||!chapter.reading_refs.some(reading=>reading.book_key==='gao8'))fail('missing chapter reading role '+chapter.id);
  }
  const expected=bank.cases.filter(question=>summaries.get(question.id).chapter===chapter.number).map(question=>question.id);
  const related=bank.cases.filter(question=>summaries.get(question.id).related_chapters.includes(chapter.number)).map(question=>question.id);
  if(JSON.stringify(expected)!==JSON.stringify(chapter.case_ids)||JSON.stringify(related)!==JSON.stringify(chapter.related_case_ids))fail('chapter links disagree with assignments '+chapter.id);
  if(chapter.quick_check&&!['prompt_md','answer_md'].every(key=>text(chapter.quick_check[key])))fail('incomplete model example '+chapter.id);
  if(!chapter.case_ids.length&&!chapter.related_case_ids.length&&!chapter.quick_check)fail('empty chapter without a complete model example '+chapter.id);
  order.push(...chapter.case_ids);
 }
 if(order.length!==bank.cases.length||new Set(order).size!==order.length)fail('canonical order');
 function inspect(value){
  if(typeof value==='string'&&(/[\x00-\x09\x0b-\x1f]/.test(value)||/待补写|待核读|TODO|PLACEHOLDER/.test(value)))fail('control character or unfinished text');
  if(Array.isArray(value))value.forEach(inspect);
  else if(value&&typeof value==='object')Object.values(value).forEach(inspect);
 }
 inspect(input);
 const summary={chapters:count,summaries:input.summaries.length,primary_chapters:input.chapters.filter(chapter=>chapter.case_ids.length).length,related_only_chapters:input.chapters.filter(chapter=>!chapter.case_ids.length&&chapter.related_case_ids.length).length,model_only_chapters:input.chapters.filter(chapter=>!chapter.case_ids.length&&!chapter.related_case_ids.length).length,formula_entries:input.summaries.reduce((sum,item)=>sum+item.formulas.length,0)};
 return {...input,ordered_case_ids:order,summary};
}
