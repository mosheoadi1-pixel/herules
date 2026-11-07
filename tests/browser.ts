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
const db=await startDatabase(directory,55435),pool=new pg.Pool({connectionString:db.url});
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
  await aliasPage.getByLabel('כינוי פרטי (עד 40 תווים)',{exact:true}).fill('בדיקת כתובת');
  await aliasPage.getByRole('checkbox').check();
  await aliasPage.locator('form button.primary').click();
  await aliasPage.locator('.account').waitFor();
  await aliasPage.reload();await aliasPage.locator('.account').waitFor();
   console.log('PASS address aliases: nonconfigured 127.0.0.1 guest entry and cookie reload without Origin rejection');
  const contexts=[aliasContext,await browser.newContext(),await browser.newContext()];
  const w=aliasPage,h=await contexts[1].newPage(),x=await contexts[2].newPage();
 const errors:string[]=[];
 for(const p of [w,h,x])p.on('pageerror',(e:Error)=>errors.push(e.message));
  async function guestForm(page:any,role:string){
  await page.goto('http://localhost:4180');assert.equal(await page.locator('html').getAttribute('lang'),'he');assert.equal(await page.locator('html').getAttribute('dir'),'rtl');await page.getByRole('button',{name:'English',exact:true}).click();
  assert.equal(await page.getByLabel('Email',{exact:true}).count(),0);
  await page.getByText('Guest access is bound only to this browser cookie',{exact:false}).waitFor();
  await page.getByLabel('Private nickname (up to 40 characters)',{exact:true}).fill('Shared nickname');
  await page.getByLabel('Fixed role in the pair').selectOption(role);
   await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Enter as guest',exact:true}).click();
  }
  await w.getByRole('button',{name:'English',exact:true}).click();
  await w.getByRole('heading',{name:'Waiting for the second player',exact:true}).waitFor();
  assert.equal(await w.getByRole('button',{name:'Create new invitation',exact:true}).count(),0);
  await guestForm(h,'husband');await h.getByRole('heading',{name:'New session',exact:true}).waitFor();
  await guestForm(x,'husband');await x.getByRole('alert').filter({hasText:'already occupied'}).waitFor();
  const guestIds=await Promise.all([w,h].map(p=>p.evaluate(async()=> (await (await fetch('/api/state')).json()).user.id)));assert.equal(new Set(guestIds).size,2);
  const pairIds=await Promise.all([w,h].map(p=>p.evaluate(async()=> (await (await fetch('/api/state')).json()).user.pair_id)));assert.ok(pairIds[0]);assert.equal(pairIds[0],pairIds[1]);
  await w.reload();await w.getByRole('heading',{name:'New session',exact:true}).waitFor();
 assert.equal(await w.evaluate(async()=> (await (await fetch('/api/state')).json()).user.id),guestIds[0]);
  console.log('Browser checkpoint: two role slots, automatic shared game, third player rejected, no invitation UI, reload retains identity');
 await w.getByRole('heading',{name:'New session',exact:true}).waitFor();
 await w.getByLabel('Exact terms and boundaries for mutual review',{exact:true}).fill('Only optional tea and kind notes. No penalties for boundaries.');
 await w.getByRole('button',{name:'Create session for review',exact:true}).click();
 await w.getByRole('navigation').getByRole('button',{name:'Agreement',exact:true}).click();
 w.on('dialog',(d:any)=>d.accept());h.on('dialog',(d:any)=>d.accept());
 await w.getByRole('button',{name:'I have read and agree',exact:true}).click();
 await h.getByRole('navigation').getByRole('button',{name:'Agreement',exact:true}).click();await h.getByRole('button',{name:'I have read and agree',exact:true}).click();
 await w.getByRole('navigation').getByRole('button',{name:'Missions',exact:true}).click();
 await w.getByLabel('Title',{exact:true}).fill('Private tea invitation');await w.getByLabel('Mission text and boundaries',{exact:true}).fill('Would you like to prepare optional mint tea?');
 await w.getByLabel('Secret until explicit sending or scheduled delivery',{exact:true}).check();
 await w.getByRole('button',{name:'Save draft only',exact:true}).click();
 await w.getByRole('heading',{name:'Private tea invitation',exact:true}).waitFor();
 await h.getByRole('navigation').getByRole('button',{name:'Missions',exact:true}).click();
 assert.equal(await h.getByText('Would you like to prepare optional mint tea?',{exact:true}).count(),0);
  assert.equal((await x.request.get('http://localhost:4180/api/state')).status(),401);
 await w.getByRole('button',{name:'Send now',exact:true}).click();
 await h.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).waitFor();
 assert.equal(await h.getByLabel('Written completion',{exact:true}).count(),0);
 await h.getByRole('button',{name:'Read, acknowledge and choose to participate',exact:true}).click();
 await h.getByLabel('Written completion',{exact:true}).fill('Tea offered freely.');await h.getByRole('button',{name:'Submit completion',exact:true}).click();
 await w.getByRole('button',{name:'Approve and award once',exact:true}).click();
 await w.getByText('5 points',{exact:false}).first().waitFor();
 await w.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();
 await contexts[1].route('**/api/events',async(route:any)=>route.abort());await h.reload();
 await w.getByLabel('New message',{exact:true}).fill('Thank you for the lovely tea.');await w.getByRole('button',{name:'Send message',exact:true}).click();
 await h.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();await h.getByText('Thank you for the lovely tea.',{exact:true}).waitFor();
 await h.reload();await h.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();await h.getByText('Thank you for the lovely tea.',{exact:true}).waitFor();
 await w.getByRole('button',{name:'Pause my play',exact:true}).click();await h.getByRole('button',{name:'Pause my play',exact:true}).click();
 await w.getByRole('button',{name:'Release my pause',exact:true}).click();
 await w.getByText('1 active pauses',{exact:false}).waitFor();
 await h.getByRole('button',{name:'Release my pause',exact:true}).click();
 await w.getByRole('navigation').getByRole('button',{name:'Idea library',exact:true}).click();
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
   for(const id of ['missions','agreement','library','messages','inbox','history']){
    const index=['missions','agreement','library','messages','inbox','history'].indexOf(id);await w.getByRole('navigation').getByRole('button').nth(index).click();
    assert.ok(await w.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`overflow ${width} ${language} ${id}`);
   }
  }
 }
 console.log('PASS mobile: 320/390/768px, Hebrew RTL + English LTR, all six session tabs have no horizontal overflow');
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
  await w.getByRole('button',{name:'Send message',exact:true}).click();
  await w.waitForFunction(()=>(document.querySelector('textarea[name="text"]') as HTMLTextAreaElement)?.value==='');
  for(let i=0;i<50&&timeoutKeys.length<2;i++)await new Promise(r=>setTimeout(r,100));
  assert.equal(timeoutKeys.length,2);assert.equal(timeoutKeys[0],timeoutKeys[1]);
  const snapshot=await w.evaluate(async()=>{const r=await fetch('/api/state');return r.json();});
  assert.equal(snapshot.sessions.flatMap((s:any)=>s.messages).filter((m:any)=>m.text==='Timeout retry must appear once').length,1);
 }finally{releaseTimeout();await w.unroute(timeoutPattern,timeoutHandler);}
 console.log('PASS timeout: committed response stalled, actual 15-second timeout releases ordinary controls; retry reuses UUID and creates no duplicate');
 async function safetyWhilePending(kind:'mission'|'message'){
  await w.getByRole('navigation').getByRole('button',{name:kind==='mission'?'Missions':'Messages',exact:true}).click();
  if(kind==='mission'){await w.getByLabel('Title',{exact:true}).fill('Held draft must not arrive');await w.getByLabel('Mission text and boundaries').fill('Held ordinary draft');}
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
   const snapshot=await w.evaluate(async()=>{const r=await fetch('/api/state');return r.json();});
   assert.ok(!JSON.stringify(snapshot).includes('must not arrive'));
  }finally{release();await w.unroute(pattern,handler);}
 }
 await safetyWhilePending('mission');
 await w.getByLabel('Exact terms and boundaries for mutual review').fill('A second safety regression session');await w.getByRole('button',{name:'Create session for review',exact:true}).click();
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
  await w.getByRole('button',{name:'Sign out',exact:true}).click();await w.getByRole('button',{name:'Enter as guest',exact:true}).waitFor();
  assert.equal((await w.request.get('http://127.0.0.1:4180/api/state')).status(),401);
  await w.reload();await w.getByRole('button',{name:'Enter as guest',exact:true}).waitFor();
  await w.getByLabel('Private nickname (up to 40 characters)',{exact:true}).fill('בדיקת כתובת');await w.getByRole('checkbox').check();await w.getByRole('button',{name:'Enter as guest',exact:true}).click();await w.getByRole('alert').filter({hasText:'already occupied'}).waitFor();
  await x.getByRole('button',{name:'Existing account? Email and password sign in',exact:true}).click();await x.getByLabel('Email',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS browser: logout loses guest access without releasing role, same nickname cannot take over, optional existing-account sign-in UI, third player denied, terminal stop, zero uncaught page errors');
}finally{
 if(browser)await browser.close();if(vite)await vite.close();if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(r));}await pool.end();await db.stop();await rm(directory,{recursive:true,force:true});
}
