export function prepareTopics(bank, subject, source, cards) {
 if(bank?.version!==1||bank.subject!==subject||!bank.editorial_note||!Array.isArray(bank.topics)||bank.topics.length!==source.groups.length)throw Error('Invalid topic bank: '+subject);
 const questions=new Map(source.questions.map(q=>[q.id,q]));
 const groups=new Map(source.groups.map(g=>[g.id,g]));
 const cardIds=new Set(cards.filter(c=>c.subject===subject).map(c=>c.id));
 const seen=new Set();
 return bank.topics.map(topic=>{
  const group=groups.get(topic.group),fail=()=>{throw Error('Invalid topic: '+topic.id);};
  if(!group||topic.id!==subject+'-'+topic.group||seen.has(topic.group))fail();
  seen.add(topic.group);
  for(const field of ['title','lead_md','boundaries_md','recall_md','source_note'])if(typeof topic[field]!=='string'||!topic[field].trim())fail();
  if(typeof topic.comparison_md!=='string'||!Array.isArray(topic.stages)||topic.stages.length<3||topic.stages.length>8)fail();
  if(!Array.isArray(topic.source_question_ids)||new Set(topic.source_question_ids).size!==topic.source_question_ids.length||topic.source_question_ids.some(id=>!questions.has(id))||group.question_ids.some(id=>!topic.source_question_ids.includes(id)))fail();
  if(!Array.isArray(topic.card_ids)||new Set(topic.card_ids).size!==topic.card_ids.length||topic.card_ids.some(id=>!cardIds.has(id)))fail();
  for(const stage of topic.stages){
   if(!stage.title||!stage.explanation_md||!Array.isArray(stage.question_ids)||new Set(stage.question_ids).size!==stage.question_ids.length||stage.question_ids.some(id=>!topic.source_question_ids.includes(id)))fail();
  }
  return {...topic,subject,group_title:group.title,editorial_note:bank.editorial_note};
 });
}
