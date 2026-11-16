import assert from 'node:assert/strict';
import { streakStats } from '../src/progress.ts';

const DAY=86400000;
const day=(n:number,hour=12,minute=0)=>Date.UTC(2026,10,n,hour,minute);
const now=day(15);

assert.deepEqual(streakStats([],now),{current:0,longest:0,todayDone:false});
assert.deepEqual(streakStats([day(15)],now),{current:1,longest:1,todayDone:true});
assert.deepEqual(streakStats([day(14)],now),{current:1,longest:1,todayDone:false},'Yesterday keeps the streak alive until today ends');
assert.deepEqual(streakStats([day(13)],now),{current:0,longest:1,todayDone:false},'Two missed days break the current streak');
assert.deepEqual(streakStats([day(12),day(13),day(14),day(15)],now),{current:4,longest:4,todayDone:true});
assert.deepEqual(streakStats([day(10),day(11),day(13),day(14),day(15)],now),{current:3,longest:3,todayDone:true},'A gap splits runs; longest is the best run');
assert.equal(streakStats([day(10),day(11),day(12),day(14),day(15)],now).longest,3,'Runs before a gap count toward the longest');

// UTC midnight is the boundary: 23:59 UTC counts for the earlier day, 00:00 UTC for the next.
assert.equal(streakStats([day(14,23,59)],day(14,23,59)).todayDone,true);
assert.equal(streakStats([day(14,23,59)],day(15,0,0)).todayDone,false);
assert.equal(streakStats([day(15,0,0)],day(15,0,0)).current,1);
assert.equal(streakStats([day(14,23,59),day(15,0,1)],day(15,12,0)).current,2,'Late-night and early-morning entries are consecutive UTC days');
assert.equal(streakStats([day(15,0,0)-1],day(15,0,0)).todayDone,false,'The last millisecond of the previous day is not today');

// Duplicates on one day count once, and unusable timestamps are ignored.
assert.deepEqual(streakStats([day(15,1),day(15,2),day(15,3),0,NaN],now),{current:1,longest:1,todayDone:true});
assert.equal(streakStats([day(15)-5*DAY],now).current,0);

console.log('PASS streaks: UTC day boundaries, yesterday grace, gaps, longest run, duplicates and invalid timestamps');
