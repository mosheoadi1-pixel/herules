import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp } from '../server/app.ts';
import type { PublicIdentityProvider } from '../server/public-auth.ts';
import { purgeExpiredVerificationMedia, requireVerified, retentionDays, type PublicVerifier } from '../server/public-verification.ts';
import { VERIFICATION_CONSENT_VERSION } from '../src/verification-consent.ts';

const directory=await mkdtemp(join(tmpdir(),'her-rules-verification-'));
const storage=join(directory,'verification');
const db=await startDatabase(directory,55445),pool=new pg.Pool({connectionString:db.url});
const origin='http://localhost:4196';
const previous={mode:process.env.HR_MODE,dir:process.env.HR_VERIFICATION_DIR,admins:process.env.HR_ADMIN_PUBLIC_IDS};
const servers:Server[]=[];
const listen=async(app:Awaited<ReturnType<typeof createApp>>)=>{const server=app.listen(0);servers.push(server);await new Promise(resolve=>server.once('listening',resolve));return `http://localhost:${(server.address() as AddressInfo).port}`;};
const post=(base:string,path:string,body:unknown,cookie='')=>fetch(`${base}/api${path}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body),redirect:'manual'});
const get=(base:string,path:string,cookie='')=>fetch(`${base}/api${path}`,{headers:cookie?{Cookie:cookie}:{},redirect:'manual'});
const cookieOf=(response:Response)=>/hr_public_session=[a-f0-9]{64}/.exec(response.headers.get('set-cookie')??'')?.[0]??'';
const tokenOf=(response:Response)=>/#public-pending=([A-Za-z0-9_-]+)$/.exec(response.headers.get('location')??'')?.[1]??'';
const jpeg=(size=64)=>Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(size,7)]);
const png=(size=64)=>Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(size,9)]);
const dataUrl=(mime:string,bytes:Buffer)=>`data:${mime};base64,${bytes.toString('base64')}`;
const mediaMarkers=['data:image','storage_path','.jpg','.png'];

// Every JSON response goes through here: the status must match and no media may appear in the body.
async function body(response:Response,status=200){
  const text=await response.text();
  assert.equal(response.status,status,text);
  for(const marker of mediaMarkers)assert.ok(!text.includes(marker),`media marker ${marker} must not appear in a JSON response`);
  return text?JSON.parse(text):null;
}

type Outcome={result:'passed'|'failed'|'review';reason:string}|'throw';
let outcome:Outcome={result:'review',reason:'needs a person'};
const calls:{method:string;media:Buffer[]}[]=[];
const fakeVerifier:PublicVerifier={
  async check({method,media}){
    calls.push({method,media});
    if(outcome==='throw')throw new Error('upstream exploded');
    return outcome;
  },
};
const fake:PublicIdentityProvider={
  name:'google',
  authorizeUrl({state,redirectUri}){return `https://accounts.example.test/auth?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;},
  async exchange({code}){return {subject:code.replace(/^code:/,''),emailVerified:false};},
};

async function signUp(base:string,code:string,nickname:string){
  const started=await (await get(base,'/public/auth/google/start')).json();
  const state=new URL(started.url).searchParams.get('state')??'';
  const token=tokenOf(await get(base,`/public/auth/google/callback?code=code:${code}&state=${state}`));
  assert.ok(token,`${nickname} gets a pending registration`);
  const registered=await post(base,'/public/register',{pendingToken:token,nickname,role:'sub',gender:'woman'});
  assert.equal(registered.status,200,`${nickname} registers`);
  return {id:(await registered.json()).user.id as string,cookie:cookieOf(registered)};
}
const consent=async(base:string,user:{cookie:string})=>body(await post(base,'/public/consent',{kind:'verification',textVersion:VERIFICATION_CONSENT_VERSION},user.cookie));
const submit=(base:string,user:{cookie:string},method:string,media:string[])=>post(base,'/public/verification',{method,media},user.cookie);
const statusOf=async(base:string,user:{cookie:string})=>(await body(await get(base,'/public/me',user.cookie))).user.status as string;
const isVerified=async(id:string)=>(await pool.query('SELECT verified_at IS NOT NULL AS ok FROM public_users WHERE id=$1',[id])).rows[0].ok as boolean;

