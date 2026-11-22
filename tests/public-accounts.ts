import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp } from '../server/app.ts';
import type { PublicIdentityProvider } from '../server/public-auth.ts';

const directory=await mkdtemp(join(tmpdir(),'her-rules-public-'));
const db=await startDatabase(directory,55444),pool=new pg.Pool({connectionString:db.url});
const origin='http://localhost:4195';
const previous=process.env.HR_MODE;
const servers:Server[]=[];
const listen=async(app:Awaited<ReturnType<typeof createApp>>)=>{const server=app.listen(0);servers.push(server);await new Promise(resolve=>server.once('listening',resolve));return `http://localhost:${(server.address() as AddressInfo).port}`;};
const post=(base:string,path:string,body:unknown,cookie='')=>fetch(`${base}/api${path}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body),redirect:'manual'});
const get=(base:string,path:string,cookie='')=>fetch(`${base}/api${path}`,{headers:cookie?{Cookie:cookie}:{},redirect:'manual'});
const cookieOf=(response:Response)=>/hr_public_session=[a-f0-9]{64}/.exec(response.headers.get('set-cookie')??'')?.[0]??'';
const tokenOf=(response:Response)=>/#public-pending=([A-Za-z0-9_-]+)$/.exec(response.headers.get('location')??'')?.[1]??'';

let lastChallenge='';
const fake:PublicIdentityProvider={
  name:'google',
  authorizeUrl({state,codeChallenge,redirectUri}){lastChallenge=codeChallenge;return `https://accounts.example.test/auth?state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(redirectUri)}`;},
  async exchange({code,codeVerifier,redirectUri}){
    assert.equal(createHash('sha256').update(codeVerifier).digest('base64url'),lastChallenge,'PKCE verifier must match the S256 challenge');
    assert.equal(redirectUri,`${origin}/api/public/auth/google/callback`);
    return {subject:code.replace(/^code:/,'')};
  },
};

