export function preparePracticeSelection(input,subjects){
 if(input?.version!==1||!input.subjects||Object.keys(input.subjects).join(',')!=='political')throw Error('Invalid practice selection subjects');
 const source=subjects.find(subject=>subject.key==='political');
 const selection=input.subjects.political,ids=selection.question_ids;
 if(selection.mode!=='calculation-only'||typeof selection.selection_note!=='string'||!selection.selection_note.trim()||!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('Invalid political calculation selection');
 const known=new Set(source?.questions.map(question=>question.id));
 if(ids.some(id=>!known.has(id)))throw Error('Unknown question in political calculation selection');
 const retained=source.questions.filter(question=>ids.includes(question.id));
 if(retained.map(question=>question.id).join(',')!==ids.join(','))throw Error('Political calculation selection must preserve source order');
 return {version:1,subjects:{political:{...selection,question_ids:[...ids]}},summary:{political:{source:known.size,retained:ids.length,removed:known.size-ids.length,groups:new Set(retained.map(question=>question.group)).size}}};
}
