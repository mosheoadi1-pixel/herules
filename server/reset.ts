import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { importIdeas } from './ideas-import.ts';

export async function resetGame(pool:Pool) {
  const csv=await readFile(new URL('../custom-tasks-template.csv',import.meta.url),'utf8');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE private_game,request_keys,awards,approvals,sessions,invites,auth_sessions,pairs,users,rate_limits,imported_ideas');
    const wife=randomUUID(),husband=randomUUID(),pair=randomUUID();
    await client.query("INSERT INTO users(id,nickname,role,adult,pair_id) VALUES($1,'Wife','wife',true,$3),($2,'Husband','husband',true,$3)",[wife,husband,pair]);
    await client.query('INSERT INTO pairs(id,wife,husband) VALUES($1,$2,$3)',[pair,wife,husband]);
    await client.query('INSERT INTO private_game(singleton,wife,husband,pair_id) VALUES(true,$1,$2,$3)',[wife,husband,pair]);
    await importIdeas(client,csv);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK');throw error; } finally { client.release(); }
}