try {
  delete process.env.HR_MODE;
  const privateBase=await listen(await createApp(pool,origin,{google:fake},fakeVerifier));
  const someId='00000000-0000-4000-8000-000000000001';
  for(const [method,path] of [['POST','/public/consent'],['GET','/public/verification'],['POST','/public/verification'],['GET','/public/admin/reviews'],['GET',`/public/admin/reviews/${someId}/media`],['POST',`/public/admin/reviews/${someId}/decision`]] as const){
    const response=method==='GET'?await get(privateBase,path):await post(privateBase,path,{});
    assert.equal(response.status,404,`${method} ${path} must not exist in private mode`);
  }

  process.env.HR_MODE='public';
  process.env.HR_VERIFICATION_DIR=storage;
  delete process.env.HR_ADMIN_PUBLIC_IDS;
  assert.equal(retentionDays({}),7,'retention defaults to seven days');
  assert.equal(retentionDays({HR_VERIFICATION_RETENTION_DAYS:'3'}),3);
  for(const value of ['0','366','7d','-1']) assert.throws(()=>retentionDays({HR_VERIFICATION_RETENTION_DAYS:value}),/HR_VERIFICATION_RETENTION_DAYS/,`retention ${value} must fail closed`);
  assert.throws(()=>requireVerified({status:'pending_verification'}),/Verification required/);
  assert.equal(requireVerified({status:'verified'}).status,'verified');

  const unconfigured=await listen(await createApp(pool,origin,{google:fake}));
  const plain=await signUp(unconfigured,'plain','Plain Pat');
  assert.equal((await body(await submit(unconfigured,plain,'id_document',[dataUrl('image/jpeg',jpeg())]),503)).error,'verification not configured','no verifier configured returns 503');

  const base=await listen(await createApp(pool,origin,{google:fake},fakeVerifier));
  const nova=await signUp(base,'nova','Nova Lee');
  const bob=await signUp(base,'bob','Bob Ray');
  const cara=await signUp(base,'cara','Cara Lin');
  const dee=await signUp(base,'dee','Dee Park');
  const eli=await signUp(base,'eli','Eli Stone');
  const fox=await signUp(base,'fox','Fox Hart');
  const gus=await signUp(base,'gus','Gus Vale');

  const beforeConsent=await submit(base,bob,'id_document',[dataUrl('image/jpeg',jpeg())]);
  assert.equal((await body(beforeConsent,409)).error,'Consent required','verification requires recorded consent');
  assert.equal((await body(await get(base,'/public/verification',bob.cookie))).consented,false);
  assert.equal((await post(base,'/public/consent',{kind:'verification',textVersion:'verification-old'},bob.cookie)).status,400,'consent must reference the current text');
  assert.equal((await post(base,'/public/consent',{kind:'other',textVersion:VERIFICATION_CONSENT_VERSION},bob.cookie)).status,400,'consent kind is fixed');
  await consent(base,bob);
  await consent(base,bob);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public_consents WHERE public_user_id=$1',[bob.id])).rows[0].n,1,'consent is idempotent');
  assert.equal((await body(await get(base,'/public/verification',bob.cookie))).consented,true);
  assert.equal((await post(base,'/public/verification',{method:'id_document',media:[dataUrl('image/jpeg',jpeg())]})).status,401,'verification requires a sign-in');

  for(const user of [cara,dee,eli,fox,gus]) await consent(base,user);

  const bad=[
    {method:'id_document',media:[dataUrl('image/gif',jpeg())]},
    {method:'id_document',media:[dataUrl('image/png',jpeg())]},
    {method:'id_document',media:[]},
    {method:'id_document',media:[dataUrl('image/jpeg',jpeg()),dataUrl('image/jpeg',jpeg()),dataUrl('image/jpeg',jpeg()),dataUrl('image/jpeg',jpeg())]},
    {method:'passport',media:[dataUrl('image/jpeg',jpeg())]},
  ];
  for(const item of bad) assert.equal((await post(base,'/public/verification',item,fox.cookie)).status,400,`invalid ${JSON.stringify(item.method)} upload must fail`);
  assert.equal((await body(await submit(base,fox,'id_document',[dataUrl('image/jpeg',jpeg(5*1024*1024-3))]),413)).error,'Image too large','an image over 5 MB is rejected');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public_verifications WHERE public_user_id=$1',[fox.id])).rows[0].n,0,'rejected uploads create no verification');

  const bobImages=[jpeg(128),png(128)];
  outcome={result:'passed',reason:'documents match'};
  const passed=await body(await submit(base,bob,'id_document',[dataUrl('image/jpeg',bobImages[0]),dataUrl('image/png',bobImages[1])]));
  assert.equal(passed.status,'verified');
  assert.equal(passed.verification.status,'passed');
  assert.deepEqual(calls.at(-1)!.media.map(item=>item.toString('hex')),bobImages.map(item=>item.toString('hex')),'the verifier receives the uploaded bytes');
  assert.equal(await statusOf(base,bob),'verified','a passed check verifies the user');
  assert.equal(await isVerified(bob.id),true);
  assert.equal((await body(await get(base,'/public/verification',bob.cookie))).verification.status,'passed');
  assert.ok(existsSync(join(storage,passed.verification.id,'0.jpg')),'media is stored until purge');
  assert.ok(existsSync(join(storage,passed.verification.id,'1.png')));
  assert.equal((await submit(base,bob,'id_document',[dataUrl('image/jpeg',jpeg())])).status,409,'a verified user cannot submit again');
  const bobVerification=passed.verification.id as string;

  outcome={result:'failed',reason:'document unreadable'};
  const failed=await body(await submit(base,cara,'id_document',[dataUrl('image/jpeg',jpeg())]));
  assert.equal(failed.verification.status,'failed');
  assert.equal(failed.status,'pending_verification');
  assert.equal(await isVerified(cara.id),false,'a failed check does not verify');
  const caraVerification=failed.verification.id as string;
  assert.equal((await pool.query('SELECT purge_after FROM public_verifications WHERE id=$1',[caraVerification])).rows[0].purge_after,null,'an automatic failure has no purge timer until an admin decides');
  assert.ok(existsSync(join(storage,caraVerification,'0.jpg')),'an automatic failure keeps its media');

  outcome={result:'review',reason:'needs a person'};
  const deeImages=[jpeg(96)];
  const reviewed=await body(await submit(base,dee,'camera_age',[dataUrl('image/jpeg',deeImages[0])]));
  assert.equal(reviewed.verification.status,'review');
  assert.equal(await isVerified(dee.id),false);
  const deeVerification=reviewed.verification.id as string;

  outcome='throw';
  const thrown=await body(await submit(base,eli,'id_document',[dataUrl('image/jpeg',jpeg())]));
  assert.equal(thrown.verification.status,'review','a verifier error becomes a review, never a pass');
  assert.equal(thrown.verification.reason,'automatic check unavailable');
  outcome={result:'review',reason:'blurry'};
  await body(await submit(base,eli,'id_document',[dataUrl('image/jpeg',jpeg())]));
  await body(await submit(base,eli,'id_document',[dataUrl('image/jpeg',jpeg())]));
  const callsBefore=calls.length;
  assert.equal((await body(await submit(base,eli,'id_document',[dataUrl('image/jpeg',jpeg())]),429)).error,'Too many verification attempts; try again tomorrow','the fourth attempt in 24 hours is refused');
  assert.equal(calls.length,callsBefore,'a refused attempt never reaches the verifier');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public_verifications WHERE public_user_id=$1',[eli.id])).rows[0].n,3,'exactly three attempts are recorded');

  assert.equal((await get(base,'/public/admin/reviews')).status,401,'admin routes require a sign-in');
  assert.equal((await body(await get(base,'/public/admin/reviews',nova.cookie),403)).error,'Reviewer role required','no reviewers configured means nobody is an admin');
  process.env.HR_ADMIN_PUBLIC_IDS=` ${nova.id.toUpperCase()} , not-a-uuid`;
  assert.equal((await get(base,'/public/admin/reviews',cara.cookie)).status,403,'a non-admin gets 403 on the admin list');
  assert.equal((await post(base,`/public/admin/reviews/${caraVerification}/decision`,{decision:'approve',reason:'please'},cara.cookie)).status,403,'a non-admin cannot decide');
  assert.equal((await get(base,`/public/admin/reviews/${caraVerification}/media`,cara.cookie)).status,403,'a non-admin cannot see media');

  const list=await body(await get(base,'/public/admin/reviews',nova.cookie));
  const listed=list.reviews.map((item:any)=>item.id);
  assert.ok(listed.includes(deeVerification),'a review item appears in the admin list');
  assert.ok(listed.includes(caraVerification),'a failed item appears in the admin list');
  assert.ok(!listed.includes(bobVerification),'a passed item stays out of the admin list');
  assert.ok(list.reviews.every((item:any)=>['review','failed'].includes(item.status)),'only review and failed items are listed');

  const media=await get(base,`/public/admin/reviews/${deeVerification}/media?index=0`,nova.cookie);
  assert.equal(media.status,200);
  assert.equal(media.headers.get('content-type'),'image/jpeg');
  assert.ok(Buffer.from(await media.arrayBuffer()).equals(deeImages[0]),'the reviewer sees the uploaded image');
  assert.equal((await get(base,`/public/admin/reviews/${deeVerification}/media?index=2`,nova.cookie)).status,404,'a missing media index is not found');
  assert.equal((await get(base,`/public/admin/reviews/${bobVerification}/media`,nova.cookie)).status,409,'passed items have no review media');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM public_admin_audit WHERE action='media-view' AND target_verification_id=$1 AND actor_id=$2",[deeVerification,nova.id])).rows[0].n,1,'media views are audited');

  const decide=(verification:string,decision:string,reason:unknown)=>post(base,`/public/admin/reviews/${verification}/decision`,{decision,reason},nova.cookie);
  assert.equal((await decide(deeVerification,'approve','')).status,400,'a decision needs a reason');
  assert.equal((await decide(deeVerification,'maybe','ok')).status,400,'only approve or reject');
  assert.equal((await decide(bobVerification,'reject','changed my mind')).status,409,'a passed item cannot be decided');
  const approved=await body(await decide(deeVerification,'approve','documents match'));
  assert.equal(approved.verification.status,'passed');
  assert.equal(await statusOf(base,dee),'verified','approve verifies the user');
  assert.equal((await decide(deeVerification,'reject','again')).status,409,'a decided item cannot be decided again');
  const audit=await pool.query("SELECT actor_id,action,reason FROM public_admin_audit WHERE target_verification_id=$1 AND action='approve'",[deeVerification]);
  assert.equal(audit.rows.length,1,'approve writes one audit row');
  assert.equal(audit.rows[0].actor_id,nova.id);
  assert.equal(audit.rows[0].reason,'documents match');
  assert.equal((await pool.query('SELECT reviewer_id FROM public_verifications WHERE id=$1',[deeVerification])).rows[0].reviewer_id,nova.id);

  const rejected=await body(await decide(caraVerification,'reject','still unreadable'));
  assert.equal(rejected.verification.status,'failed','reject keeps the item failed');
  assert.equal(await isVerified(cara.id),false,'reject keeps the user unverified');
  assert.equal(await statusOf(base,cara),'pending_verification');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM public_admin_audit WHERE action='reject' AND target_verification_id=$1",[caraVerification])).rows[0].n,1,'reject writes an audit row');
  assert.ok((await pool.query('SELECT purge_after FROM public_verifications WHERE id=$1',[caraVerification])).rows[0].purge_after.getTime()>Date.now(),'an admin decision on a failed item starts the retention timer');
  const queued=(await body(await get(base,'/public/admin/reviews',nova.cookie))).reviews.map((item:any)=>item.id);
  assert.ok(!queued.includes(caraVerification),'a decided failed item leaves the admin queue');
  assert.ok(!queued.includes(deeVerification),'a decided review item leaves the admin queue');

  await pool.query("INSERT INTO public_verifications(id,public_user_id,method,status) VALUES($1,$2,'id_document','pending')",[randomUUID(),gus.id]);
  assert.equal(await purgeExpiredVerificationMedia(pool,new Date(),storage),0,'nothing is purged before its purge time');
  await pool.query("UPDATE public_verifications SET decided_at=now()-interval '8 days', purge_after=now()-interval '1 day' WHERE id=ANY($1::uuid[])",[[bobVerification,caraVerification]]);
  assert.equal(await purgeExpiredVerificationMedia(pool,new Date(),storage),2,'only decided items past their window are purged');
  assert.equal((await pool.query("SELECT status,purge_after FROM public_verifications WHERE id=$1",[bobVerification])).rows[0].status,'purged');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public_verification_media WHERE verification_id=ANY($1::uuid[])',[[bobVerification,caraVerification]])).rows[0].n,0,'purged media rows are deleted');
  assert.equal(existsSync(join(storage,bobVerification)),false,'purged files are deleted');
  assert.equal(existsSync(join(storage,caraVerification)),false,'purged failed-item files are deleted');
  assert.ok(existsSync(join(storage,deeVerification,'0.jpg')),'a decision inside the window keeps its media');
  assert.ok(existsSync(join(storage,thrown.verification.id,'0.jpg')),'review items keep their media until decided');
  assert.equal((await pool.query("SELECT status FROM public_verifications WHERE public_user_id=$1",[gus.id])).rows[0].status,'pending','pending items are never purged');
  const hank=await signUp(base,'hank','Hank Moss');
  await consent(base,hank);
  outcome={result:'failed',reason:'document unreadable'};
  const hankVerification=(await body(await submit(base,hank,'id_document',[dataUrl('image/jpeg',jpeg())]))).verification.id as string;
  assert.equal(await purgeExpiredVerificationMedia(pool,new Date(Date.now()+400*24*3600*1000),storage),1,'a far-future purge removes only the approved item, never an undecided failure');
  assert.equal(existsSync(join(storage,deeVerification)),false,'the approved item is purged once its window has passed');
  assert.ok(existsSync(join(storage,hankVerification,'0.jpg')),'an undecided automatic failure keeps its files after a far-future purge');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public_verification_media WHERE verification_id=$1',[hankVerification])).rows[0].n,1,'an undecided automatic failure keeps its media rows');
  assert.equal(await purgeExpiredVerificationMedia(pool,new Date(),storage),0,'a second purge does nothing');
  const afterPurge=await body(await get(base,'/public/verification',bob.cookie));
  assert.equal(afterPurge.verification.status,'purged');
  assert.equal(afterPurge.status,'verified','the verified status survives the purge');
  assert.equal((await get(base,`/public/admin/reviews/${caraVerification}/media`,nova.cookie)).status,410,'purged media cannot be viewed');

  console.log('PASS public-verification: consent gate, fake verifier outcomes, attempt limit, admin review and audit, retention purge, private mode 404');
} finally {
  for(const [key,value] of [['HR_MODE',previous.mode],['HR_VERIFICATION_DIR',previous.dir],['HR_ADMIN_PUBLIC_IDS',previous.admins]] as const){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
  await pool.end();
  await db.stop();
  await rm(directory,{recursive:true,force:true});
}
