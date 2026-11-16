import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { weeklyDigest, pickSuggestion, DIGEST_DAYS } from '../src/digest.ts';
import { library } from '../src/library.ts';
import type { Mission } from '../server/app.ts';

const DAY=86400000;
const now=Date.parse('2026-11-15T12:00:00Z');
const ago=(days:number)=>now-days*DAY;
const mission=(extra:Partial<Mission>={}):Mission=>({id:randomUUID(),revision:1,title:'Task',text:'Task',points:1,secret:false,status:'approved',approvedAt:ago(1),deliveredAt:ago(2),category:'worship',...extra});
const wifeOnly=['scheduled','topRated','suggestion'];

const empty=weeklyDigest([],'wife',now);
assert.equal(empty.days,DIGEST_DAYS);
assert.equal(empty.approved,0);assert.equal(empty.delivered,0);assert.equal(empty.husbandPoints,0);assert.equal(empty.herPoints,0);
assert.deepEqual(empty.devotionStreak,{current:0,longest:0});assert.deepEqual(empty.missionStreak,{current:0,longest:0});
assert.deepEqual(empty.topCategories,[]);assert.equal(empty.scheduled,0);assert.equal(empty.topRated,undefined);assert.ok(empty.suggestion);
const emptyHusband=weeklyDigest([],'husband',now);
assert.equal(emptyHusband.approved,0);
assert.deepEqual(Object.keys(emptyHusband).filter(k=>wifeOnly.includes(k)),[],'husband digest carries no wife-only fields, even when empty');

const approvedA=mission({points:5,approvedAt:ago(1),deliveredAt:ago(2),category:'worship',rating:'like',ratedAt:ago(1)});
const approvedB=mission({points:3,approvedAt:ago(0.5),deliveredAt:ago(3),category:'worship',rating:'love',ratedAt:ago(0.5)});
const approvedC=mission({points:2,approvedAt:ago(6),deliveredAt:ago(6),category:'denial'});
const boundary=mission({points:7,approvedAt:ago(7),deliveredAt:ago(7),category:'public'});
const oldApproval=mission({points:50,approvedAt:ago(8),deliveredAt:ago(9),category:'training'});
const pending=mission({status:'pending',approvedAt:undefined,points:9,deliveredAt:ago(1),category:'dresscode'});
const secretQueued=mission({status:'queued',approvedAt:undefined,deliveredAt:undefined,secret:true,scheduledAt:now+DAY,points:4,category:'secret'});
const surpriseQueued=mission({status:'queued',approvedAt:undefined,deliveredAt:undefined,surprise:true,sealed:true,revealsAt:now+DAY,points:6,category:'public'});
const surpriseDelivered=mission({status:'pending',approvedAt:undefined,deliveredAt:ago(1),surprise:true,points:8,category:'denial'});
const all=[approvedA,approvedB,approvedC,boundary,oldApproval,pending,secretQueued,surpriseQueued,surpriseDelivered];

// Seven-day window: a approval exactly seven days old counts, one at eight days does not.
const wife=weeklyDigest(all,'wife',now);
assert.equal(wife.approved,4);
assert.equal(wife.husbandPoints,17);assert.equal(wife.herPoints,17);
assert.equal(wife.scheduled,2,'the wife sees every queued item, withheld ones included');
assert.deepEqual(wife.topRated,{id:approvedB.id,title:'Task',rating:'love'},'love outranks a more recent like');
assert.ok(wife.suggestion&&!['rewards','consequences','secret'].includes(wife.suggestion.category));
assert.equal(wife.topCategories.find(c=>c.category==='denial')?.count,2,'the wife counts her own delivered surprise');

// Husband totals: the same approvals, but withheld items are omitted from every count.
const husband=weeklyDigest(all,'husband',now);
assert.equal(husband.approved,4);assert.equal(husband.husbandPoints,17);assert.equal(husband.herPoints,17);
assert.equal(husband.delivered,wife.delivered-1,'the delivered-but-unrevealed surprise is not counted for him');
assert.equal(husband.topCategories.find(c=>c.category==='denial')?.count,1,'withheld categories never inflate husband counts');
assert.equal(husband.topCategories.some(c=>c.category==='secret'),false);
assert.equal(husband.scheduled,undefined);assert.equal(husband.topRated,undefined);assert.equal(husband.suggestion,undefined);
const serialized=JSON.stringify(husband);
assert.equal(serialized.includes(secretQueued.id),false,'withheld secret ids never appear in the husband digest');
assert.equal(serialized.includes(surpriseQueued.id),false,'sealed surprise ids never appear in the husband digest');
assert.equal(serialized.includes(surpriseDelivered.id),false,'unrevealed surprise ids never appear in the husband digest');

const revealedSurprise=mission({points:4,approvedAt:ago(1),deliveredAt:ago(2),surprise:true,revealedAt:ago(2),category:'public'});
assert.equal(weeklyDigest([revealedSurprise],'husband',now).topCategories[0]?.category,'public','a revealed surprise counts for him');

const streaky=[mission({approvedAt:ago(0),deliveredAt:ago(0)}),mission({approvedAt:ago(1),deliveredAt:ago(1)}),mission({approvedAt:ago(3),deliveredAt:ago(3)})];
const streakDigest=weeklyDigest(streaky,'husband',now);
assert.deepEqual(streakDigest.devotionStreak,{current:2,longest:2});
assert.deepEqual(streakDigest.missionStreak,{current:2,longest:2});

const categoryMix=[...Array.from({length:3},()=>mission({category:'training',deliveredAt:ago(1)})),...Array.from({length:2},()=>mission({category:'worship',deliveredAt:ago(1)})),mission({category:'denial',deliveredAt:ago(1)}),mission({category:'public',deliveredAt:ago(1)})];
assert.deepEqual(weeklyDigest(categoryMix,'husband',now).topCategories,[{category:'training',count:3},{category:'worship',count:2},{category:'denial',count:1}],'top three by count, ties alphabetical');

assert.equal(pickSuggestion(library,now)?.id,pickSuggestion(library,now+1000)?.id,'the same UTC day gives the same suggestion');
assert.notEqual(pickSuggestion(library,now)?.id,pickSuggestion(library,now+DAY)?.id,'the next UTC day picks another idea');
assert.equal(pickSuggestion([],now),undefined);

console.log('PASS digest: wife and husband totals, seven-day window, husband omissions of withheld items, sealed and unrevealed surprises, wife-only fields, streaks, top categories and empty week');
