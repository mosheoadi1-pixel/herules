import assert from 'node:assert/strict';
import { dailySpark, pickSpark, rankSpark, sparkPool, SPARK_DISMISSED, SPARK_REROLLS, type SparkIdea } from '../src/spark.ts';
import { library } from '../src/library.ts';

const DAY = 86400000;
const now = Date.parse('2026-11-16T09:00:00Z');

const idea = (id: string, extra: Partial<SparkIdea> = {}): SparkIdea => ({ id, category: 'challenges', he: `רעיון ${id}`, en: `Idea ${id}`, minutes: 10, intensity: 2, tags: [], ...extra });
const pool = [idea('a'), idea('b'), idea('c'), idea('d')];

// The pool never offers rewards, consequences or an idea she dismissed today.
{
  const mixed = [...pool, idea('r', { category: 'rewards' }), idea('c2', { category: 'consequences' })];
  assert.deepEqual(sparkPool(mixed).map(i => i.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(sparkPool(mixed, ['b', 'r']).map(i => i.id), ['a', 'c', 'd']);
  assert.deepEqual(sparkPool([]), []);
}

// A low-energy day floats gentle, short or low-intensity ideas to the front.
{
  const gentle = idea('gentle', { intensity: 1, minutes: 30, tags: ['care'] });
  const short = idea('short', { intensity: 3, minutes: 5 });
  const bold = idea('bold', { intensity: 3, minutes: 90 });
  const ranked = rankSpark([bold, gentle, short], 'low');
  assert.equal(ranked[0].id, 'gentle');
  assert.equal(ranked[1].id, 'short');
  assert.equal(ranked[2].id, 'bold');
  assert.deepEqual(rankSpark([bold, short, gentle], 'high').map(i => i.id), ['bold', 'short', 'gentle'], 'no preference keeps the pool order');
}

// A matching check-in mood floats its tags, and ties keep the original order.
{
  const calm = idea('calm', { tags: ['reading'] });
  const playful = idea('playful', { tags: ['dice'] });
  const connecting = idea('connect', { tags: ['conversation'] });
  assert.deepEqual(rankSpark([playful, connecting, calm], 'medium', 'quiet').map(i => i.id), ['connect', 'calm', 'playful']);
  assert.deepEqual(rankSpark([calm, connecting, playful], 'medium', 'playful').map(i => i.id), ['playful', 'calm', 'connect']);
  assert.deepEqual(rankSpark([calm, playful, connecting], 'medium', 'connection').map(i => i.id), ['connect', 'calm', 'playful']);
}

// One spark per UTC day; a reroll advances it and wraps after the pool is exhausted.
{
  const first = pickSpark(pool, now);
  assert.ok(first);
  assert.equal(pickSpark(pool, now + 3600000)?.id, first.id, 'the same UTC day keeps the same spark');
  assert.notEqual(pickSpark(pool, now + DAY)?.id, undefined);
  const rerolled = new Set<string>();
  for (let i = 0; i < pool.length; i++) rerolled.add(pickSpark(pool, now, i)!.id);
  assert.equal(rerolled.size, pool.length, 'every reroll inside one pool length reaches a different idea');
  assert.equal(pickSpark(pool, now, pool.length)?.id, first.id, 'rerolls wrap around the pool');
  assert.equal(pickSpark([], now), undefined);
}

// dailySpark reports the day and reroll count it used.
{
  const spark = dailySpark(pool, { now, rerolls: 2 });
  assert.ok(spark);
  assert.equal(spark.day, Math.floor(now / DAY));
  assert.equal(spark.rerolls, 2);
  assert.ok(pool.some(i => i.id === spark.idea.id));
  assert.equal(dailySpark([], { now }), undefined);
  assert.equal(dailySpark([idea('r', { category: 'rewards' })], { now }), undefined, 'a rewards-only pool has no spark');
  const dismissed = dailySpark(pool, { now, dismissed: pool.map(i => i.id) });
  assert.equal(dismissed, undefined, 'dismissing every idea leaves no spark');
}

// The caps are part of the contract.
assert.equal(SPARK_REROLLS, 10);
assert.equal(SPARK_DISMISSED, 30);

// The real library always yields an eligible spark.
{
  const spark = dailySpark(library, { now });
  assert.ok(spark);
  assert.equal(['rewards', 'consequences'].includes(spark.idea.category), false);
  assert.ok(library.some(i => i.id === spark.idea.id));
}

console.log('PASS spark: eligible pool, dismissals, low-energy and mood ranking, one per UTC day, rerolls and caps');
