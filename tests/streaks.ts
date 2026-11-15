import assert from 'node:assert/strict';
import type { Mission } from '../server/app.ts';
import { devotionStreak, missionStreak } from '../src/progress.ts';

const now=Date.UTC(2026,10,15,12);
const at=(daysAgo:number,hour=12,minute=0,second=0)=>Date.UTC(2026,10,15-daysAgo,hour,minute,second);
const approved=(daysAgo:number,hour=12,minute=0,second=0):Partial<Mission>=>({status:'approved',approvedAt:at(daysAgo,hour,minute,second)});
const delivered=(daysAgo:number,extra:Partial<Mission>={}):Partial<Mission>=>({status:'pending',deliveredAt:at(daysAgo),...extra});
let id=0;
const missions=(...parts:Partial<Mission>[]):Mission[]=>parts.map(part=>({id:`m${id++}`,revision:1,title:'t',text:'t',points:1,secret:false,status:'pending',...part}));

assert.deepEqual(devotionStreak([],now),{current:0,longest:0,todayDone:false});
assert.deepEqual(missionStreak([],now),{current:0,longest:0,todayDone:false});

assert.deepEqual(devotionStreak(missions(approved(0)),now),{current:1,longest:1,todayDone:true});
assert.deepEqual(devotionStreak(missions(approved(1),approved(0)),now),{current:2,longest:2,todayDone:true});
assert.deepEqual(devotionStreak(missions(approved(2),approved(0)),now),{current:1,longest:1,todayDone:true},'a one-day gap resets the run');
assert.deepEqual(devotionStreak(missions(approved(1)),now),{current:1,longest:1,todayDone:false},'today empty keeps yesterday as the run');
assert.deepEqual(devotionStreak(missions(approved(3),approved(2),approved(1)),now),{current:3,longest:3,todayDone:false},'a run ending yesterday is current while today is open');
assert.deepEqual(devotionStreak(missions(approved(3),approved(2)),now),{current:0,longest:2,todayDone:false},'a run that ended the day before yesterday is not current');
assert.deepEqual(devotionStreak(missions(approved(10),approved(9),approved(8),approved(4),approved(3),approved(0)),now),{current:1,longest:3,todayDone:true},'longest survives a gap');

assert.deepEqual(missionStreak(missions(delivered(0),delivered(1),delivered(2)),now),{current:3,longest:3,todayDone:true});
assert.deepEqual(missionStreak(missions(delivered(1,{status:'refused'})),now),{current:1,longest:1,todayDone:false},'a delivered refused mission counts for the mission streak');
assert.deepEqual(devotionStreak(missions(delivered(0,{status:'refused'})),now),{current:0,longest:0,todayDone:false},'a refused mission never counts for devotion');
assert.deepEqual(missionStreak(missions(delivered(0,{status:'cancelled'})),now),{current:1,longest:1,todayDone:true},'a delivered cancelled mission counts for the mission streak');
assert.deepEqual(missionStreak(missions({status:'queued',scheduledAt:at(0)},{status:'draft'}),now),{current:0,longest:0,todayDone:false},'undelivered missions never count');
assert.equal(devotionStreak(missions({status:'approved',approvedAt:undefined}),now).current,0,'an approval without a time does not count');

assert.deepEqual(devotionStreak(missions(approved(1,23,59,59)),Date.UTC(2026,10,15,0,0,1)),{current:1,longest:1,todayDone:false},'23:59:59 UTC belongs to the previous UTC day');
assert.deepEqual(devotionStreak(missions(approved(1,23,59,59),approved(0,0,0,1)),now),{current:2,longest:2,todayDone:true},'23:59:59 UTC and 00:00:01 UTC are two UTC days');
assert.deepEqual(devotionStreak(missions(approved(0,0,0,1),approved(0,0,0,30)),now),{current:1,longest:1,todayDone:true},'two approvals on one UTC day count once');

console.log('PASS streaks: empty input, single and consecutive approvals, one-day gaps, yesterday grace, longest across gaps, delivered refused and cancelled rules, UTC day boundary');
