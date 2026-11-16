import assert from 'node:assert/strict';
import { queenLevel, queenProgress } from '../src/queen.ts';

const approved=(id:string)=>({id,status:'approved'});
const names=(n:number)=>queenLevel(n).name.en;

assert.equal(names(0),'Duchess');
assert.equal(names(9),'Duchess');
assert.equal(names(10),'Queen');
assert.equal(names(24),'Queen');
assert.equal(names(25),'Empress');
assert.equal(queenLevel(9).toNext,1);
assert.equal(queenLevel(9).next?.level,'queen');
assert.equal(queenLevel(24).toNext,1);
assert.equal(queenLevel(25).next,null);
assert.equal(queenLevel(25).toNext,0);
assert.equal(queenLevel(12).floor,10);
assert.equal(queenLevel(12).progress,12);
assert.deepEqual(queenLevel(3).name,{he:'דוכסית',en:'Duchess'});

const missions=[
  approved('a'),approved('b'),approved('a'),
  {id:'c',status:'pending'},{id:'d',status:'queued'},{id:'e',status:'submitted'},
  {id:'f',status:'revision'},{id:'g',status:'cancelled'},{id:'h',status:'refused'},{id:'i',status:'acknowledged'},
];
assert.equal(queenProgress(missions),2,'Only approved missions count, once per id');
assert.equal(queenProgress([]),0);
assert.equal(queenProgress(Array.from({length:10},(_,i)=>approved(`m${i}`))),10);

console.log('PASS queen levels: Duchess 0-9, Queen 10-24, Empress 25+, approved-only deduplicated progress, derived next step');
