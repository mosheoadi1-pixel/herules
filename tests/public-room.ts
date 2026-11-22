import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp } from '../server/app.ts';
import type { PublicIdentityProvider } from '../server/public-auth.ts';

const previous={mode:process.env.HR_MODE,admins:process.env.HR_ADMIN_PUBLIC_IDS,adminHash:process.env.ADMIN_HASH};
process.env.HR_MODE='public';
delete process.env.ADMIN_HASH;
const directory=await mkdtemp(join(tmpdir(),'her-rules-room-'));
const db=await startDatabase(directory,55447),pool=new pg.Pool({connectionString:db.url});
const origin='http://localhost:4197';
const servers:Server[]=[];
const streams:Stream[]=[];
const listen=async(app:Awaited<ReturnType<typeof createApp>>)=>{const server=app.listen(0);servers.push(server);await new Promise(resolve=>server.once('listening',resolve));return `http://localhost:${(server.address() as AddressInfo).port}`;};
const post=(base:string,path:string,body:unknown,cookie='')=>fetch(`${base}/api${path}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body),redirect:'manual'});
const get=(base:string,path:string,cookie='')=>fetch(`${base}/api${path}`,{headers:cookie?{Cookie:cookie}:{},redirect:'manual'});
const del=(base:string,path:string,cookie='')=>fetch(`${base}/api${path}`,{method:'DELETE',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{})},redirect:'manual'});
const cookieOf=(response:Response)=>/hr_public_session=[a-f0-9]{64}/.exec(response.headers.get('set-cookie')??'')?.[0]??'';
const tokenOf=(response:Response)=>/#public-pending=([A-Za-z0-9_-]+)$/.exec(response.headers.get('location')??'')?.[1]??'';
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function json(response:Response,status=200){const text=await response.text();assert.equal(response.status,status,text);return text?JSON.parse(text):null;}
async function failure(response:Response,status:number,message:string){const data=await json(response,status);assert.equal(data.error,message);}

type Frame={id:number;event:string;data:any};
type Stream={status:number;frames:Frame[];until:(predicate:(frames:Frame[])=>boolean,timeout?:number)=>Promise<Frame[]>;close:()=>Promise<void>};
// Reads the event stream into frames. Heartbeat comments and retry lines are not room events.
async function stream(base:string,cookie:string,lastEventId?:string):Promise<Stream>{
  const controller=new AbortController();
  const response=await fetch(`${base}/api/public/events`,{headers:{Cookie:cookie,...(lastEventId?{'Last-Event-ID':lastEventId}:{})},signal:controller.signal});
  if(response.status!==200){controller.abort();return {status:response.status,frames:[],until:async()=>[],close:async()=>{}};}
  const frames:Frame[]=[];
  const reading=(async()=>{
    const reader=response.body!.getReader(),decoder=new TextDecoder();
    let buffer='';
    try{
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        for(let cut=buffer.indexOf('\n\n');cut>=0;cut=buffer.indexOf('\n\n')){
          const block=buffer.slice(0,cut);buffer=buffer.slice(cut+2);
          const fields:Record<string,string>={};
          for(const line of block.split('\n')){const at=line.indexOf(':');if(at<=0)continue;fields[line.slice(0,at)]=line.slice(at+1).replace(/^ /,'');}
          if(fields.event==='room')frames.push({id:Number(fields.id),event:fields.event,data:JSON.parse(fields.data)});
        }
      }
    }catch{/* closed by the test */}
  })();
  const handle:Stream={status:200,frames,until:async(predicate,timeout=6000)=>{const started=Date.now();while(!predicate(frames)){if(Date.now()-started>timeout)throw new Error(`timed out; received ids ${JSON.stringify(frames.map(f=>f.id))}`);await sleep(50);}return frames;},close:async()=>{controller.abort();await reading;}};
  streams.push(handle);
  return handle;
}

const fake:PublicIdentityProvider={
  name:'google',
  authorizeUrl({state,redirectUri}){return `https://accounts.example.test/auth?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;},
  async exchange({code}){return {subject:code.replace(/^code:/,''),emailVerified:false};},
};

