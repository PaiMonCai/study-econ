import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const fail=message=>{throw new Error('15-day plan: '+message);};
const unique=list=>Array.isArray(list)&&new Set(list).size===list.length;
export function prepareIntensivePlan(input,subjects,comprehensive){
 if(input?.id!=='intensive-15'||input.version!==1||input.days?.length!==15||input.subjects?.join(',')!=='micro,macro')fail('invalid scope or duration');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.start)||new Date(input.start+'T00:00:00Z').toISOString().slice(0,10)!==input.start)fail('invalid start date');
 const catalog=new Map([...subjects.flatMap(s=>s.questions),...comprehensive.questions].map(q=>[q.id,q]));
 const papers=new Map(comprehensive.papers.map(p=>[p.id,p]));
 const covered={micro:new Set(),macro:new Set()},groups={micro:new Set(),macro:new Set()};
 const reserved=new Set(input.reserved_papers.flatMap(id=>papers.get(id)?.question_ids||[]));
 if(input.reserved_papers.length!==2||reserved.size!==8)fail('two complete final papers required');
 for(const [index,day] of input.days.entries()){
  if(day.day!==index+1||!day.title||!day.phase||!day.blocks?.every(b=>b.label&&Number.isInteger(b.minutes)&&b.minutes>0)||day.blocks.reduce((n,b)=>n+b.minutes,0)!==240)fail('invalid day or four-hour budget');
  for(const subject of input.subjects){
   const block=day[subject],bank=subjects.find(s=>s.key===subject),prefix=subject==='micro'?'MI':'MA';
   if(!block||!unique(block.groups)||block.groups.some(id=>!bank.groups.some(g=>g.id===id))||block.focus?.length!==3||block.checks?.length!==3||block.focus.some(t=>typeof t!=='string'||!t.trim())||block.checks.some(t=>typeof t!=='string'||!t.trim()))fail('incomplete topic checklist');
   for(const field of ['required_refs','screen_refs','extra_refs']){
    if(!unique(block[field])||block[field].some(id=>!catalog.has(id)||!id.startsWith(prefix)&&!id.startsWith('C'+prefix)))fail('unknown or wrong-subject question');
    if(day.day<14&&block[field].some(id=>reserved.has(id)))fail('final-paper question exposed before assessment');
   }
   if(day.day<=10){
    if(block.groups.length!==1||groups[subject].has(block.groups[0]))fail('first ten days must cover each topic once');
    groups[subject].add(block.groups[0]);
    const expected=bank.groups.find(g=>g.id===block.groups[0]).question_ids;
    const scoped=[...block.required_refs,...block.screen_refs];
    if(!unique(scoped)||scoped.length!==expected.length||expected.some(id=>!scoped.includes(id))||block.required_refs.length!==2)fail('every specialist question must be assigned as full work or screening');
    for(const id of scoped)covered[subject].add(id);
    if(block.required_refs.reduce((n,id)=>n+catalog.get(id).minutes,0)>55)fail('representatives leave too little learning time');
   }else if(day.day<=13&&block.required_refs.reduce((n,id)=>n+catalog.get(id).minutes,0)>85)fail('integrated work exceeds its block');
  }
  if(day.day>=14){
   const paper=papers.get(day.paper_id);
   if(!paper||day.paper_id!==input.reserved_papers[day.day-14]||paper.minutes!==120||paper.question_ids.some(id=>!catalog.has(id)))fail('invalid final assessment');
   const refs=[...day.micro.required_refs,...day.macro.required_refs];
   if(refs.length!==paper.question_ids.length||paper.question_ids.some(id=>!refs.includes(id)))fail('assessment must retain the complete paper');
  }
 }
 if(Object.values(covered).some(ids=>ids.size!==100)||Object.values(groups).some(ids=>ids.size!==10))fail('incomplete twenty-topic coverage');
 return structuredClone(input);
}

export function intensiveMarkdown(plan,subjects,comprehensive){
 const catalog=new Map([...subjects.flatMap(s=>s.questions),...comprehensive.questions].map(q=>[q.id,q]));
 const names={micro:'微观',macro:'宏观'};
 const refs=ids=>ids.map(id=>`${id} ${catalog.get(id).title}（${catalog.get(id).minutes}分钟）`).join('；')||'无';
 const lines=[`# ${plan.title}`,'',`默认日期：${plan.start}起，共15天。可在网站独立调整开始日期。`,'',plan.target,'',plan.editorial_note,'','## 每天怎样执行','',...plan.instructions.map(t=>'- '+t),'','## 满分目标的验收口径','',...plan.acceptance.map(t=>'- '+t),'','## 15天总览','','| 天数 | 微观 | 宏观 | 核心安排 |','|---|---|---|---|'];
 for(const d of plan.days)lines.push(`| 第${d.day}天 | ${d.micro.title} | ${d.macro.title} | ${d.phase} |`);
 for(const day of plan.days){
  lines.push('',`## 第${day.day}天：${day.title}`,'',day.note,'',`4小时必做：${day.blocks.map(b=>b.label+' '+b.minutes+'分钟').join('；')}。`);
  if(day.paper_id)lines.push('',`限时卷：${day.paper_id}，120分钟，微观与宏观各50分，共100分。题目是编者训练题，非官方卷制。`);
  for(const subject of plan.subjects){const b=day[subject];lines.push('',`### ${names[subject]}：${b.title}`,'',...b.focus.map(t=>'- '+t),'',`完整闭卷：${refs(b.required_refs)}`);
   if(b.screen_refs.length)lines.push('',`条件筛查：${b.screen_refs.join('、')}。只列条件、选法、边界，不计完整作答；有断点即升级为加练整题。`);
   if(b.extra_refs.length)lines.push('',`加练候选：${refs(b.extra_refs)}。结合错题择做，全天加练最多120分钟，不要求一次全部完成。`);
   lines.push('','过关自查：',...b.checks.map(t=>'- [ ] '+t));
  }
  lines.push('','复测：第'+day.day+'天抽检到期的1/3/7天旧专题；优先最近“不熟/不会”的宏微观题。30分钟以闭卷复现关键关系和一个断点为主，整题重写放进加练。');
 }
 lines.push('','## 记录与延期','', '题目自评、综合题分问得分与每日过关自查分别保存。自查通过不自动表示全部题目已掌握。每日必做未完成时记待补；次日优先补断点，不把读答案算独立完成。第15天仍有未解决失分点，应延长修补和隔日复测，不能按日历自动宣告满分。','', '原50天三科安排、旧作答、照片、收藏与背诵记录保留。15天安排只包含宏观和微观。','');
 return lines.join('\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const here=path.dirname(fileURLToPath(import.meta.url)),read=async name=>JSON.parse(await readFile(path.join(here,'content',name+'.json'),'utf8'));
 const subjects=await Promise.all(['micro','macro'].map(async key=>({key,...await read(key)})));
 const banks=await Promise.all(['micro','macro'].map(key=>read('comprehensive-'+key)));
 const comprehensive={questions:banks.flatMap(b=>b.cases),papers:(await read('training-papers')).papers};
 const plan=prepareIntensivePlan(await read('intensive-plan'),subjects,comprehensive);
 await mkdir(path.join(here,'dist/materials'),{recursive:true});
 await writeFile(path.join(here,'dist/materials/intensive-15-day-plan.md'),intensiveMarkdown(plan,subjects,comprehensive),'utf8');
 console.log(JSON.stringify({days:15,topics:20,specialist_questions:200,core_minutes:3600,guide:'dist/materials/intensive-15-day-plan.md'}));
}
