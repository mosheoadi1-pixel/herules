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
const fixtureEmail='test-user@example.test';
const fixtureHash=createHash('sha256').update(fixtureEmail).digest('hex');
const emailOf=new Map<string,{email?:string;emailVerified:boolean}>();
const fake:PublicIdentityProvider={
  name:'google',
  authorizeUrl({state,codeChallenge,redirectUri}){lastChallenge=codeChallenge;return `https://accounts.example.test/auth?state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(redirectUri)}`;},
  async exchange({code,codeVerifier,redirectUri}){
    assert.equal(createHash('sha256').update(codeVerifier).digest('base64url'),lastChallenge,'PKCE verifier must match the S256 challenge');
    assert.equal(redirectUri,`${origin}/api/public/auth/google/callback`);
    const subject=code.replace(/^code:/,'');
    const identity=emailOf.get(subject);
    return {subject,email:identity?.email,emailVerified:identity?.emailVerified===true};
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
  const savedAdmin={hash:process.env.ADMIN_HASH,ids:process.env.HR_ADMIN_PUBLIC_IDS};
  try{
    const signIn=async(app:string,subject:string)=>{const started=await (await get(app,'/public/auth/google/start')).json();return get(app,`/public/auth/google/callback?code=code:${subject}&state=${new URL(started.url).searchParams.get('state')}`);};
    const enrol=async(app:string,subject:string,nickname:string)=>{
      const token=tokenOf(await signIn(app,subject));
      assert.ok(token,`${subject} gets a pending registration`);
      const registered=await post(app,'/public/register',{pendingToken:token,nickname,role:'sub',gender:'woman'});
      assert.equal(registered.status,200,`${subject} registers`);
      return {id:(await registered.json()).user.id as string,cookie:cookieOf(registered)};
    };
    const me=async(app:string,cookie:string)=>{const response=await get(app,'/public/me',cookie);assert.equal(response.status,200);return response.json() as Promise<{user:{id:string;status:string};isAdmin:boolean}>;};
    const hashOf=async(id:string)=>(await pool.query('SELECT email_sha256 FROM public_users WHERE id=$1',[id])).rows[0].email_sha256 as string|null;

    for(const bad of ['a'.repeat(63),'A'.repeat(64),'z'.repeat(64)]){
      process.env.ADMIN_HASH=bad;
      await assert.rejects(createApp(pool,origin,{google:fake}),/ADMIN_HASH must be 64 lowercase hex characters/,'a malformed ADMIN_HASH fails startup');
    }
    process.env.ADMIN_HASH='';
    await assert.doesNotReject(createApp(pool,origin,{google:fake}),'an empty ADMIN_HASH leaves email-based admin off');

    emailOf.set('admin-subject',{email:fixtureEmail,emailVerified:true});
    emailOf.set('unverified-subject',{email:fixtureEmail,emailVerified:false});
    emailOf.set('late-subject',{emailVerified:false});
    process.env.ADMIN_HASH=fixtureHash;
    const adminBase=await listen(await createApp(pool,origin,{google:fake}));
    const admin=await enrol(adminBase,'admin-subject','Ada Admin');
    const unverified=await enrol(adminBase,'unverified-subject','Una Lee');
    const late=await enrol(adminBase,'late-subject','Lale Yan');
    assert.equal(await hashOf(admin.id),fixtureHash,'a verified email stores its hash at registration');
    assert.equal(await hashOf(unverified.id),null,'an unverified email stores no hash');
    assert.equal(await hashOf(late.id),null,'no verified email stores no hash');

    const adminMe=await me(adminBase,admin.cookie);
    assert.equal(adminMe.isAdmin,true,'a verified email whose hash matches ADMIN_HASH is admin');
    assert.ok(!JSON.stringify(adminMe).includes(fixtureHash)&&!JSON.stringify(adminMe).includes(fixtureEmail),'/me never returns the hash or the email');
    assert.equal((await get(adminBase,'/public/admin/reviews',admin.cookie)).status,200,'an admin reaches the review list');
    assert.equal((await me(adminBase,unverified.cookie)).isAdmin,false,'an unverified email is not admin');
    assert.equal((await me(adminBase,late.cookie)).isAdmin,false,'a user without an email is not admin');
    const refused=await get(adminBase,'/public/admin/reviews',unverified.cookie);
    assert.equal(refused.status,403,'a non-admin gets 403 on the review list');
    assert.equal((await refused.json()).error,'Reviewer role required');

    process.env.ADMIN_HASH='0'.repeat(63)+'1';
    assert.equal((await me(adminBase,admin.cookie)).isAdmin,false,'a stored hash that differs from ADMIN_HASH is not admin');
    assert.equal((await get(adminBase,'/public/admin/reviews',admin.cookie)).status,403,'the review list refuses a non-matching hash');
    delete process.env.ADMIN_HASH;
    assert.equal((await me(adminBase,admin.cookie)).isAdmin,false,'with ADMIN_HASH unset, email-based admin is off');

    process.env.HR_ADMIN_PUBLIC_IDS=` ${unverified.id.toUpperCase()} `;
    assert.equal((await me(adminBase,unverified.cookie)).isAdmin,true,'HR_ADMIN_PUBLIC_IDS still makes an admin');
    assert.equal((await get(adminBase,'/public/admin/reviews',unverified.cookie)).status,200,'and that admin reaches the review list');
    assert.equal((await me(adminBase,admin.cookie)).isAdmin,false,'listing an id does not grant admin to others');
    delete process.env.HR_ADMIN_PUBLIC_IDS;

    process.env.ADMIN_HASH=fixtureHash;
    emailOf.set('late-subject',{email:fixtureEmail,emailVerified:true});
    const again=await signIn(adminBase,'late-subject');
    assert.equal(again.headers.get('location'),'/','a known subject signs in');
    assert.equal(await hashOf(late.id),fixtureHash,'a verified sign-in stores the hash for an existing account');
    assert.equal((await me(adminBase,cookieOf(again))).isAdmin,true,'the account is admin from its next sign-in on');

    const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='public_users'")).rows.map(row=>row.column_name);
    assert.ok(!columns.includes('email'),'public_users has no email column');
    const stored=(await pool.query("SELECT row_to_json(u)::text AS row FROM public_users u UNION ALL SELECT row_to_json(s)::text FROM public_auth_states s UNION ALL SELECT row_to_json(i)::text FROM auth_identities i")).rows;
    for(const {row} of stored)assert.ok(!row.includes(fixtureEmail),'no stored row contains the plaintext email');
    assert.ok(stored.some(({row})=>row.includes(fixtureHash)),'the hash is what gets stored');
  } finally {
    for(const [key,value] of [['ADMIN_HASH',savedAdmin.hash],['HR_ADMIN_PUBLIC_IDS',savedAdmin.ids]] as const){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
  console.log('PASS public-accounts: private mode unchanged, public mode gates email routes, provider flow, registration, sessions, admin gate by email hash');
} finally {
  if (previous===undefined) delete process.env.HR_MODE; else process.env.HR_MODE=previous;
  await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
  await pool.end();
  await db.stop();
  await rm(directory,{recursive:true,force:true});
}
