import assert from 'node:assert/strict';
import { createHash,randomBytes,randomUUID,scryptSync } from 'node:crypto';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createApp } from '../server/app.ts';
import { startDatabase } from '../scripts/db/runtime.mjs';

const directory=await mkdtemp(join(tmpdir(),'her-rules-private-upgrade-'));
const db=await startDatabase(directory,55437),pool=new pg.Pool({connectionString:db.url});
let server:ReturnType<Awaited<ReturnType<typeof createApp>>['listen']>|undefined;
try{
 for(const file of ['001-foundation.sql','002-guests.sql'])await pool.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
 const wife=randomUUID(),husband=randomUUID(),pair=randomUUID(),session=randomUUID();
 const password='upgrade-password-long',digest='salt:'+scryptSync(password,'salt',64).toString('hex');
 await pool.query('INSERT INTO users(id,email,password,role,adult) VALUES($1,$2,$3,$4,true)',[wife,'wife@upgrade.test',digest,'wife']);
 await pool.query('INSERT INTO users(id,nickname,role,adult) VALUES($1,$2,$3,true)',[husband,'Existing guest','husband']);
 await pool.query('INSERT INTO pairs VALUES($1,$2,$3)',[pair,wife,husband]);
 await pool.query('UPDATE users SET pair_id=$1',[pair]);
 const history={id:session,status:'stopped',terms:'Keep our original boundaries',revision:1,revisions:[{revision:1,terms:'Keep our original boundaries'}],approvals:[wife,husband],pauses:[],remaining:50000,last:Date.now(),started:true,points:7,missions:[],messages:[{id:randomUUID(),by:wife,text:'Preserve this message',at:Date.now()}],history:[],inbox:[]};
 await pool.query('INSERT INTO sessions VALUES($1,$2,$3,$4)',[session,pair,'stopped',JSON.stringify(history)]);
 const token=randomBytes(32).toString('hex');
 await pool.query("INSERT INTO auth_sessions VALUES($1,$2,now()+interval '1 day')",[createHash('sha256').update(token).digest('hex'),husband]);
 const app=await createApp(pool,'http://localhost:4191');
 await createApp(pool,'http://localhost:4191');
 server=app.listen(4191);
 const cookie='hr_session='+token;
 const before=await fetch('http://localhost:4191/api/state',{headers:{Cookie:cookie}});assert.equal(before.status,200);
 const state=await before.json();assert.equal(state.user.id,husband);assert.equal(state.user.pair_id,pair);assert.equal(state.sessions[0].id,session);assert.equal(state.sessions[0].points,7);assert.deepEqual(state.sessions[0].messages,history.messages);assert.equal(state.sessions[0].terms,history.terms);
 const login=await fetch('http://localhost:4191/api/login',{method:'POST',headers:{Origin:'http://localhost:4191','Content-Type':'application/json'},body:JSON.stringify({email:'wife@upgrade.test',password})});assert.equal(login.status,200);
 const oldWife=await fetch('http://localhost:4191/api/state',{headers:{Cookie:login.headers.get('set-cookie')!.split(';')[0]}});assert.equal((await oldWife.json()).user.id,wife);
 const occupied=await fetch('http://localhost:4191/api/guest',{method:'POST',headers:{Origin:'http://localhost:4191','Content-Type':'application/json'},body:JSON.stringify({nickname:'Existing guest',role:'husband',adult:true})});assert.equal(occupied.status,409);
 assert.equal((await pool.query('SELECT count(*) FROM pairs')).rows[0].count,'1');
 assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count,'2');
 console.log('PASS private-game migration: existing pair/registered login/guest cookie/session/history/points retained; repeat startup and occupied-slot rejection');
 await new Promise<void>(r=>server!.close(()=>r()));server=undefined;
 // A multi-pair installation must not silently expose one pair to another.
 await pool.query('DROP TABLE private_game');
 const otherWife=randomUUID(),otherHusband=randomUUID();
 for(const [id,role] of [[otherWife,'wife'],[otherHusband,'husband']])await pool.query('INSERT INTO users(id,nickname,role,adult) VALUES($1,$2,$3,true)',[id,'Other player',role]);
 await pool.query('INSERT INTO pairs VALUES($1,$2,$3)',[randomUUID(),otherWife,otherHusband]);
 await assert.rejects(createApp(pool,'http://localhost:4191'),/Multiple existing pairs/);
 console.log('PASS private-game migration: ambiguous multi-pair upgrade refuses automatic selection without deleting data');
}finally{
 if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()));}
 await pool.end();await db.stop();await rm(directory,{recursive:true,force:true});
}
