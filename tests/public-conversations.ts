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
const directory=await mkdtemp(join(tmpdir(),'her-rules-conversations-'));
const db=await startDatabase(directory,55449),pool=new pg.Pool({connectionString:db.url});
const origin='http://localhost:4199';
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
// Reads every named event on the stream. Heartbeats and retry lines are not events.
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
          if(fields.event)frames.push({id:Number(fields.id),event:fields.event,data:JSON.parse(fields.data)});
        }
      }
    }catch{/* closed by the test */}
  })();
  const handle:Stream={status:200,frames,until:async(predicate,timeout=6000)=>{const started=Date.now();while(!predicate(frames)){if(Date.now()-started>timeout)throw new Error(`timed out; received ${JSON.stringify(frames.map(f=>[f.id,f.event]))}`);await sleep(50);}return frames;},close:async()=>{controller.abort();await reading;}};
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
const addressed=(member:Member,body:Record<string,unknown>)=>post(base,'/public/room/messages',body,member.cookie);
const act=(member:Member,id:string,action:string,body:Record<string,unknown>={})=>post(base,`/public/conversations/${id}/${action}`,body,member.cookie);
const writeMessage=(member:Member,id:string,body:string,extra:Record<string,unknown>={})=>post(base,`/public/conversations/${id}/messages`,{body,...extra},member.cookie);
const detailOf=async(member:Member,id:string)=>json(await get(base,`/public/conversations/${id}`,member.cookie));
const listOf=async(member:Member)=>(await json(await get(base,'/public/conversations',member.cookie))).conversations as {id:string;state:string;role:string;otherNickname:string;canAnswer:boolean;canMessage:boolean;canClose:boolean;cooldownUntil:string|null}[];
const roomOf=async(member:Member)=>(await json(await get(base,'/public/room?after=0&limit=100',member.cookie))).messages as {id:string;body:string|null}[];
const report=(member:Member,id:string,reason:unknown)=>post(base,`/public/conversations/messages/${id}/report`,{reason},member.cookie);
const block=(member:Member,body:unknown)=>post(base,'/public/room/blocks',body,member.cookie);
const adminRemove=(member:Member,id:string,body:unknown)=>post(base,`/public/admin/conversations/messages/${id}/remove`,body,member.cookie);
const expire=(id:string)=>pool.query("UPDATE conversations SET cooldown_until=now()-interval '1 second' WHERE id=$1",[id]);
const countKey=async(key:string)=>(await pool.query('SELECT count(*)::int AS n FROM conversation_messages WHERE idempotency_key=$1',[key])).rows[0].n as number;

