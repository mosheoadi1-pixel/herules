import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp, type Session } from '../server/app.ts';

const directory=await mkdtemp(join(tmpdir(),'her-rules-proposals-'));
const db=await startDatabase(directory,55442),pool=new pg.Pool({connectionString:db.url});
let server:ReturnType<Awaited<ReturnType<typeof createApp>>['listen']>|undefined;
try {
  const app=await createApp(pool,'http://localhost:4200');
  server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server!.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const origin=`http://127.0.0.1:${address.port}`;
  const enter=async(role:'wife'|'husband')=>{
    const response=await fetch(`${origin}/api/guest`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({role,adult:true})});
    assert.equal(response.status,200);
    return response.headers.get('set-cookie')?.split(';')[0]??assert.fail('missing cookie');
  };
  const wife=await enter('wife'),husband=await enter('husband');
  const call=(cookie:string,op:string,body:any)=>fetch(`${origin}/api/sessions/${sessionId}/${op}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
  const state=async(cookie:string)=>{
    const response=await fetch(`${origin}/api/state`,{headers:{Cookie:cookie}});
    assert.equal(response.status,200);
    const data=await response.json()as{sessions:Session[]};
    assert.ok(data.sessions[0]);
    return data.sessions[0];
  };
  const created=await fetch(`${origin}/api/sessions`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:wife},body:JSON.stringify({terms:'Our shared terms for proposals',minutes:600})});
  assert.equal(created.status,200);
  const sessionId=(await created.json() as{session:Session}).session.id;
  for(const cookie of [wife,husband])assert.equal((await call(cookie,'approve',{revision:1})).status,200);

  // Only the husband proposes; a retry with the same key returns the original stored result.
  assert.equal((await call(wife,'propose',{key:randomUUID(),title:'T',text:'T',points:1})).status,403);
  const key=randomUUID();
  const sent=await call(husband,'propose',{key,title:'A slow evening together',text:'Nothing planned: quiet time, her choice, no agenda.',points:3});
  assert.equal(sent.status,200);
  const proposal=(await sent.json() as any).proposal as{id:string;status:string};
  assert.equal(proposal.status,'pending');
  const retry=await call(husband,'propose',{key,title:'A slow evening together',text:'Nothing planned: quiet time, her choice, no agenda.',points:3});
  assert.equal((await retry.json() as any).proposal.id,proposal.id,'committed retry returns original');
  let sessionView=await state(wife);
  assert.equal(sessionView.proposals?.length,1,'wife sees the proposal');

  // Only the wife decides, and adoption creates a draft only: nothing is delivered or scheduled.
  assert.equal((await call(husband,'proposal-decide',{proposal:proposal.id,adopt:true})).status,403);
  const adopted=await call(wife,'proposal-decide',{proposal:proposal.id,adopt:true});
  assert.equal(adopted.status,200);
  const adoptedBody=await adopted.json() as any;
  assert.equal(adoptedBody.proposal.status,'adopted');
  assert.equal(adoptedBody.mission.status,'draft','adoption creates a draft, never a delivery');
  sessionView=await state(wife);
  assert.ok(sessionView.missions.some(m=>m.id===adoptedBody.mission.id),'draft joined her missions');

  // A decided proposal cannot be decided again, in either direction.
  assert.equal((await call(wife,'proposal-decide',{proposal:proposal.id,adopt:false})).status,409);
  assert.equal((await call(wife,'proposal-decide',{proposal:proposal.id,adopt:true})).status,409);

  // Declining keeps the flow working and stores the outcome.
  const second=randomUUID();
  assert.equal((await call(husband,'propose',{key:second,title:'A dance for one song',text:'She picks the song; joining is her choice.',points:2})).status,200);
  const secondId=await state(husband).then(view=>view.proposals!.find(p=>p.status==='pending')!.id);
  const declined=await call(wife,'proposal-decide',{proposal:secondId,adopt:false});
  assert.equal(declined.status,200);
  assert.equal((await declined.json() as any).proposal.status,'declined');

  // Proposals stay available while a pause is active; delivery of an adopted draft still waits for play.
  assert.equal((await call(husband,'pause',{})).status,200);
  assert.equal((await call(husband,'checkin',{minutes:10,energy:'low',mood:'quiet'})).status,200);
  const third=randomUUID();
  assert.equal((await call(husband,'propose',{key:third,title:'Held note',text:'A proposal while paused.',points:1})).status,200,'proposals work during a pause');
  assert.equal((await call(wife,'deliver',{mission:adoptedBody.mission.id})).status,409,'delivery requires active play');
  assert.equal((await call(husband,'resume',{})).status,200);

  // The adopted draft is delivered only by her explicit choice.
  assert.equal((await call(wife,'deliver',{mission:adoptedBody.mission.id})).status,200);
  sessionView=await state(wife);
  assert.equal(sessionView.missions.find(m=>m.id===adoptedBody.mission.id)?.status,'pending');

  // Stop is terminal for proposals like every other mutation; like messages, retries after
  // terminal state are rejected rather than replayed.
  assert.equal((await call(wife,'stop',{})).status,200);
  const fourth=randomUUID();
  const terminal=await call(husband,'propose',{key:fourth,title:'Late',text:'Too late.',points:1});
  assert.equal(terminal.status,409,'terminal session rejects proposals');
  const retryAfterStop=await call(husband,'propose',{key,title:'A slow evening together',text:'Nothing planned: quiet time, her choice, no agenda.',points:3});
  assert.equal(retryAfterStop.status,409,'terminal state also rejects a committed-key retry');

  console.log('proposals: PASS');
} finally {
  await pool.end().catch(()=>{});
  await server?.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));
  await rm(directory,{recursive:true,force:true});
}
