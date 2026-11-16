import assert from 'node:assert/strict';
import { SEASON_DAY_MS, seasonForbiddenWords, seasonItemFor, seasonPacks, seasonStartDefault } from '../src/seasons.ts';

const ids = seasonPacks.map(pack => pack.id);
assert.equal(new Set(ids).size, ids.length, 'pack ids are unique');
assert.deepEqual(Object.fromEntries(seasonPacks.map(pack => [pack.id, pack.days])), { 'worship-week': 7, 'service-weekend': 2, 'queens-month': 30, hanukkah: 8 });

const filled = (value: { he?: string; en?: string }) => typeof value.he === 'string' && value.he.trim().length > 0 && typeof value.en === 'string' && value.en.trim().length > 0;
const escaped = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function forbiddenIn(text: string) {
  const hits: string[] = [];
  for (const word of seasonForbiddenWords.he) if (text.includes(word)) hits.push(word);
  for (const word of seasonForbiddenWords.en) if (new RegExp(`\\b${escaped(word)}\\b`, 'i').test(text)) hits.push(word);
  return hits;
}

assert.deepEqual(forbiddenIn('You are ugly'), ['ugly'], 'the detector catches a listed English term');
assert.deepEqual(forbiddenIn('Begin the beginning of the father'), [], 'English terms match whole words only');
assert.deepEqual(forbiddenIn('אתה מכוער'), ['מכוער'], 'the detector catches a listed Hebrew term');

for (const pack of seasonPacks) {
  assert.ok(filled(pack.title) && filled(pack.description), `${pack.id}: title and description are bilingual`);
  assert.ok(Number.isInteger(pack.days) && pack.days > 0, `${pack.id}: length in days is a positive integer`);
  assert.ok(pack.items.length > 0, `${pack.id}: items are non-empty`);
  assert.ok(pack.items.length <= pack.days, `${pack.id}: no more items than days`);
  for (const value of [pack.title, pack.description]) {
    assert.deepEqual(forbiddenIn(value.he), [], `${pack.id}: no humiliation term in Hebrew copy`);
    assert.deepEqual(forbiddenIn(value.en), [], `${pack.id}: no humiliation term in English copy`);
  }
  for (const item of pack.items) {
    assert.ok(filled(item.title) && filled(item.text), `${pack.id}: item "${item.title.en}" has bilingual title and text`);
    assert.ok(Number.isInteger(item.points) && item.points >= 0 && item.points <= 5, `${pack.id}: item "${item.title.en}" points are 0..5`);
    for (const value of [item.title.he, item.text.he, item.title.en, item.text.en]) assert.deepEqual(forbiddenIn(value), [], `${pack.id}: no humiliation term in "${value}"`);
  }
}

const queens = seasonPacks.find(pack => pack.id === 'queens-month')!;
assert.equal(queens.items.length, 10, "Queen's Month rotates through ten fixed items");
assert.equal(seasonItemFor(queens, 1), queens.items[0]);
assert.equal(seasonItemFor(queens, 11), queens.items[0], 'day 11 wraps to the first item');
assert.equal(seasonItemFor(queens, 30), queens.items[9]);

const day = SEASON_DAY_MS, nextMidnight = Date.UTC(2026, 10, 16);
assert.equal(seasonStartDefault(Date.UTC(2026, 10, 15, 12)), nextMidnight);
assert.equal(seasonStartDefault(Date.UTC(2026, 10, 15, 23, 58, 30)), nextMidnight, 'a start inside the minute still rounds to the next midnight');
assert.equal(seasonStartDefault(nextMidnight - 60000), nextMidnight, 'exactly one minute before midnight is accepted as the at-or-after boundary');
assert.equal(seasonStartDefault(nextMidnight), nextMidnight + day);
const fixedNow = Date.UTC(2026, 10, 15, 9, 30);
assert.ok(seasonStartDefault(fixedNow) - fixedNow >= 60000 && seasonStartDefault(fixedNow) - fixedNow < day + 60000);

console.log(`PASS season packs: ${seasonPacks.length} packs, bilingual items, humiliation-term scan, unique ids, day wrap and UTC start default`);
