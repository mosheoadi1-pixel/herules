import assert from 'node:assert/strict';
import { library, ideasForDestination, suggest } from '../src/library.ts';

const ideas = [...library, ...(['rewards','consequences','challenges'] as const).map(category => ({...library[0], id:`import-${category}`, category}))];
for (const destination of ['library','rewards','consequences'] as const) {
 const selected = ideasForDestination(ideas,destination);
 assert.ok(selected.length);
 assert.ok(selected.every(i => destination === 'library' ? !['rewards','consequences'].includes(i.category) : i.category === destination));
 assert.ok(selected.some(i => i.id === `import-${destination === 'library' ? 'challenges' : destination}`));
 for (let n=0;n<100;n++) assert.ok(selected.includes(suggest(selected,[])!));
}
console.log('PASS idea destinations include imports and restrict dice pools');

const safe = library.find(i=>i.id==='random-22')!;
const unsafe = {...safe,id:'import-public',he:'unsafe',en:'unsafe',tags:['public','outdoors']};
const spoof = {...unsafe,id:safe.id};
for (const destination of ['library','rewards','consequences'] as const) {
 const off = ideasForDestination([...library,unsafe,spoof],destination,false);
 const on = ideasForDestination([...library,unsafe,spoof],destination,true);
 assert.ok(!on.includes(unsafe) && !on.includes(spoof));
 if(destination==='library') {
  assert.ok(off.includes(unsafe) && off.includes(spoof));
  assert.ok(on.includes(safe));
  assert.equal(on.filter(i=>i.category==='roleplay').length,0);
  assert.ok(on.filter(i=>i.tags.includes('music')).includes(safe));
  for(let n=0;n<20;n++) assert.ok(on.includes(suggest(on,[])!));
 } else assert.ok(on.every(i=>i.category===destination));
}