try {
  // Private mode has no conversation routes at all.
  delete process.env.HR_MODE;
  const privateBase=await listen(await createApp(pool,origin));
  for(const [method,path] of [['GET','/public/conversations'],['GET',`/public/conversations/${randomUUID()}`],['POST',`/public/conversations/${randomUUID()}/accept`],['POST',`/public/conversations/${randomUUID()}/decline`],['POST',`/public/conversations/${randomUUID()}/close`],['POST',`/public/conversations/${randomUUID()}/messages`],['POST',`/public/conversations/messages/${randomUUID()}/report`],['POST',`/public/admin/conversations/messages/${randomUUID()}/remove`],['GET','/public/admin/conversations/reports']] as const){
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
  const sam=await enrol('sam','Sam Four','sub');await verify(sam);
  const una=await enrol('una','Una Pending','sub');
  process.env.HR_ADMIN_PUBLIC_IDS=admin.id;

  // Gate: verified users only.
  await failure(await get(base,'/public/conversations',una.cookie),403,'Verification required');
  await failure(await get(base,'/public/conversations'),401,'Please sign in');
  assert.deepEqual(await listOf(sara),[],'a verified sub starts with no conversations');

  // Live streams open before the request so they can see it arrive.
  const saraLive=await stream(base,sara.cookie);
  const danaLive=await stream(base,dana.cookie);

  // A dom's addressed post creates a request. It is not a room message, and the room shows nothing for it.
  const requestBody=await json(await addressed(dana,{body:'Would you meet me on Thursday?',targetNickname:'sara one'}));
  const requested=requestBody.conversation;
  assert.ok(!('message' in requestBody),'an addressed post returns a conversation, not a room message');
  assert.equal(requested.state,'requested');
  assert.equal(requested.role,'dom');
  assert.equal(requested.otherNickname,'Sara One','the dom sees the sub nickname as it is registered');
  assert.equal(requested.canMessage,false);
  assert.equal(requested.canAnswer,false);
  assert.ok(!(await roomOf(dana)).some(message=>message.body?.includes('Thursday')),'the request is not in the room');
  assert.ok(!(await roomOf(sara)).some(message=>message.body?.includes('Thursday')),'the sub does not see the request in the room');

  // A sub cannot post to the room, and a sub's list shows the request for answering.
  await failure(await addressed(sara,{body:'Hello room'}),403,'Only doms can post in the room');
  const saraList=await listOf(sara);
  const asSub=saraList.find(item=>item.id===requested.id);
  assert.ok(asSub,'the sub sees the request');
  assert.equal(asSub!.role,'sub');
  assert.equal(asSub!.otherNickname,'Dana One');
  assert.equal(asSub!.canAnswer,true);
  assert.ok(!JSON.stringify(saraList).includes('@'),'the list shows nicknames only');

  // The sub is told of the request; the dom is not.
  const requestFrame=(await saraLive.until(frames=>frames.some(frame=>frame.event==='conversation_requested'&&frame.data.id===requested.id))).find(frame=>frame.event==='conversation_requested'&&frame.data.id===requested.id)!;
  assert.equal(requestFrame.id,Number((await pool.query('SELECT seq FROM conversations WHERE id=$1',[requested.id])).rows[0].seq),'the request event id is the conversation seq');
  const openingId=(await detailOf(sara,requested.id)).messages[0].id as string;
  await danaLive.until(frames=>frames.some(frame=>frame.event==='conversation_message'&&frame.data.id===openingId));
  assert.ok(!danaLive.frames.some(frame=>frame.event==='conversation_requested'),'the dom is never sent a request event');
  assert.ok(!(await json(await get(base,'/public/room?after=0&limit=100',dana.cookie))).events.some((event:{event:string})=>event.event==='conversation_requested'),'the dom poll never shows a request event');

  // Only the sub answers. Messages wait for acceptance. Outsiders see nothing.
  await failure(await writeMessage(sara,requested.id,'Yes already'),409,'Messages open after the request is accepted');
  await failure(await writeMessage(dana,requested.id,'Ping'),409,'Messages open after the request is accepted');
  await failure(await act(dana,requested.id,'accept'),403,'Only the sub can answer a request');
  await failure(await act(sol,requested.id,'accept'),404,'Conversation unavailable');
  await failure(await get(base,`/public/conversations/${requested.id}`,sol.cookie),404,'Conversation unavailable');
  await failure(await writeMessage(sol,requested.id,'hi'),404,'Conversation unavailable');
  const danaDetail=await detailOf(dana,requested.id);
  assert.equal(danaDetail.messages.length,1);
  assert.equal(danaDetail.messages[0].body,'Would you meet me on Thursday?');
  assert.equal(danaDetail.messages[0].mine,true);
  assert.equal((await detailOf(sara,requested.id)).messages[0].mine,false);

  // Accept: both sides are told, and both may now write.
  const accepted=(await json(await act(sara,requested.id,'accept'))).conversation;
  assert.equal(accepted.state,'accepted');
  assert.equal(accepted.canMessage,true);
  assert.equal(accepted.canAnswer,false);
  await failure(await act(sara,requested.id,'accept'),409,'The conversation is not waiting for an answer');
  await danaLive.until(frames=>frames.some(frame=>frame.event==='conversation_updated'&&frame.data.id===requested.id&&frame.data.state==='accepted'));
  await saraLive.until(frames=>frames.some(frame=>frame.event==='conversation_updated'&&frame.data.id===requested.id&&frame.data.state==='accepted'));

  const danaKey=randomUUID();
  const fromDana=(await json(await writeMessage(dana,requested.id,'Thursday works',{idempotencyKey:danaKey}))).message;
  assert.equal(fromDana.body,'Thursday works');
  assert.equal(fromDana.mine,true);
  const fromSara=(await json(await writeMessage(sara,requested.id,'Yes, eight'))).message;
  assert.equal(fromSara.nickname,'Sara One');
  const retried=(await json(await writeMessage(dana,requested.id,'Thursday works',{idempotencyKey:danaKey}))).message;
  assert.equal(retried.id,fromDana.id,'a retried message returns the original message');
  await failure(await writeMessage(dana,requested.id,'Other words',{idempotencyKey:danaKey}),409,'Idempotency key was used for a different message');
  assert.equal(await countKey(danaKey),1,'a retried message is stored once');
  await failure(await writeMessage(dana,requested.id,''),400,'Invalid or missing input');
  await failure(await writeMessage(dana,requested.id,'x'.repeat(1001)),400,'Invalid or missing input');
  assert.deepEqual((await detailOf(sara,requested.id)).messages.map((message:{body:string})=>message.body),['Would you meet me on Thursday?','Thursday works','Yes, eight'],'both sides read the thread in order');
  await saraLive.until(frames=>frames.some(frame=>frame.event==='conversation_message'&&frame.data.id===fromDana.id));

  // Polling and SSE agree on conversation events, and a resume from a request's id skips that request.
  const polled=await json(await get(base,`/public/room?after=${requestFrame.id}&limit=100`,sara.cookie));
  assert.ok(polled.events.some((event:{event:string;data:{id:string}})=>event.event==='conversation_message'&&event.data.id===fromDana.id),'polling returns conversation messages as events');
  const resumed=await stream(base,sara.cookie,String(requestFrame.id));
  await resumed.until(frames=>frames.some(frame=>frame.event==='conversation_message'&&frame.data.id===fromSara.id));
  assert.ok(resumed.frames.every(frame=>frame.id>requestFrame.id),'resuming sends only events after Last-Event-ID');
  assert.ok(!resumed.frames.some(frame=>frame.event==='conversation_requested'),'the request is not replayed after its own id');
  const streamedConversation=resumed.frames.filter(frame=>frame.event.startsWith('conversation_')).map(frame=>frame.id);
  assert.deepEqual(streamedConversation,polled.events.map((event:{id:number})=>event.id),'the event stream and polling agree on conversation events');
  // A replay carries each conversation's current state, not its earlier transitions.
  const fromStart=await stream(base,sara.cookie,'0');
  await fromStart.until(frames=>frames.some(frame=>frame.event.startsWith('conversation_')&&frame.data.id===requested.id&&frame.data.state==='accepted'));
  assert.ok(!fromStart.frames.some(frame=>frame.event==='conversation_requested'&&frame.data.id===requested.id),'a replay does not restate an earlier request');

  // Reports: one per user per message, never on your own message, never on a message you cannot see.
  await failure(await report(dana,openingId,'mine'),400,'You cannot report your own message');
  await failure(await report(sol,openingId,'outsider'),404,'Message unavailable');
  assert.deepEqual(await json(await report(sara,openingId,'spam')),{reported:true});
  assert.deepEqual(await json(await report(sara,openingId,'spam again')),{reported:true},'a repeat report is accepted');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM conversation_reports WHERE message_id=$1 AND reporter_id=$2',[openingId,sara.id])).rows[0].n,1,'one report per user per message');
  await failure(await report(sara,openingId,''),400,'Invalid or missing input');
  await failure(await report(sara,randomUUID(),'missing'),404,'Message unavailable');

  // Admin removal: body hidden for everyone, one audit row, admin-only, and the removal reaches the participants.
  await failure(await adminRemove(dana,fromDana.id,{reason:'Not an admin'}),403,'Reviewer role required');
  await failure(await adminRemove(sara,fromDana.id,{reason:'Not an admin'}),403,'Reviewer role required');
  await failure(await adminRemove(admin,fromDana.id,{reason:''}),400,'Invalid or missing input');
  const removed=await json(await adminRemove(admin,fromDana.id,{reason:'Off-topic'}));
  assert.equal(removed.message.removed,true);
  assert.equal(removed.message.body,null);
  await failure(await adminRemove(admin,fromDana.id,{reason:'Again'}),409,'Message already removed');
  const audit=(await pool.query('SELECT action,actor_id,reason FROM public_admin_audit WHERE target_message_id=$1',[fromDana.id])).rows;
  assert.deepEqual(audit.map(row=>({action:row.action,actor:row.actor_id,reason:row.reason})),[{action:'conversation-remove',actor:admin.id,reason:'Off-topic'}],'every removal writes one audit row');
  const saraThread=(await detailOf(sara,requested.id)).messages as {id:string;body:string|null;removed:boolean}[];
  const marker=saraThread.find(message=>message.id===fromDana.id)!;
  assert.equal(marker.removed,true);
  assert.equal(marker.body,null);
  assert.ok(!JSON.stringify(saraThread).includes('Thursday works'),'removed text never reaches the thread');
  await saraLive.until(frames=>frames.some(frame=>frame.event==='conversation_message'&&frame.data.id===fromDana.id&&frame.data.removed===true));
  await failure(await report(sara,fromDana.id,'late'),404,'Message unavailable');
  await failure(await get(base,'/public/admin/conversations/reports',dana.cookie),403,'Reviewer role required');
  const reports=await json(await get(base,'/public/admin/conversations/reports',admin.cookie));
  const entry=reports.reports.find((row:{id:string})=>row.id===openingId);
  assert.equal(entry.reportCount,1);
  assert.equal(entry.nickname,'Dana One');
  assert.ok(!JSON.stringify(reports).includes('@'),'the report list has no email');

  // Close an accepted conversation: messages stop, and the cooldown starts.
  const closed=(await json(await act(dana,requested.id,'close'))).conversation;
  assert.equal(closed.state,'closed');
  assert.equal(closed.canMessage,false);
  assert.equal(closed.canClose,false);
  assert.ok(closed.cooldownUntil,'closing an accepted conversation starts the cooldown');
  await failure(await writeMessage(sara,requested.id,'After close'),409,'This conversation is closed');
  await failure(await act(sara,requested.id,'close'),409,'This conversation is closed');
  await failure(await addressed(dana,{body:'Again',targetNickname:'Sara One'}),409,'Wait 30 days after a declined or closed conversation before asking again');
  await saraLive.until(frames=>frames.some(frame=>frame.event==='conversation_updated'&&frame.data.id===requested.id&&frame.data.state==='closed'));
  await expire(requested.id);
  const again=(await json(await addressed(dana,{body:'Second try',targetNickname:'Sara One'}))).conversation;
  assert.equal(again.state,'requested','a request works once the cooldown has passed');
  assert.notEqual(again.id,requested.id);

  // Decline sets a cooldown; the dom's retried request is the original; the cooldown then expires.
  const askKey=randomUUID();
  const toSol=(await json(await addressed(dov,{body:'May I ask you something?',targetNickname:'Sol Two',idempotencyKey:askKey}))).conversation;
  const askRetry=(await json(await addressed(dov,{body:'May I ask you something?',targetNickname:'Sol Two',idempotencyKey:askKey}))).conversation;
  assert.equal(askRetry.id,toSol.id,'a retried request returns the original conversation');
  await failure(await addressed(dov,{body:'Different',targetNickname:'Sol Two',idempotencyKey:askKey}),409,'Idempotency key was used for a different message');
  await failure(await addressed(dov,{body:'May I ask you something?',targetNickname:'Sara One',idempotencyKey:askKey}),409,'Idempotency key was used for a different message');
  assert.equal(await countKey(askKey),1,'a retried request stores one opening message');
  await failure(await addressed(dov,{body:'Second ask',targetNickname:'Sol Two'}),409,'A conversation with this sub is already open');
  await failure(await act(dov,toSol.id,'decline'),403,'Only the sub can answer a request');
  const declined=(await json(await act(sol,toSol.id,'decline'))).conversation;
  assert.equal(declined.state,'declined');
  assert.ok(declined.cooldownUntil,'declining sets a cooldown');
  await failure(await addressed(dov,{body:'Please',targetNickname:'Sol Two'}),409,'Wait 30 days after a declined or closed conversation before asking again');
  await failure(await act(sol,toSol.id,'accept'),409,'The conversation is not waiting for an answer');
  await failure(await writeMessage(dov,toSol.id,'hello'),409,'This conversation is closed');
  await expire(toSol.id);
  const askAgain=(await json(await addressed(dov,{body:'Please',targetNickname:'Sol Two'}))).conversation;
  assert.equal(askAgain.state,'requested','a request works once the decline cooldown has passed');

  // Withdrawing a request is a close without a cooldown: the dom may ask at once.
  const withdrawn=(await json(await addressed(dov,{body:'Changed my mind soon',targetNickname:'Sara One'}))).conversation;
  const closedRequest=(await json(await act(dov,withdrawn.id,'close'))).conversation;
  assert.equal(closedRequest.state,'closed');
  assert.equal(closedRequest.cooldownUntil,null,'withdrawing a request sets no cooldown');
  const reask=(await json(await addressed(dov,{body:'Back again',targetNickname:'Sara One'}))).conversation;
  assert.equal(reask.state,'requested','the dom may ask again at once after withdrawing');

  // Block hides a conversation both ways, stops requests and messages, and unblocking restores it.
  const toCoffee=(await json(await addressed(dana,{body:'Coffee?',targetNickname:'Sol Two'}))).conversation;
  await json(await act(sol,toCoffee.id,'accept'));
  const coffeeMessage=(await json(await writeMessage(dana,toCoffee.id,'Hello Sol'))).message;
  assert.deepEqual(await json(await block(sol,{nickname:'Dana One'})),{blocked:true,userId:dana.id});
  assert.ok(!(await listOf(dana)).some(item=>item.id===toCoffee.id),'the blocked dom no longer sees the conversation');
  assert.ok(!(await listOf(sol)).some(item=>item.id===toCoffee.id),'the blocker no longer sees the conversation');
  await failure(await get(base,`/public/conversations/${toCoffee.id}`,dana.cookie),404,'Conversation unavailable');
  await failure(await get(base,`/public/conversations/${toCoffee.id}`,sol.cookie),404,'Conversation unavailable');
  await failure(await writeMessage(dana,toCoffee.id,'Still there?'),404,'Conversation unavailable');
  await failure(await writeMessage(sol,toCoffee.id,'Still there?'),404,'Conversation unavailable');
  await failure(await addressed(dana,{body:'Again',targetNickname:'Sol Two'}),404,'Recipient unavailable');
  await failure(await report(sol,coffeeMessage.id,'hidden'),404,'Message unavailable');
  assert.equal((await del(base,`/public/room/blocks/${dana.id}`,sol.cookie)).status,200);
  assert.ok((await listOf(sol)).some(item=>item.id===toCoffee.id),'unblocking restores the conversation for the sub');
  assert.ok((await listOf(dana)).some(item=>item.id===toCoffee.id),'unblocking restores the conversation for the dom');

  // Per-user message limit: the opening counts; the twenty-first message in ten minutes is refused, per user.
  const pair=(await json(await addressed(dia,{body:'Opening',targetNickname:'Sam Four'}))).conversation;
  await json(await act(sam,pair.id,'accept'));
  for(let i=1;i<20;i++) await json(await writeMessage(dia,pair.id,`Message ${i}`));
  await failure(await writeMessage(dia,pair.id,'One too many'),429,'Too many messages; try again in ten minutes');
  await json(await writeMessage(sam,pair.id,'The sub still can'));

  console.log('PASS public-conversations: gate, dom request without a room message, sub-only answers, accept, messages with idempotency and limits, polling and SSE agreement, resume, reports, admin removal and audit, close, cooldowns, withdrawal, block both ways, private mode 404');
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
