import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp } from '../server/app.ts';

const directory=await mkdtemp(join(tmpdir(),'her-rules-reset-'));
const db=await startDatabase(directory,55439),pool=new pg.Pool({connectionString:db.url});
try {
  await createApp(pool,'http://localhost:4193');
  const { resetGame }=await import('../server/reset.ts');
  await resetGame(pool);
  assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count,'2');
  assert.equal((await pool.query('SELECT count(*) FROM pairs')).rows[0].count,'1');
  const ideas=(await pool.query('SELECT id FROM imported_ideas ORDER BY id')).rows;
  assert.ok(ideas.length>100,'Custom CSV must be seeded');
  const pair=(await pool.query('SELECT pair_id FROM private_game')).rows[0].pair_id;
  await pool.query("INSERT INTO sessions VALUES(gen_random_uuid(),$1,'active','{}')",[pair]);
  await pool.query("INSERT INTO auth_sessions SELECT 'old-cookie',id,now()+interval '7 days' FROM users LIMIT 1");
  await pool.query('ALTER TABLE imported_ideas ADD CONSTRAINT reject_seed CHECK(false) NOT VALID');
  await assert.rejects(resetGame(pool),{code:'23514'});
  assert.equal((await pool.query('SELECT count(*) FROM sessions')).rows[0].count,'1','Failed seed must preserve gameplay');
  assert.equal((await pool.query('SELECT count(*) FROM auth_sessions')).rows[0].count,'1','Failed seed must preserve cookies');
  assert.deepEqual((await pool.query('SELECT id FROM imported_ideas ORDER BY id')).rows,ideas);
  await pool.query('ALTER TABLE imported_ideas DROP CONSTRAINT reject_seed');
  await resetGame(pool);
  assert.equal((await pool.query('SELECT count(*) FROM sessions')).rows[0].count,'0');
  assert.equal((await pool.query('SELECT count(*) FROM auth_sessions')).rows[0].count,'0');
  assert.deepEqual((await pool.query('SELECT id FROM imported_ideas ORDER BY id')).rows,ideas);
  console.log(`PASS startup reset: two identities, one pair, ${ideas.length} custom tasks, empty gameplay and expired cookies`);
} finally { await pool.end();await db.stop();await rm(directory,{recursive:true,force:true}); }
