import assert from 'node:assert/strict';
import type { Mission } from '../server/app.ts';
import { queenScore } from '../src/progress.ts';

const mission=(part:Partial<Mission>):Pick<Mission,'status'|'adoration'>=>({status:'pending',...part});

assert.deepEqual(queenScore([]),{score:0,breakdown:{loved:0,liked:0,ok:0,total:0}});
assert.deepEqual(queenScore([mission({status:'approved'})]),{score:0,breakdown:{loved:0,liked:0,ok:0,total:0}},'approved without feedback is not counted');
assert.deepEqual(queenScore([
  mission({status:'approved',adoration:'loved'}),
  mission({status:'approved',adoration:'liked'}),
  mission({status:'approved',adoration:'ok'}),
  mission({status:'approved'}),
]),{score:1,breakdown:{loved:1,liked:1,ok:1,total:3}},'the score is the loved count; the breakdown counts only rated approvals');
assert.equal(queenScore([mission({status:'approved',adoration:'loved'}),mission({status:'approved',adoration:'loved'})]).score,2);
assert.deepEqual(queenScore([
  mission({status:'submitted',adoration:'loved'}),
  mission({status:'pending',adoration:'loved'}),
  mission({status:'cancelled',adoration:'loved'}),
  mission({status:'refused',adoration:'loved'}),
]),{score:0,breakdown:{loved:0,liked:0,ok:0,total:0}},'only approved missions count');

console.log('PASS queen score: empty input, loved count as score, breakdown of approved feedback only, non-approved statuses ignored');