let base='';
type Member={id:string;cookie:string};
async function enrol(code:string,nickname:string,role:'sub'|'dom'):Promise<Member>{
  const started=await (await get(base,'/public/auth/google/start')).json();
  const token=tokenOf(await get(base,`/public/auth/google/callback?code=code:${code}&state=${new URL(started.url).searchParams.get('state')}`));
  assert.ok(token,`${nickname} gets a pending registration`);
  const registered=await post(base,'/public/register',{pendingToken:token,nickname,role,gender:'woman'});
  const {user}=await json(registered);
  return {id:user.id as string,cookie:cookieOf(registered)};
}
const verify=(member:Member)=>pool.query('UPDATE public_users SET verified_at=now() WHERE id=$1',[member.id]);
const send=(member:Member,body:Record<string,unknown>)=>post(base,'/public/room/messages',body,member.cookie);
const report=(member:Member,id:string,reason:unknown)=>post(base,`/public/room/messages/${id}/report`,{reason},member.cookie);
const block=(member:Member,body:unknown)=>post(base,'/public/room/blocks',body,member.cookie);
const adminRemove=(member:Member,id:string,body:unknown)=>post(base,`/public/admin/room/messages/${id}/remove`,body,member.cookie);
const roomOf=async(member:Member,after=0,limit=100)=>(await json(await get(base,`/public/room?after=${after}&limit=${limit}`,member.cookie))).messages as {id:string;seq:number;body:string|null;removed:boolean}[];
const seenBy=async(member:Member)=>new Set((await roomOf(member)).map(message=>message.id));

