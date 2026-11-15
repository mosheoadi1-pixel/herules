import assert from 'node:assert/strict';
import { library, type Category, type Idea } from '../src/library.ts';
import { WHEEL_COST_MAX, moodTags, offeredWheels, pickWheelIndex, wheelDefinitions, wheelPool, wheelWeights } from '../src/wheels.ts';

const categories: Category[] = ['challenges','timed','rewards','consequences','worship','devotion','cleaning','cooking','training','dresscode','teasing','anticipation','roleplay','random','secret'];
const sample: Idea[] = [...library, ...categories.map((category, n) => ({ id: `import-${category}-${n}`, category, he: 'x', en: 'x', minutes: 5, intensity: 3, tags: ['care', 'flirtation', 'home'] }))];
const byId = (id: string) => wheelDefinitions.find(def => def.id === id)!;

assert.deepEqual(wheelDefinitions.map(def => def.id), ['worship', 'tease', 'service', 'dare']);
for (const def of wheelDefinitions) {
 assert.ok(def.name.he && def.name.en && def.description.he && def.description.en, `${def.id} needs bilingual text`);
 const pool = wheelPool(def, sample);
 assert.ok(pool.every(idea => def.categories.includes(idea.category)), `${def.id} pool has a category outside its allowlist`);
 assert.ok(pool.every(idea => !def.tags.length || idea.tags.some(tag => def.tags.includes(tag))), `${def.id} pool has an idea without a listed tag`);
 assert.ok(!pool.some(idea => idea.category === 'consequences' || idea.category === 'rewards'), `${def.id} pool pulled consequences or rewards`);
 assert.deepEqual(pool, wheelPool(def, [...sample]), `${def.id} pool is not deterministic`);
 assert.deepEqual(pool.map(idea => idea.id), sample.filter(idea => pool.some(p => p.id === idea.id)).map(idea => idea.id), `${def.id} pool does not keep input order`);
}
assert.ok(wheelPool(byId('dare'), sample).every(idea => ['challenges','timed'].includes(idea.category)));
const explicit = wheelPool({ ...byId('worship'), categories: ['consequences', 'worship'], tags: [] }, sample);
assert.ok(explicit.some(idea => idea.category === 'consequences'), 'a definition that lists consequences includes them');
assert.ok(!wheelDefinitions.some(def => def.categories.includes('consequences') || def.categories.includes('rewards')), 'no built-in wheel lists consequences or rewards');
console.log('PASS wheels: pools respect allowed categories and tags, exclude consequences and rewards unless listed, and stay deterministic');

const offered = offeredWheels(sample).map(wheel => wheel.def.id);
assert.ok(offered.includes('dare') && offered.includes('tease'));
assert.deepEqual(offeredWheels([]), []);
assert.deepEqual(offeredWheels(library.filter(idea => idea.category === 'rewards' || idea.category === 'consequences')), []);
assert.deepEqual(offeredWheels([{ ...library[0], id: 'only-dare', category: 'challenges', tags: [] }]).map(wheel => wheel.def.id), ['dare']);
const builtIn = offeredWheels(library).map(wheel => wheel.def.id);
assert.ok(builtIn.includes('dare') && builtIn.includes('tease'));
console.log(`PASS wheels: empty pools are not offered (built-in library offers ${builtIn.join(', ')})`);

const pool = [{ tags: ['conversation'] }, { tags: ['writing'] }, { tags: ['care'] }] as Idea[];
const connection = { energy: 'medium', mood: 'connection' } as const;
assert.deepEqual(wheelWeights(pool, connection, true), [2, 1, 2], 'matching mood tags weigh 2');
assert.deepEqual(wheelWeights(pool, { energy: 'low', mood: 'quiet' }, true), [1, 2, 1], 'only tags that match the mood or energy weigh 2');
assert.deepEqual(wheelWeights(pool, undefined, true), [1, 1, 1], 'no check-in means every idea weighs 1');
assert.deepEqual(wheelWeights(pool, connection, false), [1, 1, 1], 'weighting off means every idea weighs 1');
assert.ok(moodTags(connection).includes('conversation') && !moodTags(undefined).length);
const seeds = Array.from({ length: 100 }, (_, seed) => seed);
const weights = [2, 1];
assert.deepEqual(seeds.map(seed => pickWheelIndex(weights, seed)), seeds.map(seed => pickWheelIndex(weights, seed)), 'a fixed seed reproduces the index');
assert.ok(seeds.every(seed => [0, 1].includes(pickWheelIndex(weights, seed))));
let heavy = 0;
for (let seed = 1; seed <= 3000; seed++) if (pickWheelIndex(weights, seed) === 0) heavy++;
assert.ok(heavy / 3000 > 0.6 && heavy / 3000 < 0.73, `weight 2 should win about two thirds of seeded picks, got ${heavy}`);
assert.equal(pickWheelIndex([], 1), -1);
assert.equal(WHEEL_COST_MAX, 20);
console.log('PASS wheels: mood weighting gives matching ideas weight 2, otherwise 1, and seeded picks are reproducible');
