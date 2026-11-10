import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp, type Session } from '../server/app.ts';

const directory=await mkdtemp(join(tmpdir(),'her-rules-experience-'));
const db=await startDatabase(directory,55440),pool=new pg.Pool({connectionString:db.url});
let server:ReturnType<Awaited<ReturnType<typeof createApp>>['listen']>|undefined;
try {
  const app=await createApp(pool,'http://localhost:4194');
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
      const data=await response.json();assert.ok((Array.isArray(status)?status:[status]).includes(response.status),`${path}: expected ${status}, got ${response.status}: ${JSON.stringify(data)}`);return Array.isArray(status)?{...data,_status:response.status}:data;
    };
  }
  const w=await account('wife'),h=await account('husband');
  let id=(await w('/sessions',{terms:'Small optional invitations and independent boundaries',minutes:30})).session.id;
  const action=(who:typeof w,op:string,body:Record<string,unknown>={},status=200)=>who(`/sessions/${id}/${op}`,body,status);
  const state=async():Promise<Session>=>(await w(`/sessions/${id}`)).session;
  const create=async(secret=false)=>(await action(w,'mission',{key:randomUUID(),title:'Original invitation',text:'Share a quiet conversation',points:7,secret})).mission;
  const approve=async()=>{for(const who of [w,h])await action(who,'approve',{revision:(await state()).revision});};
  // Trusting a supplied identity, accepting invalid values, or gating check-ins on play must fail here.
  const wifeId=(await w('/state')).user.id,husbandId=(await h('/state')).user.id;
  const checkin={minutes:15,energy:'low',mood:'quiet'};
  const gameplayState=(s:Session)=>{const {last,checkIns,reflections,history,inbox,...rest}=s;return rest;};
  const unchecked=await state();assert.equal(unchecked.checkIns,undefined);
  // Reflection is caller-owned, replaceable and never changes play, including terminal sessions.
  const reflectState=(s:Session)=>{const {last,reflections,history,inbox,...rest}=s;return rest;};
  async function reflection(){
    const before=await state();
    for(const invalid of [{},{appreciation:'  ',repeat:''},{appreciation:'x'.repeat(1001)},{repeat:'x'.repeat(1001)},{appreciation:null},{repeat:3}])await action(w,'reflection',invalid,400);
    const body={appreciation:' Thank you ',repeat:' ',userId:husbandId,reflections:{[husbandId]:{appreciation:'Spoof'}}};
    await Promise.all([action(w,'reflection',body),action(w,'reflection',body)]);
    const retryBefore=await state();await action(w,'reflection',body);const retryAfter=await state();
    assert.deepEqual(retryAfter.history,retryBefore.history);assert.deepEqual(retryAfter.inbox,retryBefore.inbox);
    await action(h,'reflection',{repeat:' Another quiet conversation '});
    await action(w,'reflection',{appreciation:'x'.repeat(1000),repeat:' Again '});
    const after=await state();assert.deepEqual(reflectState(after),reflectState(before));
    assert.deepEqual(after.reflections,{[wifeId]:{appreciation:'x'.repeat(1000),repeat:'Again'},[husbandId]:{appreciation:'',repeat:'Another quiet conversation'}});
    assert.deepEqual((await h(`/sessions/${id}`)).session.reflections,after.reflections);
  }
  assert.equal(unchecked.reflections,undefined);await reflection();
  await action(w,'checkin',{...checkin,userId:husbandId,by:husbandId,checkIns:{[husbandId]:checkin}});
  let checked=await state();
  assert.deepEqual(checked.checkIns,{[wifeId]:checkin});
  assert.deepEqual(gameplayState(checked),gameplayState(unchecked));
  for(const invalid of [{minutes:0},{minutes:1441},{minutes:1.5},{minutes:'15'},{minutes:null},{energy:'other'},{mood:'other'},{energy:null},{mood:null}]){
    await action(w,'checkin',{...checkin,...invalid},400);
    assert.deepEqual((await state()).checkIns,checked.checkIns);
  }
  await action(h,'checkin',{minutes:1440,energy:'high',mood:'playful'});
  await action(w,'checkin',{minutes:1,energy:'medium',mood:'connection'});
  checked=await state();
  assert.deepEqual(checked.checkIns,{[wifeId]:{minutes:1,energy:'medium',mood:'connection'},[husbandId]:{minutes:1440,energy:'high',mood:'playful'}});
  assert.deepEqual((await h(`/sessions/${id}`)).session.checkIns,checked.checkIns);
  assert.deepEqual((await h('/state')).sessions.find((s:Session)=>s.id===id).checkIns,checked.checkIns);
  await action(w,'mission',{key:randomUUID(),title:'Still held',text:'Check-in is not approval'},409);
  // Reward creation is gameplay and must remain blocked until both approve.
  await action(w,'reward',{key:randomUUID(),title:'Tea',description:'A shared cup',cost:0},409);
  // A misplaced gameplay guard must not block communication or let it resume the clock.
  const before=await state(),message={key:randomUUID(),text:'Let us review at our own pace'};
  const messages=await Promise.all([action(w,'message',message),action(w,'message',message)]);
  assert.deepEqual(messages[0],messages[1]);
  assert.equal((await state()).messages.length,1);assert.deepEqual((await state()).approvals,[]);
  await approve();
  await action(h,'persona',{persona:'playful'},403);
  await action(w,'persona',{persona:'unknown'},400);
  await action(w,'persona',{persona:'playful'});
  assert.equal((await h(`/sessions/${id}`)).session.persona,'playful');
  await action(h,'followup',{text:'Share a cup of tea'},403);
  await action(w,'followup',{text:'   '},400);
  await action(w,'followup',{text:' Share a cup of tea '});
  assert.deepEqual((await h(`/sessions/${id}`)).session.followups,['Share a cup of tea']);
  const reward=(await action(w,'reward',{key:randomUUID(),title:'Tea',description:'A shared cup',cost:0})).reward;
  assert.equal(reward.cost,0);
  // Style defaults/immutability, legacy fallback, and review CAS must survive both styles.
  for(const style of ['simple','written','legacy'] as const){
    const m=(await action(w,'mission',{key:randomUUID(),title:'Completion choice',text:'Optional conversation',points:0,...(style==='written'?{completionStyle:'written'}:{})})).mission;
    assert.equal(m.completionStyle,style==='written'?'written':'simple');
    if(style==='legacy')await pool.query("UPDATE sessions SET data=jsonb_set(data,'{missions}',(SELECT jsonb_agg(value - 'completionStyle') FROM jsonb_array_elements(data->'missions'))) WHERE id=$1",[id]);
    await action(w,'deliver',{mission:m.id});
    await action(w,'edit',{mission:m.id,title:'Changed',text:'Changed',points:3,secret:false,completionStyle:'simple'},409);
    await action(h,'complete',{mission:m.id,key:randomUUID(),expectedVersion:0},409);
    await action(h,'ack',{mission:m.id});
    if(style!=='simple')for(const text of [undefined,'','   '])await action(h,'complete',{mission:m.id,key:randomUUID(),expectedVersion:0,text},400);
    const body={mission:m.id,key:randomUUID(),expectedVersion:0,...(style!=='simple'?{text:' A kind note '}:{})};
    const submitted=await action(h,'complete',body);assert.equal(submitted.completion,style==='simple'?'':'A kind note');
    assert.deepEqual(await action(h,'complete',body),submitted);
    await action(w,'review',{mission:m.id,key:randomUUID(),submissionVersion:0,approve:true},409);
    await action(w,'review',{mission:m.id,key:randomUUID(),submissionVersion:1,approve:false});
    await action(h,'complete',{...body,key:randomUUID()},409);
    await action(h,'complete',{...body,key:randomUUID(),expectedVersion:1,text:style==='simple'?'':'Updated note'});
    const review={mission:m.id,key:randomUUID(),submissionVersion:2,approve:true};
    const approved=await action(w,'review',review);assert.deepEqual(await action(w,'review',review),approved);
    await action(w,'review',{...review,key:randomUUID()},409);
  }
  assert.equal((await state()).points,0);
  for(const completionStyle of ['invalid',null,1])await action(w,'mission',{key:randomUUID(),title:'Bad style',text:'Optional',completionStyle},400);
  const editable=await create();
  await action(w,'edit',{mission:editable.id,title:editable.title,text:editable.text,points:7,secret:false,completionStyle:'written'});
  await action(w,'edit',{mission:editable.id,title:editable.title,text:editable.text,points:7,secret:false});
  assert.equal((await state()).missions.find(m=>m.id===editable.id)?.completionStyle,'written','Old edit callers preserve style');
  await action(w,'edit',{mission:editable.id,title:editable.title,text:editable.text,points:7,secret:false,completionStyle:'invalid'},400);
  await action(w,'deliver',{mission:editable.id});await action(h,'adjust',{mission:editable.id,key:randomUUID(),reason:'adjust'});
  await action(w,'replace',{mission:editable.id,key:randomUUID(),title:'Replacement',text:'Optional',completionStyle:'invalid'},400);
  const replacement=(await action(w,'replace',{mission:editable.id,key:randomUUID(),title:'Replacement',text:'Optional',completionStyle:'written'})).mission;
  assert.equal(replacement.completionStyle,'written');await action(w,'cancel',{mission:replacement.id});
  const rawBefore=(await pool.query('SELECT data FROM sessions WHERE id=$1',[id])).rows[0].data;
  await action(w,'reflection',{repeat:'Active reflection leaves the clock alone'});
  const rawAfter=(await pool.query('SELECT data FROM sessions WHERE id=$1',[id])).rows[0].data;
  assert.equal(rawAfter.last,rawBefore.last);assert.deepEqual(reflectState(rawAfter),reflectState(rawBefore));
  // Sequence edits must be wife-only, guarded, validated and presentation-only.
  assert.equal((await state()).sequence,undefined);
  const seqA=await create(),seqB=await create(true),seqC=await create();
  await action(h,'sequence',{missions:[seqA.id]},403);
  for(const missions of [[seqA.id,seqA.id],[seqA.id,seqB.id,seqC.id,randomUUID()],['bad'],null])await action(w,'sequence',{missions},400);
  await action(w,'sequence',{missions:[randomUUID()]},404);
  const sequenceBefore=await state();
  await action(w,'sequence',{missions:[seqC.id,seqB.id,seqA.id]});
  const sequenced=await state();
  assert.deepEqual(sequenced.sequence,[seqC.id,seqB.id,seqA.id]);
  assert.deepEqual(sequenced.missions,sequenceBefore.missions);
  assert.equal(sequenced.points,sequenceBefore.points);
  assert.deepEqual(sequenced.approvals,sequenceBefore.approvals);
  assert.deepEqual((await h(`/sessions/${id}`)).session.sequence,[seqC.id,seqA.id],'Hidden secret IDs must not leak through sequence');
  for(const who of [w,h]){
    await action(who,'pause');await action(w,'sequence',{missions:[]},409);await action(who,'resume');
  }
  await action(w,'sequence',{missions:[]});assert.deepEqual((await state()).sequence,[]);
  for(const owner of [w,h])await action(owner,'pause');
  const frozen=await state();
  await reflection();
  for(const who of [w,h])await action(who,'checkin',checkin);
  assert.deepEqual(gameplayState(await state()),gameplayState(frozen));
  for(const who of [w,h])await action(who,'message',{key:randomUUID(),text:'We can still talk'});
  await pool.query("UPDATE sessions SET data=jsonb_set(data,'{last}',to_jsonb($2::bigint)) WHERE id=$1",[id,Date.now()-60000]);
  assert.equal((await state()).remaining,frozen.remaining);assert.deepEqual((await state()).pauses,frozen.pauses);
  await action(w,'resume');
  await action(w,'message',{key:randomUUID(),text:'Your pause remains yours'});
  assert.equal((await state()).pauses.length,1);await action(h,'resume');
  console.log('PASS experience: chat before approvals and during both personal pauses, duplicate retry, frozen clock and unchanged holds');

  // Losing role/state checks, draft validation, or the replacement transaction must fail these assertions.
  let committedAdjustment:any,committedReplacement:any;
  for(const starting of ['pending','acknowledged','revision']) {
    const m=await create(starting==='revision');
    await action(w,'adjust',{key:randomUUID(),mission:m.id,reason:'softer'},403);
    await action(h,'adjust',{key:randomUUID(),mission:m.id,reason:'softer'},409);
    await action(w,'deliver',{mission:m.id});
    if(starting!=='pending')await action(h,'ack',{mission:m.id});
    if(starting==='revision'){
      await action(h,'complete',{mission:m.id,key:randomUUID(),expectedVersion:0,text:'Earlier written work'});
      await action(w,'review',{mission:m.id,key:randomUUID(),submissionVersion:1,approve:false});
    }
    const original=(await state()).missions.find(v=>v.id===m.id)!;
    const request={key:randomUUID(),mission:m.id,reason:starting==='pending'?'softer':'adjust',...(starting==='pending'?{}:{note:' A shorter invitation please '})};
    await action(h,'adjust',{...request,reason:'other'},400);
    await action(h,'adjust',{...request,note:'x'.repeat(4001)},400);
    await action(h,'adjust',{...request,key:'bad'},400);
    const adjusted=await Promise.all([action(h,'adjust',request),action(h,'adjust',request)]);assert.deepEqual(adjusted[0],adjusted[1]);
    const waiting=(await state()).missions.find(v=>v.id===m.id)!;
    assert.equal(waiting.status,'adjustment');
    assert.deepEqual({...waiting,status:original.status,adjustment:undefined},{...original,adjustment:undefined});
    assert.equal(waiting.adjustment?.reason,request.reason);
    assert.equal(waiting.adjustment?.note,starting==='pending'?undefined:'A shorter invitation please');
    await action(h,'adjust',{...request,key:randomUUID()},409);
    await action(h,'ack',{mission:m.id},409);
    await action(h,'complete',{mission:m.id,key:randomUUID(),expectedVersion:original.submissionVersion??0,text:'Not accepted'},409);
    await action(w,'review',{mission:m.id,key:randomUUID(),submissionVersion:original.submissionVersion??0,approve:true},409);
    await action(w,'edit',{mission:m.id,title:'Mutated',text:'Mutated',points:0,secret:false},409);
    const replacement={key:randomUUID(),mission:m.id,title:'Shorter invitation',text:'Share one kind thought',points:3,secret:original.secret};
    await action(h,'replace',replacement,403);
    for(const invalid of [{title:' '},{text:' '},{points:-1},{points:101},{points:1.5},{title:'x'.repeat(161)},{text:'x'.repeat(4001)},{secret:'yes'}])await action(w,'replace',{...replacement,...invalid},400);
    assert.equal((await state()).missions.find(v=>v.id===m.id)!.status,'adjustment');
    await action(h,'pause');
    await action(w,'replace',replacement,409);await action(h,'adjust',{...request,key:randomUUID()},409);
    await action(h,'resume');
    if(starting==='pending'){
      // Fail after constructing the replacement to prove cancellation and retry storage roll back together.
      await pool.query("ALTER TABLE request_keys ADD CONSTRAINT reject_replacement CHECK(kind<>'replace') NOT VALID");
      try {
        await action(w,'replace',replacement,500);
        const rolledBack=await state();
        assert.equal(rolledBack.missions.find(v=>v.id===m.id)!.status,'adjustment');
        assert.equal(rolledBack.missions.filter(v=>v.replaces===m.id).length,0);
        assert.equal((await pool.query('SELECT count(*) FROM request_keys WHERE key=$1',[replacement.key])).rows[0].count,'0');
      } finally {await pool.query('ALTER TABLE request_keys DROP CONSTRAINT reject_replacement');}
    }
    const replacements=await Promise.all([action(w,'replace',replacement),action(w,'replace',replacement)]);assert.deepEqual(replacements[0],replacements[1]);
    committedAdjustment={body:request,result:adjusted[0]};committedReplacement={body:replacement,result:replacements[0]};
    const next=replacements[0].mission;
    assert.equal(next.status,'draft');assert.equal(next.replaces,m.id);assert.equal(next.revision,1);
    assert.equal(next.title,'Shorter invitation');assert.equal(next.text,'Share one kind thought');assert.equal(next.points,3);
    assert.equal(next.acknowledgedAt,undefined);assert.equal(next.submissionVersion,undefined);assert.equal(next.completion,undefined);
    const replaced=(await state()).missions.find(v=>v.id===m.id)!;
    assert.equal(replaced.replacementId,next.id);assert.equal(replaced.status,'cancelled');
    assert.equal(replaced.text,original.text);assert.equal(replaced.title,original.title);assert.equal(replaced.points,original.points);assert.equal(replaced.completion,original.completion);
    assert.equal((await state()).missions.filter(v=>v.replaces===m.id).length,1);
    await action(w,'replace',{...replacement,key:randomUUID()},409);
    const husband=(await h(`/sessions/${id}`)).session as Session;
    assert.equal(husband.missions.some(v=>v.id===next.id),!original.secret,'Preserve existing nonsecret draft visibility and secret exclusion');
    await action(h,'complete',{mission:next.id,key:randomUUID(),expectedVersion:0,text:'Before delivery'},409);
    await action(w,'deliver',{mission:next.id});
    await action(h,'complete',{mission:next.id,key:randomUUID(),expectedVersion:0,text:'Before acknowledgement'},409);
    await action(h,'ack',{mission:next.id});
    await action(h,'complete',{mission:next.id,key:randomUUID(),expectedVersion:0,text:'A kind thought'});
    const review={mission:next.id,key:randomUUID(),submissionVersion:1,approve:true};
    await Promise.all([action(w,'review',review),action(w,'review',review)]);
    await action(w,'pause');assert.deepEqual(await action(w,'replace',replacement),replacements[0]);assert.deepEqual(await action(h,'adjust',request),adjusted[0]);await action(w,'resume');
  }
  assert.equal((await state()).points,9);assert.equal((await pool.query('SELECT count(*) FROM awards')).rows[0].count,'6');
  const declined=await create();await action(w,'deliver',{mission:declined.id});await action(h,'refuse',{mission:declined.id});
  const waiting=await create();await action(w,'deliver',{mission:waiting.id});await action(h,'adjust',{mission:waiting.id,key:randomUUID(),reason:'softer',note:''});await action(h,'refuse',{mission:waiting.id});
  await action(w,'replace',{mission:waiting.id,key:randomUUID(),title:'Too late',text:'No replacement after decline'},409);
  console.log('PASS experience: adjustment from all three invitation states, roles/validation/holds, immutable originals, atomic single replacement, secret scope, fresh acknowledgement, optional notes, free refusal and single awards');

  const stale=await create();await action(w,'deliver',{mission:stale.id});await action(h,'adjust',{mission:stale.id,key:randomUUID(),reason:'adjust'});
  await action(w,'revise',{terms:'Revised boundaries require independent approvals'});
  await action(w,'sequence',{missions:[]},409);
  await action(h,'message',{key:randomUUID(),text:'Discussing the new terms'});
  const reviewHold=await state();assert.deepEqual(reviewHold.approvals,[]);assert.equal(reviewHold.missions.find(v=>v.id===stale.id)!.status,'cancelled');
  await action(h,'checkin',{minutes:30,energy:'medium',mood:'connection'});
  assert.deepEqual(gameplayState(await state()),gameplayState(reviewHold));
  await action(w,'replace',{mission:stale.id,key:randomUUID(),title:'Old revision',text:'Must not replace'},409);
  await approve();
  await action(w,'replace',{mission:stale.id,key:randomUUID(),title:'Old revision',text:'Still must not replace'},409);
  const race=await create();await action(w,'deliver',{mission:race.id});await action(h,'adjust',{mission:race.id,key:randomUUID(),reason:'adjust'});
  const raceBody={mission:race.id,title:'Only one',text:'One replacement only',points:0};
  const results=await Promise.all([1,2].map(()=>w(`/sessions/${id}/replace`,{...raceBody,key:randomUUID()},[200,409])));
  assert.deepEqual(results.map(v=>v._status).sort(),[200,409]);assert.equal((await state()).missions.filter(v=>v.replaces===race.id).length,1);
  await action(h,'stop');
  const stopped=await state();
  await reflection();
  for(const who of [w,h])await action(who,'checkin',checkin,409);
  await action(w,'sequence',{missions:[]},409);
  for(const who of [w,h])await action(who,'message',{key:randomUUID(),text:'After stop'},409);
  await action(h,'adjust',{mission:race.id,key:randomUUID(),reason:'softer'},409);
  await action(w,'replace',{...raceBody,key:randomUUID()},409);
  assert.deepEqual(await action(h,'adjust',committedAdjustment.body),committedAdjustment.result);
  assert.deepEqual(await action(w,'replace',committedReplacement.body),committedReplacement.result);
  const afterStop=await state();assert.deepEqual(reflectState(afterStop),reflectState(stopped));
  id=(await w('/sessions',{terms:'Expiry is terminal for messages too',minutes:1})).session.id;
  await approve();
  await pool.query("UPDATE sessions SET data=jsonb_set(jsonb_set(data,'{remaining}','1'::jsonb),'{last}',to_jsonb($2::bigint)) WHERE id=$1",[id,Date.now()-1000]);
  await action(h,'message',{key:randomUUID(),text:'After expiry'},409);
  await action(h,'adjust',{mission:race.id,key:randomUUID(),reason:'adjust'},409);
  await action(w,'replace',{...raceBody,key:randomUUID()},409);assert.equal((await state()).status,'expired');
  for(const who of [w,h])await action(who,'checkin',checkin,409);
  await action(w,'sequence',{missions:[]},409);
  assert.equal((await state()).sequence,undefined,'New sessions do not inherit sequence');
  assert.equal((await state()).reflections,undefined,'New sessions do not inherit reflections');await reflection();
  console.log('PASS experience: wife-only optional sequence, order/clear, validation, hidden IDs, holds and terminal guards, no mission transitions');
  assert.equal((await state()).checkIns,undefined,'New sessions do not inherit check-ins');
  console.log('PASS experience: own validated check-ins, spoof resistance, shared visibility, updates/boundaries, holds, terminal rejection and unchanged gameplay');
  console.log('PASS experience: revised agreements cancel adjustments, stale revision blocked, distinct-key replacement race, terminal stop/expiry block new operations');
  id=(await w('/sessions',{terms:'Rewards test',minutes:30})).session.id;
  assert.equal((await state()).rewards,undefined);assert.equal((await state()).rewardRequests,undefined);assert.equal((await state()).points,0);
  const rewardBody={key:randomUUID(),title:'Shared tea',description:'A quiet cup',cost:4};
  await action(w,'reward',rewardBody,409);await approve();
  await action(h,'reward',{...rewardBody,key:randomUUID()},403);
  for(const cost of [-1,1.5,'4',null])await action(w,'reward',{...rewardBody,key:randomUUID(),cost},400);
  const created=(await action(w,'reward',rewardBody)).reward;
  assert.deepEqual((await action(w,'reward',rewardBody)).reward,created);
  await action(w,'reward-request',{key:randomUUID(),reward:created.id},403);
  const reqBody={key:randomUUID(),reward:created.id};
  const requested=await Promise.all([action(h,'reward-request',reqBody),action(h,'reward-request',reqBody)]);
  assert.deepEqual(requested[0],requested[1]);const request=requested[0].request;
  assert.equal((await state()).points,0);
  await action(h,'reward-decision',{key:randomUUID(),request:request.id,approve:true},403);
  await action(w,'reward-decision',{key:randomUUID(),request:request.id,approve:true},409);
  assert.equal((await state()).rewardRequests?.[0].status,'pending');
  await pool.query("UPDATE sessions SET data=jsonb_set(data,'{rewards,0,title}',to_jsonb('Changed catalog'::text)) WHERE id=$1",[id]);
  const snapshot=(await state()).rewardRequests![0];assert.deepEqual([snapshot.title,snapshot.description,snapshot.cost],['Shared tea','A quiet cup',4]);
  const declinedReward=(await action(h,'reward-request',{key:randomUUID(),reward:created.id})).request;
  await action(w,'reward-decision',{key:randomUUID(),request:declinedReward.id,approve:false});
  for(const who of [w,h]){
    const view=(await who(`/sessions/${id}`)).session,history=view.history;
    assert.ok(history.some((n:any)=>n.event==='reward-request'&&n.rewardRequestId===declinedReward.id));
    assert.ok(history.some((n:any)=>n.event==='reward-decision'&&n.rewardRequestId===declinedReward.id&&n.outcome==='declined'));
    assert.ok(view.inbox.filter((n:any)=>n.event==='reward-decision').every((n:any)=>!('rewardRequestId' in n)&&!('outcome' in n)));
  }
  assert.equal((await state()).points,0);
  const free=(await action(w,'reward',{key:randomUUID(),title:'Free',description:'Optional',cost:0})).reward;
  const freeRequest=(await action(h,'reward-request',{key:randomUUID(),reward:free.id})).request;
  const freeDecision={key:randomUUID(),request:freeRequest.id,approve:true};
  await pool.query("ALTER TABLE request_keys ADD CONSTRAINT reject_reward_decision CHECK(kind<>'reward-decision') NOT VALID");
  try {await action(w,'reward-decision',freeDecision,500);assert.equal((await state()).rewardRequests?.find(r=>r.id===freeRequest.id)?.status,'pending');}
  finally {await pool.query('ALTER TABLE request_keys DROP CONSTRAINT reject_reward_decision');}
  const freeResults=await Promise.all([action(w,'reward-decision',freeDecision),action(w,'reward-decision',freeDecision)]);assert.deepEqual(freeResults[0],freeResults[1]);assert.equal((await state()).points,0);
  assert.equal((await state()).history.filter(n=>n.event==='reward-decision'&&(n as any).rewardRequestId===freeRequest.id&&(n as any).outcome==='approved').length,1);
  const refused=(await action(w,'mission',{key:randomUUID(),title:'Freely refused',text:'Optional',points:7})).mission;
  await action(w,'deliver',{mission:refused.id});await action(h,'refuse',{mission:refused.id});assert.equal((await state()).points,0);
  for(let i=0;i<5;i++){
    const m=(await action(w,'mission',{key:randomUUID(),title:`Milestone ${i}`,text:'Optional',points:1})).mission;
    await action(w,'deliver',{mission:m.id});await action(h,'ack',{mission:m.id});await action(h,'complete',{key:randomUUID(),mission:m.id,expectedVersion:0});
    const decision={key:randomUUID(),mission:m.id,submissionVersion:1,approve:true};await action(w,'review',decision);await action(w,'review',decision);
    assert.equal(new Set((await state()).missions.filter(m=>m.status==='approved').map(m=>m.id)).size,i+1);
  }
  const rival=(await action(h,'reward-request',{key:randomUUID(),reward:created.id})).request;
  const decisions=[request.id,rival.id].map(request=>({key:randomUUID(),request,approve:true}));
  const raced=await Promise.all(decisions.map(b=>w(`/sessions/${id}/reward-decision`,b,[200,409])));
  assert.deepEqual(raced.map(v=>v._status).sort(),[200,409]);assert.equal((await state()).points,1);
  const winner=decisions[raced.findIndex(v=>v._status===200)];
  const retry=await action(w,'reward-decision',winner);assert.equal(retry.points,1);
  await action(w,'reward-decision',{...winner,key:randomUUID()},409);
  const beforePause=await state();await action(h,'pause');
  for(const [who,op,body] of [[w,'reward',rewardBody],[h,'reward-request',reqBody],[w,'reward-decision',{key:randomUUID(),request:rival.id,approve:false}]] as const)await action(who,op,{...body,key:randomUUID()},409);
  assert.equal(new Set((await state()).missions.filter(m=>m.status==='approved').map(m=>m.id)).size,5);
  await action(h,'resume');await action(h,'stop');
  await action(w,'reward',{...rewardBody,key:randomUUID()},409);await action(h,'reward-request',{...reqBody,key:randomUUID()},409);
  await action(w,'reward-decision',{key:randomUUID(),request:decisions.find(v=>v.request!==winner.request)!.request,approve:false},409);
  assert.deepEqual(await action(w,'reward-decision',winner),retry);
  assert.deepEqual((await h(`/sessions/${id}`)).session.rewardRequests,(await state()).rewardRequests);
  assert.ok((await h(`/sessions/${id}`)).session.history.some((n:any)=>n.rewardRequestId===declinedReward.id&&n.outcome==='declined'));
  assert.ok(beforePause.history.some(n=>n.event==='reward-request')&&beforePause.history.some(n=>n.event==='reward-decision'));
  id=(await w('/sessions',{terms:'Fresh store',minutes:30})).session.id;
  assert.equal((await state()).rewards,undefined);assert.equal((await state()).rewardRequests,undefined);assert.equal((await state()).points,0);
  console.log('PASS rewards: roles, validation, snapshots, holds, archive, retries, five unique approvals and competing deductions');
} finally {
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  await pool.end();await db.stop();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