try {
  // Private mode has no room routes at all.
  delete process.env.HR_MODE;
  const privateBase=await listen(await createApp(pool,origin));
  for(const [method,path] of [['GET','/public/room'],['POST','/public/room/messages'],['GET','/public/events'],['POST',`/public/room/messages/${randomUUID()}/report`],['POST','/public/room/blocks'],['DELETE',`/public/room/blocks/${randomUUID()}`],['POST',`/public/admin/room/messages/${randomUUID()}/remove`],['GET','/public/admin/room/reports']] as const){
    const response=await fetch(`${privateBase}/api${path}`,{method,headers:{'Content-Type':'application/json',Origin:origin},body:method==='POST'?'{}':undefined});
    assert.equal(response.status,404,`${method} ${path} must not exist in private mode`);
  }
  process.env.HR_MODE='public';

  base=await listen(await createApp(pool,origin,{google:fake}));
  const admin=await enrol('admin','Ada Admin','sub');await verify(admin);
  const dana=await enrol('dana','Dana One','dom');await verify(dana);
  const dov=await enrol('dov','Dov Two','dom');await verify(dov);
  const dia=await enrol('dia','Dia Three','dom');await verify(dia);
  const sara=await enrol('sara','Sara One','sub');await verify(sara);
  const sol=await enrol('sol','Sol Two','sub');await verify(sol);
  const una=await enrol('una','Una Pending','sub');
  process.env.HR_ADMIN_PUBLIC_IDS=admin.id;

  // Verification gate and roles.
  await failure(await get(base,'/public/room',una.cookie),403,'Verification required');
  await failure(await send(una,{body:'hello'}),403,'Verification required');
  assert.equal((await get(base,'/public/events',una.cookie)).status,403,'unverified users get no event stream');
  assert.equal((await get(base,'/public/room')).status,401,'anonymous readers are refused');
  await failure(await send(sara,{body:'hello from a sub'}),403,'Only doms can post in the room');
  await failure(await send(sara,{body:'hello',targetNickname:'Dana One'}),403,'Only doms can post in the room');
  assert.ok(Array.isArray((await json(await get(base,'/public/room?after=0&limit=100',sara.cookie))).messages),'a verified sub can read the room');

  // Posting: general and addressed posts, nickname matching, body rules.
  const first=(await json(await send(dana,{body:'  Good evening  '}))).message;
  assert.equal(first.body,'Good evening','bodies are trimmed');
  assert.equal(first.nickname,'Dana One');
  assert.equal(first.targetNickname,null,'a dom post without a target is a general post');
  assert.equal(first.removed,false);
  assert.ok(!JSON.stringify(first).includes('@')&&!('email' in first),'the room shows nicknames only');
  const toSara=(await json(await send(dana,{body:'Tonight, the usual',targetNickname:'sara ONE'}))).message;
  assert.equal(toSara.targetNickname,'Sara One','nickname matching is case-insensitive');
  assert.equal(toSara.targetId,sara.id);
  await failure(await send(dana,{body:'hi',targetNickname:'Una Pending'}),404,'Recipient unavailable');
  await failure(await send(dana,{body:'hi',targetNickname:'Dov Two'}),404,'Recipient unavailable');
  await failure(await send(dana,{body:'hi',targetNickname:'Nobody Here'}),404,'Recipient unavailable');
  await failure(await send(dana,{body:'hi',targetNickname:'x'.repeat(21)}),400,'Invalid or missing input');
  for(const body of ['','   ','x'.repeat(1001),'😀'.repeat(1001)]) await failure(await send(dana,{body}),400,'Invalid or missing input');
  await failure(await send(dana,{}),400,'Invalid or missing input');
  const longest=(await json(await send(dana,{body:'😀'.repeat(1000)}))).message;
  assert.equal([...longest.body].length,1000,'1000 characters is accepted; the limit counts characters');

  const key=randomUUID();
  const once=(await json(await send(dana,{body:'Retry safely',idempotencyKey:key}))).message;
  const again=(await json(await send(dana,{body:'Retry safely',idempotencyKey:key}))).message;
  assert.equal(again.id,once.id,'a retried post returns the same message');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM room_messages WHERE idempotency_key=$1',[key])).rows[0].n,1,'a retried post does not duplicate');
  await failure(await send(dana,{body:'Different text',idempotencyKey:key}),409,'Idempotency key was used for a different message');
  await failure(await send(dana,{body:'Retry safely',targetNickname:'Sara One',idempotencyKey:key}),409,'Idempotency key was used for a different message');
  const otherAuthor=(await json(await send(dov,{body:'Same key, other author',idempotencyKey:key}))).message;
  assert.notEqual(otherAuthor.id,once.id,'idempotency keys are scoped to the author');
  await failure(await send(dana,{body:'x',idempotencyKey:'not-a-uuid'}),400,'Invalid or missing input');

  // Per-user post limit: twenty posts in ten minutes, the twenty-first is refused.
  for(let i=0;i<20;i++) await json(await send(dia,{body:`Post ${i}`}));
  await failure(await send(dia,{body:'One too many'}),429,'Too many posts; try again in ten minutes');

  // Reports: one per user per message.
  const dovGeneral=(await json(await send(dov,{body:'Dov here'}))).message;
  const dovToSara=(await json(await send(dov,{body:'For Sara',targetNickname:'Sara One'}))).message;
  assert.deepEqual(await json(await report(sara,first.id,'spam')),{reported:true});
  assert.deepEqual(await json(await report(sara,first.id,'spam again')),{reported:true},'a repeat report is accepted without a second row');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM room_reports WHERE message_id=$1 AND reporter_id=$2',[first.id,sara.id])).rows[0].n,1,'one report per user per message');
  assert.deepEqual(await json(await report(sol,first.id,'rude')),{reported:true});
  await failure(await report(dana,first.id,'mine'),400,'You cannot report your own message');
  await failure(await report(sara,first.id,''),400,'Invalid or missing input');
  await failure(await report(sara,randomUUID(),'missing'),404,'Message unavailable');

  // Blocks hide in both directions and cannot be bypassed by addressing.
  await failure(await block(dana,{}),400,'Invalid or missing input');
  await failure(await block(dana,{userId:dov.id,nickname:'Dov Two'}),400,'Invalid or missing input');
  await failure(await block(dana,{userId:dana.id}),400,'You cannot block yourself');
  await failure(await block(dana,{nickname:'Nobody Here'}),404,'Recipient unavailable');
  assert.deepEqual(await json(await block(dana,{userId:dov.id})),{blocked:true,userId:dov.id});
  {
    const danaSees=await seenBy(dana),dovSees=await seenBy(dov),saraSees=await seenBy(sara);
    assert.ok(!danaSees.has(dovGeneral.id)&&!danaSees.has(dovToSara.id),'the blocker does not see the blocked user messages');
    assert.ok(!dovSees.has(first.id),'the blocked user does not see the blocker messages');
    assert.ok(dovSees.has(dovGeneral.id),'a user always sees their own messages');
    assert.ok(saraSees.has(dovToSara.id)&&saraSees.has(first.id),'users outside the block see both');
    await failure(await report(dov,first.id,'hidden'),404,'Message unavailable');
  }
  await json(await block(sol,{nickname:'dana one'}));
  await failure(await send(dana,{body:'Still there?',targetNickname:'Sol Two'}),404,'Recipient unavailable');
  assert.ok(!(await seenBy(sol)).has(first.id),'a sub who blocked a dom does not see that dom messages');
  assert.equal((await del(base,`/public/room/blocks/${dov.id}`,dana.cookie)).status,200);
  assert.ok((await seenBy(dana)).has(dovGeneral.id),'unblocking restores the messages');

  // Realtime: a live event, its removal event, resume from Last-Event-ID, and polling agreement.
  const refused=await stream(base,una.cookie);
  assert.equal(refused.status,403,'an unverified stream is refused');
  const live=await stream(base,sara.cookie);
  const liveMessage=(await json(await send(dana,{body:'Live note'}))).message;
  const arrived=await live.until(frames=>frames.some(frame=>frame.data.id===liveMessage.id));
  const liveFrame=arrived.find(frame=>frame.data.id===liveMessage.id)!;
  assert.equal(liveFrame.id,liveMessage.seq,'the event id is the message seq');
  assert.equal(liveFrame.data.body,'Live note');
  const removedLive=await json(await adminRemove(admin,liveMessage.id,{reason:'Test removal'}));
  assert.equal(removedLive.message.removed,true);
  assert.equal(removedLive.message.body,null);
  const gone=await live.until(frames=>frames.some(frame=>frame.data.id===liveMessage.id&&frame.data.removed===true));
  const goneFrame=gone.find(frame=>frame.data.id===liveMessage.id&&frame.data.removed===true)!;
  assert.ok(goneFrame.id>liveMessage.seq,'a removal is a newer event');
  assert.equal(goneFrame.data.body,null);

  const resumed=await stream(base,sara.cookie,String(liveMessage.seq));
  const page=await json(await get(base,`/public/room?after=${liveMessage.seq}&limit=100`,sara.cookie));
  const polled=page.messages.map((message:{seq:number})=>message.seq);
  await resumed.until(frames=>frames.length===polled.length);
  assert.ok(resumed.frames.every(frame=>frame.id>liveMessage.seq),'resuming sends only events after Last-Event-ID');
  assert.ok(!resumed.frames.some(frame=>frame.data.id===liveMessage.id&&!frame.data.removed),'the earlier live event is not replayed');
  assert.deepEqual(resumed.frames.map(frame=>frame.id),polled,'the event stream and polling agree');

  const older=await stream(base,sara.cookie,String(first.seq));
  await older.until(frames=>frames.some(frame=>frame.data.id===liveMessage.id&&frame.data.removed===true));
  assert.ok(older.frames.some(frame=>frame.data.id===toSara.id),'resuming from an older event replays newer messages');

  const oneMessage=await json(await get(base,'/public/room?after=0&limit=1',sara.cookie));
  assert.equal(oneMessage.messages.length,1);
  assert.equal(oneMessage.hasMore,true,'a page with more to read says so');
  assert.equal(oneMessage.cursor,oneMessage.messages[0].seq);
  const latest=await json(await get(base,'/public/room',sara.cookie));
  const latestSeqs=latest.messages.map((message:{seq:number})=>message.seq);
  assert.deepEqual(latestSeqs,[...latestSeqs].sort((a,b)=>a-b),'the default room view is oldest first');
  assert.equal(latest.cursor,latestSeqs[latestSeqs.length-1]);
  assert.ok(!JSON.stringify(latest).includes('@')&&!JSON.stringify(latest).includes('email'),'readers never see email or identity fields');

  // Admin removal and reports.
  await failure(await adminRemove(dana,dovGeneral.id,{reason:'Not an admin'}),403,'Reviewer role required');
  await failure(await adminRemove(sara,dovGeneral.id,{reason:'Not an admin'}),403,'Reviewer role required');
  const target=(await json(await send(dov,{body:'Gone text'}))).message;
  await failure(await adminRemove(admin,target.id,{reason:''}),400,'Invalid or missing input');
  const done=await json(await adminRemove(admin,target.id,{reason:'Off-topic'}));
  assert.equal(done.message.removed,true);
  assert.equal(done.message.body,null);
  await failure(await adminRemove(admin,target.id,{reason:'Again'}),409,'Message already removed');
  const audit=(await pool.query('SELECT action,actor_id,reason FROM public_admin_audit WHERE target_message_id=$1',[target.id])).rows;
  assert.deepEqual(audit.map(row=>({action:row.action,actor:row.actor_id,reason:row.reason})),[{action:'room-remove',actor:admin.id,reason:'Off-topic'}],'every removal writes one audit row');
  const saraView=await json(await get(base,'/public/room?after=0&limit=100',sara.cookie));
  const marker=saraView.messages.find((message:{id:string})=>message.id===target.id);
  assert.equal(marker.removed,true);
  assert.equal(marker.body,null);
  assert.ok(!JSON.stringify(saraView).includes('Gone text'),'removed text never reaches readers');
  await failure(await report(sara,target.id,'late'),404,'Message unavailable');

  await failure(await get(base,'/public/admin/room/reports',dana.cookie),403,'Reviewer role required');
  const reports=await json(await get(base,'/public/admin/room/reports',admin.cookie));
  const entry=reports.reports.find((row:{id:string})=>row.id===first.id);
  assert.equal(entry.reportCount,2,'reports from two users count separately');
  assert.equal(entry.nickname,'Dana One');
  assert.ok(!JSON.stringify(reports).includes('@'),'the report list has no email');

  console.log('PASS public-room: verification gate, role rules, addressed posts, body and idempotency rules, post limit, reports, blocks, SSE live/removal/resume, polling agreement, admin removal and audit, private mode 404');
} finally {
  for(const [key,value] of [['HR_MODE',previous.mode],['HR_ADMIN_PUBLIC_IDS',previous.admins],['ADMIN_HASH',previous.adminHash]] as const){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  await Promise.all(streams.map(handle=>handle.close()));
  await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
  await pool.end();
  await db.stop();
  await rm(directory,{recursive:true,force:true});
}
