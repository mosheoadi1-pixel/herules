import assert from 'node:assert/strict';
import { weeklyDigest, DIGEST_WINDOW_MS, type DigestInput } from '../src/digest.ts';
import { devotionStreak, missionStreak } from '../src/progress.ts';
import { pickSpark, sparkDay } from '../src/spark.ts';
import { library } from '../src/library.ts';
import type { Mission } from '../server/app.ts';

const DAY = 86400000;
const now = Date.parse('2026-11-15T12:00:00Z');
const ago = (days: number) => now - days * DAY;
const mission = (id: string, extra: Partial<Mission> = {}): Mission => ({ id, revision: 1, title: `Title ${id}`, text: `Text ${id}`, points: 1, secret: false, status: 'approved', approvedAt: ago(1), ...extra });

const missions: Mission[] = [
  mission('a', { points: 3, approvedAt: ago(0), deliveredAt: ago(0), category: 'challenges', rating: 'like' }),
  mission('b', { points: 2, approvedAt: ago(2), deliveredAt: ago(2), category: 'challenges', rating: 'love' }),
  mission('c', { points: 4, approvedAt: ago(3), category: 'care' }),
  mission('d', { points: 5, approvedAt: ago(4), category: 'writing' }),
  mission('h', { points: 1, approvedAt: ago(1) }),
  mission('e', { points: 50, approvedAt: ago(8), category: 'old', rating: 'love' }),
  mission('f', { points: 9, status: 'pending', deliveredAt: ago(0), category: 'draftcat' }),
];
const history: DigestInput['history'] = [
  { at: ago(1), event: 'reward-decision', by: 'husband', outcome: 'approved', rewardRequestId: 'r1' },
  { at: ago(2), event: 'reward-decision', by: 'wife', outcome: 'declined', rewardRequestId: 'r2' },
  { at: ago(9), event: 'reward-decision', by: 'wife', outcome: 'approved', rewardRequestId: 'r3' },
  { at: ago(1), event: 'wish-decision', by: 'husband', points: 4 },
  { at: ago(2), event: 'wish-decision', by: 'husband' },
  { at: ago(1), event: 'wheel-spin', by: 'wife', points: 2 },
  { at: ago(10), event: 'wheel-spin', by: 'wife', points: 9 },
  { at: ago(1), event: 'wheel-spin', by: 'wife' },
];
const rewardRequests = [{ id: 'r1', cost: 7 }, { id: 'r2', cost: 4 }, { id: 'r3', cost: 100 }];
const auctions = [
  { outcome: 'charged', winningBid: 6, closesAt: ago(3) },
  { outcome: 'void', closesAt: ago(2) },
  { outcome: 'charged', winningBid: 50, closesAt: ago(20) },
];
const spark = { sessionId: 'session-1', reroll: 0, dismissed: [] as string[], checkIn: { energy: 'low' as const, mood: 'quiet' as const } };
const base = { now, missions, history, rewardRequests, auctions };

// Wife digest from hand-made visible data: window, points, spend, tags, streaks and the top-rated idea.
const wife = weeklyDigest({ ...base, viewer: 'wife', ideas: library, spark });
assert.equal(wife.approved, 5, 'approvals older than seven days are excluded');
assert.equal(wife.pointsHerEarned, 15);
assert.equal(wife.pointsEarnedHusband, 15, 'his earned points are the approved points of the same week');
assert.equal(wife.pointsSpentHusband, 17, 'approved reward requests, approved wish prices and charged auction bids; declined, unpriced and void spend nothing');
assert.equal(wife.pointsHerSpent, 2, 'wheel spins in the week; a spin without a recorded cost adds nothing, and wishes are paid from shared points');
assert.deepEqual(wife.topTags, ['challenges', 'care', 'writing'], 'categories ordered by count, then name; pending and old missions are not counted');
assert.deepEqual(wife.topRated, { title: 'Title b', category: 'challenges', rating: 'love' }, 'love beats like, and the window applies');
assert.equal(wife.empty, false);
assert.deepEqual(wife.period, { fromDay: sparkDay(ago(7)), toDay: sparkDay(now) });
assert.equal(wife.period.fromDay, '2026-11-08');
assert.equal(wife.period.toDay, '2026-11-15');
assert.ok(wife.suggestion, 'the wife gets one suggested next idea');
assert.deepEqual(wife.suggestion, pickSpark(library, { sessionId: spark.sessionId, day: sparkDay(now), reroll: 1, dismissed: [], checkIn: spark.checkIn }), 'the suggestion is the next candidate of the existing spark rotation');
console.log('PASS digest wife totals: window, approvals, reward, wish and auction spend, her spend, top tags, top-rated idea, next idea');

