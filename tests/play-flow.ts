process.env.HR_MODE='private';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp, type Mission, type Session } from '../server/app.ts';
import { quickPresets } from '../src/quick.ts';
import { progressStats, careDue, milestones, quietDays, weeklyRecap, favouriteMood } from '../src/progress.ts';

const directory=await mkdtemp(join(tmpdir(),'her-rules-play-flow-'));
const db=await startDatabase(directory,55441),pool=new pg.Pool({connectionString:db.url});
let server:ReturnType<Awaited<ReturnType<typeof createApp>>['listen']>|undefined;
try {
  const app=await createApp(pool,'http://localhost:4195');
  server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server!.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const origin=`http://127.0.0.1:${address.port}`;
  async function account(role:'wife'|'husband') {
    const entry=await fetch(origin+'/api/guest',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({role,adult:true})});
    assert.equal(entry.status,200);
    const cookie=entry.headers.get('set-cookie')!.split(';')[0];
    return async(path:string,body?:unknown,status:number|number[]=200,error?:string)=>{
      const response=await fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
      const data=await response.json();assert.ok((Array.isArray(status)?status:[status]).includes(response.status),`${path}: expected ${status}, got ${response.status}: ${JSON.stringify(data)}`);
      if(error!==undefined)assert.equal(data.error,error,`${path}: expected error '${error}', got ${JSON.stringify(data)}`);
      return data;
    };
  }
  const w=await account('wife'),h=await account('husband');
  const id=(await w('/sessions',{terms:'Simple invitations, free refusal, pauses always available',minutes:120})).session.id;
  const op=(who:typeof w,name:string,body:Record<string,unknown>={},status=200,error?:string)=>who(`/sessions/${id}/${name}`,body,status,error);
  const state=async():Promise<Session>=>(await w(`/sessions/${id}`)).session;
  const edit=async(change:(row:Session)=>void)=>{const row=(await pool.query('SELECT data FROM sessions WHERE id=$1',[id])).rows[0].data as Session;change(row);await pool.query('UPDATE sessions SET data=$2 WHERE id=$1',[id,JSON.stringify(row)]);};
  const freshEvening=()=>edit(row=>{for(const m of row.missions)m.createdAt=0;delete row.eveningClosedAt;});

  // The agreement flow was removed (commit d606a49): approve is a no-op and only pauses gate play.
  let s=await state();
  for(const who of [w,h])await op(who,'approve',{revision:s.revision});
  s=await state();
  assert.equal(s.approvals.length,0);

  // Quick commands: wife only, known presets only, keyed retries, schedule bounds.
  const preset=quickPresets[1];
  await op(h,'quick',{preset:preset.id,key:randomUUID()},403);
  await op(w,'quick',{preset:'unknown',key:randomUUID()},404);
  await op(w,'quick',{key:randomUUID()},400);
  assert.equal((await op(w,'quick',{preset:preset.id,key:randomUUID(),scheduledAt:Date.now()-60000},400)).error,'Schedule must be in the future');
  await op(w,'quick',{preset:preset.id,key:randomUUID(),scheduledAt:Date.now()+366*86400000},400);
  const key=randomUUID();
  const first=await op(w,'quick',{preset:preset.id,key,lang:'en'});
  const retry=await op(w,'quick',{preset:preset.id,key,lang:'en'});
  assert.deepEqual(retry,first);
  s=await state();
  assert.equal(s.missions.filter(m=>m.title===preset.en).length,1);
  const quick=s.missions.find(m=>m.id===first.mission.id)!;
  assert.equal(quick.status,'pending');assert.equal(quick.points,preset.points);assert.equal(quick.text,preset.en);

  // Scheduled quick command waits in the queue and is not delivered early.
  const later=await op(w,'quick',{preset:quickPresets[2].id,key:randomUUID(),lang:'he',scheduledAt:Date.now()+3600000});
  assert.equal(later.mission.status,'queued');assert.equal(later.mission.deliveredAt,undefined);

  // Husband completes the delivered invitation; wife reviews once; the review records approval time and her points.
  await op(h,'ack',{mission:quick.id});
  await op(h,'complete',{mission:quick.id,text:'',expectedVersion:0,key:randomUUID()});
  s=await state();
  const completed=s.missions.find(m=>m.id===quick.id)!;
  assert.equal(completed.status,'submitted');
  await op(w,'review',{mission:quick.id,approve:true,submissionVersion:1,key:randomUUID()});
  s=await state();
  const approved=s.missions.find(m=>m.id===quick.id)!;
  assert.equal(approved.status,'approved');assert.ok(approved.approvedAt&&approved.approvedAt>0);
  assert.equal(s.herPoints,preset.points);
  assert.equal(s.points,preset.points);

  // Wishlist: she adds, only he prices, she requests priced wishes, and he decides with shared points.
  await edit(row=>{row.points=20;});
  await op(h,'wish-add',{title:'Hidden'},403);
  await op(w,'wish-add',{title:'Carpet',description:'Soft and warm',link:'https://example.com/rug'});
  await op(w,'wish-add',{title:'Bad link',link:'javascript:alert(1)'},400);
  await op(w,'wish-add',{title:'A specific book'});
  s=await state();
  const carpet=s.wishes!.find(x=>x.title==='Carpet')!,book=s.wishes!.find(x=>x.title==='A specific book')!;
  assert.equal(carpet.cost,undefined);
  assert.equal((await op(w,'wish-request',{wish:carpet.id},409)).error,'Wish is not priced yet');
  await op(w,'wish-price',{wish:carpet.id,cost:50},403);
  await op(h,'wish-price',{wish:carpet.id,cost:50});
  await op(h,'wish-price',{wish:book.id,cost:5});
  await op(w,'wish-request',{wish:carpet.id});
  s=await state();
  const carpetRequest=s.wishRequests!.find(r=>r.wish===carpet.id)!;
  assert.equal(carpetRequest.status,'pending');
  assert.equal((await op(w,'wish-request',{wish:carpet.id},409)).error,'Wish already requested');
  assert.equal((await op(w,'wish-remove',{wish:carpet.id},409)).error,'Wish has a pending request');
  assert.equal((await op(h,'wish-price',{wish:carpet.id,cost:40},409)).error,'Wish has a pending request');
  assert.equal((await op(h,'wish-decision',{request:carpetRequest.id,approve:true},409)).error,'Insufficient points for wish');
  await op(h,'wish-decision',{request:carpetRequest.id,approve:false});
  s=await state();
  assert.equal(s.wishRequests!.find(r=>r.id===carpetRequest.id)!.status,'declined');
  assert.equal(s.points,20);
  await op(w,'wish-request',{wish:carpet.id});
  await op(w,'wish-request',{wish:book.id});
  s=await state();
  const bookRequest=s.wishRequests!.find(r=>r.wish===book.id)!;
  await op(h,'wish-decision',{request:bookRequest.id,approve:true});
  s=await state();
  assert.equal(s.points,15);
  assert.equal(s.wishRequests!.find(r=>r.id===bookRequest.id)!.status,'approved');

  // Saved commands are visible to her and hidden from him.
  await op(w,'command-save',{title:'Playlist',text:'Send one song each morning',points:1});
  s=await state();
  const saved=s.commands!.find(c=>c.title==='Playlist')!;
  assert.ok(saved);
  const husbandView=(await h(`/sessions/${id}`)).session as Session;
  assert.equal(husbandView.commands,undefined);
  await op(h,'command-save',{title:'Nope',text:'Nope',points:1},403);
  await op(w,'command-delete',{command:saved.id});
  s=await state();
  assert.ok(!s.commands!.some(c=>c.id===saved.id));

  // Aftercare: husband only, and the card turns off after it is sent.
  assert.equal(careDue(s.missions,s.lastCareAt),true);
  await op(w,'aftercare',{},403);
  await op(h,'aftercare',{});
  s=await state();
  assert.equal(careDue(s.missions,s.lastCareAt),false);

  // Her night: wife only, keyed retries return the original night, invalid steps are rejected, steps are queued or delivered by their minute.
  const nightStep={he:'שלב ראשון',en:'First step',points:2,minutesFromNow:0};
  await freshEvening();
  const nightPayload={key:randomUUID(),mood:'playful',lang:'en',steps:[nightStep,{he:'שלב שני',en:'Second step',points:3,minutesFromNow:60}]};
  await op(h,'her-night',nightPayload,403);
  await op(w,'her-night',{...nightPayload,steps:[]},400);
  await op(w,'her-night',{...nightPayload,steps:[{...nightStep,minutesFromNow:10081}]},400);
  await op(w,'her-night',{...nightPayload,steps:[{...nightStep,points:101}]},400);
  await op(w,'her-night',{...nightPayload,steps:[{...nightStep,en:''}]},400);
  await op(w,'her-night',{...nightPayload,steps:[{...nightStep,en:'x'.repeat(161)}]},400);
  await op(w,'her-night',{...nightPayload,steps:[nightStep,nightStep,nightStep,nightStep]},400);
  await op(w,'her-night',{...nightPayload,mood:'angry'},400);
  const night=await op(w,'her-night',nightPayload);
  assert.deepEqual(await op(w,'her-night',nightPayload),night);
  s=await state();
  const storedNight=s.nights!.find(n=>n.id===night.night.id)!;
  assert.equal(s.nights!.filter(n=>n.id===night.night.id).length,1);
  assert.equal(storedNight.mood,'playful');assert.equal(s.moodCounts!.playful,1);
  const nightMissions=storedNight.missionIds.map(missionId=>s.missions.find(m=>m.id===missionId)!);
  assert.deepEqual(nightMissions.map(m=>m.text),['First step','Second step']);
  assert.equal(nightMissions[0].status,'pending');assert.ok(nightMissions[0].deliveredAt);
  assert.equal(nightMissions[1].status,'queued');assert.equal(nightMissions[1].deliveredAt,undefined);
  assert.ok(nightMissions[1].scheduledAt!>Date.now());
  await op(w,'her-night',{key:randomUUID(),mood:'soft',lang:'he',steps:[{...nightStep,minutesFromNow:5}]});
  s=await state();
  assert.equal(s.moodCounts!.soft,1);assert.equal(s.moodCounts!.playful,1);

  // Quick rating: wife only, approved work only, allowed while paused, stored with a time.
  await op(h,'rate',{mission:quick.id,rating:'love'},403);
  await op(w,'rate',{mission:later.mission.id,rating:'love'},409,'Approved mission required');
  await op(w,'rate',{mission:quick.id,rating:'meh'},400);
  await op(w,'pause',{});
  await op(w,'rate',{mission:quick.id,rating:'love'});
  await op(w,'resume',{});
  s=await state();
  const rated=s.missions.find(m=>m.id===quick.id)!;
  assert.equal(rated.rating,'love');assert.ok(rated.ratedAt!>0);

  // Private notes: wife only, hidden from him, deletable.
  await op(h,'note-save',{text:'Private'},403);
  await op(w,'note-save',{text:'   '},400);
  await op(w,'note-save',{text:'x'.repeat(1001)},400);
  const note=(await op(w,'note-save',{text:'  Keep this for me  '})).note;
  assert.equal(note.text,'Keep this for me');
  s=await state();
  assert.ok(s.notes!.some(n=>n.id===note.id));
  assert.equal((await h(`/sessions/${id}`)).session.notes,undefined);
  await op(h,'note-delete',{note:note.id},403);
  await op(w,'note-delete',{note:note.id});
  s=await state();
  assert.ok(!s.notes!.some(n=>n.id===note.id));

  // Pure helpers match the server's data.
  const stats=progressStats(s.missions,Date.now());
  assert.equal(stats.total,1);assert.equal(stats.thisWeek,1);assert.equal(stats.streak,1);
  assert.equal(stats.graceUsed,false);
  assert.equal(stats.ackRate,50);
  const recap=weeklyRecap(s.missions,Date.now());
  assert.deepEqual(recap,{approvedThisWeek:1,topRating:'love',herPointsThisWeek:preset.points});

  // Pure helpers on hand-made inputs.
  const day=86400000,now=Date.parse('2026-11-14T12:00:00');
  const at=(daysAgo:number)=>now-daysAgo*day;
  const done=(daysAgo:number,extra:Partial<Mission>={}):Mission=>({id:randomUUID(),revision:1,title:'t',text:'t',points:1,secret:false,status:'approved',approvedAt:at(daysAgo),...extra});
  assert.equal(progressStats([done(0),done(1),done(2)],now).streak,3);
  assert.equal(progressStats([done(1),done(2)],now).streak,2);
  const bridged=progressStats([done(0),done(1),done(3),done(4)],now);
  assert.equal(bridged.streak,4);assert.equal(bridged.graceUsed,true);
  assert.equal(progressStats([done(0),done(2),done(3),done(5)],now).streak,3);
  assert.equal(progressStats([done(0),done(2),done(3),done(4)],now).streak,4);
  assert.equal(progressStats([done(0),done(3)],now).streak,1);
  assert.equal(progressStats([],now).streak,0);
  assert.deepEqual(milestones(4),[{at:5,reached:false},{at:10,reached:false},{at:25,reached:false}]);
  assert.deepEqual(milestones(10),[{at:5,reached:true},{at:10,reached:true},{at:25,reached:false}]);
  assert.equal(quietDays({last:now-3*day-1000},now),3);assert.equal(quietDays({last:now+5000},now),0);assert.equal(quietDays(undefined,now),0);
  const recapSample=weeklyRecap([
    done(1,{points:2,rating:'love'}),done(3,{points:3,rating:'like'}),done(4,{points:3,rating:'like'}),done(2,{points:1,rating:'skip'}),
    done(10,{points:50,rating:'love'}),{...done(1),status:'pending',approvedAt:undefined,points:9}
  ],now);
  assert.deepEqual(recapSample,{approvedThisWeek:4,topRating:'like',herPointsThisWeek:9});
  assert.deepEqual(weeklyRecap([done(1)],now),{approvedThisWeek:1,topRating:null,herPointsThisWeek:1});
  assert.equal(favouriteMood({soft:0,playful:2,strict:2}),'playful');assert.equal(favouriteMood({soft:1,playful:0,strict:3}),'strict');
  assert.equal(favouriteMood({soft:0,playful:0,strict:0}),null);assert.equal(favouriteMood(undefined),null);

  // Pace: wife only, values 1-3, enforced per night and per evening for quick commands; cancelled commands free a slot.
  await op(h,'pace',{commandsPerEvening:2},403);
  for(const commandsPerEvening of [0,4,'x'])await op(w,'pace',{commandsPerEvening},400);
  await op(w,'pace',{commandsPerEvening:2});
  s=await state();
  assert.equal(s.pace,2);
  assert.equal((await h(`/sessions/${id}`)).session.pace,2);
  await freshEvening();
  const paceOne=await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'});
  assert.ok(paceOne.mission.createdAt>0);
  await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'});
  assert.equal((await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'},409)).error,'Evening limit reached for the current pace');
  await op(w,'cancel',{mission:paceOne.mission.id});
  await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'});
  await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'},409,'Evening limit reached for the current pace');
  assert.equal((await op(w,'her-night',{key:randomUUID(),mood:'soft',lang:'en',steps:[nightStep,nightStep,nightStep]},400)).error,'Too many steps for the current pace');
  await op(w,'pace',{commandsPerEvening:3});
  await freshEvening();
  await op(w,'her-night',{key:randomUUID(),mood:'soft',lang:'en',steps:[nightStep,nightStep,nightStep]});
  assert.equal((await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'},409)).error,'Evening limit reached for the current pace');
  assert.equal((await op(w,'her-night',{key:randomUUID(),mood:'soft',lang:'en',steps:[nightStep]},409)).error,'Evening limit reached for the current pace');
  await freshEvening();
  await op(w,'pace',{commandsPerEvening:1});
  await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'});
  assert.equal((await op(w,'her-night',{key:randomUUID(),mood:'soft',lang:'en',steps:[nightStep]},409)).error,'Evening limit reached for the current pace');
  assert.equal((await op(w,'her-night',{key:randomUUID(),mood:'soft',lang:'en',steps:[nightStep,nightStep]},400)).error,'Too many steps for the current pace');
  await freshEvening();
  await op(w,'pace',{commandsPerEvening:3});

  // Done for tonight: wife only, keyed, cancels queued commands, blocks new ones until the evening reopens after 12 hours.
  await freshEvening();
  await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en',scheduledAt:Date.now()+3600000});
  await op(w,'her-night',{key:randomUUID(),mood:'soft',lang:'en',steps:[{...nightStep,minutesFromNow:120}]});
  s=await state();
  const queuedIds=s.missions.filter(m=>m.status==='queued').map(m=>m.id);
  assert.ok(queuedIds.length>=3);
  const closeKey=randomUUID();
  await op(h,'evening-close',{key:randomUUID()},403);
  const closed=await op(w,'evening-close',{key:closeKey});
  assert.deepEqual(closed,{closed:queuedIds.length});
  assert.deepEqual(await op(w,'evening-close',{key:closeKey}),closed);
  s=await state();
  assert.ok(queuedIds.every(missionId=>s.missions.find(m=>m.id===missionId)!.status==='cancelled'));
  assert.ok(s.eveningClosedAt!>0);
  assert.ok(s.history.some(item=>item.event==='evening-close'));
  assert.equal((await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'},409)).error,'Evening is closed');
  assert.equal((await op(w,'her-night',{key:randomUUID(),mood:'soft',lang:'en',steps:[nightStep]},409)).error,'Evening is closed');
  await edit(row=>{for(const m of row.missions)m.createdAt=0;row.eveningClosedAt=Date.now()-11*3600000;});
  await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'},409,'Evening is closed');
  await edit(row=>{row.eveningClosedAt=Date.now()-13*3600000;});
  assert.equal((await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'})).mission.status,'pending');

  // Saved evenings: wife only, validated, capped at 20, hidden from him, run through the same night rules.
  await op(h,'evening-save',{name:'Slow Sunday',mood:'soft',steps:[nightStep]},403);
  await op(w,'evening-save',{name:'   ',mood:'soft',steps:[nightStep]},400);
  await op(w,'evening-save',{name:'x'.repeat(81),mood:'soft',steps:[nightStep]},400);
  await op(w,'evening-save',{name:'Angry',mood:'angry',steps:[nightStep]},400);
  await op(w,'evening-save',{name:'Empty',mood:'soft',steps:[]},400);
  await op(w,'evening-save',{name:'Long',mood:'soft',steps:[nightStep,nightStep,nightStep,nightStep]},400);
  await op(w,'evening-save',{name:'Long step',mood:'soft',steps:[{...nightStep,en:'x'.repeat(161)}]},400);
  const twoStep=(await op(w,'evening-save',{name:'Two steps',mood:'playful',steps:[nightStep,{...nightStep,minutesFromNow:60}]})).evening;
  const slow=(await op(w,'evening-save',{name:'Slow Sunday',mood:'soft',steps:[nightStep]})).evening;
  for(let i=2;i<20;i++)await op(w,'evening-save',{name:`Evening ${i}`,mood:'strict',steps:[nightStep]});
  s=await state();
  assert.equal(s.savedEvenings!.length,20);
  assert.equal((await h(`/sessions/${id}`)).session.savedEvenings,undefined);
  assert.equal((await op(w,'evening-save',{name:'Overflow',mood:'soft',steps:[nightStep]},409)).error,'Saved evenings list is full');
  await op(h,'evening-run',{key:randomUUID(),evening:slow.id},403);
  await op(w,'evening-run',{key:randomUUID(),evening:randomUUID()},404);
  const runKey=randomUUID();
  const ran=await op(w,'evening-run',{key:runKey,evening:slow.id,lang:'en'});
  assert.deepEqual(await op(w,'evening-run',{key:runKey,evening:slow.id,lang:'en'}),ran);
  s=await state();
  const storedRun=s.nights!.find(n=>n.id===ran.night.id)!;
  assert.equal(s.nights!.filter(n=>n.id===ran.night.id).length,1);
  assert.equal(storedRun.mood,'soft');
  assert.equal(s.missions.find(m=>m.id===storedRun.missionIds[0])!.text,'First step');
  await op(w,'pace',{commandsPerEvening:1});
  assert.equal((await op(w,'evening-run',{key:randomUUID(),evening:twoStep.id,lang:'en'},400)).error,'Too many steps for the current pace');
  await freshEvening();
  await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'});
  assert.equal((await op(w,'evening-run',{key:randomUUID(),evening:slow.id,lang:'en'},409)).error,'Evening limit reached for the current pace');
  await freshEvening();
  await op(w,'pace',{commandsPerEvening:3});
  await op(w,'evening-close',{key:randomUUID()});
  assert.equal((await op(w,'evening-run',{key:randomUUID(),evening:slow.id,lang:'en'},409)).error,'Evening is closed');
  await edit(row=>{row.eveningClosedAt=Date.now()-13*3600000;});
  await op(h,'evening-delete',{evening:slow.id},403);
  await op(w,'evening-delete',{evening:slow.id});
  s=await state();
  assert.ok(!s.savedEvenings!.some(e=>e.id===slow.id));
  assert.ok(s.savedEvenings!.some(e=>e.id===twoStep.id));
  assert.equal((await op(w,'evening-run',{key:randomUUID(),evening:slow.id,lang:'en'},404)).error,'Evening unavailable');

  // Night cap: the list holds 50 nights; the 50th is accepted, and the 51st is refused by the list check (evening open, pace and steps fine).
  await freshEvening();
  await op(w,'pace',{commandsPerEvening:3});
  await edit(row=>{row.nights=Array.from({length:49},(_,i)=>({id:randomUUID(),mood:'soft' as const,at:Date.now()-i,missionIds:[]}));});
  await op(w,'her-night',{key:randomUUID(),mood:'strict',lang:'en',steps:[nightStep]});
  s=await state();
  assert.equal(s.nights!.length,50);
  await freshEvening();
  await op(w,'her-night',{key:randomUUID(),mood:'strict',lang:'en',steps:[nightStep]},409,'Night list is full');
  await op(w,'evening-run',{key:randomUUID(),evening:twoStep.id,lang:'en'},409,'Night list is full');
  s=await state();
  assert.equal(s.nights!.length,50);

  // Saved-evening edits and pace changes stay private: none of them reach his history or inbox, while shared evening runs do.
  const hisView=(await h(`/sessions/${id}`)).session as Session;
  const privateEvents=['evening-save','evening-delete','pace'];
  assert.deepEqual(hisView.history.filter(item=>privateEvents.includes(item.event)),[]);
  assert.deepEqual(hisView.inbox.filter(item=>privateEvents.includes(item.event)),[]);
  assert.ok(hisView.history.some(item=>item.event==='evening-run'));
  assert.ok(hisView.inbox.some(item=>item.event==='evening-run'));

  // Devotions: husband gives, she reveals, sips (+2 Glow), grants once (+3) and seals.
  await op(w,'tribute-queue',{kind:'note',text:'x',key:randomUUID()},403);
  await op(h,'tribute-queue',{kind:'note',text:'For you alone'},400);
  const tributeKey=randomUUID();
  const sent=await op(h,'tribute-queue',{kind:'note',text:'For you alone',key:tributeKey});
  assert.ok(sent.tributeId);
  assert.deepEqual(await op(h,'tribute-queue',{kind:'note',text:'For you alone',key:tributeKey}),sent);
  await op(h,'tribute-reveal',{key:randomUUID()},403);
  await op(h,'sip',{key:randomUUID()},403);
  s=await state();
  assert.equal(s.adoration?.waiting,1);
  assert.equal(s.adoration?.ready,0);
  const glow0=s.herPoints??0;
  const revealKey=randomUUID();
  const revealed=await op(w,'tribute-reveal',{key:revealKey});
  assert.equal(revealed.tribute.text,'For you alone');
  assert.deepEqual(await op(w,'tribute-reveal',{key:revealKey}),revealed);
  await op(w,'tribute-reveal',{key:randomUUID()},404,'No devotion is waiting for you');
  s=await state();
  assert.equal(s.adoration?.last?.text,'For you alone');
  assert.equal(s.adoration?.waiting,0);
  assert.equal(s.adoration?.ready,1);
  await op(w,'sip',{key:randomUUID()});
  s=await state();
  assert.equal(s.herPoints,glow0+2);
  assert.equal(s.adoration?.ready,0);
  await op(w,'sip',{key:randomUUID()},404,'No adoration to sip yet');
  await op(w,'grant',{key:randomUUID()});
  s=await state();
  assert.equal(s.herPoints,glow0+5);
  await op(w,'grant',{key:randomUUID()},409,'This earned moment was already granted');
  await op(w,'seal',{key:randomUUID()});
  s=await state();
  assert.ok(s.adoration?.sealedAt!>0);
  const hisDevotion=(await h(`/sessions/${id}`)).session as Session;
  assert.equal(hisDevotion.adoration,undefined);
  assert.equal(hisDevotion.chapterState,undefined);

  // Chapters: composed as queued chapter missions with English copy, exempt from closing the evening.
  const decreeKey=randomUUID();
  const decree=await op(w,'chamberlain-decree',{mood:'rest',key:decreeKey});
  assert.ok(decree.missionIds.length>0);
  assert.deepEqual(await op(w,'chamberlain-decree',{mood:'rest',key:decreeKey}),decree);
  s=await state();
  const chapters=s.missions.filter(m=>m.chapter);
  assert.equal(chapters.length,decree.missionIds.length);
  assert.ok(chapters.every(m=>m.status==='queued'&&!!m.titleEn&&!!m.textEn));
  const queuedChapters=chapters.filter(m=>m.status==='queued').length;
  await op(w,'evening-close',{key:randomUUID()});
  s=await state();
  assert.equal(s.missions.filter(m=>m.chapter&&m.status==='queued').length,queuedChapters);

  // Queen level is a wife-only derived view: approved missions only, never stored, never sent to him.
  const queenWife=await w('/state'),queenHusband=await h('/state');
  s=await state();
  assert.equal(queenWife.queenLevel.progress,s.missions.filter(m=>m.status==='approved').length);
  assert.equal(queenWife.queenLevel.level,queenWife.queenLevel.progress>=25?'empress':queenWife.queenLevel.progress>=10?'queen':'duchess');
  assert.equal(queenHusband.queenLevel,undefined);
  assert.ok(!JSON.stringify(queenHusband).includes('queenLevel'));

  // Weekly digest: derived on every state read; his copy never carries wife-only fields or withheld counts.
  const digestWife=(await w('/state')).digest,digestHusband=(await h('/state')).digest;
  assert.equal(digestWife.days,7);assert.ok(digestWife.suggestion);
  for(const field of ['scheduled','topRated','suggestion'])assert.equal(field in digestHusband,false,`husband digest must not carry ${field}`);
  assert.equal(digestHusband.approved,digestWife.approved);
  assert.equal(digestHusband.husbandPoints,digestWife.husbandPoints);
  assert.equal(JSON.stringify(digestHusband).includes(preset.en),false,'the husband digest carries counts, never mission titles');

  // Recurring missions: one queued successor per chain, no duplicates, pacing preserved, stop is wife-only.
  const daily=await op(w,'mission',{title:'Morning note',text:'Leave one kind note',points:1,key:randomUUID()});
  await op(w,'queue',{mission:daily.mission.id,repeat:'daily'},400);
  await op(w,'queue',{mission:daily.mission.id,scheduledAt:Date.now()+3600000,repeat:'hourly'},400);
  await op(w,'queue',{mission:daily.mission.id,scheduledAt:Date.now()+3600000,repeat:'daily'});
  await edit(row=>{const m=row.missions.find(x=>x.id===daily.mission.id)!;m.scheduledAt=Date.now()-1000;});
  s=await state();
  const dailyFirst=s.missions.find(m=>m.id===daily.mission.id)!;
  assert.equal(dailyFirst.status,'pending','the due occurrence is delivered on read');
  const dailyChain=s.missions.filter(m=>(m.repeatOf??m.id)===daily.mission.id);
  assert.equal(dailyChain.length,2,'exactly one successor exists');
  const dailyNext=dailyChain.find(m=>m.id!==daily.mission.id)!;
  assert.equal(dailyNext.status,'queued');assert.equal(dailyNext.repeat,'daily');assert.equal(dailyNext.repeatOf,daily.mission.id);
  assert.ok(dailyNext.scheduledAt!>Date.now(),'the successor is scheduled forward, never backfilled');
  s=await state();
  assert.equal(s.missions.filter(m=>(m.repeatOf??m.id)===daily.mission.id).length,2,'repeated reads never duplicate the successor');

  // Sending a repeating occurrence by hand keeps the series going.
  const manual=await op(w,'mission',{title:'Manual repeat',text:'Send this one by hand',points:1,key:randomUUID()});
  await op(w,'queue',{mission:manual.mission.id,scheduledAt:Date.now()+3600000,repeat:'daily'});
  await op(w,'deliver',{mission:manual.mission.id});
  s=await state();
  assert.equal(s.missions.filter(m=>(m.repeatOf??m.id)===manual.mission.id).length,2,'manual delivery queues the next occurrence');

  // Cancelling a single queued occurrence keeps the chain alive.
  const weeklyOne=await op(w,'mission',{title:'Weekly habit',text:'A weekly check-in',points:1,key:randomUUID()});
  await op(w,'queue',{mission:weeklyOne.mission.id,scheduledAt:Date.now()+3600000,repeat:'weekly'});
  await op(w,'cancel',{mission:weeklyOne.mission.id});
  s=await state();
  const weeklyChain=s.missions.filter(m=>(m.repeatOf??m.id)===weeklyOne.mission.id);
  assert.equal(weeklyChain.filter(m=>m.status==='queued').length,1,'the series continues after one cancellation');
  assert.equal(weeklyChain.find(m=>m.status==='queued')!.repeat,'weekly');

  // An undelivered secret occurrence and its queued successor stay hidden from him.
  const secretRepeat=await op(w,'mission',{title:'Secret repeat',text:'Hidden repeat text',secret:true,points:1,key:randomUUID()});
  await op(w,'queue',{mission:secretRepeat.mission.id,scheduledAt:Date.now()+3600000,repeat:'daily'});
  const hisSecretView=(await h(`/sessions/${id}`)).session as Session;
  assert.equal(hisSecretView.missions.some(m=>m.id===secretRepeat.mission.id),false,'an undelivered secret occurrence is withheld');
  await edit(row=>{const m=row.missions.find(x=>x.id===secretRepeat.mission.id)!;m.scheduledAt=Date.now()-1000;});
  const hisDelivered=(await h(`/sessions/${id}`)).session as Session;
  assert.equal(hisDelivered.missions.some(m=>m.id===secretRepeat.mission.id),true,'the delivered occurrence becomes visible');
  assert.equal(hisDelivered.missions.filter(m=>m.repeatOf===secretRepeat.mission.id).length,0,'its queued secret successor stays hidden');

  // Adoration is his private, optional signal on approved work: no points, never her rating, wife-only tally.
  const pointsBefore=(await state()).points;
  const ratingBefore=(await state()).missions.find(m=>m.id===quick.id)!.rating;
  await op(w,'adore',{mission:quick.id,adoration:'loved',key:randomUUID()},403);
  await op(h,'adore',{mission:quick.id,adoration:'gold',key:randomUUID()},400);
  await op(h,'adore',{mission:manual.mission.id,adoration:'loved'},409,'Approved mission required');
  const adoreKey=randomUUID();
  const adored=await op(h,'adore',{mission:quick.id,adoration:'loved',key:adoreKey});
  assert.deepEqual(await op(h,'adore',{mission:quick.id,adoration:'loved',key:adoreKey}),adored,'a committed retry returns the original result');
  s=await state();
  const adoredMission=s.missions.find(m=>m.id===quick.id)!;
  assert.equal(adoredMission.adoration,'loved');assert.ok(adoredMission.adoredAt!>0);
  assert.equal(adoredMission.rating,ratingBefore,'his adoration never touches her rating');
  assert.equal(s.points,pointsBefore,'adoration awards no points');
  await op(h,'adore',{mission:quick.id,adoration:'liked'});
  s=await state();
  assert.equal(s.missions.find(m=>m.id===quick.id)!.adoration,'liked','he can overwrite his own signal');
  const adorationWife=await w('/state'),adorationHusband=await h('/state');
  assert.deepEqual(adorationWife.adorationTally,{loved:0,liked:1,ok:0});
  assert.equal(adorationHusband.adorationTally,undefined,'the tally is wife-only');
  assert.equal(JSON.stringify(adorationHusband).includes('adorationTally'),false);

  // Stopping a series is wife-only, keyed, and allowed while paused.
  await op(h,'repeat-stop',{mission:daily.mission.id},403);
  await op(w,'pause',{});
  const stopKey=randomUUID();
  const stopped=await op(w,'repeat-stop',{mission:daily.mission.id,key:stopKey});
  assert.deepEqual(await op(w,'repeat-stop',{mission:daily.mission.id,key:stopKey}),stopped,'stopping is idempotent');
  s=await state();
  assert.equal(s.missions.find(m=>m.id===daily.mission.id)!.repeatStopped,true);
  assert.equal(s.missions.filter(m=>(m.repeatOf??m.id)===daily.mission.id&&m.status==='queued').length,0,'queued successors are cancelled');
  await op(w,'resume',{});

  // Whisper box: his short lines are stored for her eyes only; the husband never receives the text.
  await op(w,'whisper',{text:'Not yours to write',key:randomUUID()},403);
  await op(h,'whisper',{text:'',key:randomUUID()},400);
  await op(h,'whisper',{text:'x'.repeat(401),key:randomUUID()},400);
  const whisperKey=randomUUID();
  const whisper=await op(h,'whisper',{text:'You looked beautiful at breakfast',key:whisperKey});
  assert.equal(whisper.whisperSent,1);
  assert.deepEqual(await op(h,'whisper',{text:'You looked beautiful at breakfast',key:whisperKey}),whisper,'a committed whisper retry returns the original result');
  s=await state();
  assert.equal(s.whispers?.length,1);assert.equal(s.whispers![0].text,'You looked beautiful at breakfast');
  const hisWhispers=(await h(`/sessions/${id}`)).session as Session;
  assert.equal(hisWhispers.whispers,undefined,'the wife keeps the whisper list');
  assert.equal(hisWhispers.whisperSent,1,'he only gets a count');
  assert.equal(JSON.stringify(hisWhispers).includes('beautiful at breakfast'),false,'whisper text never reaches him');
  assert.equal(JSON.stringify((await h('/state'))).includes('beautiful at breakfast'),false,'no whisper text in his state');
  await op(h,'whisper-delete',{whisper:s.whispers![0].id},403);
  await op(w,'whisper-delete',{whisper:s.whispers![0].id,key:randomUUID()});
  s=await state();
  assert.equal(s.whispers?.length,0,'she can delete a whisper');

  // The cap is 20 stored whispers.
  for(let i=0;i<20;i++)await op(h,'whisper',{text:`Line ${i}`,key:randomUUID()});
  await op(h,'whisper',{text:'One too many',key:randomUUID()},409,'Whisper list is full');

  // Daily spark: wife-only, one idea per UTC day, a reroll cap of ten and thirty dismissals.
  const husbandSparkState=await h('/state');
  assert.equal(husbandSparkState.spark,undefined,'the husband never receives a spark');
  assert.equal(JSON.stringify(husbandSparkState).includes('"spark"'),false,'no spark key in his state');
  const wifeSpark=await w('/state');
  assert.ok(wifeSpark.spark,'the wife has a daily spark');
  assert.equal(wifeSpark.spark.day,Math.floor(Date.now()/86400000));
  assert.deepEqual((await w('/state')).spark.idea.id,wifeSpark.spark.idea.id,'the same day keeps the same spark');
  assert.equal(wifeSpark.spark.rerolls,0);
  await op(h,'spark-reroll',{key:randomUUID()},403);
  await op(h,'spark-dismiss',{idea:wifeSpark.spark.idea.id,key:randomUUID()},403);
  // A spark is a planning aid, so it keeps working during either personal pause.
  await op(w,'pause',{});
  const rerollKey=randomUUID();
  const rerolled=await op(w,'spark-reroll',{key:rerollKey});
  assert.equal(rerolled.rerolls,1);
  assert.deepEqual(await op(w,'spark-reroll',{key:rerollKey}),rerolled,'a committed reroll retry returns the original result');
  const afterReroll=await w('/state');
  assert.equal(afterReroll.spark.rerolls,1);
  assert.notEqual(afterReroll.spark.idea.id,wifeSpark.spark.idea.id,'a reroll advances the spark');
  await op(w,'resume',{});
  const dismissedIdea=afterReroll.spark.idea.id,dismissKey=randomUUID();
  const dismissed=await op(w,'spark-dismiss',{idea:dismissedIdea,key:dismissKey});
  assert.equal(dismissed.dismissed,1);
  assert.deepEqual(await op(w,'spark-dismiss',{idea:dismissedIdea,key:dismissKey}),dismissed,'a committed dismissal retry returns the original result');
  await op(w,'spark-dismiss',{idea:dismissedIdea,key:randomUUID()});
  const afterDismiss=await w('/state');
  assert.equal(afterDismiss.spark.idea.id===dismissedIdea,false,'a dismissed idea is never offered again');
  assert.equal(afterDismiss.spark.rerolls,1);
  for(let i=0;i<9;i++)await op(w,'spark-reroll',{key:randomUUID()});
  await op(w,'spark-reroll',{key:randomUUID()},409,'Daily spark reroll limit reached');
  for(let i=0;i<29;i++)await op(w,'spark-dismiss',{idea:`spark-fake-${i}`,key:randomUUID()});
  await op(w,'spark-dismiss',{idea:'spark-one-too-many',key:randomUUID()},409,'Spark dismiss list is full');

  // Season packs: wife-only fixed packs, one task a day, her plan hidden from him until delivery.
  await op(h,'season-start',{pack:'worship-week',key:randomUUID()},403);
  await op(w,'season-start',{pack:'nope',key:randomUUID()},404,'Season unavailable');
  await op(w,'season-start',{pack:'worship-week',startsAt:Date.now()-1000,key:randomUUID()},400,'Schedule must be in the future');
  await op(w,'pause',{});
  await op(w,'season-start',{pack:'hanukkah',key:randomUUID()},409,'Pause is active');
  await op(w,'resume',{});
  const seasonKey=randomUUID();
  const season=await op(w,'season-start',{pack:'service-weekend',lang:'he',key:seasonKey});
  assert.equal(season.season.id,'service-weekend');assert.equal(season.season.days,2);
  assert.deepEqual(await op(w,'season-start',{pack:'service-weekend',lang:'he',key:seasonKey}),season,'a committed season retry returns the original result');
  await op(w,'season-start',{pack:'hanukkah',key:randomUUID()},409,'A season is already running');
  s=await state();
  const seasonMissions=s.missions.filter(m=>m.season?.id==='service-weekend');
  assert.equal(seasonMissions.length,2);assert.ok(seasonMissions.every(m=>m.status==='queued'));
  assert.deepEqual(s.seasonProgress,{id:'service-weekend',done:0,total:2,running:true});
  const hisSeason=(await h(`/sessions/${id}`)).session as Session;
  assert.equal(hisSeason.missions.some(m=>m.season),false,'undelivered season tasks are withheld from him');
  assert.equal(JSON.stringify(hisSeason).includes('מטבח'),false,'season copy never reaches him before delivery');
  // Simulate the pack having started: move its window and the first occurrence into the past.
  await edit(row=>{const m=row.missions.find(x=>x.season?.id==='service-weekend'&&x.season.day===1)!;row.seasonState!.startsAt=Date.now()-2*86400000;m.scheduledAt=Date.now()-86400000;});
  s=await state();
  assert.equal(s.missions.find(m=>m.season?.id==='service-weekend'&&m.season.day===1)!.status,'pending');
  const hisDeliveredSeason=(await h(`/sessions/${id}`)).session as Session;
  assert.ok(hisDeliveredSeason.missions.some(m=>m.season?.id==='service-weekend'&&m.season.day===1),'a delivered season task is visible to him');
  assert.equal(hisDeliveredSeason.missions.some(m=>m.season?.id==='service-weekend'&&m.season.day===2),false,'the next season task stays hidden');
  s=await state();
  assert.deepEqual(s.seasonProgress,{id:'service-weekend',done:1,total:2,running:true});
  await op(h,'season-stop',{key:randomUUID()},403);
  await op(w,'season-stop',{pack:'hanukkah',key:randomUUID()},404,'Season unavailable');
  const stopSeasonKey=randomUUID();
  const stoppedSeason=await op(w,'season-stop',{pack:'service-weekend',key:stopSeasonKey});
  assert.equal(stoppedSeason.cancelled,1);
  assert.deepEqual(await op(w,'season-stop',{pack:'service-weekend',key:stopSeasonKey}),stoppedSeason,'a committed stop retry returns the original result');
  s=await state();
  assert.equal(s.seasonProgress?.running,false);
  assert.equal(s.missions.filter(m=>m.season&&m.status==='queued').length,0);
  await op(w,'season-stop',{key:randomUUID()},409,'No season is running');

  // Trophy case: wife-only curation, per-viewer resolution and hidden-content placeholders.
  await op(h,'pin',{kind:'mission',ref:quick.id,key:randomUUID()},403);
  await op(h,'unpin',{pin:randomUUID(),key:randomUUID()},403);
  const trophyMission=await op(w,'mission',{title:'Trophy work',text:'A completed task worth keeping',points:1,completionStyle:'written',key:randomUUID()});
  await op(w,'deliver',{mission:trophyMission.mission.id});
  await op(h,'ack',{mission:trophyMission.mission.id});
  await op(h,'complete',{mission:trophyMission.mission.id,text:'I did it carefully',expectedVersion:0,key:randomUUID()});
  await op(w,'review',{mission:trophyMission.mission.id,approve:true,submissionVersion:1,key:randomUUID()});
  await op(w,'reflection',{appreciation:'A good evening'});
  const wifeId=(await w('/state')).user.id;
  await op(w,'pin',{kind:'mission',ref:'not-a-uuid',key:randomUUID()},400);
  await op(w,'pin',{kind:'mission',ref:randomUUID(),key:randomUUID()},404,'Pin target unavailable');
  await op(w,'pin',{kind:'reflection',ref:randomUUID(),key:randomUUID()},404,'Pin target unavailable');
  const emptyMission=await op(w,'mission',{title:'No report yet',text:'Waiting for a report',points:1,completionStyle:'written',key:randomUUID()});
  await op(w,'pin',{kind:'completion',ref:emptyMission.mission.id,key:randomUUID()},409,'Completion required');
  const pinKey=randomUUID();
  const pinnedMission=await op(w,'pin',{kind:'mission',ref:trophyMission.mission.id,key:pinKey});
  assert.equal(pinnedMission.pin.kind,'mission');
  assert.deepEqual(await op(w,'pin',{kind:'mission',ref:trophyMission.mission.id,key:pinKey}),pinnedMission,'a committed pin retry returns the original result');
  await op(w,'pin',{kind:'mission',ref:trophyMission.mission.id,key:randomUUID()},409,'Already pinned');
  const pinnedCompletion=await op(w,'pin',{kind:'completion',ref:trophyMission.mission.id,key:randomUUID()});
  const pinnedReflection=await op(w,'pin',{kind:'reflection',ref:wifeId,key:randomUUID()});
  assert.ok(pinnedCompletion.pin.id&&pinnedReflection.pin.id);
  s=await state();
  const trophyTitles=s.trophies?.map(entry=>entry.title).filter(Boolean);
  assert.ok(trophyTitles?.includes('Trophy work'),'the wife sees the pinned mission');
  assert.ok(s.trophies?.some(entry=>entry.kind==='completion'&&entry.text==='I did it carefully'));
  assert.ok(s.trophies?.some(entry=>entry.kind==='reflection'&&entry.author==='wife'&&entry.text==='A good evening'));
  // A secret draft pinned by her is a content-free placeholder for him.
  const hiddenPin=await op(w,'mission',{title:'Hidden trophy',text:'A private trophy text',secret:true,key:randomUUID()});
  await op(w,'pin',{kind:'mission',ref:hiddenPin.mission.id,key:randomUUID()});
  const hisTrophies=(await h(`/sessions/${id}`)).session as Session;
  const hiddenEntry=hisTrophies.trophies?.find(entry=>entry.hidden);
  assert.ok(hiddenEntry,'the withheld mission is a placeholder');
  assert.deepEqual(Object.keys(hiddenEntry!).sort(),['at','hidden','kind']);
  assert.equal(JSON.stringify(hisTrophies.trophies).includes('A private trophy text'),false,'hidden trophy text never reaches him');
  assert.equal(JSON.stringify(hisTrophies.trophies).includes('Hidden trophy'),false,'hidden trophy title never reaches him');
  assert.equal(hisTrophies.pins?.some(pin=>'ref' in pin),false,'the husband pins carry no references');
  assert.ok(hisTrophies.trophies?.some(entry=>entry.kind==='completion'&&entry.text==='I did it carefully'),'visible trophies resolve for him');
  const unpinKey=randomUUID();
  const unpinned=await op(w,'unpin',{pin:pinnedReflection.pin.id,key:unpinKey});
  assert.deepEqual(await op(w,'unpin',{pin:pinnedReflection.pin.id,key:unpinKey}),unpinned,'a committed unpin retry returns the original result');
  await op(w,'unpin',{pin:pinnedReflection.pin.id,key:randomUUID()},404,'Pin unavailable');
  s=await state();
  assert.equal(s.trophies?.some(entry=>entry.kind==='reflection'),false,'the removed reflection leaves the gallery');

  // The case holds thirty pins.
  await edit(row=>{row.pins=[...(row.pins??[]),...Array.from({length:27},()=>({id:randomUUID(),kind:'mission' as const,ref:randomUUID(),at:Date.now()}))];});
  s=await state();
  assert.equal(s.pins?.length,30);
  await op(w,'pin',{kind:'mission',ref:emptyMission.mission.id,key:randomUUID()},409,'Trophy case is full');
  const fillerPin=s.pins![0].id;
  await op(w,'unpin',{pin:fillerPin,key:randomUUID()});
  const pinnedAfterRoom=await op(w,'pin',{kind:'mission',ref:emptyMission.mission.id,key:randomUUID()});
  assert.ok(pinnedAfterRoom.pin.id);
  // Leave one free slot so the post-stop curation check can add a pin.
  await op(w,'unpin',{pin:(await state()).pins![0].id,key:randomUUID()});

  // Terminal sessions still reject new play, including quick commands, ratings, nights and evenings.
  await op(w,'stop',{});
  await op(w,'quick',{preset:preset.id,key:randomUUID()},409,'Session is terminal');
  await op(w,'rate',{mission:quick.id,rating:'skip'},409,'Session is terminal');
  await op(w,'her-night',{...nightPayload,key:randomUUID()},409,'Session is terminal');
  await op(w,'evening-close',{key:randomUUID()},409,'Session is terminal');
  await op(w,'evening-save',{name:'Late',mood:'soft',steps:[nightStep]},409,'Session is terminal');
  await op(w,'repeat-stop',{mission:daily.mission.id,key:randomUUID()},409,'Session is terminal');
  await op(h,'whisper',{text:'Too late',key:randomUUID()},409,'Session is terminal');
  await op(w,'spark-reroll',{key:randomUUID()},409,'Session is terminal');
  await op(w,'season-start',{pack:'hanukkah',key:randomUUID()},409,'Session is terminal');
  // Curation stays open on an ended session so the archive can be arranged after play stops.
  const latePin=await op(w,'pin',{kind:'mission',ref:quick.id,key:randomUUID()});
  assert.ok(latePin.pin.id);
  await op(w,'unpin',{pin:latePin.pin.id,key:randomUUID()});
  await op(h,'pin',{kind:'mission',ref:quick.id,key:randomUUID()},403);
  console.log('PASS play flow: approvals, quick commands, keyed retries, scheduling, review points, wishlist pricing and approval, private commands, aftercare, her night, quick ratings, private notes, progress helpers, pacing, done for tonight, saved evenings, night cap, devotions, chapters, recurring missions, adoration, whispers, daily spark, season packs, trophy case, terminal guard');
} finally {
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  await pool.end();await db.stop();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
