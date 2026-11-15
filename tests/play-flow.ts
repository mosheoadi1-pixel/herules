import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp, type Mission, type Session } from '../server/app.ts';
import { quickPresets } from '../src/quick.ts';
import { library } from '../src/library.ts';
import { pickSpark, sparkDay } from '../src/spark.ts';
import { whisperDraft } from '../src/whisper.ts';
import { seasonItemFor, seasonPacks } from '../src/seasons.ts';
import { progressStats, careDue, milestones, quietDays, weeklyRecap, favouriteMood, devotionStreak, missionStreak, WISH_COOLDOWN_MS } from '../src/progress.ts';

const directory=await mkdtemp(join(tmpdir(),'her-rules-play-flow-'));
const db=await startDatabase(directory,55441),pool=new pg.Pool({connectionString:db.url});
let server:ReturnType<Awaited<ReturnType<typeof createApp>>['listen']>|undefined;
let sparkClockOffset=0;
try {
  const app=await createApp(pool,'http://localhost:4195',{clock:()=>Date.now()+sparkClockOffset});
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
  async function ageWishes(){const row=(await pool.query('SELECT data FROM sessions WHERE id=$1',[id])).rows[0].data as Session;for(const wish of row.herWishes!)wish.createdAt=0;await pool.query('UPDATE sessions SET data=$2 WHERE id=$1',[id,JSON.stringify(row)]);}
  const edit=async(change:(row:Session)=>void)=>{const row=(await pool.query('SELECT data FROM sessions WHERE id=$1',[id])).rows[0].data as Session;change(row);await pool.query('UPDATE sessions SET data=$2 WHERE id=$1',[id,JSON.stringify(row)]);};
  const freshEvening=()=>edit(row=>{for(const m of row.missions)m.createdAt=0;delete row.eveningClosedAt;});

  // Gameplay is locked until both players approve the same revision.
  await op(w,'quick',{preset:quickPresets[0].id,key:randomUUID()},409,'Mutual approval and no pauses required');
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
  await op(w,'rate',{mission:later.mission.id,rating:'love'},409,'Approved mission required');
  await op(w,'rate',{mission:quick.id,rating:'meh'},400);
  await op(w,'pause',{});
  await op(w,'rate',{mission:quick.id,rating:'love'});
  await op(w,'resume',{});
  s=await state();
  const rated=s.missions.find(m=>m.id===quick.id)!;
  assert.equal(rated.rating,'love');assert.ok(rated.ratedAt!>0);

  // Adoration: husband-only feedback on approved work he completed. It is not points, never changes the wife's rating, and feeds only the derived queen score.
  const queenRow=async(who:typeof w)=>(await who('/state')).sessions.find((x:any)=>x.id===id);
  await op(w,'adore',{mission:quick.id,adoration:'loved',key:randomUUID()},403,'Wrong role for action');
  await op(h,'adore',{mission:quick.id,adoration:'loved'},400);
  await op(h,'adore',{mission:quick.id,adoration:'meh',key:randomUUID()},400);
  await op(h,'adore',{mission:nightMissions[0].id,adoration:'loved',key:randomUUID()},409,'Approved completion required');
  const hiddenSecret=(await op(w,'mission',{key:randomUUID(),title:'Hidden feedback',text:'Hidden feedback text',points:3,secret:true,completionStyle:'written'})).mission as Mission;
  await op(h,'adore',{mission:hiddenSecret.id,adoration:'loved',key:randomUUID()},404,'Mission unavailable');
  const adoreKey=randomUUID();
  const adored=await op(h,'adore',{mission:quick.id,adoration:'loved',key:adoreKey});
  assert.equal(adored.mission.adoration,'loved');assert.ok(adored.mission.adoredAt>0);
  assert.deepEqual(await op(h,'adore',{mission:quick.id,adoration:'ok',key:adoreKey}),adored,'a keyed retry returns the original response');
  s=await state();
  assert.equal(s.missions.find(m=>m.id===quick.id)!.adoration,'loved','a keyed retry does not re-apply the new value');
  await op(h,'adore',{mission:quick.id,adoration:'liked',key:randomUUID()});
  s=await state();
  const overwritten=s.missions.find(m=>m.id===quick.id)!;
  assert.equal(overwritten.adoration,'liked');assert.ok(overwritten.adoredAt!>0);
  assert.equal(overwritten.rating,'love');assert.equal(overwritten.ratedAt,rated.ratedAt);
  assert.equal(s.points,preset.points);assert.equal(s.herPoints,0,'adoration never changes points');
  // The notice is content-free: no mission id, title, points or missionId field in history or inbox.
  const husbandFeed=(await h(`/sessions/${id}`)).session as Session;
  const adoreEntries=[...husbandFeed.history,...husbandFeed.inbox].filter(item=>item.event==='adore');
  assert.ok(husbandFeed.history.some(item=>item.event==='adore')&&husbandFeed.inbox.some(item=>item.event==='adore'),'the husband sees a generic adore notice');
  assert.ok((await w(`/sessions/${id}`)).session.inbox.some((item:any)=>item.event==='adore'),'the wife sees the same generic notice');
  for(const item of adoreEntries){
    const text=JSON.stringify(item);
    assert.equal(text.includes(quick.id),false,'the notice carries no mission id');
    assert.equal(text.includes(quick.title),false,'the notice carries no mission title');
    assert.equal('missionId' in item,false,'the notice carries no missionId');
    assert.equal('points' in item,false,'the notice carries no points');
  }
  // Queen score: wife-only, derived from approved missions with feedback; husband state has none.
  assert.deepEqual((await queenRow(w)).queenScore,{score:0,breakdown:{loved:0,liked:1,ok:0,total:1}},'the overwrite leaves one liked approved task');
  assert.equal('queenScore' in (await queenRow(h)),false,'the husband state never carries the queen score');
  assert.deepEqual((await queenRow(w)).queenLevel,{level:'duchess',name:{he:'דוכסית',en:'Duchess'},next:10,toNext:9,progress:1},'one approved task is one queen point: Duchess with nine to go');
  assert.equal('queenLevel' in (await queenRow(h)),false,'the husband state never carries the queen level');
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

  // A second approved task without feedback is not counted; feedback given during a hold counts toward the queen score.
  const second=(await op(w,'mission',{key:randomUUID(),title:'Second approved task',text:'Second approved task text',points:1,secret:false,completionStyle:'simple'})).mission as Mission;
  await op(w,'deliver',{mission:second.id});
  await op(h,'ack',{mission:second.id});
  await op(h,'complete',{mission:second.id,text:'',expectedVersion:0,key:randomUUID()});
  await op(w,'review',{mission:second.id,approve:true,submissionVersion:1,key:randomUUID()});
  assert.deepEqual((await queenRow(w)).queenScore,{score:0,breakdown:{loved:0,liked:1,ok:0,total:1}},'an approved task without feedback is not counted');
  await op(h,'pause',{});
  await op(h,'adore',{mission:second.id,adoration:'loved',key:randomUUID()});
  await op(h,'resume',{});
  assert.deepEqual((await queenRow(w)).queenScore,{score:1,breakdown:{loved:1,liked:1,ok:0,total:2}},'feedback given during a hold counts toward the queen score');
  assert.deepEqual((await queenRow(w)).queenLevel,{level:'duchess',name:{he:'דוכסית',en:'Duchess'},next:10,toNext:7,progress:3},'two approved tasks and one loved count as three queen points');

  // Weekly digest: derived per viewer on /state. The wife sees her loved idea and a next idea; the husband sees the same numbers without either, and never a withheld title.
  const digestOf=async(who:typeof w)=>(await who('/state')).sessions.find((x:any)=>x.id===id).digest;
  const wifeDigest=await digestOf(w),husbandDigest=await digestOf(h);
  assert.ok(wifeDigest&&husbandDigest,'both roles receive a digest');
  assert.equal(wifeDigest.empty,false);assert.equal(husbandDigest.empty,false);
  assert.equal(wifeDigest.approved,2);assert.equal(husbandDigest.approved,2);
  assert.equal(wifeDigest.pointsHerEarned,preset.points+1);assert.equal(husbandDigest.pointsEarnedHusband,preset.points+1,'his earnings are the approved points');
  assert.equal(husbandDigest.pointsHerEarned,wifeDigest.pointsHerEarned);
  assert.equal(wifeDigest.pointsHerSpent,preset.points,'the wish redeemed earlier is her spend');assert.equal(husbandDigest.pointsHerSpent,preset.points);
  assert.equal(wifeDigest.pointsSpentHusband,0);assert.equal(husbandDigest.pointsSpentHusband,0);
  assert.deepEqual(wifeDigest.mostLovedIdea,{title:'Second approved task',adoration:'loved'},'the loved approval beats the liked one');
  assert.ok(wifeDigest.suggestion&&wifeDigest.suggestion.id,'the wife gets a next idea');
  const wifeState=(await w('/state')).sessions.find((x:any)=>x.id===id);
  assert.notEqual(wifeDigest.suggestion.id,wifeState.spark.id,'the next idea is not today\'s spark');
  assert.deepEqual(wifeDigest.streaks,{devotion:devotionStreak(wifeState.missions,Date.now()),mission:missionStreak(wifeState.missions,Date.now())});
  assert.deepEqual(wifeDigest.streaks,wifeState.streaks,'the digest streaks match the state streaks');
  assert.deepEqual(husbandDigest.streaks,wifeDigest.streaks);
  assert.match(wifeDigest.period.toDay,/^\d{4}-\d{2}-\d{2}$/);assert.match(wifeDigest.period.fromDay,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal('mostLovedIdea' in husbandDigest,false,'the husband digest never ranks her ideas');
  assert.equal('suggestion' in husbandDigest,false,'the husband digest never carries a suggestion');
  const husbandDigestJson=JSON.stringify((await h('/state')).sessions);
  assert.equal(husbandDigestJson.includes('Hidden feedback'),false,'the husband state holds no withheld secret title or text');
  console.log('PASS weekly digest: both roles receive a per-viewer digest; her loved idea and next suggestion are wife-only; the husband sees the same totals and no withheld content');

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

  // Recurring missions: each delivered occurrence creates exactly one successor; stop cancels the queued successor; a single cancel skips one occurrence; the series is redacted per occurrence.
  {
    const DAY=86400000;
    const draftMission=async(title:string)=>(await op(w,'mission',{key:randomUUID(),title,text:`${title} text`,points:2,secret:true,completionStyle:'written'})).mission as Mission;
    const deliverDue=async(missionId:string)=>{await edit(row=>{row.missions.find(m=>m.id===missionId)!.scheduledAt=Date.now()-1000;});return state();};
    const seriesOf=(all:Session,root:string)=>all.missions.filter(m=>m.id===root||m.repeatOf===root);
    const successorsOf=(all:Session,root:string)=>seriesOf(all,root).filter(m=>m.id!==root);
    const hisMissions=async()=>((await h(`/sessions/${id}`)).session as Session).missions;
    const future=()=>Date.now()+3600000;

    const morning=await draftMission('Morning devotion');
    await op(w,'queue',{mission:morning.id,scheduledAt:future(),repeat:'hourly'},400);
    await op(w,'queue',{mission:morning.id,repeat:'daily'},400);
    await op(h,'queue',{mission:morning.id,scheduledAt:future(),repeat:'daily'},403);
    await op(h,'repeat-stop',{key:randomUUID(),mission:morning.id},403);
    await op(w,'repeat-stop',{key:randomUUID(),mission:morning.id},409,'Repeating series required');
    await op(w,'queue',{mission:morning.id,scheduledAt:future(),repeat:'daily'});

    s=await deliverDue(morning.id);
    const root=s.missions.find(m=>m.id===morning.id)!;
    assert.equal(root.status,'pending');assert.ok(root.deliveredAt);assert.equal(root.repeat,'daily');assert.equal(root.repeatOf,morning.id);
    assert.equal(successorsOf(s,morning.id).length,1);
    const next=successorsOf(s,morning.id)[0];
    assert.equal(next.status,'queued');assert.equal(next.deliveredAt,undefined);
    assert.equal(next.scheduledAt,root.scheduledAt!+DAY);
    assert.equal(next.repeat,'daily');assert.equal(next.repeatOf,morning.id);
    assert.equal(next.title,morning.title);assert.equal(next.text,morning.text);assert.equal(next.points,2);
    assert.equal(next.secret,true);assert.equal(next.completionStyle,'written');assert.equal(next.revision,s.revision);assert.ok(next.createdAt!>0);
    s=await state();
    assert.equal(successorsOf(s,morning.id).length,1,'a repeated read must not duplicate the successor');

    // Redaction: the delivered occurrence is visible; the undelivered secret successor is not.
    let seen=await hisMissions();
    assert.ok(seen.some(m=>m.id===morning.id&&m.status==='pending'));
    assert.ok(!seen.some(m=>m.id===next.id));
    assert.equal(seen.find(m=>m.id===morning.id)!.repeatStopped,undefined);

    // Streaks are derived for both roles; the husband's counts come from his visible missions, so the undelivered secret successor adds nothing.
    const streaksOf=async(who:typeof w)=>(await who('/state')).sessions.find((x:any)=>x.id===id).streaks;
    const wifeStreaks=await streaksOf(w),husbandStreaks=await streaksOf(h);
    assert.ok(wifeStreaks&&husbandStreaks,'both roles receive streaks');
    assert.deepEqual(husbandStreaks,wifeStreaks);
    assert.equal(husbandStreaks.devotion.todayDone,true,'today has an approved mission');
    assert.equal(husbandStreaks.mission.todayDone,true,'today has a delivered mission');
    assert.deepEqual(husbandStreaks.devotion,devotionStreak(seen,Date.now()));
    assert.deepEqual(husbandStreaks.mission,missionStreak(seen,Date.now()));
    assert.deepEqual(husbandStreaks.mission,missionStreak(s.missions.filter(m=>m.deliveredAt),Date.now()));
    assert.ok(s.missions.some(m=>m.id===next.id&&!m.deliveredAt),'the undelivered successor exists for the wife');

    // A replacement does not inherit the chain; the series continues through the successor that already exists.
    await op(h,'adjust',{mission:morning.id,reason:'softer',key:randomUUID()});
    const replacement=(await op(w,'replace',{mission:morning.id,key:randomUUID(),title:'Softer devotion',text:'One verse, one sentence',points:1,completionStyle:'simple'})).mission as Mission;
    s=await state();
    assert.equal(replacement.repeat,undefined);assert.equal(replacement.repeatOf,undefined);
    assert.equal(s.missions.find(m=>m.id===next.id)!.status,'queued');

    // Each occurrence is a normal mission: the second delivery creates the third; husband completes it; points are awarded once.
    s=await deliverDue(next.id);
    const second=s.missions.find(m=>m.id===next.id)!;
    assert.equal(second.status,'pending');
    const third=seriesOf(s,morning.id).find(m=>m.status==='queued')!;
    assert.equal(third.scheduledAt,second.scheduledAt!+DAY);
    const pointsBefore=s.points;
    await op(h,'ack',{mission:next.id});
    await op(h,'complete',{mission:next.id,text:'One line written',expectedVersion:0,key:randomUUID()});
    await op(w,'review',{mission:next.id,approve:true,submissionVersion:1,key:randomUUID()});
    s=await state();
    assert.equal(s.missions.find(m=>m.id===next.id)!.status,'approved');
    assert.equal(s.points,pointsBefore+2);

    // Repeat-stop: keyed, works during a hold, cancels the queued occurrence and leaves no successor.
    const stopKey=randomUUID();
    await op(w,'pause',{});
    const stopped=await op(w,'repeat-stop',{key:stopKey,mission:third.id});
    assert.deepEqual(stopped,{cancelled:1});
    assert.deepEqual(await op(w,'repeat-stop',{key:stopKey,mission:third.id}),stopped);
    await op(w,'resume',{});
    s=await state();
    assert.equal(s.missions.find(m=>m.id===third.id)!.status,'cancelled');
    assert.equal(s.missions.find(m=>m.id===morning.id)!.repeatStopped,true);
    assert.equal(seriesOf(s,morning.id).filter(m=>m.status==='queued').length,0);
    s=await state();
    assert.equal(seriesOf(s,morning.id).filter(m=>m.status==='queued').length,0,'no successor after stop');
    seen=await hisMissions();
    assert.equal(seen.find(m=>m.id===morning.id)!.repeatStopped,undefined);

    // Weekly chains use +7 days; a single cancel skips only that occurrence and the series continues; a second cancel adds nothing.
    const letter=await draftMission('Weekly letter');
    await op(w,'queue',{mission:letter.id,scheduledAt:future(),repeat:'weekly'});
    s=await deliverDue(letter.id);
    const weeklyNext=successorsOf(s,letter.id)[0];
    assert.equal(weeklyNext.repeat,'weekly');
    assert.equal(weeklyNext.scheduledAt,s.missions.find(m=>m.id===letter.id)!.scheduledAt!+7*DAY);
    await op(w,'cancel',{mission:weeklyNext.id});
    s=await state();
    assert.equal(s.missions.find(m=>m.id===weeklyNext.id)!.status,'cancelled');
    const skipped=seriesOf(s,letter.id).find(m=>m.status==='queued')!;
    assert.equal(skipped.scheduledAt,weeklyNext.scheduledAt!+7*DAY);
    await op(w,'cancel',{mission:weeklyNext.id});
    s=await state();
    assert.equal(seriesOf(s,letter.id).filter(m=>m.status==='queued').length,1);
    await op(w,'repeat-stop',{key:randomUUID(),mission:skipped.id});
    s=await state();
    assert.equal(seriesOf(s,letter.id).filter(m=>m.status==='queued').length,0);

    // Quick commands may repeat when scheduled; the evening close cancels a queued occurrence and continues the series.
    await freshEvening();
    await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en',repeat:'daily'},400,'Repeat needs a schedule');
    const quickSeries=(await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en',scheduledAt:future(),repeat:'daily'})).mission as Mission;
    assert.equal(quickSeries.status,'queued');assert.equal(quickSeries.repeat,'daily');assert.equal(quickSeries.repeatOf,quickSeries.id);
    await op(w,'evening-close',{key:randomUUID()});
    s=await state();
    assert.equal(s.missions.find(m=>m.id===quickSeries.id)!.status,'cancelled');
    const afterClose=successorsOf(s,quickSeries.id);
    assert.equal(afterClose.length,1);assert.equal(afterClose[0].status,'queued');assert.equal(afterClose[0].scheduledAt,quickSeries.scheduledAt!+DAY);
    await op(w,'repeat-stop',{key:randomUUID(),mission:quickSeries.id});
    s=await state();
    assert.equal(seriesOf(s,quickSeries.id).filter(m=>m.status==='queued').length,0);
    console.log('PASS recurring missions: daily and weekly successors, idempotent advance, redaction, replacement without repeat, per-occurrence completion, keyed repeat-stop during a hold, single-cancel skip, quick repeat, evening close continuity');
  }

  // Daily spark: derived for the wife's state only; same UTC day is stable; reroll and dismiss are wife-only, keyed, capped and not gameplay-gated.
  const sparkState=async(who:typeof w)=>(await who('/state')).sessions.find((x:any)=>x.id===id);
  const sparkDay0=sparkDay(Date.now());
  const sparkFirst=(await sparkState(w)).spark;
  assert.deepEqual(Object.keys(sparkFirst).sort(),['category','en','he','id','intensity','minutes','tags']);
  assert.equal((await sparkState(w)).spark.id,sparkFirst.id,'same UTC day gives the same spark');
  const husbandSparkView=await sparkState(h);
  assert.equal('spark' in husbandSparkView,false);assert.equal('sparkReroll' in husbandSparkView,false);assert.equal('sparkDismissed' in husbandSparkView,false);
  await op(h,'spark-reroll',{key:randomUUID()},403,'Wrong role for action');
  await op(w,'spark-reroll',{},400);
  const rerollKey=randomUUID();
  const rerolled=await op(w,'spark-reroll',{key:rerollKey});
  assert.notEqual(rerolled.spark.id,sparkFirst.id,'a reroll changes the spark while candidates remain');
  assert.deepEqual(await op(w,'spark-reroll',{key:rerollKey}),rerolled,'keyed retry returns the original response');
  assert.equal((await sparkState(w)).sparkReroll.count,1,'a keyed retry spends no second reroll');
  assert.equal((await sparkState(w)).spark.id,rerolled.spark.id);
  // Dismissed ideas are recorded and never offered again in this session, even across rerolls.
  const dismissed=rerolled.spark.id;
  await op(h,'spark-dismiss',{key:randomUUID(),id:dismissed},403,'Wrong role for action');
  const dismissKey=randomUUID();
  const dismissedView=await op(w,'spark-dismiss',{key:dismissKey,id:dismissed});
  assert.notEqual(dismissedView.spark.id,dismissed);
  assert.deepEqual(await op(w,'spark-dismiss',{key:dismissKey,id:dismissed}),dismissedView,'keyed dismiss retry is idempotent');
  assert.deepEqual((await sparkState(w)).sparkDismissed,[dismissed]);
  const seenSparks:string[]=[],seenCategories:string[]=[];
  for(let i=0;i<3;i++){const r=await op(w,'spark-reroll',{key:randomUUID()});seenSparks.push(r.spark.id);seenCategories.push(r.spark.category);}
  for(let i=0;i<6;i++){const r=await op(w,'spark-reroll',{key:randomUUID()});seenSparks.push(r.spark.id);seenCategories.push(r.spark.category);}
  assert.equal((await sparkState(w)).sparkReroll.count,10,'ten rerolls spent today');
  assert.ok(!seenSparks.includes(dismissed),'a dismissed spark never reappears in the same session');
  assert.ok(!seenCategories.some(category=>['consequences','rewards'].includes(category)),'consequences and rewards are never offered as sparks');
  await op(w,'spark-reroll',{key:randomUUID()},409,'Spark reroll limit reached for today');
  assert.deepEqual(await op(w,'spark-reroll',{key:rerollKey}),rerolled,'a stored keyed reroll still answers after the cap');
  // The dismissed list is capped at thirty, keeping the newest entries.
  for(let i=0;i<31;i++)await op(w,'spark-dismiss',{key:randomUUID(),id:`bulk-spark-${i}`});
  const capped=(await sparkState(w)).sparkDismissed;
  assert.equal(capped.length,30);assert.equal(capped.at(-1),'bulk-spark-30');assert.ok(!capped.includes(dismissed));
  // A new UTC day resets the reroll count; the cap and the day are derived from the server clock.
  sparkClockOffset+=86400000;
  assert.notEqual(sparkDay(Date.now()+sparkClockOffset),sparkDay0);
  const nextDay=await op(w,'spark-reroll',{key:randomUUID()});
  assert.equal((await sparkState(w)).sparkReroll.count,1,'the reroll count restarts on a new UTC day');
  assert.ok(nextDay.spark);
  // Spark ops are not gameplay-gated: rerolls work while a personal pause holds the session.
  await op(h,'pause',{});
  const paused=await op(w,'spark-reroll',{key:randomUUID()});
  assert.ok(paused.spark);
  await op(h,'resume',{});
  // Pure helpers: exclusion, dismissal and the UTC day key hold for many rerolls on the built-in pool.
  for(let reroll=0;reroll<60;reroll++){const pick=pickSpark(library,{sessionId:id,day:'2026-11-15',reroll});assert.ok(pick&&!['consequences','rewards'].includes(pick.category));}
  const pureFirst=pickSpark(library,{sessionId:id,day:'2026-11-15',reroll:0})!;
  assert.notEqual(pickSpark(library,{sessionId:id,day:'2026-11-15',reroll:0,dismissed:[pureFirst.id]})!.id,pureFirst.id);
  assert.equal(pickSpark(library,{sessionId:id,day:'2026-11-15',reroll:0})!.id,pureFirst.id,'same inputs give the same spark');
  assert.equal(sparkDay(Date.UTC(2026,10,15,23,59)),'2026-11-15');assert.equal(sparkDay(Date.UTC(2026,10,16,0,0)),'2026-11-16');
  const quietPick=pickSpark(library,{sessionId:id,day:'2026-11-15',reroll:0,checkIn:{energy:'medium',mood:'quiet'}})!;
  assert.ok(['conversation','silence','reading','writing'].some(tag=>quietPick.tags.includes(tag)),'a quiet check-in prefers quiet-tagged sparks');
  console.log('PASS daily spark: wife-only derived card, stable per UTC day, keyed reroll and dismiss, ten-reroll cap, dismissed never returns, excluded categories, day reset, reroll during a pause');
  // Whisper box: husband-only; its text reaches only the wife; capped at twenty; keyed retries; never echoed to him.
  const whisperSentTexts:string[]=[],whisperIds:string[]=[],husbandReplies:unknown[]=[];
  const whisperHusbandView=async():Promise<Session>=>(await h(`/sessions/${id}`)).session;
  await op(w,'whisper',{key:randomUUID(),text:'Wife cannot whisper'},403,'Wrong role for action');
  await op(h,'whisper',{key:randomUUID(),text:'   '},400);
  await op(h,'whisper',{key:randomUUID(),text:'x'.repeat(401)},400);
  await op(h,'whisper',{text:'No key'},400);
  assert.deepEqual(whisperDraft('Whisper draft: slow walk'),{title:'Whisper draft: slow walk',text:'Whisper draft: slow walk',points:2});
  assert.equal(whisperDraft('a'.repeat(100)).title.length,60);
  const whisperKey=randomUUID(),whisperA='  Whisper A: try the slow Sunday walk, no phones  ';
  const sentOnce=await op(h,'whisper',{key:whisperKey,text:whisperA});
  assert.deepEqual(sentOnce,{whisperSent:1},'the husband gets only the count');
  assert.deepEqual(await op(h,'whisper',{key:whisperKey,text:whisperA}),sentOnce,'a keyed retry returns the original response');
  whisperSentTexts.push(whisperA.trim());husbandReplies.push(sentOnce);
  const boundary='y'.repeat(400);
  husbandReplies.push(await op(h,'whisper',{key:randomUUID(),text:boundary}));whisperSentTexts.push(boundary);
  for(let i=1;i<=18;i++){const text=`Fill ${i} private note`;husbandReplies.push(await op(h,'whisper',{key:randomUUID(),text}));whisperSentTexts.push(text);}
  await op(h,'whisper',{key:randomUUID(),text:'Over cap'},409,'Whisper list is full');
  let wifeWhispers=await state();
  assert.equal(wifeWhispers.whispers!.length,20);assert.equal(wifeWhispers.whisperSent,20);
  assert.equal(wifeWhispers.whispers![0].text,whisperA.trim());assert.equal(wifeWhispers.whispers![1].text,boundary);
  const deletedId=wifeWhispers.whispers![0].id;whisperIds.push(deletedId);
  await op(h,'whisper-delete',{key:randomUUID(),whisper:deletedId},403,'Wrong role for action');
  await op(w,'whisper-delete',{key:randomUUID(),whisper:randomUUID()},404,'Whisper unavailable');
  await op(w,'whisper-delete',{key:randomUUID(),whisper:'not-a-uuid'},400);
  const deleteKey=randomUUID();
  assert.deepEqual(await op(w,'whisper-delete',{key:deleteKey,whisper:deletedId}),{ok:true});
  assert.deepEqual(await op(w,'whisper-delete',{key:deleteKey,whisper:deletedId}),{ok:true},'a keyed delete retry replays its response');
  wifeWhispers=await state();
  assert.equal(wifeWhispers.whispers!.length,19,'deleting one whisper frees one slot');
  await op(h,'pause',{});
  const heldText='Held whisper accepted during his pause';
  husbandReplies.push(await op(h,'whisper',{key:randomUUID(),text:heldText}));whisperSentTexts.push(heldText);
  await op(h,'resume',{});
  await op(h,'whisper',{key:randomUUID(),text:'Over cap again'},409,'Whisper list is full');
  wifeWhispers=await state();
  assert.equal(wifeWhispers.whispers!.length,20);assert.equal(wifeWhispers.whisperSent,21,'the count keeps every whisper sent, not the list length');
  assert.ok(wifeWhispers.whispers!.some(item=>item.text===heldText));
  assert.equal(JSON.stringify(husbandReplies).includes('"text"'),false,'no whisper reply carries a text field');
  const husbandState=await whisperHusbandView();
  assert.equal('whispers' in husbandState,false,'the husband session view has no whispers field');
  assert.equal(husbandState.whisperSent,21,'the husband sees the sent count');
  const whisperNotices=husbandState.history.filter(item=>item.event==='whisper');
  assert.equal(whisperNotices.length,21,'one content-free notice per accepted whisper, none for retries or refusals');
  for(const item of whisperNotices)assert.deepEqual(Object.keys(item).sort(),['at','by','event']);
  const inboxNotices=husbandState.inbox.filter(item=>item.event==='whisper');
  assert.equal(inboxNotices.length,21);
  for(const item of inboxNotices)assert.deepEqual(Object.keys(item).sort(),['at','event','id','readBy']);
  assert.equal(husbandState.history.some(item=>item.event==='whisper-delete'),false,'deleting a whisper writes no notice');
  assert.ok(wifeWhispers.inbox.some(item=>item.event==='whisper'),'the wife sees the same content-free notice');
  whisperIds.push(...wifeWhispers.whispers!.map(item=>item.id));
  const husbandJson=JSON.stringify({session:husbandState,state:(await h('/state')).sessions,replies:husbandReplies});
  for(const text of whisperSentTexts)assert.equal(husbandJson.includes(text),false,'no whisper text reaches the husband in state, history, inbox or replies');
  for(const whisperId of whisperIds)assert.equal(husbandJson.includes(whisperId),false,'no whisper id reaches the husband');
  console.log('PASS whisper box: husband-only keyed whispers, count-only replies, wife-only text, 20-slot cap freed by delete, pause acceptance, content-free notices, husband redaction scan');
  // Season packs: curated bilingual packs, one running season per session, wife-only ops, the husband sees only delivered occurrences, stop cancels queued ones during holds, keyed retries, and season missions do not use the evening cap.
  {
    const DAY=86400000;
    const worship=seasonPacks.find(pack=>pack.id==='worship-week')!,queens=seasonPacks.find(pack=>pack.id==='queens-month')!;
    const seasonMissions=(all:Session)=>all.missions.filter(m=>m.season);
    const byDay=(all:Session)=>Object.fromEntries(seasonMissions(all).map(m=>[m.season!.day,m.status]));
    await op(h,'season-start',{key:randomUUID(),pack:worship.id,lang:'en'},403,'Wrong role for action');
    await op(w,'season-start',{key:randomUUID(),pack:'no-such-pack',lang:'en'},404,'Season unavailable');
    await op(w,'season-start',{key:randomUUID(),pack:worship.id,lang:'fr'},400);
    await op(w,'season-start',{key:randomUUID(),pack:worship.id,lang:'en',startsAt:Date.now()-DAY},400,'Schedule must be in the future');
    await op(w,'season-start',{key:randomUUID(),pack:worship.id,lang:'en',startsAt:Date.now()+364*DAY},400,'Schedule must be within one year');
    await op(h,'pause',{});
    await op(w,'season-start',{key:randomUUID(),pack:worship.id,lang:'en'},409,'Mutual approval and no pauses required');
    await op(h,'resume',{});

    const requestedAt=Date.now(),startKey=randomUUID();
    const started=await op(w,'season-start',{key:startKey,pack:worship.id,lang:'en'});
    assert.deepEqual(await op(w,'season-start',{key:startKey,pack:worship.id,lang:'en'}),started,'a keyed retry returns the original response');
    assert.deepEqual(Object.keys(started.season).sort(),['days','id','startsAt']);
    assert.equal(started.season.id,worship.id);assert.equal(started.season.days,7);
    assert.equal(started.season.startsAt%DAY,0,'the default start is a UTC midnight');
    assert.ok(started.season.startsAt>=requestedAt+60000&&started.season.startsAt<requestedAt+DAY+60000,'the default start is the next UTC midnight at least a minute out');
    const startsAt=started.season.startsAt;
    s=await state();
    const queued=seasonMissions(s);
    assert.equal(queued.length,7);
    assert.deepEqual(queued.map(m=>m.season!.day).sort((a,b)=>a-b),[1,2,3,4,5,6,7]);
    for(const m of queued){
      const item=seasonItemFor(worship,m.season!.day);
      assert.equal(m.status,'queued');assert.equal(m.deliveredAt,undefined);assert.equal(m.repeat,undefined);
      assert.equal(m.scheduledAt,startsAt+(m.season!.day-1)*DAY,'one occurrence per day, one day apart');
      assert.equal(m.season!.id,worship.id);assert.equal(m.title,item.title.en);assert.equal(m.text,item.text.en);assert.equal(m.points,item.points);
    }
    assert.equal(queued.find(m=>m.season!.day===1)!.text,worship.items[0].text.en,'the first mission is the pack day-1 item in the requested language');
    assert.deepEqual(s.seasonState,{id:worship.id,startsAt,days:7});
    assert.deepEqual(s.seasonProgress,{id:worship.id,done:0,total:7,running:true});
    assert.ok(s.history.some(item=>item.event==='season-start'));
    await op(w,'season-start',{key:randomUUID(),pack:queens.id,lang:'he'},409,'A season is already running');

    const hisQueued=(await h(`/sessions/${id}`)).session as Session;
    assert.equal(seasonMissions(hisQueued).length,0,'the husband never sees queued season missions');
    assert.equal(JSON.stringify(hisQueued).includes(worship.items[0].text.en),false,'no queued season text reaches the husband');
    assert.deepEqual(hisQueued.seasonProgress,{id:worship.id,done:0,total:7,running:true},'the husband sees the count only');

    // Time travel: the whole run moves into the past so day one is due; the other days stay in the future.
    await edit(row=>{const origin=Date.now()-60000;row.seasonState!.startsAt=origin;for(const m of row.missions)if(m.season)m.scheduledAt=origin+(m.season.day-1)*DAY;});
    const hisDelivered=(await h(`/sessions/${id}`)).session as Session;
    assert.deepEqual(seasonMissions(hisDelivered).map(m=>[m.season!.day,m.status]),[[1,'pending']],'only the delivered occurrence reaches him');
    assert.equal(seasonMissions(hisDelivered)[0].text,worship.items[0].text.en);
    assert.deepEqual(hisDelivered.seasonProgress,{id:worship.id,done:1,total:7,running:true});
    assert.deepEqual((await w(`/sessions/${id}`)).session.seasonProgress,{id:worship.id,done:1,total:7,running:true});

    // Stop: wife only, works during a hold, cancels queued occurrences only, keyed retry replays, and a second stop is refused.
    await op(h,'season-stop',{key:randomUUID()},403,'Wrong role for action');
    await op(w,'season-stop',{key:randomUUID(),pack:queens.id},404,'Season unavailable');
    await op(h,'pause',{});
    const stopKey=randomUUID();
    const stopped=await op(w,'season-stop',{key:stopKey,pack:worship.id});
    assert.deepEqual(stopped,{cancelled:6});
    assert.deepEqual(await op(w,'season-stop',{key:stopKey,pack:worship.id}),stopped,'a keyed stop retry returns the original response');
    await op(h,'resume',{});
    s=await state();
    assert.deepEqual(byDay(s),{1:'pending',2:'cancelled',3:'cancelled',4:'cancelled',5:'cancelled',6:'cancelled',7:'cancelled'},'delivered occurrences stay');
    assert.equal(typeof s.seasonState!.stoppedAt,'number');
    assert.deepEqual(s.seasonProgress,{id:worship.id,done:1,total:7,running:false});
    assert.ok(s.history.some(item=>item.event==='season-stop'));
    assert.deepEqual(seasonMissions((await h(`/sessions/${id}`)).session as Session).map(m=>m.season!.day),[1],'occurrences cancelled before delivery stay hidden from him');
    await op(w,'season-stop',{key:randomUUID()},409,'No season is running');

    // Restart with another pack in Hebrew; the old run's delivered occurrence is not counted, and the evening cap ignores season missions.
    await freshEvening();
    const restarted=await op(w,'season-start',{key:randomUUID(),pack:queens.id,lang:'he'});
    s=await state();
    const queensRun=seasonMissions(s).filter(m=>m.season!.id===queens.id);
    assert.equal(queensRun.length,30);
    for(const m of queensRun){
      assert.equal(m.status,'queued');assert.equal(m.title,seasonItemFor(queens,m.season!.day).title.he);
      assert.equal(m.scheduledAt,restarted.season.startsAt+(m.season!.day-1)*DAY);
    }
    assert.deepEqual(s.seasonProgress,{id:queens.id,done:0,total:30,running:true},'a restarted pack starts at zero');
    assert.equal((await op(w,'quick',{preset:preset.id,key:randomUUID(),lang:'en'})).mission.status,'pending','season missions do not use up the evening cap');
    const hisRestart=(await h(`/sessions/${id}`)).session as Session;
    assert.deepEqual(seasonMissions(hisRestart).map(m=>m.season!.id),[worship.id],'he sees only the delivered occurrence of the earlier run, none of the queued run');
    assert.equal(JSON.stringify(hisRestart).includes(queens.items[0].text.he),false,'no queued Hebrew season text reaches the husband');
    const seasonNotices=hisRestart.history.filter(item=>item.event==='season-start'||item.event==='season-stop');
    assert.equal(seasonNotices.length,3,'one content-free notice per accepted start or stop');
    for(const item of seasonNotices)assert.deepEqual(Object.keys(item).sort(),['at','by','event']);
    console.log('PASS season packs: curated start with keyed retry, one-year and future checks, hold gating, husband sees only delivered occurrences, stop during a hold with keyed retry, restart at zero, evening cap untouched, content-free notices');
  }

  // Sealed envelope: a queued surprise is a minimal card for the husband until delivery; secret items never show; reveal stays the only path to content.
  {
    const DAY=86400000;
    const husbandSession=async()=>(await h(`/sessions/${id}`)).session as Session;
    const husbandNotices=async()=>{const view=await husbandSession();return JSON.stringify({history:view.history,inbox:view.inbox});};
    const sealedTitle='Sealed title 4c1f',sealedText='Sealed body 4c1f',sealedCategory='Sealed category 4c1f';
    const sealedMission=(await op(w,'mission',{key:randomUUID(),title:sealedTitle,text:sealedText,points:13,surprise:true,category:sealedCategory,completionStyle:'written'})).mission as Mission;
    const scheduled=Date.now()+3600000;
    await op(w,'queue',{mission:sealedMission.id,scheduledAt:scheduled});
    const wifeCard=(await state()).missions.find(m=>m.id===sealedMission.id)!;
    assert.equal(wifeCard.status,'queued');assert.equal(wifeCard.title,sealedTitle);assert.equal(wifeCard.text,sealedText);assert.equal(wifeCard.category,sealedCategory);assert.equal(wifeCard.scheduledAt,scheduled);
    const sealedStub=(await husbandSession()).missions.find(m=>m.id===sealedMission.id)!;
    assert.deepEqual(Object.keys(sealedStub).sort(),['id','revealsAt','revision','sealed','status','surprise']);
    assert.deepEqual({id:sealedStub.id,revealsAt:sealedStub.revealsAt,revision:sealedStub.revision,sealed:sealedStub.sealed,status:sealedStub.status,surprise:sealedStub.surprise},{id:sealedMission.id,revealsAt:scheduled,revision:wifeCard.revision,sealed:true,status:'queued',surprise:true});
    const sealedBody=JSON.stringify(await husbandSession());
    for(const hidden of [sealedTitle,sealedText,sealedCategory])assert.equal(sealedBody.includes(hidden),false,`sealed card leaked ${hidden}`);
    await op(h,'reveal',{mission:sealedMission.id},409);
    await op(h,'ack',{mission:sealedMission.id},409);
    const sealedNotices=await husbandNotices();
    for(const hidden of [sealedTitle,sealedText,sealedCategory])assert.equal(sealedNotices.includes(hidden),false,`queued notices leaked ${hidden}`);

    const pendingTitle='Pending title 4c1f',pendingText='Pending body 4c1f',pendingCategory='Pending category 4c1f';
    const pendingMission=(await op(w,'mission',{key:randomUUID(),title:pendingTitle,text:pendingText,points:4,surprise:true,category:pendingCategory,completionStyle:'written'})).mission as Mission;
    await op(w,'deliver',{mission:pendingMission.id});
    const pendingStub=(await husbandSession()).missions.find(m=>m.id===pendingMission.id)!;
    assert.deepEqual(Object.keys(pendingStub).sort(),['deliveredAt','id','revision','status','surprise']);
    assert.equal(pendingStub.status,'pending');assert.equal(typeof pendingStub.deliveredAt,'number');
    const pendingBody=JSON.stringify(await husbandSession());
    for(const hidden of [pendingTitle,pendingText,pendingCategory])assert.equal(pendingBody.includes(hidden),false,`delivered surprise leaked ${hidden}`);

    const secretQueued=(await op(w,'mission',{key:randomUUID(),title:'Secret queued 4c1f',text:'Secret queued body 4c1f',points:3,secret:true,completionStyle:'written'})).mission as Mission;
    const secretSurprise=(await op(w,'mission',{key:randomUUID(),title:'Secret surprise 4c1f',text:'Secret surprise body 4c1f',points:3,secret:true,surprise:true,category:'Secret surprise category 4c1f',completionStyle:'written'})).mission as Mission;
    await op(w,'queue',{mission:secretQueued.id,scheduledAt:scheduled});
    await op(w,'queue',{mission:secretSurprise.id,scheduledAt:scheduled});
    const secretView=await husbandSession();
    assert.equal(secretView.missions.some(m=>m.id===secretQueued.id||m.id===secretSurprise.id),false,'secret queued missions are absent from the husband view');
    for(const hidden of ['Secret queued 4c1f','Secret surprise 4c1f','Secret surprise category 4c1f'])assert.equal(JSON.stringify(secretView).includes(hidden),false,`secret leaked ${hidden}`);

    await edit(row=>{row.missions.find(m=>m.id===sealedMission.id)!.scheduledAt=Date.now()-1000;});
    const delivered=(await husbandSession()).missions.find(m=>m.id===sealedMission.id)!;
    assert.deepEqual(Object.keys(delivered).sort(),['deliveredAt','id','revision','status','surprise']);
    assert.equal(delivered.status,'pending');assert.equal(typeof delivered.deliveredAt,'number');
    const deliveredNotices=await husbandNotices();
    for(const hidden of [sealedTitle,sealedText,sealedCategory])assert.equal(deliveredNotices.includes(hidden),false,`delivery notices leaked ${hidden}`);

    await op(h,'reveal',{mission:sealedMission.id});
    const revealed=(await husbandSession()).missions.find(m=>m.id===sealedMission.id)!;
    assert.equal(revealed.title,sealedTitle);assert.equal(revealed.text,sealedText);assert.equal(revealed.category,sealedCategory);assert.equal(revealed.status,'pending');assert.equal(revealed.sealed,undefined);
    const afterFirstReveal=await husbandNotices();
    await op(h,'reveal',{mission:sealedMission.id});
    assert.equal(await husbandNotices(),afterFirstReveal,'reveal retry adds no notices');
    assert.equal((await husbandSession()).missions.find(m=>m.id===secretSurprise.id),undefined);
    console.log('PASS sealed envelope: queued surprise shows only the sealed key set, delivered surprise shows the minimal stub, secret items stay absent, delivery reveals through the existing reveal op, notices stay content-free');
  }

  // Wheel spend: the wife sets a 0-20 cost (not gated by play); a paid spin is gated like other points spends, deducts once per key, and leaves only a content-free notice.
  {
    const husbandSession=async()=>(await h(`/sessions/${id}`)).session as Session;
    await op(h,'wheel-config',{key:randomUUID(),cost:2},403);
    await op(w,'wheel-config',{key:randomUUID(),cost:21},400);
    await op(w,'wheel-config',{key:randomUUID(),cost:-1},400);
    const configKey=randomUUID();
    const configured=await op(w,'wheel-config',{key:configKey,cost:3});
    assert.deepEqual(configured,{wheelCost:3});
    assert.deepEqual(await op(w,'wheel-config',{key:configKey,cost:3}),configured,'a keyed config retry returns the original response');
    s=await state();
    assert.equal(s.wheelCost,3);
    assert.equal((await husbandSession()).wheelCost,3,'the cost is a plain number and both players see it');
    assert.equal(s.history.some(item=>item.event==='wheel-config'),false,'changing the cost writes no notice');

    await edit(row=>{row.herPoints=2;});
    await op(h,'wheel-spin',{key:randomUUID()},403);
    await op(w,'wheel-spin',{key:randomUUID()},409,'Not enough points for a spin');
    await edit(row=>{row.herPoints=5;});
    await op(w,'pause',{});
    await op(w,'wheel-spin',{key:randomUUID()},409,'Mutual approval and no pauses required');
    await op(w,'wheel-config',{key:randomUUID(),cost:3});
    await op(w,'resume',{});

    const spinKey=randomUUID();
    const spun=await op(w,'wheel-spin',{key:spinKey});
    assert.deepEqual(spun,{herPoints:2});
    assert.deepEqual(await op(w,'wheel-spin',{key:spinKey}),spun,'a keyed spin retry replays its response');
    s=await state();
    assert.equal(s.herPoints,2,'a keyed spin retry does not deduct twice');
    const spins=s.history.filter(item=>item.event==='wheel-spin');
    assert.equal(spins.length,1,'one notice for the accepted spin; refused, paused and retried spins write none');
    assert.deepEqual(Object.keys(spins[0]).sort(),['at','by','event','points'],'the spin notice carries no wheel, idea or result, only the points spent');
    assert.equal(spins[0].points,3,'the spin notice records the cost paid');
    const inbox=s.inbox.filter(item=>item.event==='wheel-spin');
    assert.equal(inbox.length,1);
    assert.deepEqual(Object.keys(inbox[0]).sort(),['at','event','id','readBy']);
    assert.equal((await husbandSession()).history.filter(item=>item.event==='wheel-spin').length,1,'the husband sees the content-free notice');
    console.log('PASS wheel spend: wife-only keyed cost 0-20, insufficient and held spins refused, keyed spin retry deducts once, content-free notice only');
  }

  let lateLotId='';
  // Auctions: a bid reserves nothing. At closing the highest bid is charged only if the husband's balance covers it, and the charge is burned, not credited. Held sessions void due lots without charging.
  {
    const husbandSession=async()=>(await h(`/sessions/${id}`)).session as Session;
    const lotNamed=async(title:string)=>(await state()).auctions!.find(a=>a.title===title)!;
    const ageLot=(lotId:string)=>edit(row=>{row.auctions!.find(a=>a.id===lotId)!.closesAt=Date.now()-1000;});
    const newLot=(title:string,minBid=1)=>op(w,'auction',{key:randomUUID(),title,description:`${title} details`,minBid,closesAt:Date.now()+3600000});
    const bid=(lotId:string,amount:number)=>op(h,'auction-bid',{key:randomUUID(),auction:lotId,amount});
    await op(h,'auction',{key:randomUUID(),title:'Nope',description:'Nope',minBid:1,closesAt:Date.now()+3600000},403,'Wrong role for action');
    await op(w,'auction',{key:randomUUID(),title:'Past',description:'Past',minBid:1,closesAt:Date.now()-1000},400,'Closing time must be in the future');
    await op(w,'auction',{key:randomUUID(),title:'Far',description:'Far',minBid:1,closesAt:Date.now()+7*86400000+60000},400,'Closing time must be within seven days');
    for(const extra of [{minBid:0},{minBid:100001},{minBid:1.5},{title:''},{description:''}])await op(w,'auction',{key:randomUUID(),title:'Bad',description:'Bad',minBid:1,closesAt:Date.now()+3600000,...extra},400);
    await edit(row=>{row.points=10;});

    const lotA=(await newLot('Dinner date',5)).auction;
    const walkBody={key:randomUUID(),title:'Walk',description:'Walk details',minBid:4,closesAt:Date.now()+3600000};
    const walk=await op(w,'auction',walkBody);
    assert.deepEqual(await op(w,'auction',walkBody),walk,'a keyed auction retry returns the original response');
    const lotB=walk.auction;
    const lotC=(await newLot('Extra one')).auction,lotD=(await newLot('Extra two')).auction,lotE=(await newLot('Extra three')).auction;
    lateLotId=lotE.id;
    await op(w,'auction',{key:randomUUID(),title:'Sixth',description:'Sixth',minBid:1,closesAt:Date.now()+3600000},409,'Too many open auctions');
    s=await state();
    assert.equal(s.auctions!.length,5);assert.equal(s.auctions!.filter(a=>a.status==='open').length,5);
    assert.equal(s.auctions!.filter(a=>a.title==='Walk').length,1,'a keyed retry adds no second lot');

    const pointsBeforeBids=s.points;
    await op(h,'auction-bid',{key:randomUUID(),auction:lotA.id,amount:4},409,'Bid is below the minimum');
    await op(w,'auction-bid',{key:randomUUID(),auction:lotA.id,amount:6},403,'Wrong role for action');
    await op(h,'auction-bid',{key:randomUUID(),auction:randomUUID(),amount:6},404,'Auction unavailable');
    await bid(lotA.id,5);
    await op(h,'auction-bid',{key:randomUUID(),auction:lotA.id,amount:5},409,'Bid must beat the current highest bid');
    await bid(lotA.id,6);
    const nineBody={key:randomUUID(),auction:lotA.id,amount:9};
    const nine=await op(h,'auction-bid',nineBody);
    assert.deepEqual(await op(h,'auction-bid',nineBody),nine,'a keyed bid retry returns the original response');
    assert.equal(JSON.stringify(nine).includes('"points"'),false,'a bid response carries no balance');
    await op(h,'auction-bid',{key:randomUUID(),auction:lotA.id,amount:100001},400);
    await op(h,'auction-bid',{key:randomUUID(),auction:lotA.id,amount:1.5},400);
    await bid(lotB.id,8);
    await bid(lotD.id,5);
    s=await state();
    assert.deepEqual((await lotNamed('Dinner date')).bids.map(x=>x.amount),[5,6,9]);
    assert.equal(s.points,pointsBeforeBids,'bids do not move or lock points');
    assert.equal((await husbandSession()).auctions!.length,5,'the husband sees the lots and his bids');

    // A bid of exactly the balance is charged; a bid above the balance voids; an empty lot closes as no-bids.
    const herBefore=s.herPoints;
    await ageLot(lotA.id);
    s=await state();
    const closedA=s.auctions!.find(a=>a.id===lotA.id)!;
    assert.deepEqual([closedA.status,closedA.outcome,closedA.winningBid],['closed','charged',9]);
    assert.equal(s.points,1,'the winning bid is burned from the husband only');
    assert.equal(s.herPoints,herBefore,'nothing is credited to the wife');
    await edit(row=>{row.points=5;row.auctions!.find(a=>a.id===lotB.id)!.closesAt=Date.now()-1000;});
    s=await state();
    const voidB=s.auctions!.find(a=>a.id===lotB.id)!;
    assert.deepEqual([voidB.status,voidB.outcome,voidB.winningBid],['void','void',undefined]);
    assert.equal(s.points,5,'an uncovered bid charges nothing');
    await ageLot(lotC.id);
    s=await state();
    assert.deepEqual([s.auctions!.find(a=>a.id===lotC.id)!.status,s.auctions!.find(a=>a.id===lotC.id)!.outcome],['closed','no-bids']);
    await ageLot(lotD.id);
    s=await state();
    assert.deepEqual([s.auctions!.find(a=>a.id===lotD.id)!.outcome,s.points],['charged',0],'a balance equal to the bid is enough');

    const settled=structuredClone(s.auctions);
    s=await state();
    assert.deepEqual(s.auctions,settled,'a closed lot never changes on later reads');
    assert.equal(s.points,0,'later reads charge nothing again');
    assert.equal(s.history.filter(n=>n.event==='auction-close').length,4,'each lot closes exactly once');
    await op(h,'auction-bid',{key:randomUUID(),auction:lotA.id,amount:12},409,'Auction is closed');

    // Holds: bids are accepted while paused, creation is gated, and a due lot voids without charge.
    const lotF=(await newLot('Held lot',2)).auction;
    await bid(lotF.id,3);
    await op(h,'pause',{});
    await bid(lotF.id,4);
    await op(w,'auction',{key:randomUUID(),title:'Paused',description:'Paused',minBid:1,closesAt:Date.now()+3600000},409,'Mutual approval and no pauses required');
    await ageLot(lotF.id);
    s=await state();
    assert.deepEqual([s.auctions!.find(a=>a.id===lotF.id)!.status,s.auctions!.find(a=>a.id===lotF.id)!.outcome],['void','void']);
    assert.equal(s.points,0,'a lot due during a hold never charges');
    await op(h,'resume',{});

    // The list cap is enforced at 50 stored lots; the filler rows are removed again afterwards.
    const filler={id:randomUUID(),title:'Filler',description:'Filler',minBid:1,closesAt:0,status:'closed' as const,bids:[],createdAt:0,outcome:'no-bids' as const};
    await edit(row=>{while(row.auctions!.length<50)row.auctions!.push({...filler,id:randomUUID()});});
    await op(w,'auction',{key:randomUUID(),title:'Full',description:'Full',minBid:1,closesAt:Date.now()+3600000},409,'Auction list is full');
    await edit(row=>{row.auctions=row.auctions!.filter(a=>a.title!=='Filler');});
    s=await state();
    assert.equal(s.auctions!.length,6);

    const auctionNotices=s.history.filter(n=>n.event.startsWith('auction'));
    const closeNotices=auctionNotices.filter(n=>n.event==='auction-close');
    assert.deepEqual(closeNotices.map(n=>n.outcome).sort(),['charged','charged','no-bids','void','void']);
    for(const n of closeNotices)assert.deepEqual(Object.keys(n).sort(),['at','by','event','outcome']);
    for(const n of auctionNotices.filter(n=>n.event!=='auction-close'))assert.deepEqual(Object.keys(n).sort(),['at','by','event']);
    const inboxAuction=s.inbox.filter(n=>n.event.startsWith('auction'));
    assert.equal(inboxAuction.length,auctionNotices.length);
    for(const n of inboxAuction)assert.deepEqual(Object.keys(n).sort(),['at','event','id','readBy']);
    const noticeText=JSON.stringify([...auctionNotices,...inboxAuction]);
    for(const lot of [lotA,lotB,lotC,lotD,lotE,lotF])assert.equal(noticeText.includes(lot.id)||noticeText.includes(lot.title),false,'auction notices carry no id or title');
    assert.deepEqual((await husbandSession()).history.filter(n=>n.event.startsWith('auction')),auctionNotices,'the husband sees the same content-free notices');
    console.log('PASS auctions: wife-only lots with validation and caps, husband-only keyed bids below minimum or beating, bids reserve nothing, exact-balance charge burned, uncovered and held lots void, closed lots stay closed, content-free notices');
  }

  // Terminal sessions still reject new play, including quick commands, ratings, nights and evenings.
  await op(w,'stop',{});
  assert.equal((await sparkState(w)).spark,null,'a terminal session offers no spark');
  await op(w,'quick',{preset:preset.id,key:randomUUID()},409,'Session is terminal');
  await op(w,'rate',{mission:quick.id,rating:'skip'},409,'Session is terminal');
  await op(h,'adore',{mission:quick.id,adoration:'ok',key:randomUUID()},409,'Session is terminal');
  await op(w,'her-night',{...nightPayload,key:randomUUID()},409,'Session is terminal');
  await op(w,'evening-close',{key:randomUUID()},409,'Session is terminal');
  await op(w,'repeat-stop',{key:randomUUID(),mission:quick.id},409,'Session is terminal');
  await op(w,'evening-save',{name:'Late',mood:'soft',steps:[nightStep]},409,'Session is terminal');
  await op(h,'whisper',{key:randomUUID(),text:'After stop'},409,'Session is terminal');
  await op(w,'whisper-delete',{key:randomUUID(),whisper:whisperIds[1]},409,'Session is terminal');
  await op(w,'season-start',{key:randomUUID(),pack:seasonPacks[0].id,lang:'en'},409,'Session is terminal');
  await op(w,'season-stop',{key:randomUUID()},409,'Session is terminal');
  await op(w,'wheel-config',{key:randomUUID(),cost:1},409,'Session is terminal');
  await op(w,'wheel-spin',{key:randomUUID()},409,'Session is terminal');
  await op(w,'auction',{key:randomUUID(),title:'Late',description:'Late',minBid:1,closesAt:Date.now()+3600000},409,'Session is terminal');
  await op(h,'auction-bid',{key:randomUUID(),auction:lateLotId,amount:3},409,'Session is terminal');
  assert.deepEqual(((await state()).auctions!.find(a=>a.id===lateLotId)!).outcome,'void','open auctions void when the session stops');
  assert.equal(JSON.stringify(await whisperHusbandView()).includes('After stop'),false);
  console.log('PASS play flow: approvals, quick commands, keyed retries, scheduling, review points, wishes with cooldown, private commands, aftercare, her night, quick ratings, adoration feedback with keyed retry, overwrite, hold and terminal rules, private notes, progress helpers, pacing, done for tonight, saved evenings, night cap, whisper box, terminal guard');

  // Trophy case: session-scoped pins of approved work, written completions and reflections. A pin is a reference resolved for each viewer; withheld content reaches the husband only as a placeholder; curation stays open after the session ends.
  {
    const trophyTitle='Trophy mission 9f3a',completionText='Trophy completion body 9f3a';
    const wifeId=(await w('/state')).user.id as string,husbandId=(await h('/state')).user.id as string;
    const trophy=(await w('/sessions',{terms:'Trophy case terms: welcome, boundaries and a check-in after each evening',minutes:600})).session.id as string;
    const tOp=(who:typeof w,name:string,body:Record<string,unknown>={},status:number|number[]=200,error?:string)=>who(`/sessions/${trophy}/${name}`,body,status,error);
    const tState=async(who:typeof w=w):Promise<Session>=>(await who(`/sessions/${trophy}`)).session;
    const tEdit=async(change:(row:Session)=>void)=>{const row=(await pool.query('SELECT data FROM sessions WHERE id=$1',[trophy])).rows[0].data as Session;change(row);await pool.query('UPDATE sessions SET data=$2 WHERE id=$1',[trophy,JSON.stringify(row)]);};
    const draft=async(title:string,text:string,extra:Record<string,unknown>={})=>(await tOp(w,'mission',{key:randomUUID(),title,text,points:1,secret:false,completionStyle:'written',...extra})).mission as Mission;
    const approvedWork=async(title:string,completion:string)=>{const m=await draft(title,`${title} text`);await tOp(w,'deliver',{mission:m.id});await tOp(h,'ack',{mission:m.id});await tOp(h,'complete',{mission:m.id,text:completion,expectedVersion:0,key:randomUUID()});await tOp(w,'review',{mission:m.id,approve:true,submissionVersion:1,key:randomUUID()});return m;};
    for(const who of [w,h])await tOp(who,'approve',{revision:1});

    const approved=await approvedWork(trophyTitle,completionText);
    const pinKey=randomUUID();
    const pinMission=await tOp(w,'pin',{key:pinKey,kind:'mission',ref:approved.id});
    assert.deepEqual(Object.keys(pinMission.pin).sort(),['at','id','kind'],'a pin response carries only the pin id, kind and time');
    assert.deepEqual(await tOp(w,'pin',{key:pinKey,kind:'mission',ref:approved.id}),pinMission,'a keyed pin retry returns the original response');
    const pinCompletion=await tOp(w,'pin',{key:randomUUID(),kind:'completion',ref:approved.id});
    await tOp(w,'reflection',{appreciation:'Thank you for the slow evening',repeat:'More walks'});
    await tOp(h,'reflection',{appreciation:'Your patience',repeat:''});
    const pinWifeReflection=await tOp(w,'pin',{key:randomUUID(),kind:'reflection',ref:wifeId});
    const pinHusbandReflection=await tOp(w,'pin',{key:randomUUID(),kind:'reflection',ref:husbandId});

    // Roles, duplicates, unknown refs, malformed bodies and the completion rules.
    await tOp(h,'pin',{key:randomUUID(),kind:'mission',ref:approved.id},403,'Wrong role for action');
    await tOp(h,'unpin',{key:randomUUID(),pin:pinMission.pin.id},403,'Wrong role for action');
    await tOp(w,'pin',{key:randomUUID(),kind:'mission',ref:approved.id},409,'Already pinned');
    await tOp(w,'pin',{key:randomUUID(),kind:'mission',ref:randomUUID()},404,'Pin target unavailable');
    await tOp(w,'pin',{key:randomUUID(),kind:'reflection',ref:randomUUID()},404,'Pin target unavailable');
    await tOp(w,'pin',{key:randomUUID(),kind:'bogus',ref:approved.id},400);
    await tOp(w,'pin',{key:randomUUID(),kind:'mission',ref:'not-a-uuid'},400);
    await tOp(w,'pin',{kind:'mission',ref:approved.id},400);
    const bare=await draft('Trophy bare title 7c1e','No completion yet 7c1e');
    await tOp(w,'pin',{key:randomUUID(),kind:'completion',ref:bare.id},409,'Completion required');
    const empty=await draft('Trophy empty title 7c1e','Empty completion 7c1e',{completionStyle:'simple'});
    await tOp(w,'deliver',{mission:empty.id});await tOp(h,'ack',{mission:empty.id});
    await tOp(h,'complete',{mission:empty.id,text:'',expectedVersion:0,key:randomUUID()});
    await tOp(w,'pin',{key:randomUUID(),kind:'completion',ref:empty.id},409,'Completion required');

    // Resolved gallery: newest first, per-kind content, the same for both roles when everything is visible.
    let view=await tState();
    assert.deepEqual(view.trophies!.map(entry=>entry.id),[pinHusbandReflection.pin.id,pinWifeReflection.pin.id,pinCompletion.pin.id,pinMission.pin.id],'newest pin first');
    const [husbandReflection,wifeReflection,completionEntry,missionEntry]=view.trophies!;
    assert.deepEqual(husbandReflection,{id:pinHusbandReflection.pin.id,kind:'reflection',at:husbandReflection.at,author:'husband',text:'Your patience'});
    assert.deepEqual(wifeReflection,{id:pinWifeReflection.pin.id,kind:'reflection',at:wifeReflection.at,author:'wife',text:'Thank you for the slow evening\nMore walks'});
    assert.deepEqual(completionEntry,{id:pinCompletion.pin.id,kind:'completion',at:completionEntry.at,author:'husband',text:completionText});
    assert.deepEqual(missionEntry,{id:pinMission.pin.id,kind:'mission',at:missionEntry.at,author:'wife',title:trophyTitle,text:`${trophyTitle} text`});
    const husbandView=await tState(h);
    assert.deepEqual(husbandView.trophies,view.trophies,'both roles see the same resolved content for visible work');
    assert.equal(husbandView.pins!.every(pin=>!('ref' in pin)),true,'the husband sees pin ids and kinds, never refs');

    // Withheld content: a pinned secret draft and a sealed surprise reach him only as placeholders; the wife sees them.
    const secret=await draft('Trophy secret title 7c1e','Trophy secret body 7c1e',{secret:true});
    await tOp(w,'pin',{key:randomUUID(),kind:'mission',ref:secret.id});
    const secretPin=(await tState()).pins!.find(pin=>pin.ref===secret.id)!;
    const surprise=(await tOp(w,'mission',{key:randomUUID(),title:'Trophy surprise title 7c1e',text:'Trophy surprise body 7c1e',points:1,secret:false,surprise:true,category:'Trophy surprise category 7c1e',completionStyle:'simple'})).mission as Mission;
    await tOp(w,'queue',{mission:surprise.id,scheduledAt:Date.now()+3600000});
    await tOp(w,'pin',{key:randomUUID(),kind:'mission',ref:surprise.id});
    const surprisePin=(await tState()).pins!.find(pin=>pin.ref===surprise.id)!;
    let husbandJson=JSON.stringify(await tState(h));
    for(const hidden of ['Trophy secret title 7c1e','Trophy secret body 7c1e','Trophy surprise title 7c1e','Trophy surprise body 7c1e','Trophy surprise category 7c1e',secret.id])assert.equal(husbandJson.includes(hidden),false,`a withheld pin leaked ${hidden}`);
    assert.deepEqual((await tState(h)).trophies!.filter(entry=>entry.hidden),[{kind:'mission',at:surprisePin.at,hidden:true},{kind:'mission',at:secretPin.at,hidden:true}],'a withheld pin is kind, time and hidden only');
    assert.deepEqual((await tState()).trophies!.find(entry=>entry.id===secretPin.id),{id:secretPin.id,kind:'mission',at:secretPin.at,author:'wife',title:'Trophy secret title 7c1e',text:'Trophy secret body 7c1e'},'the wife sees the withheld secret');
    await tOp(w,'deliver',{mission:secret.id});
    assert.deepEqual((await tState(h)).trophies!.find(entry=>entry.id===secretPin.id),{id:secretPin.id,kind:'mission',at:secretPin.at,author:'wife',title:'Trophy secret title 7c1e',text:'Trophy secret body 7c1e'},'after delivery the husband sees the title');

    // Fill to the cap with a seeded sequence: 30 pins exactly; the 31st is refused; an unpin frees one slot.
    const doomed=await draft('Trophy doomed title 7c1e','Trophy doomed body 7c1e');
    await tOp(w,'pin',{key:randomUUID(),kind:'mission',ref:doomed.id});
    for(let i=1;i<=23;i++){const filler=await draft(`Trophy filler ${i}`,`Trophy filler text ${i}`);await tOp(w,'pin',{key:randomUUID(),kind:'mission',ref:filler.id});}
    assert.equal((await tState()).pins!.length,30,'thirty pins fill the case');
    const overflow=await draft('Trophy overflow title 7c1e','Trophy overflow body 7c1e');
    await tOp(w,'pin',{key:randomUUID(),kind:'mission',ref:overflow.id},409,'Trophy case is full');
    await tOp(w,'unpin',{key:randomUUID(),pin:randomUUID()},404,'Pin unavailable');
    await tOp(w,'unpin',{key:randomUUID(),pin:'not-a-uuid'},400);
    const unpinKey=randomUUID();
    const unpinned=await tOp(w,'unpin',{key:unpinKey,pin:pinMission.pin.id});
    assert.deepEqual(await tOp(w,'unpin',{key:unpinKey,pin:pinMission.pin.id}),unpinned,'a keyed unpin retry replays its response');
    assert.equal((await tState()).pins!.length,29,'an unpin frees one slot');
    await tOp(w,'pin',{key:randomUUID(),kind:'mission',ref:overflow.id});
    assert.equal((await tState()).pins!.length,30);

    // Missing refs: a deleted mission and a deleted reflection resolve to missing for both viewers, with the pin id so the wife can remove them.
    const doomedPin=(await tState()).pins!.find(pin=>pin.ref===doomed.id)!;
    await tEdit(row=>{row.missions=row.missions.filter(m=>m.id!==doomed.id);});
    const missingMission={id:doomedPin.id,kind:'mission',at:doomedPin.at,missing:true};
    assert.deepEqual((await tState()).trophies!.find(entry=>entry.id===doomedPin.id),missingMission);
    assert.deepEqual((await tState(h)).trophies!.find(entry=>entry.id===doomedPin.id),missingMission);
    await tEdit(row=>{delete row.reflections![husbandId];});
    assert.deepEqual((await tState()).trophies!.find(entry=>entry.id===pinHusbandReflection.pin.id),{id:pinHusbandReflection.pin.id,kind:'reflection',at:husbandReflection.at,missing:true});

    // Holds do not block curation: pausing, unpinning and re-pinning all work.
    await tOp(h,'pause',{});
    const heldPin=(await tState()).pins!.find(pin=>pin.kind==='reflection'&&pin.ref===wifeId)!;
    await tOp(w,'unpin',{key:randomUUID(),pin:heldPin.id});
    await tOp(w,'pin',{key:randomUUID(),kind:'reflection',ref:wifeId});
    await tOp(h,'resume',{});

    // Notices are content-free: the event only, in history and inbox, for both roles.
    const notices=(await tState()).history.filter(item=>['pin','unpin'].includes(item.event));
    assert.ok(notices.some(item=>item.event==='pin')&&notices.some(item=>item.event==='unpin'),'pins and unpins write notices');
    for(const item of notices)assert.deepEqual(Object.keys(item).sort(),['at','by','event'],'a pin notice has no id, title, text or ref');
    const inboxNotices=(await tState()).inbox.filter(item=>['pin','unpin'].includes(item.event));
    for(const item of inboxNotices)assert.deepEqual(Object.keys(item).sort(),['at','event','id','readBy']);
    const noticeText=JSON.stringify([...notices,...inboxNotices,...(await tState(h)).history.filter(item=>['pin','unpin'].includes(item.event))]);
    for(const title of [trophyTitle,'Trophy secret title 7c1e','Trophy surprise title 7c1e','Trophy doomed title 7c1e',completionText])assert.equal(noticeText.includes(title),false,`a curation notice carries ${title}`);

    // Ended sessions: pin and unpin still work, the new session refuses play, and the archive keeps resolving for both roles.
    await tOp(w,'stop',{});
    const surpriseAgain=(await tState()).pins!.find(pin=>pin.ref===surprise.id)!;
    await tOp(w,'unpin',{key:randomUUID(),pin:surpriseAgain.id});
    const repinned=await tOp(w,'pin',{key:randomUUID(),kind:'mission',ref:surprise.id});
    assert.ok(repinned.pin.id,'a pin works on an ended session');
    await tOp(w,'mission',{key:randomUUID(),title:'After stop',text:'After stop',points:1},409,'Session is terminal');
    await tOp(w,'pin',{key:randomUUID(),kind:'completion',ref:approved.id},409,'Already pinned');
    const archivedWife=(await w(`/state`)).sessions.find((x:any)=>x.id===trophy) as Session;
    const archivedHusband=(await tState(h));
    assert.equal(archivedWife.status,'stopped');
    assert.equal(archivedWife.trophies!.length,30,'the wife archive resolves all pins');
    assert.equal(archivedHusband.trophies!.length,30,'the husband archive resolves all pins');
    assert.equal(archivedHusband.trophies!.filter(entry=>entry.hidden).length,1,'the cancelled surprise stays a placeholder for him');
    assert.deepEqual(archivedHusband.trophies!.find(entry=>entry.id===secretPin.id),{id:secretPin.id,kind:'mission',at:secretPin.at,author:'wife',title:'Trophy secret title 7c1e',text:'Trophy secret body 7c1e'},'delivered work stays readable in the archive');
    console.log('PASS trophy case: pins of missions, completions and reflections with keyed retries, 30-pin cap and unpin freeing a slot, completion text required, per-viewer placeholders for withheld and missing refs, content-free notices, pins and unpins on an ended session');
  }
} finally {
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  await pool.end();await db.stop();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
