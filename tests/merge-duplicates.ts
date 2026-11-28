import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp } from '../server/app.ts';
import { importIdeas, mergeDuplicateIdeas, normalizeIdeaText, ideaSimilarity, ideaFingerprint, isSameIdea } from '../server/ideas-import.ts';

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
  assert.equal(ideaSimilarity('fold all the laundry','fold all the laundry'),1);
  assert.ok(ideaSimilarity('קפלו את כל הכביסה בלי להתלונן','קפלו את כל הכביסה מבלי להתלונן')>0.86);
  // Reworded copies whose wording diverges in both languages are still one idea when all metadata matches.
  const clothespinsA='לשים אטבים על ירכיים פנימיות למספר דקות';
  const clothespinsB='לענוד אטבי כביסה על הירכיים הפנימיות במשך 5 דקות';
  const clothespinsEnA='Place clothespins on inner thighs for a few minutes';
  const clothespinsEnB='Wear clothespins on your inner thighs for five minutes';
  const meta={category:'consequences',minutes:5,intensity:3,tags:['control','touch']};
  assert.ok(isSameIdea(ideaFingerprint(clothespinsA,clothespinsEnA,meta),ideaFingerprint(clothespinsB,clothespinsEnB,meta)));
  assert.ok(!isSameIdea(ideaFingerprint(clothespinsA,clothespinsEnA,meta),ideaFingerprint(clothespinsB,clothespinsEnB,{...meta,minutes:15})));
  // The import guard rejects reworded or punctuation-only duplicates before they reach the table.
  assert.equal(await importIdeas(pool,a),1);
  assert.equal(await importIdeas(pool,a2),0);
  assert.equal(await importIdeas(pool,a3),0);
  assert.equal(await importIdeas(pool,c),1);
  assert.equal(await importIdeas(pool,d),1);
  assert.equal((await pool.query('SELECT count(*) FROM imported_ideas')).rows[0].count,'3');
  assert.equal(await mergeDuplicateIdeas(pool),0);
  // Legacy rows inserted without the guard are still merged on load, keeping the first id and the union of tags.
  await pool.query("INSERT INTO imported_ideas(id,category,he,en,minutes,intensity,tags) VALUES('legacy-a2','challenges',$1,$2,60,3,'{ties}')",['לשבת על כיסא עם הידיים קשורות מאחורי הגב','Sit on a chair with your hands tied behind your back']);
  await pool.query("INSERT INTO imported_ideas(id,category,he,en,minutes,intensity,tags) VALUES('legacy-a3','challenges',$1,$2,30,1,'{chair}')",['לשבת על כיסא עם הידיים קשורות מאחורי הגב.','Bound to the chair']);
  assert.equal(await mergeDuplicateIdeas(pool),2);
  const merged=(await pool.query("SELECT * FROM imported_ideas WHERE he LIKE 'לשבת על כיסא%' AND category='challenges'")).rows;
  assert.equal(merged.length,1);
  assert.deepEqual(merged[0].tags,['chair','control','home','ties']);
  assert.equal((await pool.query('SELECT count(*) FROM imported_ideas')).rows[0].count,'3');
  assert.equal(await mergeDuplicateIdeas(pool),0);
  // A single CSV containing two reworded copies also yields one row.
  await pool.query('TRUNCATE imported_ideas');
  const batch=header+'challenges,"קפלו את כל הכביסה בלי להתלונן","Fold all the laundry without complaining",5,1,a\r\nchallenges,"קפלו את כל הכביסה מבלי להתלונן","Fold all the laundry without a single complaint",5,1,b\r\n';
  assert.equal(await importIdeas(pool,batch),1);
  // The reported paraphrase pair cannot enter the table twice, even across separate imports.
  await pool.query('TRUNCATE imported_ideas');
  const rewordedA=header+'consequences,"'+clothespinsA+'","'+clothespinsEnA+'",5,3,control|touch\r\n';
  const rewordedB=header+'consequences,"'+clothespinsB+'","'+clothespinsEnB+'",5,3,control|touch\r\n';
  assert.equal(await importIdeas(pool,rewordedA),1);
  assert.equal(await importIdeas(pool,rewordedB),0);
  // The current template imports duplicate-free: server-load merging has nothing to collapse.
  const csv=await readFile(new URL('../custom-tasks-template.csv',import.meta.url),'utf8');
  await pool.query('TRUNCATE imported_ideas');
  const inserted=await importIdeas(pool,csv);
  assert.equal(await mergeDuplicateIdeas(pool),0);
  assert.equal((await pool.query('SELECT count(*) FROM imported_ideas')).rows[0].count,String(inserted));
  console.log('PASS duplicate merge: import-time guard, normalized/fuzzy clustering, tag union, category isolation, repeat-safe, clean template');
} finally {
  await pool.end();await db.stop();await rm(directory,{recursive:true,force:true});
}
