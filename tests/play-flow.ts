import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp, type Mission, type Session } from '../server/app.ts';
import { quickPresets } from '../src/quick.ts';
import { progressStats, careDue, milestones, quietDays, weeklyRecap, favouriteMood, WISH_COOLDOWN_MS } from '../src/progress.ts';

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
    return async(path:string,body?:unknown,status:number|number[]=200)=>{
      const response=await fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
      const data=await response.json();assert.ok((Array.isArray(status)?status:[status]).includes(response.status),`${path}: expected ${status}, got ${response.status}: ${JSON.stringify(data)}`);return data;
    };
  }
  const w=await account('wife'),h=await account('husband');
  const id=(await w('/sessions',{terms:'Simple invitations, free refusal, pauses always available',minutes:120})).session.id;
  const op=(who:typeof w,name:string,body:Record<string,unknown>={},status=200)=>who(`/sessions/${id}/${name}`,body,status);
  const state=async():Promise<Session>=>(await w(`/sessions/${id}`)).session;
  async function ageWishes(){const row=(await pool.query('SELECT data FROM sessions WHERE id=$1',[id])).rows[0].data as Session;for(const wish of row.herWishes!)wish.createdAt=0;await pool.query('UPDATE sessions SET data=$2 WHERE id=$1',[id,JSON.stringify(row)]);}
  const edit=async(change:(row:Session)=>void)=>{const row=(await pool.query('SELECT data FROM sessions WHERE id=$1',[id])).rows[0].data as Session;change(row);await pool.query('UPDATE sessions SET data=$2 WHERE id=$1',[id,JSON.stringify(row)]);};
  const freshEvening=()=>edit(row=>{for(const m of row.missions)m.createdAt=0;delete row.eveningClosedAt;});

  // Gameplay is locked until both players approve the same revision.
  await op(w,'quick',{preset:quickPresets[0].id,key:randomUUID()},409);
  let s=await state();
  for(const who of [w,h])await op(who,'approve',{revision:s.revision});
  s=await state();
  assert.equal(s.approvals.length,2);

  // Quick commands: wife only, known presets only, keyed retries, schedule bounds.
  const preset=quickPresets[1];
  await op(h,'quick',{preset:preset.id,key:randomUUID()},403);
  await op(w,'quick',{preset:'unknown',key:randomUUID()},404);
  await op(w,'quick',{preset:preset.id},400);
  await op(w,'quick',{key:randomUUID()},400);
  await op(w,'quick',{preset:preset.id,key:randomUUID(),scheduledAt:Date.now()-60000},400);
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

  // Her wishes: spend only her own points; wishes cool down for a day; insufficient balance is rejected.
  await op(h,'herwish',{title:'Hidden',cost:1},403);
  await op(w,'herwish',{title:'An hour free of interruptions',cost:preset.points});
  s=await state();
  const createdWish=s.herWishes!.find(x=>x.title==='An hour free of interruptions')!;
  assert.ok(createdWish.createdAt!>0);
  await op(w,'herwish',{title:'Too expensive',cost:999});
  s=await state();
  const expensive=s.herWishes!.find(x=>x.title==='Too expensive')!;
  assert.equal((await op(w,'herwish-redeem',{wish:expensive.id},409)).error,'Wish is still cooling down');
  assert.equal((await op(w,'herwish-redeem',{wish:createdWish.id},409)).error,'Wish is still cooling down');
  await ageWishes();
  assert.equal((await op(w,'herwish-redeem',{wish:expensive.id},409)).error,'Not enough points');
  await op(w,'herwish-redeem',{wish:createdWish.id});
  s=await state();
  assert.equal(s.herPoints,0);
  assert.ok(!s.herWishes!.some(x=>x.id===createdWish.id));
  assert.ok(s.herWishes!.some(x=>x.id===expensive.id));

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
  await op(w,'rate',{mission:later.mission.id,rating:'love'},409);
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
  assert.equal(WISH_COOLDOWN_MS,86400000);

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
  await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'},409);
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
  await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'},409);
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

  // Terminal sessions still reject new play, including quick commands, ratings, nights and evenings.
  await op(w,'stop',{});
  await op(w,'quick',{preset:preset.id,key:randomUUID()},409);
  await op(w,'rate',{mission:quick.id,rating:'skip'},409);
  await op(w,'her-night',{...nightPayload,key:randomUUID()},409);
  await op(w,'evening-close',{key:randomUUID()},409);
  await op(w,'evening-save',{name:'Late',mood:'soft',steps:[nightStep]},409);
  console.log('PASS play flow: approvals, quick commands, keyed retries, scheduling, review points, wishes with cooldown, private commands, aftercare, her night, quick ratings, private notes, progress helpers, pacing, done for tonight, saved evenings, terminal guard');
} finally {
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  await pool.end();await db.stop();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
