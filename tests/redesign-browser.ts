import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import pg from 'pg';
import { createServer } from 'vite';
import { createApp } from '../server/app.ts';
import { startDatabase } from '../scripts/db/runtime.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ovadia/Downloadsold/agent/.venv/Lib/site-packages/playwright/driver/package');
const directory=await mkdtemp(join(tmpdir(),'her-rules-redesign-'));
const db=await startDatabase(directory,55440),pool=new pg.Pool({connectionString:db.url});
let browser:any,server:any,vite:any;
try {
 const app=await createApp(pool,'http://localhost:4190');
 app.use(express.static('public'));
 vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'spa'});app.use(vite.middlewares);
 server=app.listen(4190);browser=await chromium.launch({headless:true});
 const w=await (await browser.newContext({reducedMotion:'reduce'})).newPage();
 const h=await (await browser.newContext()).newPage();
 for(const [page,role] of [[w,'wife'],[h,'husband']] as const){
  await page.addInitScript("window.testPermission='default';Object.defineProperty(Notification,'permission',{configurable:true,get(){return window.testPermission}})");
  await page.goto('http://localhost:4190');await page.locator('select[name="role"]').selectOption(role);
  await page.getByRole('checkbox').check();await page.locator('form button.primary').click();
 }
 await w.getByLabel('תנאים וגבולות מדויקים לבדיקה משותפת').fill('Optional activities, shared choice.');
 await w.getByRole('button',{name:'יצירת מפגש לבדיקה'}).click();
  await w.getByRole('navigation').waitFor();
  for(const page of [w,h]){
   await page.getByRole('navigation').waitFor();
   await page.getByRole('button',{name:'הפעלת התראות',exact:true}).waitFor();
   await page.evaluate(()=>{(window as any).testPermission='granted';window.dispatchEvent(new Event('focus'));});
   await page.getByText('התראות מופעלות',{exact:true}).waitFor({timeout:3000});
   await page.evaluate(()=>{(window as any).testPermission='denied';document.dispatchEvent(new Event('visibilitychange'));});
   await page.getByText('התראות חסומות. אפשר לשנות בהגדרות האתר בדפדפן.',{exact:true}).waitFor({timeout:3000});
   await page.evaluate(()=>{(window as any).testPermission='default';window.dispatchEvent(new Event('focus'));});
   await page.getByRole('button',{name:'הפעלת התראות',exact:true}).waitFor({timeout:3000});
   await page.evaluate(()=>{(window as any).savedNotification=window.Notification;Object.defineProperty(window,'Notification',{configurable:true,value:undefined});window.dispatchEvent(new Event('focus'));});
   await page.getByText('הדפדפן אינו תומך בהתראות.',{exact:true}).waitFor({timeout:3000});
   await page.evaluate(()=>{Object.defineProperty(window,'Notification',{configurable:true,value:(window as any).savedNotification});window.dispatchEvent(new Event('focus'));});
  }
  for(const page of [w,h]){
   await page.setViewportSize({width:320,height:800});
   for(const language of ['he','en']){
    if(language==='en')await page.getByRole('button',{name:'English',exact:true}).click();
    await page.evaluate(()=>{(window as any).testPermission='granted';window.dispatchEvent(new Event('focus'));});
    await page.getByText(language==='he'?'התראות מופעלות':'Notifications enabled',{exact:true}).waitFor({timeout:3000});
    await page.evaluate(()=>{(window as any).testPermission='denied';document.dispatchEvent(new Event('visibilitychange'));});
    await page.getByText(language==='he'?'התראות חסומות. אפשר לשנות בהגדרות האתר בדפדפן.':'Notifications blocked. Change this in your browser’s site settings.',{exact:true}).waitFor({timeout:3000});
    const nav=page.getByRole('navigation');
    await nav.getByRole('button',{name:language==='he'?'משימות':'Missions',exact:true}).click();
    await page.evaluate(()=>{const nav=document.querySelector('nav')!;nav.scrollLeft=document.documentElement.dir==='rtl'?-nav.scrollWidth:nav.scrollWidth;window.scrollTo(0,0);(window as any).focusOriginal=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(){(window as any).focusOriginal.call(this,{preventScroll:true});};});
    const before=await page.evaluate(()=>window.scrollY);
    await page.getByRole('region',{name:language==='he'?'הצעד הבא':'Next step'}).getByRole('button',{name:language==='he'?'לעיון בהסכמה':'Review agreement'}).evaluate((button:HTMLButtonElement)=>button.click());
    await page.waitForTimeout(100);
    const selected=await nav.locator('[aria-current="page"]').evaluate((button:HTMLElement)=>{const b=button.getBoundingClientRect(),n=button.parentElement!.getBoundingClientRect();return {left:b.left,right:b.right,navLeft:n.left,navRight:n.right};});
    assert.ok(selected.left>=selected.navLeft&&selected.right<=selected.navRight,`${language}: selected tab should fit in the navigation strip`);
    assert.equal(await page.evaluate(()=>window.scrollY),before,`${language}: tab strip scrolling must not scroll the page`);
    assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'H2');
    await page.evaluate(()=>{HTMLElement.prototype.focus=(window as any).focusOriginal;});
    for(const button of await page.locator('.safety button').all()){
     assert.equal(await button.isEnabled(),true);
     await button.evaluate((el:HTMLElement)=>el.scrollIntoView({block:'center'}));
     const reach=await button.evaluate((el:HTMLElement)=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,hit:hit?.outerHTML.slice(0,150),same:hit===el||el.contains(hit)};});
     assert.ok(reach.left>=0&&reach.right<=reach.width&&reach.top>=0&&reach.bottom<=reach.height&&reach.same,`${language}: safety control must be reachable in the viewport: ${JSON.stringify(reach)}`);
    }
   }
   await page.getByRole('button',{name:'עברית',exact:true}).click();
  }
  await w.getByRole('button',{name:'English',exact:true}).click();
  await w.getByRole('navigation').getByRole('button',{name:'Rewards',exact:true}).click();
  assert.ok(await w.getByText('No rewards yet.').isVisible());
  assert.ok(await w.getByText('No reward requests yet.').isVisible());
  await w.getByRole('navigation').getByRole('button',{name:'Messages',exact:true}).click();
  assert.ok(await w.getByText('No messages yet.').isVisible());
  await w.getByRole('navigation').getByRole('button',{name:'Idea library',exact:true}).click();
  assert.ok(await w.getByRole('heading',{name:/ways to choose together/}).evaluate((el:HTMLElement)=>el.getBoundingClientRect().top) < await w.getByRole('heading',{name:'How are we right now?'}).evaluate((el:HTMLElement)=>el.getBoundingClientRect().top));
  await w.getByRole('button',{name:'עברית',exact:true}).click();
 for(const language of ['he','en']) {
  if(language==='en') await w.getByRole('button',{name:'English',exact:true}).click();
  assert.equal(await w.locator('html').getAttribute('dir'),language==='he'?'rtl':'ltr');
  for(const width of [320,375,768]) {
   await w.setViewportSize({width,height:800});
   const tabs=language==='he'?['משימות','פרסים','ספריית השראה','השראת עונשים']:['Missions','Rewards','Idea library','Punishments inspiration'];
   for(const [index,tab] of tabs.entries()) {
    await w.getByRole('navigation').getByRole('button',{name:tab,exact:true}).click();
    const overflow=await w.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(overflow.scroll<=overflow.width,`${language} ${width} ${tab}: ${JSON.stringify(overflow)}`);
    assert.ok(await w.locator('.safety button').first().isVisible());
    assert.ok(await w.locator('.safety button').last().isVisible());
    await w.screenshot({path:join(tmpdir(),`her-rules-${language}-${width}-${index}.png`)});
   }
  }
 }
  await w.keyboard.press('Tab');
  assert.equal(await w.evaluate(()=>document.activeElement?.matches(':focus-visible')),true);
  assert.equal(await w.locator('.roulette-wheel').evaluate((el:HTMLElement)=>getComputedStyle(el).transitionDuration),'1e-05s');
  for(const page of [w,h]){
   if(await page.locator('html').getAttribute('lang')==='he') await page.getByRole('button',{name:'English',exact:true}).click();
   page.on('dialog',(dialog:any)=>dialog.accept());
   await page.getByRole('navigation').getByRole('button',{name:'Agreement',exact:true}).click();
   await page.getByRole('button',{name:'I have read and agree',exact:true}).click();
  }
  const post=async(page:any,op:string,body:any)=>page.evaluate(async({op,body}:any)=>{
   const state=await(await fetch('/api/state')).json();
   const response=await fetch(`/api/sessions/${state.sessions[0].id}/${op}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!response.ok) throw new Error(`${op}: ${response.status} ${await response.text()}`);
   return response.json();
  },{op,body});
  const first=(await post(w,'mission',{key:crypto.randomUUID(),title:'First invitation',text:'Optional first',points:0,completionStyle:'written'})).mission;
  await post(w,'deliver',{mission:first.id});await post(h,'ack',{mission:first.id});
  for(const page of [w,h]) await page.getByRole('navigation').getByRole('button',{name:'Missions',exact:true}).click();
  const current=w.getByRole('region',{name:'Current invitation',exact:true});
  await current.getByRole('heading',{name:'First invitation',exact:true}).waitFor();
  for(const control of ['Session persona','Optional follow-up ideas','New mission to review','Optional invitation sequence']){
   const element=w.getByText(control,{exact:true});
   assert.ok(await current.evaluate((el:HTMLElement,other:HTMLElement)=>!!(el.compareDocumentPosition(other)&Node.DOCUMENT_POSITION_FOLLOWING),await element.elementHandle()),`Current invitation must precede ${control} in document order`);
   assert.ok((await current.boundingBox()).y < (await element.boundingBox()).y,`Current invitation must appear above ${control}`);
  }
  const firstCard=h.locator(`#mission-${first.id}`);
  await firstCard.getByLabel('Written completion').fill('Unsent report');
  await firstCard.evaluate((el:HTMLElement)=>(window as any).originalMissionCard=el);
  const second=(await post(w,'mission',{key:crypto.randomUUID(),title:'Second invitation',text:'Optional second',points:0})).mission;
  await post(w,'deliver',{mission:second.id});
  await h.getByRole('region',{name:'Current invitation',exact:true}).getByRole('heading',{name:'Second invitation',exact:true}).waitFor();
  assert.equal(await firstCard.evaluate((el:HTMLElement)=>el===(window as any).originalMissionCard),true,'The old mission card stays mounted');
  await h.locator('.other-invitation > summary').filter({hasText:'First invitation'}).click();
  assert.equal(await firstCard.getByLabel('Written completion').inputValue(),'Unsent report');
  await h.getByRole('region',{name:'Current invitation',exact:true}).getByRole('button',{name:'Decline without penalty',exact:true}).click();
  await h.getByRole('region',{name:'Current invitation',exact:true}).getByRole('heading',{name:'First invitation',exact:true}).waitFor();
  assert.equal(await firstCard.evaluate((el:HTMLElement)=>el===(window as any).originalMissionCard),true);
  assert.equal(await firstCard.getByLabel('Written completion').inputValue(),'Unsent report');
  const draft=(await post(w,'mission',{key:crypto.randomUUID(),title:'Editable invitation',text:'Original draft',points:0})).mission;
  await w.getByRole('region',{name:'Current invitation',exact:true}).getByRole('heading',{name:'Editable invitation',exact:true}).waitFor();
  await w.getByRole('region',{name:'Current invitation',exact:true}).getByRole('button',{name:'Edit draft',exact:true}).click();
  assert.equal(await w.getByLabel('Title',{exact:true}).inputValue(),'Editable invitation');
  assert.equal(await w.getByLabel('Title',{exact:true}).evaluate((el:HTMLElement)=>el===document.activeElement),true);
  await w.getByLabel('Mission text and boundaries').fill('Edited draft');
  await w.getByRole('button',{name:'Save draft only',exact:true}).click();
  await w.locator(`#mission-${draft.id}`).getByText('Edited draft',{exact:true}).waitFor();
 console.log('PASS redesign: RTL/LTR, 320/375/768, four tabs, screenshots, safety visibility, keyboard focus and reduced motion');
} finally {
 await browser?.close();await new Promise<void>(resolve=>server?server.close(()=>resolve()):resolve());
 await vite?.close();await pool.end();await db.stop();await rm(directory,{recursive:true,force:true});
}
