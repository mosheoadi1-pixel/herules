import assert from 'node:assert/strict';
import { library, suggest } from '../src/library.ts';
import { readFileSync } from 'node:fs';
assert.equal(library.length,42);
assert.equal(new Set(library.map(i=>i.en)).size,42);
assert.equal(new Set(library.map(i=>i.he)).size,42);
for(const c of ['challenges','timed','rewards','consequences','roleplay','anticipation','random','secret']){
 assert.equal(library.filter(i=>i.category===c).length,['roleplay','anticipation'].includes(c)?6:5);
 for(let old=1;old<=20;old++)assert.ok(!library.some(i=>i.id===`${c}-${old}`),'Everyday catalog IDs must be removed');
 for(let kept=21;kept<=25;kept++)assert.ok(library.some(i=>i.id===`${c}-${kept}`),'Retained bold IDs must stay stable');
}
const supplied=readFileSync(new URL('../custom-tasks-template.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1);
assert.equal(supplied.length,2);
for(const row of supplied){const [category,he]=row.split(',');const item=library.find(i=>i.he===he.trim());assert.ok(item,'Supplied Hebrew task must be present verbatim');assert.equal(item.category,category);assert.equal(item.minutes,10);assert.equal(item.intensity,3);assert.ok(item.tags.includes('custom'));}
assert.ok(library.every(i=>i.intensity===3));
for(const i of library){assert.ok(i.minutes>0&&i.intensity>=1&&i.intensity<=3&&i.tags.length>0);assert.ok(i.he.length>20&&i.en.length>20);}
const recent=library.slice(0,10).map(i=>i.id);
for(let i=0;i<100;i++)assert.ok(!recent.includes(suggest(library,recent)!.id));
assert.equal(suggest(library.slice(0,10),recent),undefined);
console.log('PASS library: 42 ideas, exact supplied CSV wording, normalized defaults, 160 everyday IDs removed, 40 bold IDs retained, bilingual uniqueness and last-ten avoidance');
