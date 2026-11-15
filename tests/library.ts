import assert from 'node:assert/strict';
import { categories, ideasForDestination, library, suggest } from '../src/library.ts';
import { labels } from '../src/i18n.ts';
assert.equal(library.length,43);
assert.equal(new Set(library.map(i=>i.en)).size,43);
assert.notEqual(library.find(v=>v.id==='custom-anticipation-1')!.en,library.find(v=>v.id==='custom-anticipation-2')!.en);
assert.equal(new Set(library.map(i=>i.he)).size,43);
for(const c of ['challenges','timed','rewards','consequences','roleplay','anticipation','random','secret']){
 assert.equal(library.filter(i=>i.category===c).length,c==='anticipation'?7:c==='roleplay'?6:5);
 for(let old=1;old<=20;old++)assert.ok(!library.some(i=>i.id===`${c}-${old}`),'Everyday catalog IDs must be removed');
 for(let kept=21;kept<=25;kept++)assert.ok(library.some(i=>i.id===`${c}-${kept}`),'Retained bold IDs must stay stable');
}
assert.ok(library.every(i=>i.intensity===3));
for(const i of library){assert.ok(i.minutes>0&&i.intensity>=1&&i.intensity<=3&&i.tags.length>0);assert.ok(i.he.length>20&&i.en.length>20);}
const recent=library.slice(0,10).map(i=>i.id);
for(let i=0;i<100;i++)assert.ok(!recent.includes(suggest(library,recent)!.id));
assert.equal(suggest(library.slice(0,10),recent),undefined);
console.log('PASS built-in library: 43 ideas, 160 everyday IDs removed, 40 bold IDs retained, Hebrew and English uniqueness, last-ten avoidance');
const newCategories=['worship','devotion','training','dresscode','public','denial'];
assert.deepEqual(categories.slice(-6),newCategories);
for(const c of categories)assert.ok(labels[c]?.[0]&&labels[c]?.[1],`Category ${c} needs Hebrew and English labels`);
assert.deepEqual([labels.worship,labels.devotion,labels.training,labels.dresscode,labels.public,labels.denial],[['סגידה','Worship'],['מסירות','Devotion'],['אימון','Training'],['קוד לבוש','Dress code'],['בציבור','Public'],['מניעת סיפוק','Denial']]);
const probe=categories.map((category,i)=>({...library[0]!,id:`probe-${i}`,category}));
const shown=new Set(ideasForDestination(probe,'library').map(i=>i.category));
for(const c of newCategories)assert.ok(shown.has(c as typeof categories[number]),`${c} must appear in the library destination`);
assert.deepEqual(ideasForDestination(probe,'rewards').map(i=>i.category),['rewards']);
console.log(`PASS category labels: ${categories.length} categories have Hebrew and English labels; worship, devotion, training, dresscode, public and denial appear in the library`);
