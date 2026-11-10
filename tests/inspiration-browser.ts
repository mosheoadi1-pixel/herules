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
const directory=await mkdtemp(join(tmpdir(),'her-rules-inspiration-'));
const db=await startDatabase(directory,Number(process.env.BROWSER_TEST_DB_PORT||55439)),pool=new pg.Pool({connectionString:db.url});
let browser:any,server:any,vite:any;
try {
 const app=await createApp(pool,'http://localhost:4189');
 app.use(express.static('public'));
 vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'spa'});app.use(vite.middlewares);
 server=app.listen(4189);
 browser=await chromium.launch({headless:true});
 const w=await (await browser.newContext()).newPage(),h=await (await browser.newContext()).newPage();
 for(const [page,role] of [[w,'wife'],[h,'husband']] as const){
  await page.goto('http://localhost:4189');await page.getByRole('button',{name:'English',exact:true}).click();
  await page.locator('select[name="role"]').selectOption(role);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Enter',exact:true}).click();
 }
 await w.getByRole('heading',{name:'New session',exact:true}).waitFor();
 await w.getByLabel('Exact terms and boundaries for mutual review',{exact:true}).fill('Optional activities; decline without penalty.');
 await w.getByRole('button',{name:'Create session for review',exact:true}).click();
 await h.getByRole('navigation').waitFor();
 assert.equal(await h.getByRole('navigation').getByRole('button',{name:'Punishments inspiration',exact:true}).count(),0);
 assert.equal(await w.getByRole('navigation').getByRole('button',{name:'Punishments inspiration',exact:true}).count(),1);
 await w.getByRole('navigation').getByRole('button',{name:'Rewards',exact:true}).click();
 const cards=w.locator('.cards.library article');
 const first=await cards.nth(0).locator('p').first().innerText(),second=await cards.nth(1).locator('p').first().innerText();
 await cards.nth(0).getByRole('button',{name:'Choose and edit',exact:true}).click();
 assert.equal(await w.getByLabel('Reward title',{exact:true}).inputValue(),first.slice(0,160));
 assert.equal(await w.locator('textarea[name="description"]').inputValue(),first);
 await w.getByLabel('Reward title',{exact:true}).fill('Edited title');await w.locator('textarea[name="description"]').fill('Edited description');
 assert.equal(await w.getByLabel('Reward title',{exact:true}).inputValue(),'Edited title');
 assert.equal(await w.locator('textarea[name="description"]').inputValue(),'Edited description');
 await w.getByLabel('Reward cost',{exact:true}).fill('17');
 await cards.nth(1).getByRole('button',{name:'Choose and edit',exact:true}).click();
 assert.equal(await w.getByLabel('Reward title',{exact:true}).inputValue(),second.slice(0,160));
 assert.equal(await w.locator('textarea[name="description"]').inputValue(),second);
 assert.equal(await w.getByLabel('Reward cost',{exact:true}).inputValue(),'','New idea must clear the previous price');
 assert.equal(await w.getByLabel('Reward cost',{exact:true}).evaluate((el:HTMLInputElement)=>el.required&&!el.checkValidity()),true);
 assert.equal(await w.evaluate(async()=> ((await(await fetch('/api/state')).json()).sessions[0].rewards??[]).length),0);
 await w.getByRole('navigation').getByRole('button',{name:'Punishments inspiration',exact:true}).click();
 const consequence=await w.locator('.cards.library article').first().locator('p').first().innerText();
 await w.locator('.cards.library article').first().getByRole('button',{name:'Choose and edit',exact:true}).click();
 assert.equal(await w.getByLabel('Title',{exact:true}).inputValue(),consequence.slice(0,150));
 assert.equal(await w.locator('#mission-composer textarea').inputValue(),consequence);
 await w.getByLabel('Title',{exact:true}).fill('Edited voluntary invitation');
 await w.locator('#mission-composer textarea').fill('An optional edited invitation.');
 assert.equal(await w.getByLabel('Title',{exact:true}).inputValue(),'Edited voluntary invitation');
 assert.equal(await w.evaluate(async()=> (await(await fetch('/api/state')).json()).sessions[0].missions.length),0);
 console.log('PASS inspiration browser: reward selection/editing and price reset, voluntary editable mission, wife-only tab');
} finally {
 await browser?.close();await vite?.close();await new Promise<void>(resolve=>server?server.close(()=>resolve()):resolve());
 await pool.end();await db.stop();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