try {
  delete process.env.HR_MODE;
  const privateBase=await listen(await createApp(pool,origin));
  for(const path of ['/public/config','/public/me','/public/auth/google/start']) assert.equal((await get(privateBase,path)).status,404,`${path} must not exist in private mode`);
  assert.equal((await post(privateBase,'/public/logout',{})).status,404,'public logout must not exist in private mode');
  const privateRegister=await post(privateBase,'/register',{email:'private@example.test',password:'correct horse battery',role:'wife',adult:true});
  assert.equal(privateRegister.status,200,'private email registration still works');
  assert.equal((await post(privateBase,'/login',{email:'private@example.test',password:'correct horse battery'})).status,200,'private email login still works');

  process.env.HR_MODE='public';
  const bareBase=await listen(await createApp(pool,origin));
  assert.deepEqual(await (await get(bareBase,'/public/config')).json(),{mode:'public'});
  assert.equal((await post(bareBase,'/register',{email:'x@example.test',password:'correct horse battery',role:'wife',adult:true})).status,404,'email registration is disabled in public mode');
  assert.equal((await post(bareBase,'/login',{email:'private@example.test',password:'correct horse battery'})).status,404,'email login is disabled in public mode');
  assert.equal((await post(bareBase,'/guest',{nickname:'Guest',role:'wife',adult:true})).status,404,'guest entry is disabled in public mode');
  const unconfigured=await get(bareBase,'/public/auth/google/start');
  assert.equal(unconfigured.status,503);
  assert.equal((await unconfigured.json()).error,'provider not configured');

  const base=await listen(await createApp(pool,origin,{google:fake}));
  const started=await get(base,'/public/auth/google/start');
  assert.equal(started.status,200);
  const {url}=await started.json();
  const state=new URL(url).searchParams.get('state')??'';
  assert.ok(state.length>=40,'state is random');
  assert.equal(new URL(url).searchParams.get('code_challenge_method'),'S256');
  assert.equal((await get(base,'/public/auth/apple/start')).status,503,'an unconfigured provider stays unavailable');
  assert.equal((await get(base,'/public/auth/google/callback?code=code:nova&state=not-a-real-state')).status,400,'an unknown state is rejected');

  const callback=await get(base,`/public/auth/google/callback?code=code:nova&state=${state}`);
  assert.equal(callback.status,302);
  const pendingToken=tokenOf(callback);
  assert.ok(pendingToken,'a new subject gets a pending registration token');
  assert.equal((await get(base,`/public/auth/google/callback?code=code:nova&state=${state}`)).status,400,'a state is single use');
  const expiredState=new URL((await (await get(base,'/public/auth/google/start')).json()).url).searchParams.get('state')??'';
  await pool.query("UPDATE public_auth_states SET expires_at=now()-interval '1 second' WHERE token=$1",[expiredState]);
  assert.equal((await get(base,`/public/auth/google/callback?code=code:late&state=${expiredState}`)).status,400,'an expired state is rejected');

  for(const body of [{nickname:'a',role:'sub',gender:'woman'},{nickname:'bad!name',role:'sub',gender:'woman'},{nickname:'Nova',role:'admin',gender:'woman'},{nickname:'Nova',role:'sub',gender:'robot'}])
    assert.equal((await post(base,'/public/register',{pendingToken,...body})).status,400,`invalid ${JSON.stringify(body)} must fail`);

  const registered=await post(base,'/public/register',{pendingToken,nickname:'  Nova Lee ',role:'sub',gender:'woman'});
  assert.equal(registered.status,200);
  const registeredBody=await registered.json();
  const {id,...profile}=registeredBody.user;
  assert.match(id,/^[0-9a-f-]{36}$/);
  assert.deepEqual(profile,{nickname:'Nova Lee',role:'sub',gender:'woman',status:'pending_verification'});
  const cookie=cookieOf(registered);
  assert.ok(cookie.startsWith('hr_public_session='),'register sets the public session cookie');
  assert.match(registered.headers.get('set-cookie')??'',/HttpOnly/i);
  assert.match(registered.headers.get('set-cookie')??'',/SameSite=Lax/i);

  const me=await get(base,'/public/me',cookie);
  assert.equal(me.status,200);
  assert.equal((await me.json()).user.status,'pending_verification');
  assert.equal((await get(base,'/state',cookie)).status,401,'a public session does not authenticate private routes');
  assert.equal((await get(base,'/public/me')).status,401,'me requires a session');

  const callbackFor=async(code:string)=>{const next=await (await get(base,'/public/auth/google/start')).json();return get(base,`/public/auth/google/callback?code=${code}&state=${new URL(next.url).searchParams.get('state')}`);};
  const bobToken=tokenOf(await callbackFor('code:bob'));
  assert.ok(bobToken,'a second new subject gets its own pending token');
  assert.equal((await post(base,'/public/register',{pendingToken:bobToken,nickname:'NOVA LEE',role:'dom',gender:'man'})).status,409,'nickname conflicts are case-insensitive');
  assert.equal((await pool.query('SELECT count(*) FROM public_auth_states WHERE token=$1',[bobToken])).rows[0].count,'1','a failed registration keeps the pending row');
  assert.equal((await post(base,'/public/register',{pendingToken:bobToken,nickname:'Bob Ray',role:'dom',gender:'man'})).status,200,'a nickname conflict does not consume the pending token');

  const again=await callbackFor('code:nova');
  assert.equal(again.headers.get('location'),'/','a known subject signs in instead of registering again');
  assert.ok(cookieOf(again).startsWith('hr_public_session='));
  assert.equal((await pool.query("SELECT count(*) FROM auth_identities WHERE provider_subject='nova'")).rows[0].count,'1','repeating a subject never creates a second identity');
  assert.equal((await pool.query('SELECT count(*) FROM public_users')).rows[0].count,'2');

  assert.equal((await post(base,'/public/register',{pendingToken,nickname:'Nova Again',role:'sub',gender:'woman'})).status,400,'a consumed pending token cannot register again');
  assert.equal((await pool.query('SELECT count(*) FROM public_auth_states WHERE token=$1',[pendingToken])).rows[0].count,'0','a successful registration consumes the pending row');

  const out=await post(base,'/public/logout',{},cookie);
  assert.equal(out.status,200);
  assert.equal((await get(base,'/public/me',cookie)).status,401,'logout invalidates the public session');
  assert.equal((await get(base,'/public/me',cookieOf(again))).status,200,'other public sessions are unaffected by logout');
  console.log('PASS public-accounts: private mode unchanged, public mode gates email routes, provider flow, registration, sessions');
} finally {
  if (previous===undefined) delete process.env.HR_MODE; else process.env.HR_MODE=previous;
  await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
  await pool.end();
  await db.stop();
  await rm(directory,{recursive:true,force:true});
}
