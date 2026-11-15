import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { labels } from '../src/i18n.ts';
import { library } from '../src/library.ts';
import { parseCsv } from '../server/ideas-import.ts';

const rows = parseCsv(readFileSync(new URL('../custom-tasks-template.csv', import.meta.url), 'utf8')).slice(1);
const used = new Set<string>();
for (const row of rows) for (const tag of (row[5] ?? '').split('|')) if (tag.trim()) used.add(tag.trim());
for (const idea of library) for (const tag of idea.tags) used.add(tag);
const missing = [...used].filter(tag => !labels[tag]).sort();
assert.deepEqual(missing, [], `Tags without a bilingual label: ${missing.join(', ')}`);
for (const [tag, [he, en]] of Object.entries(labels)) if (used.has(tag)) assert.ok(he && en, `${tag} needs Hebrew and English labels`);
console.log(`PASS tag labels: ${used.size} tags used in the CSV and built-in library all have Hebrew and English labels`);
