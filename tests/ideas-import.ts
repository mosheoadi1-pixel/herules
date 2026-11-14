import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp } from '../server/app.ts';
import { importIdeas } from '../server/ideas-import.ts';
import { library } from '../src/library.ts';

const directory=await mkdtemp(join(tmpdir(),'her-rules-ideas-'));
const db=await startDatabase(directory,55438),pool=new pg.Pool({connectionString:db.url});
let server:ReturnType<Awaited<ReturnType<typeof createApp>>['listen']>|undefined;
const header='category,he,en,minutes,intensity,tags\r\n';
const row='challenges,"שלום, עולם","Say ""hello""\nworld",5,2,conversation|home';
try {
  const app=await createApp(pool,'http://localhost:4192');
  await pool.query("ALTER TABLE imported_ideas DROP CONSTRAINT imported_ideas_category_check, ADD CONSTRAINT imported_ideas_category_check CHECK(category IN ('challenges','timed','rewards','consequences','roleplay','anticipation','random','secret'))");
  for(const category of ['teasing','cleaning','cooking']) {
    assert.equal(await importIdeas(pool,header+row.replace('challenges',category)),1);
  }
  assert.equal(await importIdeas(pool,'\uFEFF'+header+row),1);
  assert.equal(await importIdeas(pool,header+row),0);
  const stored=(await pool.query("SELECT * FROM imported_ideas WHERE category='challenges'")).rows;
  assert.equal(stored[0].he,'שלום, עולם');
  assert.equal(stored[0].en,'Say "hello"\nworld');
  assert.deepEqual(stored[0].tags,['conversation','home']);
  assert.equal(await importIdeas(pool,header+row.replace(',5,2,',',5,9,')),1);
  assert.equal((await pool.query('SELECT intensity FROM imported_ideas WHERE intensity=3')).rowCount,1);
  assert.equal(await importIdeas(pool,header+row.replace(',5,2,',',5,4,')),0);
  // Built-in deduplication: a row duplicating either language of a src/library.ts suggestion is never inserted.
  const builtin=library[0]!;
  const builtinRow=(he:string,en:string)=>header+`challenges,"${he.replace(/"/g,'""')}","${en.replace(/"/g,'""')}",5,2,builtin`;
  assert.equal(await importIdeas(pool,builtinRow(builtin.he,builtin.en)),0);
  assert.equal(await importIdeas(pool,builtinRow(builtin.he,'English wording that matches no built-in suggestion')),0);
  assert.equal(await importIdeas(pool,builtinRow('נוסח עברי שאינו קיים בספרייה המובנית',builtin.en)),0);
  for(const bad of [row.replace('challenges','unknown'),row.replace(',5,2,',',0,2,'),...['0','-1','2.5','4.5','Infinity','invalid'].map(value=>row.replace(',5,2,',`,5,${value},`)),'challenges,"unclosed']) {
    await assert.rejects(importIdeas(pool,header+row.replace('שלום, עולם','רעיון חדש')+'\n'+bad));
  }
  assert.equal((await pool.query('SELECT count(*) FROM imported_ideas')).rows[0].count,'5');
  await assert.rejects(importIdeas(pool,'wrong,header\n'+row));
  await createApp(pool,'http://localhost:4192');
  assert.equal((await pool.query('SELECT count(*) FROM imported_ideas')).rows[0].count,'5');
  server=app.listen(4192);
  assert.equal((await fetch('http://localhost:4192/api/ideas')).status,401);
  const guest=await fetch('http://localhost:4192/api/guest',{method:'POST',headers:{Origin:'http://localhost:4192','Content-Type':'application/json'},body:JSON.stringify({nickname:'Importer test',role:'wife',adult:true})});
  const response=await fetch('http://localhost:4192/api/ideas',{headers:{Cookie:guest.headers.get('set-cookie')!.split(';')[0]}});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).ideas,(await pool.query('SELECT * FROM imported_ideas ORDER BY id')).rows);
  console.log('PASS CSV import: Hebrew, quotes, multiline, tags, deduplication, built-in deduplication, atomic validation, authenticated library');
} finally {
  if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()));}
  await pool.end();await db.stop();await rm(directory,{recursive:true,force:true});
}
