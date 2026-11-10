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
  await page.goto('http://localhost:4190');await page.locator('select[name="role"]').selectOption(role);
  await page.getByRole('checkbox').check();await page.locator('form button.primary').click();
 }
 await w.getByLabel('תנאים וגבולות מדויקים לבדיקה משותפת').fill('Optional activities, shared choice.');
 await w.getByRole('button',{name:'יצירת מפגש לבדיקה'}).click();
 await w.getByRole('navigation').waitFor();
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
 console.log('PASS redesign: RTL/LTR, 320/375/768, four tabs, screenshots, safety visibility, keyboard focus and reduced motion');
} finally {
 await browser?.close();await new Promise<void>(resolve=>server?server.close(()=>resolve()):resolve());
 await vite?.close();await pool.end();await db.stop();await rm(directory,{recursive:true,force:true});
}
