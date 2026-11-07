import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startDatabase } from '../scripts/db/runtime.mjs';
const directory=await mkdtemp(join(tmpdir(),'her-rules-production-'));
const db=await startDatabase(directory,55436);
let child:ReturnType<typeof spawn>|undefined;
try{
 child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,DATABASE_URL:db.url,NODE_ENV:'production',APP_ORIGIN:'https://her-rules.example',PORT:'4181'},stdio:['ignore','pipe','pipe']});
 let diagnostics='';child.stdout!.on('data',d=>{diagnostics+=d;});child.stderr!.on('data',d=>{diagnostics+=d;});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://localhost:4181/')).ok){ready=true;break;}}catch{}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready,'Production process failed to start: '+diagnostics);
 const root=await fetch('http://localhost:4181/');const html=await root.text();assert.match(html,/\/assets\/index-[^\"]+\.js/);assert.ok(!html.includes('/src/main.tsx'));assert.equal(root.headers.get('strict-transport-security'),'max-age=31536000');
 const script=/src="([^\"]+\.js)"/.exec(html)![1];assert.equal((await fetch('http://localhost:4181'+script)).status,200);
 const worker=await fetch('http://localhost:4181/sw.js');assert.equal(worker.headers.get('cache-control'),'no-cache');assert.ok((await worker.text()).includes('skipWaiting'));
 assert.equal((await fetch('http://localhost:4181/server/app.ts')).status,404);
  const legacy=await fetch('http://localhost:4181/legacy/');assert.equal(legacy.status,200);assert.equal(legacy.headers.get('content-security-policy'),root.headers.get('content-security-policy'));assert.match(legacy.headers.get('content-security-policy')!,/script-src 'self';/);
  assert.match(await legacy.text(),/<script src="\.\/demo\.js"><\/script>/);assert.equal((await fetch('http://localhost:4181/legacy/demo.js')).status,200);
 const registration=await fetch('http://localhost:4181/api/register',{method:'POST',headers:{Origin:'https://her-rules.example','Content-Type':'application/json'},body:JSON.stringify({email:'production@smoke.test',password:'production-smoke-long',adult:true,role:'wife'})});
 assert.equal(registration.status,200);const cookie=registration.headers.get('set-cookie')!;assert.ok(cookie.includes('Secure'));assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Lax'));assert.equal(registration.headers.get('cache-control'),'no-store');
  assert.equal((await fetch('http://localhost:4181/api/logout',{method:'POST',headers:{Origin:'http://localhost:4181','Content-Type':'application/json'},body:'{}'})).status,403);
  const guest=await fetch('http://localhost:4181/api/guest',{method:'POST',headers:{Origin:'https://her-rules.example','Content-Type':'application/json'},body:JSON.stringify({nickname:'Production guest',adult:true,role:'husband'})});assert.equal(guest.status,200);
  const guestCookie=guest.headers.get('set-cookie')!;for(const attribute of ['Secure','HttpOnly','SameSite=Lax','Max-Age=604800'])assert.ok(guestCookie.includes(attribute));
 console.log('PASS production entry: real server/index.ts, PostgreSQL migration, built bundle/assets, Secure cookies, HSTS, exact HTTPS Origin, no source serving, root worker headers, scoped legacy');
}finally{
 if(child&&child.exitCode===null){const exit=new Promise<void>(r=>child!.once('exit',()=>r()));child.kill();await exit;}
 await db.stop();await rm(directory,{recursive:true,force:true});
}
