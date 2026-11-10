import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import pg from 'pg';
import { createServer } from 'vite';
import { createApp } from '../server/app.ts';
import { startDatabase } from '../scripts/db/runtime.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ovadia/Downloadsold/agent/.venv/Lib/site-packages/playwright/driver/package');
const directory=await mkdtemp(join(tmpdir(),'her-rules-browser-'));
const db=await startDatabase(directory,55441),pool=new pg.Pool({connectionString:db.url});
let browser:any,server:any,vite:any;
try{
 const app=await createApp(pool,'http://localhost:4180');
 const oldWorker=await readFile(new URL('./fixtures/old-root-sw.js',import.meta.url),'utf8');
 let serveOldWorker=false;
 app.get('/sw.js',(_req,res,next)=>{if(serveOldWorker)res.type('application/javascript').send(oldWorker);else next();});
 app.use(express.static('public'));app.use('/legacy',express.static('legacy'));
  vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false,allowedHosts:true},appType:'spa'});app.use(vite.middlewares);
 server=app.listen(4180);
  browser=await chromium.launch({headless:true});
  const aliasContext=await browser.newContext();
  const aliasPage=await aliasContext.newPage();
  await aliasPage.goto('http://127.0.0.1:4180');
  await aliasPage.getByRole('checkbox').check();
  await aliasPage.locator('form button.primary').click();
  await aliasPage.locator('.account').waitFor();
  await aliasPage.reload();await aliasPage.locator('.account').waitFor();
   console.log('PASS address aliases: nonconfigured 127.0.0.1 guest entry and cookie reload without Origin rejection');
  const contexts=[aliasContext,await browser.newContext(),await browser.newContext()];
  const w=aliasPage,h=await contexts[1].newPage(),x=await contexts[2].newPage();
  async function heldOwnSave(kind:'checkin'|'reflection',controls:any[],values:string[],buttonName:string){
    const pattern=`**/api/sessions/*/${kind}`;
    let release!:()=>void,committed!:()=>void;
    const gate=new Promise<void>(r=>release=r),saved=new Promise<void>(r=>committed=r);
    const handler=async(route:any)=>{const response=await route.fetch();assert.equal(response.status(),200);committed();await gate;await route.fulfill({response}).catch(()=>{});};
    await w.route(pattern,handler);
    try{
      await w.getByRole('button',{name:buttonName,exact:true}).click();await saved;
      for(const control of controls)assert.equal(await control.isDisabled(),true,`${kind}: edits blocked while own save response is held`);
      assert.equal(await w.getByRole('button',{name:/^(Pause my play|Release my pause)$/}).isEnabled(),true);
      assert.equal(await w.getByRole('button',{name:'Stop permanently',exact:true}).isEnabled(),true);
      release();
      await w.getByRole('button',{name:buttonName,exact:true}).waitFor();
      await w.waitForFunction((name:string)=>[...document.querySelectorAll('button')].some(b=>b.textContent===name&&!b.disabled),buttonName);
      for(let i=0;i<controls.length;i++){assert.equal(await controls[i].isEnabled(),true);assert.equal(await controls[i].inputValue(),values[i]);}
      const stored=await w.evaluate(async(kind:string)=>{const data=await (await fetch('/api/state')).json();return data.sessions[0][kind==='checkin'?'checkIns':'reflections'][data.user.id];},kind);
      assert.deepEqual(kind==='checkin'?[String(stored.minutes),stored.energy,stored.mood]:[stored.appreciation,stored.repeat],values);
    }finally{release();await w.unroute(pattern,handler);}
  }
 const errors:string[]=[];
 for(const p of [w,h,x])p.on('pageerror',(e:Error)=>errors.push(e.message));
  async function guestForm(page:any,role:string){
  await page.goto('http://localhost:4180');assert.equal(await page.locator('html').getAttribute('lang'),'he');assert.equal(await page.locator('html').getAttribute('dir'),'rtl');await page.getByRole('button',{name:'English',exact:true}).click();
  assert.equal(await page.getByLabel('Email',{exact:true}).count(),0);
  await page.getByText('Every entry to a role returns to the same identity',{exact:false}).waitFor();
  await page.locator('select[name="role"]').selectOption(role);
   await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Enter',exact:true}).click();
  }
  await w.getByRole('button',{name:'English',exact:true}).click();
  await w.getByRole('heading',{name:'Waiting for the second player',exact:true}).waitFor();
  assert.equal(await w.getByRole('button',{name:'Create new invitation',exact:true}).count(),0);
  await guestForm(h,'husband');await h.getByRole('heading',{name:'New session',exact:true}).waitFor();
  await guestForm(x,'husband');await x.locator('.account').waitFor();
  assert.equal(await x.evaluate(async()=> (await (await fetch('/api/state')).json()).user.id),await h.evaluate(async()=> (await (await fetch('/api/state')).json()).user.id));
  await x.getByRole('button',{name:'Sign out',exact:true}).click();
  const guestIds=await Promise.all([w,h].map(p=>p.evaluate(async()=> (await (await fetch('/api/state')).json()).user.id)));assert.equal(new Set(guestIds).size,2);
  const pairIds=await Promise.all([w,h].map(p=>p.evaluate(async()=> (await (await fetch('/api/state')).json()).user.pair_id)));assert.ok(pairIds[0]);assert.equal(pairIds[0],pairIds[1]);
  await w.reload();await w.getByRole('heading',{name:'New session',exact:true}).waitFor();
 assert.equal(await w.evaluate(async()=> (await (await fetch('/api/state')).json()).user.id),guestIds[0]);
  console.log('Browser checkpoint: two identities, automatic shared game, repeated role entry, no invitation UI, reload retains identity');
 await w.getByRole('heading',{name:'New session',exact:true}).waitFor();
 await w.getByLabel('Exact terms and boundaries for mutual review',{exact:true}).fill('Only optional tea and kind notes. No penalties for boundaries.');
   await w.getByRole('button',{name:'Create session for review',exact:true}).click();
   await w.getByLabel('Available minutes',{exact:true}).fill('25');
   await w.getByLabel('Energy').selectOption('low');
   await w.getByLabel('Mood').selectOption('quiet');
   await w.getByRole('button',{name:'Save my check-in',exact:true}).click();
   await h.getByText('25 minutes · Energy: Low · Mood: Quiet',{exact:false}).waitFor();
   assert.equal(await h.getByLabel('Available minutes',{exact:true}).inputValue(),'15');
   await h.getByLabel('Available minutes',{exact:true}).fill('40');
   await h.getByRole('button',{name:'Save my check-in',exact:true}).click();
   await w.getByText('40 minutes · Energy: Medium · Mood: Connection',{exact:false}).waitFor();
    assert.equal(await w.getByLabel('Available minutes',{exact:true}).inputValue(),'25');
    // A partner refresh must preserve values that were NEVER saved, not merely reload saved values.
    await w.getByLabel('Available minutes',{exact:true}).fill('73');
    await w.getByLabel('Energy').selectOption('high');
    await w.getByLabel('Mood').selectOption('playful');
    await h.getByLabel('Available minutes',{exact:true}).fill('41');
    await h.getByRole('button',{name:'Save my check-in',exact:true}).click();
    await w.getByText('41 minutes · Energy: Medium · Mood: Connection',{exact:false}).waitFor();
    assert.equal(await w.getByLabel('Available minutes',{exact:true}).inputValue(),'73');
    assert.equal(await w.getByLabel('Energy').inputValue(),'high');
    assert.equal(await w.getByLabel('Mood').inputValue(),'playful');
    const savedCheckIn=await w.evaluate(async()=>{const data=await (await fetch('/api/state')).json();return data.sessions[0].checkIns[data.user.id];});
    assert.deepEqual(savedCheckIn,{minutes:25,energy:'low',mood:'quiet'});
    await w.getByLabel('Available minutes',{exact:true}).fill('25');await w.getByLabel('Energy').selectOption('low');await w.getByLabel('Mood').selectOption('quiet');
    await h.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Save my check-in'&&!b.disabled));
    await h.getByLabel('Available minutes',{exact:true}).fill('40');await h.getByRole('button',{name:'Save my check-in',exact:true}).click();
     console.log('PASS cycle 2 gap: partner refresh preserves genuinely unsaved minutes/energy/mood; persisted own entry unchanged');
     await w.getByLabel('Available minutes',{exact:true}).fill('26');
     await heldOwnSave('checkin',[w.getByLabel('Available minutes',{exact:true}),w.getByLabel('Energy'),w.getByLabel('Mood')],['26','low','quiet'],'Save my check-in');
     await w.getByLabel('Available minutes',{exact:true}).fill('25');await w.getByRole('button',{name:'Save my check-in',exact:true}).click();
     console.log('PASS own check-in save: held committed response locks all fields, safety stays enabled, refresh re-enables fields with submitted/API values');
    await w.getByRole('region',{name:'Next step',exact:true}).getByRole('button',{name:'Review agreement',exact:true}).click();
    await w.getByRole('heading',{name:'Explicit agreement · revision 1',exact:true}).waitFor();
    assert.equal(await w.evaluate(()=>document.activeElement?.tagName),'H2');
    assert.equal(await w.locator('.hero h1').isVisible(),false,'Repeated hero is collapsed after entry');
  await w.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();
  await w.getByLabel('New message',{exact:true}).fill('We can discuss boundaries before approval.');await w.getByRole('button',{name:'Send message',exact:true}).click();
  await w.getByText('We can discuss boundaries before approval.',{exact:true}).waitFor();
 await w.getByRole('navigation').getByRole('button',{name:'Agreement',exact:true}).click();
 w.on('dialog',(d:any)=>d.accept());h.on('dialog',(d:any)=>d.accept());
 await w.getByRole('button',{name:'I have read and agree',exact:true}).click();
  await h.getByRole('navigation').getByRole('button',{name:'Agreement',exact:true}).click();await h.getByRole('button',{name:'I have read and agree',exact:true}).click();
  // Hold an old state read while real partner updates and a local mutation arrive.
  let releaseOld!:()=>void,releaseFresh!:()=>void,oldStarted!:()=>void,freshStarted!:()=>void;
  const oldGate=new Promise<void>(r=>releaseOld=r),freshGate=new Promise<void>(r=>releaseFresh=r);
  const oldHeld=new Promise<void>(r=>oldStarted=r),freshHeld=new Promise<void>(r=>freshStarted=r);
  let reads=0,freshSnapshot:any;
  const stateHandler=async(route:any)=>{const number=++reads,response=await route.fetch();if(number===1){oldStarted();await oldGate;}else if(number===2){freshSnapshot=await response.json();freshStarted();await freshGate;}await route.fulfill({response}).catch(()=>{});};
  await w.route('**/api/state',stateHandler);
  try{
    const sendPartner=async(count:number)=>h.evaluate(async(count:number)=>{const state=await(await fetch('/api/state')).json(),id=state.sessions.find((s:any)=>s.status==='active').id;for(let i=0;i<count;i++){const r=await fetch(`/api/sessions/${id}/message`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),text:`refresh burst ${crypto.randomUUID()}`})});if(!r.ok)throw new Error(`burst ${r.status}`);}},count);
    await sendPartner(1);await oldHeld;await sendPartner(8);
    await new Promise(r=>setTimeout(r,10500)); // Two five-second polls while the old read is held.
    await w.getByLabel('Available minutes',{exact:true}).fill('27');
    const committed=w.waitForResponse((r:any)=>r.url().endsWith('/checkin')&&r.request().method()==='POST');
    await w.getByRole('button',{name:'Save my check-in',exact:true}).click();assert.equal((await committed).status(),200);
    releaseOld();await freshHeld;
    assert.equal(freshSnapshot.sessions.find((s:any)=>s.status==='active').checkIns[freshSnapshot.user.id].minutes,27,'reconciliation read starts after mutation');
    assert.equal(await w.getByLabel('Available minutes',{exact:true}).isDisabled(),true);
    releaseFresh();
    await w.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Save my check-in'&&!b.disabled));
    await new Promise(r=>setTimeout(r,1000));
    assert.ok(reads<=2,`burst must coalesce into at most two state reads, got ${reads}`);
    assert.equal(await w.getByLabel('Available minutes',{exact:true}).inputValue(),'27');
  }finally{releaseOld();releaseFresh();await w.unroute('**/api/state',stateHandler);}
  // A read begun while the mutation response is held cannot satisfy that mutation.
  let releaseA!:()=>void,releaseB!:()=>void,releaseC!:()=>void,releaseMutation!:()=>void;
  let seenA!:()=>void,seenB!:()=>void,seenC!:()=>void,mutationCommitted!:()=>void;
  const gateA=new Promise<void>(r=>releaseA=r),gateB=new Promise<void>(r=>releaseB=r),gateC=new Promise<void>(r=>releaseC=r),mutationGate=new Promise<void>(r=>releaseMutation=r);
  const heldA=new Promise<void>(r=>seenA=r),heldB=new Promise<void>(r=>seenB=r),heldC=new Promise<void>(r=>seenC=r),mutationSaved=new Promise<void>(r=>mutationCommitted=r);
  let orderedReads=0,afterResponse:any;
  const orderedState=async(route:any)=>{const n=++orderedReads,response=await route.fetch();if(n===1){seenA();await gateA;}else if(n===2){seenB();await gateB;}else if(n===3){afterResponse=await response.json();seenC();await gateC;}await route.fulfill({response}).catch(()=>{});};
  const heldMutation=async(route:any)=>{const response=await route.fetch();assert.equal(response.status(),200);mutationCommitted();await mutationGate;await route.fulfill({response}).catch(()=>{});};
  await w.route('**/api/state',orderedState);await w.route('**/api/sessions/*/checkin',heldMutation);
  await w.evaluate(()=>{const original=window.fetch;(window as any).originalFetch=original;(window as any).checkinParsed=false;window.fetch=async(...args)=>{const response=await original(...args);if(String(args[0]).endsWith('/checkin')){const json=response.json.bind(response);response.json=async()=>{const body=await json();(window as any).checkinParsed=true;return body;};}return response;};});
  try{
    await h.evaluate(async()=>{const state=await(await fetch('/api/state')).json(),id=state.sessions.find((s:any)=>s.status==='active').id;await fetch(`/api/sessions/${id}/message`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:crypto.randomUUID(),text:'refresh ordering'})});});
    await heldA;await w.getByLabel('Available minutes',{exact:true}).fill('28');await w.getByRole('button',{name:'Save my check-in',exact:true}).click();await mutationSaved;
    releaseA();await heldB;
    const response=w.waitForResponse((r:any)=>r.url().endsWith('/checkin')&&r.request().method()==='POST');releaseMutation();await response;await w.waitForFunction(()=>(window as any).checkinParsed===true);
    releaseB();await heldC;
    assert.equal(afterResponse.sessions.find((s:any)=>s.status==='active').checkIns[afterResponse.user.id].minutes,28);
    assert.equal(await w.getByLabel('Available minutes',{exact:true}).isDisabled(),true);
    releaseC();await w.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Save my check-in'&&!b.disabled));
  }finally{releaseA();releaseB();releaseC();releaseMutation();await w.unroute('**/api/state',orderedState);await w.unroute('**/api/sessions/*/checkin',heldMutation);await w.evaluate(()=>{window.fetch=(window as any).originalFetch;});}
  const failedState=async(route:any)=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'temporary failure'})});
  await w.route('**/api/state',failedState);
  try{
    await w.getByLabel('Available minutes',{exact:true}).fill('29');
    const saved=w.waitForResponse((r:any)=>r.url().endsWith('/checkin')&&r.request().method()==='POST');
    await w.getByRole('button',{name:'Save my check-in',exact:true}).click();assert.equal((await saved).status(),200);
    await w.getByText('Waiting for a fresh server update before further actions.',{exact:false}).waitFor();
    await w.getByRole('button',{name:'עברית',exact:true}).click();
    await w.getByText('ממתינים לעדכון חדש מהשרת לפני פעולות נוספות.',{exact:false}).waitFor();
    await w.getByRole('button',{name:'English',exact:true}).click();
    assert.equal(await w.getByRole('button',{name:'Save my check-in',exact:true}).isDisabled(),true);
    for(const name of ['Available minutes','Energy','Mood','Appreciation (optional)','Repeat next time (optional)'])assert.equal(await w.getByLabel(name).isDisabled(),true,`${name} disabled until reconciliation`);
    await w.getByRole('navigation').getByRole('button',{name:'Rewards',exact:true}).click();
    for(const name of ['Reward title','Reward description','Reward cost'])assert.equal(await w.getByLabel(name,{exact:true}).isDisabled(),true,`${name} disabled until reconciliation`);
    const paused=w.waitForResponse((r:any)=>r.url().endsWith('/pause')&&r.request().method()==='POST');
    await w.getByRole('button',{name:'Pause my play',exact:true}).click();assert.equal((await paused).status(),200);
    assert.equal(await w.getByRole('button',{name:'Stop permanently',exact:true}).isEnabled(),true);
  }finally{await w.unroute('**/api/state',failedState);}
  await w.getByRole('button',{name:'Release my pause',exact:true}).waitFor({timeout:12000});
  await w.getByRole('button',{name:'Release my pause',exact:true}).click();
  await w.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Save my check-in'&&!b.disabled));
  assert.equal(await w.getByLabel('Available minutes',{exact:true}).inputValue(),'29');
  await w.getByRole('navigation').getByRole('button',{name:'Agreement',exact:true}).click();
  // A fresh 401 releases the reconciliation lock into the sign-in flow.
  await x.locator('select[name="role"]').selectOption('wife');await x.getByRole('checkbox').check();await x.getByRole('button',{name:'Enter',exact:true}).click();
  await x.getByRole('button',{name:'Save my check-in',exact:true}).waitFor();
  const unauthorized=async(route:any)=>route.fulfill({status:401,contentType:'application/json',body:'{"error":"Please sign in"}'});
  const expireAfterSave=async(route:any)=>{const response=await route.fetch();assert.equal(response.status(),200);await x.route('**/api/state',unauthorized);await route.fulfill({response});};
  await x.route('**/api/sessions/*/checkin',expireAfterSave);
  try{
    await x.getByLabel('Available minutes',{exact:true}).fill('30');await x.getByRole('button',{name:'Save my check-in',exact:true}).click();
    await x.getByRole('button',{name:'Enter',exact:true}).waitFor();assert.equal(await x.getByRole('button',{name:'Enter',exact:true}).isEnabled(),true);
  }finally{await x.unroute('**/api/state',unauthorized);await x.unroute('**/api/sessions/*/checkin',expireAfterSave);}
  await x.locator('select[name="role"]').selectOption('wife');await x.getByRole('checkbox').check();await x.getByRole('button',{name:'Enter',exact:true}).click();
  await x.getByRole('button',{name:'Sign out',exact:true}).click();await x.getByRole('button',{name:'Enter',exact:true}).waitFor();
  // An unkeyed request can arrive after timeout and after a successful state read.
  let releaseLate!:()=>void,lateEntered!:()=>void,lateRequest:any;
  const lateGate=new Promise<void>(r=>releaseLate=r),lateHeld=new Promise<void>(r=>lateEntered=r);
  const lateHandler=async(route:any)=>{lateRequest={url:route.request().url(),headers:route.request().headers(),body:route.request().postData()};lateEntered();await lateGate;await route.abort().catch(()=>{});};
  await w.route('**/api/sessions/*/checkin',lateHandler);
  try{
    await w.getByLabel('Available minutes',{exact:true}).fill('31');await w.getByRole('button',{name:'Save my check-in',exact:true}).click();await lateHeld;
    await w.getByText('The timed-out action may still complete after a refresh.',{exact:false}).waitFor({timeout:20000});
    const unlock=w.getByRole('button',{name:'I understand the risk; unlock actions',exact:true});await unlock.waitFor();
    await w.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='I understand the risk; unlock actions'&&!b.disabled));
    assert.equal(await w.getByRole('button',{name:'Save my check-in',exact:true}).isDisabled(),true);
    const beforeLate=await h.evaluate(async()=> (await(await fetch('/api/state')).json()).sessions[0].checkIns);
    assert.notEqual(beforeLate[guestIds[0]].minutes,31);
    const late=await fetch(lateRequest.url,{method:'POST',headers:{Origin:'http://127.0.0.1:4180',Cookie:lateRequest.headers.cookie,'Content-Type':'application/json'},body:lateRequest.body});assert.equal(late.status,200);
    const afterLate=await h.evaluate(async()=> (await(await fetch('/api/state')).json()).sessions[0].checkIns);assert.equal(afterLate[guestIds[0]].minutes,31);
    assert.equal(await w.getByRole('button',{name:'Save my check-in',exact:true}).isDisabled(),true);
    await w.reload();await w.getByText('The timed-out action may still complete after a refresh.',{exact:false}).waitFor();
    assert.equal(await w.getByRole('button',{name:'Save my check-in',exact:true}).isDisabled(),true);
    await w.getByRole('button',{name:'I understand the risk; unlock actions',exact:true}).click();
  }finally{releaseLate();await w.unroute('**/api/sessions/*/checkin',lateHandler);}
  await w.getByLabel('Available minutes',{exact:true}).fill('25');await w.getByRole('button',{name:'Save my check-in',exact:true}).click();
  console.log('PASS bounded refresh: held stale read, event burst and committed mutation coalesce into fresh reconciliation');
  await w.getByRole('navigation').getByRole('button',{name:'Missions',exact:true}).click();
  await w.getByText('New mission to review',{exact:true}).click();
  const surpriseControl=w.getByLabel('Surprise invitation — content is revealed only by his choice',{exact:true});
  await surpriseControl.check();
  const category=w.getByLabel('Category to display',{exact:true});
  assert.equal(await category.evaluate((el:HTMLInputElement)=>!!el.form&&el.form.closest('#mission-composer')!==null&&el.required&&!el.checkValidity()),true,'Surprise category must be required within the draft form');
  await category.fill('Conversation');assert.equal(await category.evaluate((el:HTMLInputElement)=>el.checkValidity()),true);
  const surpriseTitle='Browser surprise invitation',surpriseText='A private conversation invitation';
  await w.getByLabel('Title',{exact:true}).fill(surpriseTitle);await w.getByLabel('Mission text and boundaries',{exact:true}).fill(surpriseText);
  await w.getByRole('button',{name:'Save draft only',exact:true}).click();
  await w.getByRole('heading',{name:surpriseTitle,exact:true}).waitFor();
  await h.getByRole('navigation').getByRole('button',{name:'Missions',exact:true}).click();
  assert.equal(await h.getByText(surpriseTitle,{exact:true}).count(),0);
  await w.getByRole('region',{name:'Current invitation',exact:true}).getByRole('button',{name:'Send now',exact:true}).click();
  const invitation=h.getByRole('region',{name:'Current invitation',exact:true});
  await invitation.getByRole('heading',{name:'Surprise invitation',exact:true}).waitFor();
  await invitation.getByText('Category: Conversation',{exact:true}).waitFor();
  const placeholder=await h.locator('body').innerText();assert.ok(!placeholder.includes(surpriseTitle)&&!placeholder.includes(surpriseText));
  assert.equal(await invitation.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).count(),0);
  await h.getByRole('button',{name:'עברית',exact:true}).click();
  await h.getByRole('heading',{name:'הזמנת הפתעה',exact:true}).waitFor();
  await h.getByRole('button',{name:'English',exact:true}).click();
  const beforeReveal=await h.evaluate(async()=>await(await fetch('/api/state')).json());
  const hiddenMission=beforeReveal.sessions[0].missions.find((m:any)=>m.surprise&&m.category==='Conversation');
  assert.equal(hiddenMission.status,'pending');assert.equal(hiddenMission.acknowledgedAt,undefined);
  await invitation.getByRole('button',{name:'Reveal invitation',exact:true}).click();
  await invitation.getByRole('heading',{name:surpriseTitle,exact:true}).waitFor();await invitation.getByText(surpriseText,{exact:true}).waitFor();
  const afterReveal=await h.evaluate(async(id:string)=>{const state=await(await fetch('/api/state')).json();return state.sessions[0].missions.find((m:any)=>m.id===id);},hiddenMission.id);
  assert.equal(afterReveal.status,'pending');assert.equal(afterReveal.acknowledgedAt,undefined);
  await invitation.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).click();
  await h.waitForFunction(async(id:string)=>{const state=await(await fetch('/api/state')).json();return state.sessions[0].missions.find((m:any)=>m.id===id)?.status==='acknowledged';},hiddenMission.id);
  await invitation.getByRole('button',{name:'Decline without penalty',exact:true}).click();
  await w.getByText('New mission to review',{exact:true}).click();
  console.log('PASS surprise browser: UI draft, delivery, Hebrew placeholder, reveal without acceptance and explicit acknowledgement');
 await w.getByLabel('Title',{exact:true}).fill('Private tea invitation');await w.getByLabel('Mission text and boundaries',{exact:true}).fill('Would you like to prepare optional mint tea?');
  await w.getByLabel('Secret until explicit sending or scheduled delivery',{exact:true}).check();
  await w.getByLabel('Completion style').selectOption('written');
 await w.getByRole('button',{name:'Save draft only',exact:true}).click();
  await w.getByRole('heading',{name:'Private tea invitation',exact:true}).waitFor();
  assert.equal(await w.getByLabel('Title',{exact:true}).isVisible(),false,'Composer collapses after saving');
 await h.getByRole('navigation').getByRole('button',{name:'Missions',exact:true}).click();
 assert.equal(await h.getByText('Would you like to prepare optional mint tea?',{exact:true}).count(),0);
  assert.equal((await x.request.get('http://localhost:4180/api/state')).status(),401);
 await w.getByRole('button',{name:'Send now',exact:true}).click();
  await h.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).waitFor();
  await w.getByRole('region',{name:'Next step',exact:true}).getByText('Waiting for your husband to acknowledge',{exact:false}).waitFor();
   assert.equal(await h.getByRole('region',{name:'Current invitation',exact:true}).count(),1);
   assert.ok(await h.getByRole('region',{name:'Current invitation',exact:true}).evaluate((el:HTMLElement)=>!!(el.compareDocumentPosition(document.querySelector('fieldset')!)&Node.DOCUMENT_POSITION_FOLLOWING)),'Current invitation precedes check-in editing');
   assert.ok(await h.getByRole('region',{name:'Current invitation',exact:true}).evaluate((el:HTMLElement)=>!!(el.compareDocumentPosition(document.querySelector('.reflection')!)&Node.DOCUMENT_POSITION_FOLLOWING)),'Current invitation precedes optional reflection');
  assert.equal(await h.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).count(),1);
 assert.equal(await h.getByLabel('Written completion',{exact:true}).count(),0);
   await h.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).click();
   await h.getByRole('button',{name:'Pause my play',exact:true}).click();
   await h.getByRole('region',{name:'Next step',exact:true}).getByText('Your pause is active.',{exact:false}).waitFor();
   await w.getByRole('region',{name:'Next step',exact:true}).getByText('Waiting on your partner’s pause.',{exact:false}).waitFor();
   assert.equal(await h.getByRole('button',{name:'Submit completion',exact:true}).isDisabled(),true);
   await h.getByRole('button',{name:'Release my pause',exact:true}).click();
  await h.getByText('Request a softer version or adjustment',{exact:true}).click();
  await h.getByLabel('Request type').selectOption('softer');
  await h.getByLabel('Note (optional)',{exact:true}).fill('A smaller invitation please.');
  await h.getByRole('button',{name:'Request adjustment',exact:true}).click();
  await h.getByText('Awaiting adjustment',{exact:true}).waitFor();
  assert.equal(await h.getByLabel('Written completion',{exact:true}).count(),0);
  await w.getByText('Create replacement draft',{exact:true}).click();
  await w.getByLabel('Replacement title',{exact:true}).fill('A smaller tea invitation');
   await w.getByLabel('Replacement text and boundaries').fill('Would you like to choose a tea together?');
   await w.getByRole('region',{name:'Current invitation',exact:true}).getByLabel('Completion style').selectOption('written');
  await w.getByRole('button',{name:'Save replacement draft only',exact:true}).click();
  await w.getByRole('heading',{name:'A smaller tea invitation',exact:true}).waitFor();
   await h.locator('summary').filter({hasText:'Private tea invitation'}).click();
   await h.getByText('A replacement draft was created and this invitation was cancelled.',{exact:true}).waitFor();
  assert.equal(await h.getByRole('heading',{name:'A smaller tea invitation',exact:true}).count(),0);
  await w.getByRole('button',{name:'Send now',exact:true}).click();
  await h.getByRole('heading',{name:'A smaller tea invitation',exact:true}).waitFor();
  assert.equal(await h.getByLabel('Written completion',{exact:true}).count(),0);
  await h.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).click();
   console.log('PASS cycle 1 browser: chat before agreement, adjustment/note, linked secret replacement, immutable original and fresh acknowledgement');
   // Switching the focused card must not remount A's uncontrolled, genuinely unsaved report.
   const unsavedReport='Still writing this report — not submitted.';
   await h.getByRole('region',{name:'Current invitation',exact:true}).getByLabel('Written completion').fill(unsavedReport);
   await w.getByText('New mission to review',{exact:true}).click();
   await w.getByLabel('Title',{exact:true}).fill('Focus switch invitation B');
   await w.getByLabel('Mission text and boundaries').fill('An optional second invitation for later.');
   await w.getByRole('button',{name:'Save draft only',exact:true}).click();
   await w.getByRole('region',{name:'Current invitation',exact:true}).getByRole('heading',{name:'Focus switch invitation B',exact:true}).waitFor();
   await w.getByRole('region',{name:'Current invitation',exact:true}).getByRole('button',{name:'Send now',exact:true}).click();
   await h.getByRole('region',{name:'Current invitation',exact:true}).getByRole('heading',{name:'Focus switch invitation B',exact:true}).waitFor();
   assert.equal(await h.getByLabel('Written completion').isVisible(),false,'A moves into a collapsed other card');
   await h.locator('.other-invitation > summary').filter({hasText:'A smaller tea invitation'}).click();
   assert.equal(await h.getByLabel('Written completion').inputValue(),unsavedReport,'A retains its unsaved report when focus moves to B');
   const unsubmitted=await h.evaluate(async()=>{const data=await (await fetch('/api/state')).json();return data.sessions[0].missions.find((m:any)=>m.title==='A smaller tea invitation');});
   assert.equal(unsubmitted.status,'acknowledged');assert.equal(unsubmitted.completion,undefined);assert.equal(unsubmitted.submissionVersion,undefined);
   await h.getByRole('region',{name:'Current invitation',exact:true}).getByRole('button',{name:'Decline without penalty',exact:true}).click();
   await h.getByRole('region',{name:'Current invitation',exact:true}).getByRole('heading',{name:'A smaller tea invitation',exact:true}).waitFor();
   assert.equal(await h.getByLabel('Written completion').inputValue(),unsavedReport,'A also retains its report when becoming current again');
   console.log('PASS cycle 3 review regression: unsaved written report survives current → archive → current; API remains acknowledged without submission');
  await h.getByLabel('Written completion',{exact:true}).fill('Tea offered freely.');await h.getByRole('button',{name:'Submit completion',exact:true}).click();
 await w.getByRole('button',{name:'Approve and award once',exact:true}).click();
    await w.getByText('5 points',{exact:false}).first().waitFor();
    await w.getByRole('navigation').getByRole('button',{name:'Rewards',exact:true}).click();
    await w.getByLabel('Reward title',{exact:true}).fill('Shared tea');
    await w.getByLabel('Reward description',{exact:true}).fill('A cup together');
    await w.getByLabel('Reward cost',{exact:true}).fill('3');
    let releaseReward!:()=>void,rewardCommitted!:()=>void;
    const rewardGate=new Promise<void>(r=>releaseReward=r),rewardSaved=new Promise<void>(r=>rewardCommitted=r);
    const rewardHandler=async(route:any)=>{const response=await route.fetch();assert.equal(response.status(),200);rewardCommitted();await rewardGate;await route.fulfill({response}).catch(()=>{});};
    let releaseRefresh!:()=>void,refreshStarted!:()=>void;
    const refreshGate=new Promise<void>(r=>releaseRefresh=r),refreshHeld=new Promise<void>(r=>refreshStarted=r);
    const refreshHandler=async(route:any)=>{const response=await route.fetch();refreshStarted();await refreshGate;await route.fulfill({response}).catch(()=>{});};
    await w.route('**/api/sessions/*/reward',rewardHandler);
    try{
      await w.getByRole('button',{name:'Create reward',exact:true}).click();await rewardSaved;
      for(const name of ['Reward title','Reward description','Reward cost'])assert.equal(await w.getByLabel(name,{exact:true}).isDisabled(),true,`${name} locked until save refresh`);
      assert.equal(await w.getByRole('button',{name:'Pause my play',exact:true}).isEnabled(),true);
      assert.equal(await w.getByRole('button',{name:'Stop permanently',exact:true}).isEnabled(),true);
      await w.route('**/api/state',refreshHandler);
      releaseReward();await refreshHeld;
      for(const name of ['Reward title','Reward description','Reward cost'])assert.equal(await w.getByLabel(name,{exact:true}).isDisabled(),true,`${name} locked during authoritative refresh`);
      releaseRefresh();await w.unroute('**/api/state',refreshHandler);
      await w.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Create reward'&&!b.disabled));
      assert.equal(await w.getByLabel('Reward title',{exact:true}).inputValue(),'');
      const savedRewards=await w.evaluate(async()=> (await(await fetch('/api/state')).json()).sessions[0].rewards);
      assert.equal(savedRewards.filter((r:any)=>r.title==='Shared tea').length,1);
    }finally{releaseReward();releaseRefresh();await w.unroute('**/api/state',refreshHandler);await w.unroute('**/api/sessions/*/reward',rewardHandler);}
    await h.getByRole('navigation').getByRole('button',{name:'Rewards',exact:true}).click();
    await h.getByRole('button',{name:'Request reward',exact:true}).click();
    await w.getByRole('button',{name:'Approve reward',exact:true}).waitFor();
    await h.getByRole('button',{name:'Request reward',exact:true}).click();
    await w.getByRole('button',{name:'Approve reward',exact:true}).first().click();
    await h.getByText('2 points available',{exact:true}).waitFor();
    await w.getByRole('button',{name:'Approve reward',exact:true}).click();
    await w.getByRole('alert').getByText('Not enough points to approve this reward. The request remains pending.',{exact:false}).waitFor();
    await w.getByRole('button',{name:'Decline reward',exact:true}).click();
    await h.getByText('3 points · Declined',{exact:true}).waitFor();
    await pool.query("UPDATE sessions SET data=jsonb_set(data,'{history}',data->'history' || jsonb_build_array(jsonb_build_object('at',$1::bigint,'event','reward-decision','by','server'))) WHERE status='active'",[Date.now()]);
    for(const page of [w,h]){
      await page.getByRole('navigation').getByRole('button',{name:'History',exact:true}).click();
      await page.locator('article').filter({hasText:'Reward request decided'}).filter({hasText:'Shared tea'}).filter({hasText:'Approved'}).waitFor();
      await page.locator('article').filter({hasText:'Reward request decided'}).filter({hasText:'Shared tea'}).filter({hasText:'Declined'}).waitFor();
      assert.equal(await page.locator('article').filter({hasText:'Reward request decided'}).filter({hasText:'Shared tea'}).filter({hasText:'A cup together'}).filter({hasText:'3 points'}).count(),2);
      await page.locator('article').filter({hasText:'Reward request decided'}).filter({hasText:'Server'}).waitFor();
      assert.equal(await page.getByText('Private tea invitation',{exact:true}).count(),0);
      await page.getByRole('navigation').getByRole('button',{name:'Rewards',exact:true}).click();
    }
    await h.getByRole('button',{name:'עברית',exact:true}).click();
    assert.equal(await h.locator('html').getAttribute('dir'),'rtl');
    await h.getByRole('heading',{name:'חנות הפרסים',exact:true}).waitFor();
    await h.getByRole('button',{name:'English',exact:true}).click();
    await w.getByRole('navigation').getByRole('button',{name:'Missions',exact:true}).click();
    await h.getByRole('navigation').getByRole('button',{name:'Missions',exact:true}).click();
   await w.getByText('New mission to review',{exact:true}).click();
   assert.equal(await w.getByLabel('Completion style').inputValue(),'simple');
   await w.getByLabel('Title',{exact:true}).fill('Simple closing invitation');
   await w.getByLabel('Mission text and boundaries').fill('An optional quiet moment');
   await w.getByLabel('Points on approved completion',{exact:true}).fill('0');
   await w.getByRole('button',{name:'Save draft only',exact:true}).click();
   await w.getByRole('region',{name:'Current invitation',exact:true}).getByRole('button',{name:'Send now',exact:true}).click();
   await h.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).click();
   assert.equal(await h.getByLabel('Written completion',{exact:true}).count(),0);
   await h.getByRole('button',{name:'Done',exact:true}).click();
    await w.getByRole('button',{name:'Approve and award once',exact:true}).click();
    const post=async(page:any,op:string,body:any)=>page.evaluate(async({op,body}:any)=>{const state=await(await fetch('/api/state')).json();const session=state.sessions.find((s:any)=>s.status==='active');const r=await fetch(`/api/sessions/${session.id}/${op}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`${op}: ${r.status}`);return r.json();},{op,body});
    for(let i=0;i<3;i++){
      const mission=(await post(w,'mission',{key:crypto.randomUUID(),title:`Milestone browser ${i}`,text:'Optional',points:0})).mission;
      await post(w,'deliver',{mission:mission.id});await post(h,'ack',{mission:mission.id});await post(h,'complete',{key:crypto.randomUUID(),mission:mission.id,expectedVersion:0});await post(w,'review',{key:crypto.randomUUID(),mission:mission.id,submissionVersion:1,approve:true});
    }
    await w.getByRole('navigation').getByRole('button',{name:'Rewards',exact:true}).click();
    await w.getByText('Unique approved missions: 5/5',{exact:true}).waitFor();
    const beforeBonus=await w.evaluate(async()=> (await(await fetch('/api/state')).json()).sessions[0].missions.length);
    await w.getByRole('button',{name:'Pause my play',exact:true}).click();
    await w.getByRole('button',{name:'Release my pause',exact:true}).waitFor();
    assert.equal(await w.getByRole('button',{name:'Draft a bonus invitation',exact:true}).isDisabled(),true);
    await w.getByRole('button',{name:'Release my pause',exact:true}).click();
    await w.getByRole('navigation').getByRole('button',{name:'Missions',exact:true}).click();
    await w.getByText('New mission to review',{exact:true}).click();
    await w.getByLabel('Title',{exact:true}).fill('Unsaved bonus navigation');
    await w.getByLabel('Mission text and boundaries').fill('Keep this unsaved text');
    let releasePartner!:()=>void,partnerCommitted!:()=>void;
    const partnerGate=new Promise<void>(r=>releasePartner=r),partnerSaved=new Promise<void>(r=>partnerCommitted=r);
    const partnerHandler=async(route:any)=>{const response=await route.fetch();assert.equal(response.status(),200);partnerCommitted();await partnerGate;await route.fulfill({response}).catch(()=>{});};
    await h.route('**/api/sessions/*/checkin',partnerHandler);
    try{
      await h.getByLabel('Available minutes',{exact:true}).fill('44');await h.getByRole('button',{name:'Save my check-in',exact:true}).click();await partnerSaved;
      await w.getByText('44 minutes · Energy:',{exact:false}).waitFor();
      await w.getByRole('navigation').getByRole('button',{name:'Rewards',exact:true}).click();
      await w.getByRole('button',{name:'Draft a bonus invitation',exact:true}).click();
      assert.equal(await w.getByLabel('Title',{exact:true}).isVisible(),true);
      assert.equal(await w.getByLabel('Title',{exact:true}).inputValue(),'Unsaved bonus navigation');
      assert.equal(await w.getByLabel('Mission text and boundaries').inputValue(),'Keep this unsaved text');
    }finally{releasePartner();await h.unroute('**/api/sessions/*/checkin',partnerHandler);}
    await h.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Save my check-in'&&!b.disabled));
    await h.getByLabel('Available minutes',{exact:true}).fill('40');await h.getByRole('button',{name:'Save my check-in',exact:true}).click();
    assert.equal(await w.evaluate(async()=> (await(await fetch('/api/state')).json()).sessions[0].missions.length),beforeBonus);
    await w.getByRole('button',{name:'Save draft only',exact:true}).click();
    await w.getByRole('region',{name:'Current invitation',exact:true}).getByRole('button',{name:'Edit draft',exact:true}).click();
    await w.getByLabel('Mission text and boundaries').fill('Unsaved edit remains');
    await w.getByRole('navigation').getByRole('button',{name:'Rewards',exact:true}).click();
    await w.getByRole('button',{name:'Draft a bonus invitation',exact:true}).click();
    assert.equal(await w.getByText('Edit draft',{exact:true}).first().isVisible(),true);
    assert.equal(await w.getByLabel('Mission text and boundaries').inputValue(),'Unsaved edit remains');
    await w.getByRole('button',{name:'Save draft only',exact:true}).click();
    await w.getByRole('region',{name:'Current invitation',exact:true}).getByText('Unsaved edit remains',{exact:true}).waitFor();
    await w.getByRole('region',{name:'Current invitation',exact:true}).getByRole('button',{name:'Cancel mission',exact:true}).click();
   console.log('PASS cycle 4 browser: written choice and simple Done both retain explicit acknowledgement and wife review');
  // The selected order changes focus only; draft editing and other/archive cards stay reachable.
  const makeDraft=async(title:string)=>{
    await w.getByText('New mission to review',{exact:true}).click();
    await w.getByLabel('Title',{exact:true}).fill(title);await w.getByLabel('Mission text and boundaries',{exact:true}).fill('An optional kind conversation');
    await w.getByRole('button',{name:'Save draft only',exact:true}).click();
    await w.waitForFunction(()=>!(document.querySelector('#mission-composer') as HTMLDetailsElement)?.open);
  };
  await makeDraft('Sequence first');await makeDraft('Sequence second');
  const draftIds=await w.evaluate(async()=>{const data=await (await fetch('/api/state')).json();return data.sessions[0].missions.filter((m:any)=>m.title.startsWith('Sequence ')).map((m:any)=>m.id);});
  await w.getByText('Optional invitation sequence',{exact:true}).click();
  await w.getByLabel('Invitation 1').selectOption(draftIds[1]);await w.getByLabel('Invitation 2').selectOption(draftIds[0]);
  await w.getByRole('button',{name:'Save invitation sequence',exact:true}).click();
  await w.getByRole('region',{name:'Current invitation',exact:true}).getByRole('heading',{name:'Sequence second',exact:true}).waitFor();
  assert.equal(await w.getByRole('region',{name:'Current invitation',exact:true}).count(),1);
  let ordered=await w.evaluate(async()=> (await (await fetch('/api/state')).json()).sessions[0]);
  assert.deepEqual(ordered.sequence,[draftIds[1],draftIds[0]]);
  assert.ok(ordered.missions.filter((m:any)=>draftIds.includes(m.id)).every((m:any)=>m.status==='draft'&&!m.deliveredAt&&!m.acknowledgedAt));
  for(const width of [320,390,768]){
    await w.setViewportSize({width,height:844});
    for(const language of ['he','en']){
      if(await w.locator('html').getAttribute('lang')!==language)await w.getByRole('button',{name:language==='he'?'עברית':'English',exact:true}).click();
      assert.ok(await w.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`guided overflow ${width} ${language}`);
      assert.equal(await w.locator('.current-invitation').count(),1);
    }
  }
  await w.getByRole('button',{name:'Edit draft',exact:true}).click();
  assert.equal(await w.getByLabel('Title',{exact:true}).inputValue(),'Sequence second');
  assert.equal(await w.getByLabel('Title',{exact:true}).evaluate((el:HTMLElement)=>el===document.activeElement),true);
  await w.getByLabel('Mission text and boundaries').fill('Edited optional conversation');await w.getByRole('button',{name:'Save draft only',exact:true}).click();
  await w.getByRole('region',{name:'Current invitation',exact:true}).getByText('Edited optional conversation',{exact:true}).waitFor();
  assert.equal(await w.getByLabel('Title',{exact:true}).isVisible(),false);
  await w.getByRole('button',{name:'Send now',exact:true}).click();
   await h.getByRole('region',{name:'Current invitation',exact:true}).getByRole('heading',{name:'Sequence second',exact:true}).waitFor();
   await h.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).waitFor();
   assert.equal(await h.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).count(),1);
  assert.equal(await h.getByLabel('Written completion',{exact:true}).count(),0);
  await w.getByRole('button',{name:'Cancel mission',exact:true}).click();
  await w.getByRole('region',{name:'Current invitation',exact:true}).getByRole('heading',{name:'Sequence first',exact:true}).waitFor();
  ordered=await w.evaluate(async()=> (await (await fetch('/api/state')).json()).sessions[0]);
  assert.equal(ordered.missions.find((m:any)=>m.id===draftIds[0]).status,'draft','Moving focus never delivers the next mission');
  await w.getByRole('button',{name:'Cancel mission',exact:true}).click();
  await w.locator('summary').filter({hasText:'A smaller tea invitation'}).click();
  await w.getByRole('heading',{name:'A smaller tea invitation',exact:true}).waitFor();
  assert.equal(await w.getByText('Tea offered freely.',{exact:true}).isVisible(),true,'Completed archive stays reachable');
  await w.locator('summary').filter({hasText:'A smaller tea invitation'}).click();
  console.log('PASS cycle 3 browser: direct agreement navigation/focus, collapsed hero/composer, one current invitation, ordered manual sequence, working edit/focus, no auto delivery/acknowledgement, reachable archive');
 await w.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();
 await contexts[1].route('**/api/events',async(route:any)=>route.abort());await h.reload();
 await w.getByLabel('New message',{exact:true}).fill('Thank you for the lovely tea.');await w.getByRole('button',{name:'Send message',exact:true}).click();
 await h.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();await h.getByText('Thank you for the lovely tea.',{exact:true}).waitFor();
 await h.reload();await h.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();await h.getByText('Thank you for the lovely tea.',{exact:true}).waitFor();
  await w.getByRole('button',{name:'Pause my play',exact:true}).click();await h.getByRole('button',{name:'Pause my play',exact:true}).click();
  await w.getByLabel('New message',{exact:true}).fill('Chat does not release either pause.');await w.getByRole('button',{name:'Send message',exact:true}).click();
  await h.getByText('Chat does not release either pause.',{exact:true}).waitFor();
   await w.getByText('2 active pauses',{exact:false}).waitFor();
   await w.getByLabel('Appreciation (optional)',{exact:true}).fill('Thank you for choosing together.');
   await w.getByRole('button',{name:'Save my reflection',exact:true}).click();
    await h.getByRole('region',{name:'Optional closing reflection',exact:true}).getByText('Thank you for choosing together.',{exact:false}).waitFor();
    await w.getByLabel('Repeat next time (optional)',{exact:true}).fill('Choose tea together again.');
    await heldOwnSave('reflection',[w.getByLabel('Appreciation (optional)'),w.getByLabel('Repeat next time (optional)')],['Thank you for choosing together.','Choose tea together again.'],'Save my reflection');
    console.log('PASS own reflection save: held committed response locks both fields, safety stays enabled, refresh re-enables fields with submitted/API values');
    await w.getByRole('region',{name:'Optional closing reflection',exact:true}).locator('p').filter({hasText:'Choose tea together again.'}).waitFor();
    for(const language of ['he','en']){
      if(await w.locator('html').getAttribute('lang')!==language)await w.getByRole('button',{name:language==='he'?'עברית':'English',exact:true}).click();
      const appreciation=w.getByLabel(language==='he'?'הערכה (לא חובה)':'Appreciation (optional)');
      const repeat=w.getByLabel(language==='he'?'מה נרצה לחזור עליו (לא חובה)':'Repeat next time (optional)');
      await appreciation.fill(`Unsaved appreciation ${language}`);await repeat.fill(`Unsaved repeat ${language}`);
      await h.getByLabel('Appreciation (optional)').fill(`Partner reflection ${language}`);
      await h.getByRole('button',{name:'Save my reflection',exact:true}).click();
      await w.getByRole('region',{name:language==='he'?'שיתוף סיום אופציונלי':'Optional closing reflection',exact:true}).getByText(`Partner reflection ${language}`,{exact:false}).waitFor();
      assert.equal(await appreciation.inputValue(),`Unsaved appreciation ${language}`);assert.equal(await repeat.inputValue(),`Unsaved repeat ${language}`);
      const persisted=await w.evaluate(async()=>{const data=await (await fetch('/api/state')).json();return data.sessions[0].reflections[data.user.id];});
      assert.deepEqual(persisted,{appreciation:'Thank you for choosing together.',repeat:'Choose tea together again.'});
    }
    await w.getByLabel('Appreciation (optional)').fill('Thank you for choosing together.');
    await w.getByLabel('Repeat next time (optional)').fill('Choose tea together again.');
    console.log('PASS reflection retention: genuinely unsaved own fields survive changed partner reflections in Hebrew and English; API retains saved own values');
   await h.getByLabel('Energy').selectOption('high');
   await h.getByRole('button',{name:'Save my check-in',exact:true}).click();
   await w.getByText('40 minutes · Energy: High · Mood: Connection',{exact:false}).waitFor();
   await w.getByText('2 active pauses',{exact:false}).waitFor();
 await w.getByRole('button',{name:'Release my pause',exact:true}).click();
 await w.getByText('1 active pauses',{exact:false}).waitFor();
  await h.getByRole('button',{name:'Release my pause',exact:true}).click();
  for(const [persona,category] of [['Strict','challenges'],['Playful','teasing'],['Caring','rewards']]){
   await w.getByRole('navigation').getByRole('button',{name:'Missions',exact:true}).click();
   await w.getByRole('button',{name:persona,exact:true}).click();
   await w.waitForFunction((value:string)=>document.querySelector('main')?.classList.contains(`persona-${value}`),persona.toLowerCase());
   await h.waitForFunction((value:string)=>document.querySelector('main')?.classList.contains(`persona-${value}`),persona.toLowerCase());
   await w.getByRole('navigation').getByRole('button',{name:'Idea library',exact:true}).click();
   assert.equal(await w.getByLabel('Category').inputValue(),category);
   await w.getByLabel('Category').selectOption('roleplay');
   await w.waitForTimeout(5200);
   assert.equal(await w.getByLabel('Category').inputValue(),'roleplay','Manual override survives ordinary refresh');
  }
  await w.reload();
  await w.getByRole('navigation').getByRole('button',{name:'Idea library',exact:true}).click();
  assert.equal(await w.getByLabel('Category').inputValue(),'rewards','Reload uses the shared persona');
  console.log('PASS persona library defaults: three mappings, shared visual style, manual override through refresh, reload');
  await w.getByRole('heading',{name:'42 ways to choose together',exact:true}).waitFor();
  await w.getByLabel('Category').selectOption('roleplay');assert.equal(await w.locator('.library article').count(),6);
  await w.getByLabel('Intensity').selectOption('3');assert.equal(await w.locator('.library article').count(),6);
  await w.getByLabel('Category').selectOption('');assert.equal(await w.locator('.library article').count(),42);
  await w.getByLabel('Boundary / activity tag').selectOption('custom');assert.equal(await w.locator('.library article').count(),2);
  await w.getByLabel('Boundary / activity tag').selectOption('');
  await w.getByLabel('Intensity').selectOption('');await w.getByLabel('Category').selectOption('roleplay');
 await w.getByRole('button',{name:'Save favorite',exact:true}).first().click();await w.getByLabel('Favorites only (this device)',{exact:true}).check();assert.equal(await w.locator('.library article').count(),1);
 await w.getByRole('button',{name:/Roll a suggestion to review/}).click();
 assert.ok((await w.getByLabel('Mission text and boundaries').inputValue()).length>20);
 console.log('PASS browser: isolated guest entry/pairing, mutual consent, secret delivery, acknowledgement, completion/review, text persistence with SSE blocked/polling fallback, independent pauses, library filtering/favorites/dice');
 for(const width of [320,390,768]){
  await w.setViewportSize({width,height:844});
  for(const language of ['he','en']){
   const current=await w.locator('html').getAttribute('lang');if(current!==language)await w.getByRole('button',{name:language==='he'?'עברית':'English',exact:true}).click();
   assert.equal(await w.locator('html').getAttribute('dir'),language==='he'?'rtl':'ltr');
    for(const id of ['missions','rewards','agreement','library','messages','inbox','history']){
     const index=['missions','rewards','agreement','library','messages','inbox','history'].indexOf(id);await w.getByRole('navigation').getByRole('button').nth(index).click();
    assert.ok(await w.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`overflow ${width} ${language} ${id}`);
   }
  }
 }
  console.log('PASS mobile: 320/390/768px, Hebrew RTL + English LTR, all seven session tabs have no horizontal overflow');
 // Install an old root worker and old cache, then let the app replace it at the same URL.
 const upgrade=await browser.newContext();const p=await upgrade.newPage();
 serveOldWorker=true;
 await p.route('http://localhost:4180/',async(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Previously installed demo</title>'}));
 await p.goto('http://localhost:4180');await p.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;await(await caches.open('her-rules-shell-v1')).put('/old',new Response('old demo'));});
 serveOldWorker=false;await p.unroute('http://localhost:4180/');await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration('/');await r!.update();});
 for(let attempt=0;attempt<100&&(await p.evaluate(()=>caches.keys())).includes('her-rules-shell-v1');attempt++)await new Promise(r=>setTimeout(r,100));
 assert.deepEqual(await p.evaluate(()=>caches.keys()),[]);
 await p.goto('http://localhost:4180');await p.getByRole('button',{name:'English',exact:true}).waitFor();
 const cacheHeader=await p.evaluate(async()=>{const r=await fetch('/api/state');return r.headers.get('cache-control');});assert.equal(cacheHeader,'no-store');
 await upgrade.setOffline(true);await p.reload();await p.getByText('Offline. Reconnect to check authoritative state. Disconnecting never acknowledges a mission.',{exact:true}).waitFor();
 await upgrade.close();console.log('PASS PWA: old root worker replaced, old demo cache deleted, API no-store, safe offline navigation');
 const selected=(await pool.query('SELECT id FROM sessions')).rows[0].id;
  assert.equal((await x.request.get(`http://localhost:4180/api/sessions/${selected}`)).status(),401);
 // Lose the response AFTER commit, wait for the real 15-second client timeout, then retry the same UUID.
 await w.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();
 await w.getByLabel('New message',{exact:true}).fill('Timeout retry must appear once');
 const timeoutKeys:string[]=[];let releaseTimeout!:()=>void,committed!:()=>void;
 const timeoutGate=new Promise<void>(r=>releaseTimeout=r),commitReached=new Promise<void>(r=>committed=r);
 const timeoutPattern='**/api/sessions/*/message';
 const timeoutHandler=async(route:any)=>{timeoutKeys.push(route.request().postDataJSON().key);const response=await route.fetch();if(timeoutKeys.length===1){assert.equal(response.status(),200);committed();await timeoutGate;}await route.fulfill({response}).catch(()=>{});};
 await w.route(timeoutPattern,timeoutHandler);
 try{
  await w.getByRole('button',{name:'Send message',exact:true}).click();await commitReached;
  await w.getByRole('alert').filter({hasText:'Request timed out'}).waitFor({timeout:20000});
   await w.getByText('The timed-out action may still complete after a refresh.',{exact:false}).waitFor();
   assert.equal(await w.getByRole('button',{name:'Send message',exact:true}).isDisabled(),true);
   assert.equal(await w.getByRole('button',{name:'Pause my play',exact:true}).isEnabled(),true);
   await w.getByRole('button',{name:'I understand the risk; unlock actions',exact:true}).click();
  await w.getByRole('button',{name:'Send message',exact:true}).click();
  await w.waitForFunction(()=>(document.querySelector('textarea[name="text"]') as HTMLTextAreaElement)?.value==='');
  for(let i=0;i<50&&timeoutKeys.length<2;i++)await new Promise(r=>setTimeout(r,100));
  assert.equal(timeoutKeys.length,2);assert.equal(timeoutKeys[0],timeoutKeys[1]);
  const snapshot=await w.evaluate(async()=>{const r=await fetch('/api/state');return r.json();});
  assert.equal(snapshot.sessions.flatMap((s:any)=>s.messages).filter((m:any)=>m.text==='Timeout retry must appear once').length,1);
 }finally{releaseTimeout();await w.unroute(timeoutPattern,timeoutHandler);}
  console.log('PASS timeout: explicit risk acknowledgement precedes same-key retry; committed message appears once');
 async function safetyWhilePending(kind:'mission'|'message'){
  await w.getByRole('navigation').getByRole('button',{name:kind==='mission'?'Missions':'Messages',exact:true}).click();
   if(kind==='mission'){if(!await w.getByLabel('Title',{exact:true}).isVisible())await w.getByText('New mission to review',{exact:true}).click();await w.getByLabel('Title',{exact:true}).fill('Held draft must not arrive');await w.getByLabel('Mission text and boundaries').fill('Held ordinary draft');}
  else await w.getByLabel('New message',{exact:true}).fill('Held message must not arrive');
  let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(r=>release=r),holding=new Promise<void>(r=>entered=r);
  const pattern=`**/api/sessions/*/${kind}`;
  const handler=async(route:any)=>{entered();await gate;await route.continue().catch(()=>{});};
  await w.route(pattern,handler);
  try{
   await w.getByRole('button',{name:kind==='mission'?'Save draft only':'Send message',exact:true}).click();
   await Promise.race([holding,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Ordinary request did not reach hold fixture')),5000))]);
   const [pause]=await Promise.all([w.waitForResponse((r:any)=>r.url().endsWith('/pause')&&r.request().method()==='POST',{timeout:5000}),w.getByRole('button',{name:'Pause my play',exact:true}).click({timeout:2000})]);assert.equal(pause.status(),200);
   const [stop]=await Promise.all([w.waitForResponse((r:any)=>r.url().endsWith('/stop')&&r.request().method()==='POST',{timeout:5000}),w.getByRole('button',{name:'Stop permanently',exact:true}).click({timeout:2000})]);assert.equal(stop.status(),200);
   const late=w.waitForResponse((r:any)=>r.url().endsWith('/'+kind)&&r.request().method()==='POST');release();assert.equal((await late).status(),409);
      await w.getByRole('heading',{name:'Stopped permanently',exact:true}).waitFor();
      if(kind==='mission')for(const page of [w,h]){
        await page.getByRole('navigation').getByRole('button',{name:'History',exact:true}).click();
        await page.locator('article').filter({hasText:'Reward request decided'}).filter({hasText:'Shared tea'}).filter({hasText:'Approved'}).waitFor();
        await page.locator('article').filter({hasText:'Reward request decided'}).filter({hasText:'Shared tea'}).filter({hasText:'Declined'}).waitFor();
      }
     await w.getByRole('region',{name:'Next step',exact:true}).getByRole('button',{name:'Reflect on this session',exact:true}).click();
     assert.equal(await w.getByLabel('Appreciation (optional)').evaluate((el:HTMLElement)=>el===document.activeElement),true);
    const closing=w.getByRole('region',{name:'Optional closing reflection',exact:true});
     await closing.getByLabel('Repeat next time (optional)').fill('Another quiet conversation.');
    await closing.getByRole('button',{name:'Save my reflection',exact:true}).click();
      await closing.locator('p').filter({hasText:'Another quiet conversation.'}).waitFor();
     for(const width of [320,390,768]){
       await w.setViewportSize({width,height:844});
       for(const language of ['he','en']){
         if(await w.locator('html').getAttribute('lang')!==language)await w.getByRole('button',{name:language==='he'?'עברית':'English',exact:true}).click();
         const next=w.getByRole('region',{name:language==='he'?'הצעד הבא':'Next step',exact:true});
         await next.getByRole('button',{name:language==='he'?'לשיתוף על המפגש':'Reflect on this session',exact:true}).focus();await w.keyboard.press('Enter');
         assert.equal(await w.locator('#reflection-appreciation').evaluate((el:HTMLElement)=>el===document.activeElement),true);
         await next.getByRole('button',{name:language==='he'?'להתחלת מפגש נוסף':'Start another session',exact:true}).focus();await w.keyboard.press('Enter');
         assert.equal(await w.locator('#new-session-terms').evaluate((el:HTMLElement)=>el===document.activeElement),true);
         assert.ok(await w.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`closing/new session overflow ${width} ${language}`);
         for(const selector of ['.reflection textarea','.reflection button','.session-select select','fieldset select','fieldset input']){
           for(const control of await w.locator(selector).all()){
             const box=await control.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width,`control outside viewport ${selector} ${width} ${language}`);
           }
         }
       }
     }
    assert.ok(await closing.evaluate((el:HTMLElement)=>!!(el.compareDocumentPosition([...document.querySelectorAll('h2')].find(h=>h.textContent==='New session')!)&Node.DOCUMENT_POSITION_FOLLOWING)),'Closing reflection appears before the new-session form');
   const snapshot=await w.evaluate(async()=>{const r=await fetch('/api/state');return r.json();});
   assert.ok(!JSON.stringify(snapshot).includes('must not arrive'));
  }finally{release();await w.unroute(pattern,handler);}
 }
 await safetyWhilePending('mission');
  await w.getByLabel('Exact terms and boundaries for mutual review').fill('A second safety regression session');await w.getByRole('button',{name:'Create session for review',exact:true}).click();
  await w.getByRole('heading',{name:'Active',exact:true}).waitFor();
  assert.equal(await w.getByLabel('Available minutes',{exact:true}).inputValue(),'15');
  const checkInSessions=await w.evaluate(async()=> (await (await fetch('/api/state')).json()).sessions);
  const oldCheckIn=checkInSessions.find((s:any)=>s.checkIns),newCheckIn=checkInSessions.find((s:any)=>s.status==='active');
   await w.getByLabel('Selected session / archive').selectOption(oldCheckIn.id);
   assert.equal(await w.getByLabel('Appreciation (optional)').inputValue(),'Thank you for choosing together.');
   assert.equal(await w.getByLabel('Repeat next time (optional)').inputValue(),'Another quiet conversation.');
  assert.equal(await w.getByLabel('Available minutes',{exact:true}).inputValue(),'25');
  assert.equal(await w.getByRole('button',{name:'Save my check-in',exact:true}).isDisabled(),true);
   await w.getByLabel('Selected session / archive').selectOption(newCheckIn.id);
   assert.equal(await w.getByLabel('Appreciation (optional)',{exact:true}).inputValue(),'');
   assert.equal(await w.getByLabel('Repeat next time (optional)',{exact:true}).inputValue(),'');
   console.log('PASS cycle 5: saved reflection fields restore from archive, new session is blank; 320/390/768 RTL/LTR closing/check-in controls fit and keyboard end-state actions focus real forms');
  assert.equal(await w.getByLabel('Available minutes',{exact:true}).inputValue(),'15');
  console.log('PASS cycle 2 browser: independent forms/shared summaries, held update, own values retained, session defaults/archive selection and terminal disabled');
 await w.getByRole('navigation').getByRole('button',{name:'Agreement',exact:true}).click();await w.getByRole('button',{name:'I have read and agree',exact:true}).click();
 await h.reload();await h.getByRole('navigation').getByRole('button',{name:'Agreement',exact:true}).click();await h.getByRole('button',{name:'I have read and agree',exact:true}).click();
 await safetyWhilePending('message');
 console.log('PASS safety: held draft and held message each allow actual successful pause AND stop requests; released ordinary requests fail without effects');
 const legacyContext=await browser.newContext();const legacy=await legacyContext.newPage();
 const violations:string[]=[];
 legacy.on('pageerror',(e:Error)=>errors.push(e.message));
 await legacy.addInitScript(()=>{document.addEventListener('securitypolicyviolation',e=>{(window as any).cspViolations=((window as any).cspViolations||[]).concat(e.violatedDirective);});});
 const legacyResponse=await legacy.goto('http://localhost:4180/legacy/');
 assert.ok(legacyResponse.headers()['content-security-policy'].includes("script-src 'self'"));
 await legacy.locator('#createBtn').click();await legacy.locator('#hostSessionState').filter({hasText:'Awaiting agreement'}).waitFor({timeout:3000});
 await legacy.locator('[data-view="rules"]').click();await legacy.locator('#hostAgree').check();await legacy.locator('#wifeAgree').check();await legacy.locator('#saveRules').click();
 await legacy.locator('[data-view="her"]').click();await legacy.locator('#missionText').fill('A legacy delegated mission');await legacy.locator('#sendMission').click();
 legacy.once('dialog',(dialog:any)=>dialog.accept('Edited legacy delegated mission'));await legacy.locator('#missionBoard').getByRole('button',{name:'Edit',exact:true}).click();await legacy.locator('#missionBoard').getByText('Edited legacy delegated mission',{exact:true}).waitFor();
 await legacy.locator('#missionBoard').getByRole('button',{name:'Approve / send',exact:true}).click();
 await legacy.locator('[data-view="host"]').click();await legacy.locator('#playerMissions').getByRole('button',{name:'Acknowledge',exact:true}).click();
 await legacy.locator('#playerMissions').getByText('Acknowledged — in progress',{exact:true}).waitFor();
 await legacy.locator('#playerMissions').getByRole('button',{name:'Submit completion',exact:true}).click();
 await legacy.locator('#playerMissions').getByText('Completed — awaiting her review',{exact:true}).waitFor();
 await legacy.locator('[data-view="her"]').click();await legacy.locator('#missionBoard').getByRole('button',{name:'Remove',exact:true}).click();await legacy.locator('#missionBoard').getByText('No missions yet.',{exact:true}).waitFor();
 assert.deepEqual(await legacy.evaluate(()=>(window as any).cspViolations||[]),violations);
 await legacyContext.close();console.log('PASS legacy: strict CSP, session creation, agreement and delegated edit/send/acknowledge/complete/remove, zero CSP violations');
  await w.getByRole('button',{name:'Sign out',exact:true}).click();await w.getByRole('button',{name:'Enter',exact:true}).waitFor();
  assert.equal((await w.request.get('http://127.0.0.1:4180/api/state')).status(),401);
  await w.reload();await w.getByRole('button',{name:'Enter',exact:true}).waitFor();
  await w.getByRole('checkbox').check();await w.getByRole('button',{name:'Enter',exact:true}).click();await w.locator('.account').waitFor();
  assert.equal(await w.evaluate(async()=> (await (await fetch('/api/state')).json()).user.id),guestIds[0]);
  assert.equal(await x.getByLabel('Email',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);console.log('PASS browser: logout and reload allow same-role re-entry, no email/password UI, terminal stop, zero uncaught page errors');
}finally{
 if(browser)await browser.close();if(vite)await vite.close();if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(r));}await pool.end();await db.stop();await rm(directory,{recursive:true,force:true});
}
