import assert from 'node:assert/strict';
import type { Mission } from '../server/app.ts';
import { queenProgress } from '../src/progress.ts';

const mission=(part:Partial<Mission>):Pick<Mission,'id'|'status'>=>({id:`q${Math.random()}`,status:'pending',...part});

assert.equal(queenProgress([]),0,'empty input is zero');
assert.equal(queenProgress([mission({status:'approved'})]),1,'an approved mission is one point');
assert.equal(queenProgress([
  mission({status:'approved'}),
  mission({status:'submitted'}),
  mission({status:'pending'}),
  mission({status:'cancelled'}),
  mission({status:'refused'}),
]),1,'only approved missions count');
assert.equal(queenProgress([
  {id:'dup',status:'approved'} as Pick<Mission,'id'|'status'>,
  {id:'dup',status:'approved'} as Pick<Mission,'id'|'status'>,
]),1,'duplicate ids are counted once');

console.log('PASS queen progress: empty input is zero, approved missions are the only signal, non-approved statuses and duplicate ids are ignored');
