import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const context={window:{}};
vm.runInNewContext(await readFile(new URL('./dist/learning.js',import.meta.url),'utf8'),context);
const {clean,review,merge}=context.window.LearningData;
const cards=[{id:'FM01'},{id:'FA01'}];
const plain=value=>JSON.parse(JSON.stringify(value));
test('old backups acquire empty recall state without changing question data',()=>{
 const old={version:1,records:[{qid:'MI001'}],drafts:{MI001:'original'}};
 assert.deepEqual(plain(clean(old,cards)),{recallProgress:{},recallDrafts:{},recallSession:null});
 assert.equal(old.drafts.MI001,'original');assert.equal(old.recallProgress,undefined);
});
test('review dates use Shanghai calendar across UTC midnight and leap day',()=>{
 const at=Date.parse('2028-02-28T16:01:00Z');
 assert.equal(review(0,at).due,'2028-02-29');
 assert.equal(review(1,at).due,'2028-03-01');
 assert.equal(review(2,at).due,'2028-03-03');
});
test('recall import keeps newer local self-assessments and adds other cards',()=>{
 const local={FM01:{rating:2,at:200,due:'2026-11-02'}};
 const incoming={FM01:{rating:0,at:100,due:'2026-10-30'},FA01:{rating:1,at:300,due:'2026-10-31'}};
 const merged=merge(local,incoming);
 assert.equal(merged.FM01.rating,2);assert.equal(merged.FA01.rating,1);assert.equal(local.FA01,undefined);
 assert.equal(merge(merged,{FM01:{rating:0,at:400,due:'2026-10-30'}}).FM01.rating,0);
});
test('malformed recall backups are rejected instead of partially applied',()=>{
 for(const input of [{recallProgress:[]},{recallProgress:{FM01:{rating:3,at:1,due:'2026-10-30'}}},{recallProgress:{FM01:{rating:1,at:1,due:'2026-02-30'}}},{recallDrafts:{FM01:42}},{recallSession:{ids:['FM01'],index:1}}])assert.throws(()=>clean(input,cards));
});
test('recall sessions and drafts round trip with safe known-card references',()=>{
 const result=clean({recallProgress:{FM01:review(2,1000)},recallDrafts:{FM01:'条件和边界'},recallSession:{ids:['FM01','FM01','FA01'],index:2,revealed:['FM01','unknown'],returnTo:'practice'}},cards);
 assert.deepEqual(plain(result.recallSession),{ids:['FM01','FA01'],index:1,revealed:['FM01'],returnTo:'practice'});
 assert.deepEqual(plain(clean(result,cards)),plain(result));
});
