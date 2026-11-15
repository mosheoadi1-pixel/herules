import assert from 'node:assert/strict';
import type { Mission } from '../server/app.ts';
import { queenLevel, queenProgress } from '../src/progress.ts';

let n=0;
const mission=(part:Partial<Mission>):Pick<Mission,'id'|'status'|'adoration'>=>({id:`m${++n}`,status:'pending',...part});

const duchess={level:'duchess',name:{he:'דוכסית',en:'Duchess'},next:10};
const queen={level:'queen',name:{he:'מלכה',en:'Queen'},next:25};
const empress={level:'empress',name:{he:'קיסרית',en:'Empress'},next:null};

assert.deepEqual(queenLevel(0),{...duchess,toNext:10,progress:0},'zero progress is Duchess');
assert.deepEqual(queenLevel(9),{...duchess,toNext:1,progress:9},'nine points is still Duchess');
assert.deepEqual(queenLevel(10),{...queen,toNext:15,progress:10},'ten points is Queen');
assert.deepEqual(queenLevel(24),{...queen,toNext:1,progress:24},'twenty-four points is still Queen');
assert.deepEqual(queenLevel(25),{...empress,toNext:null,progress:25},'twenty-five points is Empress');
assert.deepEqual(queenLevel(40),{...empress,toNext:null,progress:40},'Empress stays Empress above the top threshold');
assert.equal(queenLevel(-3).progress,0,'negative progress is clamped to zero');

assert.equal(queenProgress([]),0);
assert.equal(queenProgress([mission({status:'approved'})]),1,'one approved wife mission is one point');
assert.equal(queenProgress([mission({status:'approved',adoration:'loved'})]),2,'a loved approved mission counts as approved and as loved');
assert.equal(queenProgress([mission({status:'approved',adoration:'liked'}),mission({status:'approved',adoration:'ok'})]),2,'liked and ok add only the approval');
assert.equal(queenProgress([mission({id:'same',status:'approved',adoration:'loved'}),mission({id:'same',status:'approved',adoration:'loved'})]),2,'a mission id is counted once');
assert.equal(queenProgress([
  mission({status:'queued',secret:true,adoration:'loved'}),
  mission({status:'queued',secret:true}),
] as Pick<Mission,'id'|'status'|'adoration'>[]),0,'secret undelivered missions do not count');
assert.equal(queenProgress([
  mission({status:'submitted',adoration:'loved'}),
  mission({status:'pending',adoration:'loved'}),
  mission({status:'draft',adoration:'loved'}),
  mission({status:'cancelled',adoration:'loved'}),
  mission({status:'refused',adoration:'loved'}),
]),0,'non-approved statuses do not count, even with feedback');

const mixed=[
  mission({status:'approved'}),
  mission({status:'approved',adoration:'loved'}),
  mission({status:'approved',adoration:'loved'}),
  mission({status:'cancelled',adoration:'loved'}),
  mission({status:'queued',secret:true,adoration:'loved'}),
];
assert.equal(queenProgress(mixed),5,'three approved plus two loved');
assert.equal(queenLevel(queenProgress(mixed)).level,'duchess');

console.log('PASS queen levels: thresholds at 0, 9, 10, 24, 25; toNext values; Empress has no next level; progress counts approved wife missions and loved feedback once each; secret undelivered and non-approved missions are excluded');
