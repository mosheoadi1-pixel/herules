import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp } from '../server/app.ts';
import { importIdeas, mergeDuplicateIdeas, normalizeIdeaText } from '../server/ideas-import.ts';

const directory=await mkdtemp(join(tmpdir(),'her-rules-merge-'));
const db=await startDatabase(directory,55443),pool=new pg.Pool({connectionString:db.url});
const header='category,he,en,minutes,intensity,tags\r\n';
// One task seeded three times inside 'challenges': re-import with edited fields (A2) and a punctuation-only Hebrew variant (A3).
const a=header+'challenges,"לשבת על כיסא עם הידיים קשורות מאחורי הגב","Sit on a chair with your hands tied behind your back",45,2,home|control\r\n';
const a2=header+'challenges,"לשבת על כיסא עם הידיים קשורות מאחורי הגב","Sit on a chair with your hands tied behind your back",60,3,ties\r\n';
const a3=header+'challenges,"לשבת על כיסא עם הידיים קשורות מאחורי הגב.","Bound to the chair",30,1,chair\r\n';
// Same texts as A under another category and a fully distinct task: both must survive the merge.
const c=header+'rewards,"לשבת על כיסא עם הידיים קשורות מאחורי הגב","Sit on a chair with your hands tied behind your back",45,2,rewards\r\n';
const d=header+'consequences,"להתקלח במקלחת קרה לגמרי","Take a completely cold shower",10,3,home|control\r\n';
try {
  await createApp(pool,'http://localhost:4193');
  assert.equal(normalizeIdeaText('שלום, "עולם"!'),'שלום עולם');
  assert.equal(normalizeIdeaText('Say "hello" — world.'),'say hello world');
  for(const csv of [a,a2,a3,c,d])assert.equal(await importIdeas(pool,csv),1);
  assert.equal((await pool.query('SELECT count(*) FROM imported_ideas')).rows[0].count,'5');
  // The three A rows are one idea: two are merged away and the survivor carries the union of all tags.
  assert.equal(await mergeDuplicateIdeas(pool),2);
  const merged=(await pool.query('SELECT * FROM imported_ideas WHERE he LIKE \'לשבת על כיסא%\' AND category=\'challenges\'')).rows;
  assert.equal(merged.length,1);
  assert.deepEqual(merged[0].tags,['chair','control','home','ties']);
  // Distinct category and distinct task survive untouched; a second pass is a no-op.
  assert.equal((await pool.query('SELECT count(*) FROM imported_ideas')).rows[0].count,'3');
  assert.equal(await mergeDuplicateIdeas(pool),0);
  // The current template imports duplicate-free: server-load merging has nothing to collapse.
  const csv=await readFile(new URL('../custom-tasks-template.csv',import.meta.url),'utf8');
  await pool.query('TRUNCATE imported_ideas');
  const inserted=await importIdeas(pool,csv);
  assert.equal(await mergeDuplicateIdeas(pool),0);
  assert.equal((await pool.query('SELECT count(*) FROM imported_ideas')).rows[0].count,String(inserted));
  console.log('PASS duplicate merge: normalized-text clustering, tag union, category isolation, repeat-safe, clean template');
} finally {
  await pool.end();await db.stop();await rm(directory,{recursive:true,force:true});
}