// Husband digest: the same numbers, never the top-rated idea or a suggestion, even when the inputs are passed.
const husband = weeklyDigest({ ...base, viewer: 'husband', ideas: library, spark });
assert.equal('topRated' in husband, false, 'the husband digest never ranks her ideas');
assert.equal('suggestion' in husband, false, 'the husband digest never carries a suggestion');
assert.deepEqual({ ...husband, topRated: undefined, suggestion: undefined }, { ...wife, topRated: undefined, suggestion: undefined }, 'every shared number matches the wife');
console.log('PASS digest husband omissions: no topRated and no suggestion, shared totals identical');

// Withheld content: a queued secret contributes nothing; an approved secret or surprise counts toward totals but never toward tags or the top-rated idea.
const queuedSecret = mission('s', { status: 'queued', secret: true, points: 99, approvedAt: undefined, category: 'secretcat', title: 'Secret title', text: 'Secret text' });
assert.deepEqual(weeklyDigest({ ...base, missions: [...missions, queuedSecret], viewer: 'wife' }), weeklyDigest({ ...base, viewer: 'wife' }), 'an undelivered secret adds nothing');
const approvedSecret = mission('g', { secret: true, points: 2, approvedAt: ago(0), category: 'secretcat', rating: 'love', title: 'Secret loved' });
const approvedSurprise = mission('k', { surprise: true, points: 1, approvedAt: ago(0), category: 'surprisecat', rating: 'love', title: 'Surprise loved' });
const withWithheld = weeklyDigest({ ...base, missions: [...missions, approvedSecret, approvedSurprise], viewer: 'wife' });
assert.equal(withWithheld.approved, 7, 'approved secrets still count as approvals');
assert.equal(withWithheld.pointsHerEarned, 18);
assert.equal(withWithheld.topTags.includes('secretcat') || withWithheld.topTags.includes('surprisecat'), false, 'secret and surprise categories never surface');
assert.deepEqual(withWithheld.topRated, { title: 'Title b', category: 'challenges', rating: 'love' }, 'a withheld rated item is never the top-rated idea');
console.log('PASS digest withheld items: undelivered secret contributes nothing; approved secret and surprise count only toward totals');

// Window edges: exactly seven days back is included; one millisecond older is excluded.
assert.equal(weeklyDigest({ now, missions: [mission('x', { approvedAt: now - DIGEST_WINDOW_MS })], history: [], viewer: 'husband' }).approved, 1);
assert.equal(weeklyDigest({ now, missions: [mission('y', { approvedAt: now - DIGEST_WINDOW_MS - 1 })], history: [], viewer: 'husband' }).approved, 0);
console.log('PASS digest window: approvals older than seven days are excluded');

// Streaks come from the existing helpers and match them exactly.
assert.equal(wife.streaks.devotion.current, 5, 'today back to four days ago, with the chain broken before day six');
assert.deepEqual(wife.streaks.devotion, devotionStreak(missions, now));
assert.deepEqual(wife.streaks.mission, missionStreak(missions, now));
assert.deepEqual(husband.streaks, wife.streaks);
console.log('PASS digest streaks: devotion and mission streaks match the helpers');

// Empty input and quiet weeks show the empty state flag, not zeros-only.
const empty = weeklyDigest({ viewer: 'wife', now, missions: [], history: [] });
assert.equal(empty.empty, true);
assert.equal(empty.approved, 0);
assert.deepEqual(empty.topTags, []);
assert.equal('topRated' in empty, false);
assert.equal('suggestion' in empty, false, 'no ideas, no suggestion');
const quiet = weeklyDigest({ viewer: 'husband', now, missions: [mission('old', { approvedAt: ago(8) })], history: [{ at: ago(9), event: 'wheel-spin', by: 'wife', points: 2 }] });
assert.equal(quiet.empty, true, 'only out-of-window activity is an empty week');
const delivered = weeklyDigest({ viewer: 'husband', now, missions: [mission('p', { status: 'pending', deliveredAt: ago(0), approvedAt: undefined })], history: [] });
assert.equal(delivered.empty, false, 'a delivery this week is activity');
console.log('PASS digest empty state: no input and out-of-window-only weeks set the empty flag');
