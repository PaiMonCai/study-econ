(function(scope){
'use strict';
function createPracticeCatalog(data){
 const questions=data.subjects.flatMap(subject=>subject.questions.map(question=>({...question,subject:subject.key})));
 const byId=new Map([...questions,...(data.comprehensive?.questions||[]),...(data.examTypes?.questions||[])].map(question=>[question.id,question]));
 const selections=Object.fromEntries(Object.entries(data.practiceSelection?.subjects||{}).map(([subject,selection])=>[subject,new Set(selection.question_ids)]));
 const isActive=value=>{const question=typeof value==='string'?byId.get(value):value;return !!question&&(!selections[question.subject]||selections[question.subject].has(question.id));};
 const topics=data.topics.map(topic=>{
  if(!selections[topic.subject])return topic;
  return {...topic,source_question_ids:topic.source_question_ids.filter(isActive),stages:topic.stages.map(stage=>({...stage,question_ids:stage.question_ids.filter(isActive)})).filter(stage=>stage.question_ids.length)};
 }).filter(topic=>topic.source_question_ids.length);
 const groups=subject=>data.subjects.find(item=>item.key===subject).groups.filter(group=>!selections[subject]||questions.some(question=>question.subject===subject&&question.group===group.id&&isActive(question)));
 return {isActive,questions:questions.filter(isActive),topics,groups};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createPracticeCatalog};else scope.createPracticeCatalog=createPracticeCatalog;
})(globalThis);
