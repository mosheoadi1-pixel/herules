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
