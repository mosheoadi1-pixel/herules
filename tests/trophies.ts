import assert from 'node:assert/strict';
import { TROPHY_LIMIT, trophyEntries, type TrophyPin, type TrophySource } from '../src/trophies.ts';

const wife = { id: 'wife-id', role: 'wife' as const };
const husband = { id: 'husband-id', role: 'husband' as const };
const source: TrophySource = {
  mission: id => id === 'shown' ? { title: 'Shown title', text: 'Shown text', completion: 'Done text' } : id === 'withheld' ? 'hidden' : undefined,
  reflection: id => id === 'wife-id' ? { appreciation: 'Thanks', repeat: '' } : id === 'husband-id' ? { appreciation: '', repeat: 'More walks' } : undefined,
};
const pins: TrophyPin[] = [
  { id: 'p1', kind: 'mission', ref: 'shown', at: 100 },
  { id: 'p2', kind: 'completion', ref: 'shown', at: 300 },
  { id: 'p3', kind: 'mission', ref: 'withheld', at: 200 },
  { id: 'p4', kind: 'reflection', ref: 'husband-id', at: 400 },
  { id: 'p5', kind: 'mission', ref: 'gone', at: 500 },
];

assert.equal(TROPHY_LIMIT, 30);
assert.deepEqual(trophyEntries(undefined, wife, source), [], 'no pins means an empty gallery');
const asWife = trophyEntries(pins, wife, source);
assert.deepEqual(asWife.map(entry => entry.at), [500, 400, 300, 200, 100], 'newest first');
assert.deepEqual(asWife.find(entry => entry.id === 'p1'), { id: 'p1', kind: 'mission', at: 100, author: 'wife', title: 'Shown title', text: 'Shown text' });
assert.deepEqual(asWife.find(entry => entry.id === 'p2'), { id: 'p2', kind: 'completion', at: 300, author: 'husband', text: 'Done text' });
assert.deepEqual(asWife.find(entry => entry.id === 'p4'), { id: 'p4', kind: 'reflection', at: 400, author: 'husband', text: 'More walks' });
assert.deepEqual(asWife.find(entry => entry.id === 'p5'), { id: 'p5', kind: 'mission', at: 500, missing: true });
assert.deepEqual(asWife.find(entry => entry.at === 200), { kind: 'mission', at: 200, hidden: true }, 'a withheld mission is a placeholder without id, title or text');

const asHusband = trophyEntries(pins, husband, source);
assert.deepEqual(asHusband.find(entry => entry.kind === 'reflection'), { id: 'p4', kind: 'reflection', at: 400, author: 'husband', text: 'More walks' }, 'the husband reflection is his own author');
assert.deepEqual(trophyEntries([{ id: 'r', kind: 'reflection', ref: 'wife-id', at: 1 }], husband, source)[0].author, 'wife', 'a wife reflection seen by the husband is authored by the wife');
assert.deepEqual(trophyEntries([{ id: 'r', kind: 'reflection', ref: 'wife-id', at: 1 }], wife, source)[0], { id: 'r', kind: 'reflection', at: 1, author: 'wife', text: 'Thanks' });
assert.deepEqual(trophyEntries([{ id: 'x', kind: 'reflection', ref: 'missing-id', at: 1 }], wife, source), [{ id: 'x', kind: 'reflection', at: 1, missing: true }]);
assert.equal(JSON.stringify(asHusband.filter(entry => entry.hidden)).includes('Shown'), false, 'a placeholder carries no content');
assert.deepEqual(Object.keys(asHusband.find(entry => entry.hidden)!).sort(), ['at', 'hidden', 'kind']);

console.log('PASS trophies: pins resolve per viewer, newest first, withheld and unknown refs become placeholders, reflection authorship follows the viewer');
