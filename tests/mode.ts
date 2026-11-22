import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp } from '../server/app.ts';
import { hrMode } from '../server/mode.ts';

assert.equal(hrMode({}),'private','unset HR_MODE is private');
assert.equal(hrMode({HR_MODE:'private'}),'private');
assert.equal(hrMode({HR_MODE:'public'}),'public');
assert.equal(hrMode({HR_MODE:''}),'private');
for (const value of ['Public', 'PUBLIC', 'staging', ' public']) assert.throws(()=>hrMode({HR_MODE:value}),/HR_MODE must be "private" or "public"/,`invalid HR_MODE ${JSON.stringify(value)} must throw`);

const previous=process.env.HR_MODE;

const directory=await mkdtemp(join(tmpdir(),'her-rules-mode-'));
const db=await startDatabase(directory,55443),pool=new pg.Pool({connectionString:db.url});
const origin='http://localhost:4194';
const servers:Server[]=[];
const listen=async(app:Awaited<ReturnType<typeof createApp>>)=>{const server=app.listen(0);servers.push(server);await new Promise(resolve=>server.once('listening',resolve));return `http://localhost:${(server.address() as AddressInfo).port}`;};
try {
  process.env.HR_MODE='invalid';
  await assert.rejects(createApp(pool,origin),/HR_MODE must be "private" or "public"/,'createApp must fail closed on an invalid mode');
  assert.equal((await pool.query("SELECT to_regclass('public.users') IS NOT NULL AS ready")).rows[0].ready,false,'invalid mode must stop before migrations');

  delete process.env.HR_MODE;
  const privateBase=await listen(await createApp(pool,origin));
  const guest=await fetch(`${privateBase}/api/guest`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({role:'wife',adult:true})});
  assert.equal(guest.status,200);
  const cookie=/hr_session=([a-f0-9]{64})/.exec(guest.headers.get('set-cookie')??'')?.[0];
  assert.ok(cookie,'guest login sets the session cookie');
  const privateState=await (await fetch(`${privateBase}/api/state`,{headers:{Cookie:cookie}})).json();
  assert.equal(privateState.mode,'private','state includes the resolved private mode');
  assert.equal(privateState.user.role,'wife');

  process.env.HR_MODE='public';
  const publicBase=await listen(await createApp(pool,origin));
  const publicState=await (await fetch(`${publicBase}/api/state`,{headers:{Cookie:cookie}})).json();
  assert.equal(publicState.mode,'public','state includes the resolved public mode');
  assert.equal(publicState.user.id,privateState.user.id);
  assert.deepEqual(Object.keys(publicState).sort(),Object.keys(privateState).sort(),'only the mode differs between modes');
  console.log('PASS mode: unset defaults to private, public resolves, invalid values fail closed, state exposes the mode');
} finally {
  if (previous===undefined) delete process.env.HR_MODE; else process.env.HR_MODE=previous;
  await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
  await pool.end();
  await db.stop();
  await rm(directory,{recursive:true,force:true});
}
