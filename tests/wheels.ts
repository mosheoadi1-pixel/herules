import assert from 'node:assert/strict';
import { WHEEL_COST_MAX, moodTags, offeredWheels, pickWheelIndex, wheelDefinitions, wheelPool, wheelWeights, type MoodInput } from '../src/wheels.ts';
import { library, type Idea } from '../src/library.ts';

const idea = (id: string, category: Idea['category'], tags: string[] = []): Idea => ({ id, category, he: `רעיון ${id}`, en: `Idea ${id}`, minutes: 10, intensity: 2, tags });

assert.equal(WHEEL_COST_MAX, 20);
assert.equal(new Set(wheelDefinitions.map(def => def.id)).size, wheelDefinitions.length, 'wheel ids are unique');
for (const def of wheelDefinitions) {
  assert.ok(def.name.he.trim() && def.name.en.trim() && def.description.he.trim() && def.description.en.trim(), `${def.id}: bilingual name and description`);
  assert.ok(def.categories.length > 0, `${def.id}: a category allowlist is required`);
}

// The pool honors the category allowlist and the any-of tag filter.
{
  const pool = [idea('a', 'worship', ['care']), idea('b', 'worship', ['planning']), idea('c', 'teasing'), idea('d', 'cleaning', ['home'])];
  const worship = wheelDefinitions.find(def => def.id === 'worship')!;
  assert.deepEqual(wheelPool(worship, pool).map(i => i.id), ['a'], 'tags filter inside the allowed categories');
  const service = wheelDefinitions.find(def => def.id === 'service')!;
  assert.deepEqual(wheelPool(service, pool).map(i => i.id), ['d'], 'an empty tag list accepts any tags');
  assert.deepEqual(wheelPool(worship, []), []);
}

// Rewards and consequences never enter a wheel through the definitions.
for (const def of wheelDefinitions) {
  assert.equal(wheelPool(def, [idea('r', 'rewards'), idea('c', 'consequences')]).length, 0, `${def.id}: no rewards or consequences`);
}

// A wheel is offered only when its pool is non-empty; the built-in library offers every wheel.
{
  const offered = offeredWheels([idea('a', 'worship', ['care'])]);
  assert.deepEqual(offered.map(wheel => wheel.def.id), ['worship']);
  assert.equal(offeredWheels([]).length, 0);
  assert.equal(offeredWheels(library).length, 2, 'the built-in library feeds the tease and dare wheels; imported ideas can feed the rest');
}

// The mood tags are the union of her mood and energy, deduplicated.
assert.deepEqual(moodTags(undefined), []);
const checkIn: MoodInput = { energy: 'low', mood: 'connection' };
const tags = moodTags(checkIn);
assert.deepEqual([...tags].sort(), [...new Set([...tags])].sort(), 'no duplicates');
assert.ok(tags.includes('conversation') && tags.includes('home'));

// Weighting: 2 when an idea shares a mood tag, otherwise 1; without preference everything weighs 1.
{
  const pool = [idea('a', 'worship', ['care']), idea('b', 'worship', ['planning'])];
  assert.deepEqual(wheelWeights(pool, checkIn, true), [2, 1]);
  assert.deepEqual(wheelWeights(pool, checkIn, false), [1, 1]);
  assert.deepEqual(wheelWeights(pool, undefined, true), [1, 1]);
}

// A seeded pick is reproducible, respects weights and returns -1 for an empty pool.
{
  assert.equal(pickWheelIndex([]), -1);
  assert.equal(pickWheelIndex([1, 1, 1], 7), pickWheelIndex([1, 1, 1], 7), 'the same seed picks the same index');
  assert.equal(pickWheelIndex([1, 1, 1], 7), pickWheelIndex([1, 1, 1, 1, 1], 7), 'an identical total weight space picks the same index');
  // A heavy weight is picked far more often across seeds.
  let heavy = 0;
  for (let seed = 0; seed < 200; seed++) if (pickWheelIndex([9, 1], seed) === 0) heavy++;
  assert.ok(heavy > 120, `the heavier side wins most seeds (got ${heavy}/200)`);
  const light = new Set<number>();
  for (let seed = 0; seed < 200; seed++) light.add(pickWheelIndex([1, 1, 1, 1], seed));
  assert.ok(light.size >= 2 && light.size <= 4, 'every reachable index stays inside the pool');
}

console.log('PASS wheels: limits, pool rules, offered wheels, mood tags, weights and seeded picks');
