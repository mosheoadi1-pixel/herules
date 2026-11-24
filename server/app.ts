import express, { type Request, type Response, type NextFunction } from 'express';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { quickPresets } from '../src/quick.ts';
import { eveningClosed, eveningUsed } from '../src/progress.ts';
import { chamberlainCompose, chamberlainPersistComposition } from '../src/chamberlain.ts';
import { queenLevel, queenProgress } from '../src/queen.ts';
import { adorationTally } from '../src/progress.ts';
import { weeklyDigest } from '../src/digest.ts';
import { dailySpark, SPARK_REROLLS, SPARK_DISMISSED, type Spark, type SparkIdea } from '../src/spark.ts';
import { library } from '../src/library.ts';
import { SEASON_DAY_MS, seasonItemFor, seasonPack, seasonStartDefault } from '../src/seasons.ts';
import { TROPHY_LIMIT, trophyEntries, type TrophyEntry, type TrophyPin, type TrophySource } from '../src/trophies.ts';
import { AUCTION_LIMITS, highestBid, settleAuction, type AuctionOutcome } from '../src/auctions.ts';
import { hrMode } from './mode.ts';
import { pkcePair, randomKey, type PublicIdentityProvider, type PublicProvider } from './public-auth.ts';
import { CAMERA_CONSENT_VERSION, VERIFICATION_CONSENT_VERSION } from '../src/verification-consent.ts';
import { VERIFICATION_ATTEMPTS_PER_DAY, VERIFICATION_MEDIA_MAX_ITEMS, cameraLivenessSchema, decodeImage, discardMedia, hasConsentVersion, hasVerificationConsent, purgeExpiredVerificationMedia, requireVerified, retentionMs, storeMedia, verificationDirectory, type PublicVerifier, type PublicVerifierResult } from './public-verification.ts';
import { adminHashFromEnv, isPublicAdmin, publicEmailHash } from './public-admin.ts';
import { ROOM_PAGE_MAX, ROOM_POSTS_PER_TEN_MINUTES, roomBody, roomHidden, roomHiddenIds, roomMessageSql, roomView } from './public-room.ts';
import { CONVERSATION_COOLDOWN, CONVERSATION_MESSAGES_PER_TEN_MINUTES, CONVERSATION_PAGE_MAX, conversationBody, conversationMessageSql, conversationMessageView, conversationRowSql, conversationView, otherOf, participantOf, visibleConversation } from './public-conversations.ts';
const scrypt = promisify(scryptCallback);
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const text = z.string().trim().min(1).max(4000);
const uuid = z.string().uuid();
const completionStyle=z.enum(['simple','written']);
const draftSchema=z.object({title:z.string().trim().min(1).max(160),text,points:z.number().int().min(0).max(100).default(0),secret:z.boolean().default(false),completionStyle:completionStyle.default('simple'),surprise:z.boolean().default(false),category:z.string().trim().max(80).optional(),repeat:z.enum(['daily','weekly']).optional()}).refine(v=>!v.surprise||!!v.category);
const checkInSchema=z.object({minutes:z.number().int().min(1).max(1440),energy:z.enum(['low','medium','high']),mood:z.enum(['connection','playful','quiet'])});
export type CheckIn=z.infer<typeof checkInSchema>;
const reflectionSchema=z.object({appreciation:z.string().trim().max(1000).default(''),repeat:z.string().trim().max(1000).default('')}).refine(v=>!!(v.appreciation||v.repeat));
export type Reflection=z.infer<typeof reflectionSchema>;
const nightStep=z.object({he:text,en:text,points:z.number().int().min(0).max(100),minutesFromNow:z.number().int().min(0).max(10080)});
const nightSchema=z.object({mood:z.enum(['soft','playful','strict']),lang:z.enum(['he','en']).default('he'),steps:z.array(nightStep).min(1).max(3)});
const eveningSchema=z.object({name:z.string().trim().min(1).max(80),mood:z.enum(['soft','playful','strict']),steps:z.array(nightStep).min(1).max(3)}).refine(v=>v.steps.every(st=>st.he.length<=160&&st.en.length<=160));
const paceSchema=z.object({commandsPerEvening:z.union([z.literal(1),z.literal(2),z.literal(3)])});
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
export type User = { id: string; email: string|null; nickname: string|null; role: 'wife'|'husband'; pair_id: string|null };
export type Mission = { id: string; revision: number; title: string; text: string; titleEn?: string; textEn?: string; points: number; secret: boolean; chapter?: boolean; surprise?:boolean; sealed?:boolean; revealsAt?:number; category?:string; revealedAt?:number; completionStyle?: 'simple'|'written'; status: string; scheduledAt?: number; completion?: string; submissionVersion?: number; deliveredAt?: number; acknowledgedAt?: number; adjustment?: {reason:'softer'|'adjust';note?:string;at:number}; replaces?: string; replacementId?: string; approvedAt?: number; rating?: 'love'|'like'|'skip'; ratedAt?: number; createdAt?: number; repeat?: 'daily'|'weekly'; repeatOf?: string; repeatStopped?: boolean; adoration?: 'loved'|'liked'|'ok'; adoredAt?: number; season?: {id:string;day:number} };
export type Reward = {id:string; title:string; description:string; cost:number};
export type Auction = {id:string; title:string; description:string; minBid:number; closesAt:number; status:'open'|'closed'|'void'; bids:{amount:number;at:number}[]; winningBid?:number; outcome?:AuctionOutcome; createdAt:number};
export type RewardRequest = Reward & {rewardId:string; status:'pending'|'approved'|'declined'};
export type Wish = {id:string; title:string; description:string; link?:string; cost?:number; createdAt:number};
export type WishRequest = {id:string; wish:string; title:string; cost:number; status:'pending'|'approved'|'declined'; at:number};
export type Proposal = { id: string; by: string; title: string; text: string; points: number; category?: string; at: number; status: 'pending'|'adopted'|'declined'; missionId?: string };
export type Session = { id: string; status: string; terms: string; revision: number; revisions: { revision: number; terms: string }[]; approvals: string[]; pauses: string[]; remaining: number; unlimited?: boolean; last: number; started: boolean; points: number; missions: Mission[]; rewards?: Reward[]; rewardRequests?: RewardRequest[]; sequence?: string[]; autoProgress?:boolean; persona?:'strict'|'playful'|'caring'; followups?:string[]; checkIns?: Record<string,CheckIn>; reflections?: Record<string,Reflection>; messages: {id:string; by:string; text:string; at:number}[]; history: { at:number; event:string; by:string; rewardRequestId?:string; outcome?:'approved'|'declined' }[]; inbox: {id:string; at:number; event:string; readBy:string[]}[]; herPoints?: number; proposals?: Proposal[]; wishes?: Wish[]; wishRequests?: WishRequest[]; commands?: {id:string;title:string;text:string;points:number}[]; notes?: {id:string;text:string;at:number}[]; whispers?: {id:string;text:string;at:number}[]; whisperSent?: number; spark?: { day: number; rerolls: number; dismissed: string[] }; seasonState?: {id:string;startsAt:number;days:number;stoppedAt?:number}; seasonProgress?: {id:string;done:number;total:number;running:boolean}; pins?: TrophyPin[]; trophies?: TrophyEntry[]; auctions?: Auction[]; nights?: {id:string;mood:'soft'|'playful'|'strict';at:number;missionIds:string[]}[]; moodCounts?: Record<'soft'|'playful'|'strict',number>; lastCareAt?: number; pace?: 1|2|3; eveningClosedAt?: number; savedEvenings?: {id:string;name:string;mood:'soft'|'playful'|'strict';steps:{he:string;en:string;points:number;minutesFromNow:number}[];createdAt:number}[]; chapterState?: { decree?: { mood: string; season?: string }; at?: number; cliffhanger?: { he: string; en: string } }; adoration?: { sippedFor?: string; grantedFor?: string; grantedAt?: number; sealedAt?: number; waiting?: number; ready?: number; last?: { id: string; kind: string; text: string; media?: string | null; at: number } } };
const suspended = (s: Session) => s.pauses.length > 0;
const terminal = (s: Session) => ['stopped','expired'].includes(s.status);
function notice(s: Session, event: string, by: string, reward?:{rewardRequestId?:string;outcome?:'approved'|'declined';missionId?:string}) {
  const at = Date.now(); s.history.push({ at, event, by, ...reward });
  s.inbox.push({ id: randomUUID(), at, event, readBy: [], ...(reward?.missionId?{missionId:reward.missionId}:{}) });
}
const repeatStep={daily:86400000,weekly:7*86400000} as const;
// One queued successor per chain at most. Missed intervals are skipped, never backfilled.
function repeatSuccessor(s:Session,m:Mission,now:number){
  if(!m.repeat||m.repeatStopped)return;
  const root=m.repeatOf??m.id;
  if(s.missions.some(x=>(x.repeatOf??x.id)===root&&x.status==='queued'))return;
  const step=repeatStep[m.repeat];
  let at=(m.scheduledAt??now)+step;
  while(at<=now)at+=step;
  s.missions.push({id:randomUUID(),revision:s.revision,title:m.title,text:m.text,...(m.titleEn?{titleEn:m.titleEn}:{}),...(m.textEn?{textEn:m.textEn}:{}),points:m.points,secret:m.secret,completionStyle:m.completionStyle,category:m.category,surprise:m.surprise,repeat:m.repeat,repeatOf:root,status:'queued',scheduledAt:at,createdAt:now});
}
// Auction lots close on wall-clock time regardless of holds. Terminal sessions void every open lot; held sessions
// void due lots without charging, so no points move while either personal pause is active.
function settleAuctions(s: Session, now: number) {
  const ended = terminal(s), held = suspended(s);
  for (const lot of s.auctions ?? []) {
    if (lot.status !== 'open' || (!ended && lot.closesAt > now)) continue;
    const { outcome, charge } = settleAuction({ bids: lot.bids, points: s.points, terminal: ended, held });
    if (charge) { s.points -= charge; lot.winningBid = charge; }
    lot.status = outcome === 'void' ? 'void' : 'closed';
    lot.outcome = outcome;
    notice(s, 'auction-close', 'server');
  }
}
function advance(s: Session) {
  const now = Date.now();
  if (!terminal(s) && s.started && !suspended(s)) {
    // Unlimited sessions never count down and never expire; scheduled deliveries still run on time.
    if (!s.unlimited) {
      s.remaining = Math.max(0, s.remaining - (now - s.last));
      if (!s.remaining) { s.status = 'expired'; notice(s, 'expired', 'server'); }
    }
    for (const m of s.missions) if (m.status === 'queued' && m.scheduledAt! <= now) { m.status = 'pending'; m.deliveredAt = now; notice(s, 'mission-delivered', 'server',m.surprise?{missionId:m.id}:undefined); repeatSuccessor(s,m,now); }
  }
  settleAuctions(s, now);
  s.last = now;
}
// A session without minutes is the pair's ongoing game: it never counts down and never expires.
function newSession(terms: string, minutes?: number): Session {
  return {id:randomUUID(),status:'active',terms,revision:1,revisions:terms?[{revision:1,terms}]:[],approvals:[],pauses:[],remaining:minutes===undefined?0:minutes*60000,last:Date.now(),started:true,points:0,missions:[],messages:[],history:[],inbox:[],...(minutes===undefined?{unlimited:true}:{})};
}
// Entering the game is its own session: whenever a pair loads state with nothing active, an unlimited session opens.
async function ensureSession(c: PoolClient, u: User): Promise<Session | undefined> {
  const pair=u.pair_id; if (!pair) return undefined;
  await c.query('SELECT id FROM pairs WHERE id=$1 FOR UPDATE',[pair]);
  const active=(await c.query("SELECT id FROM sessions WHERE pair_id=$1 AND status NOT IN ('stopped','expired')",[pair])).rows;
  if (active.length) return undefined;
  const s=newSession('');notice(s,'session-created',u.id);
  await c.query('INSERT INTO sessions VALUES($1,$2,$3,$4)',[s.id,pair,s.status,JSON.stringify(s)]);
  return s;
}
// Derived at response time, never stored. Counts delivered occurrences of the current run only
// (scheduledAt inside its window), so restarting a pack never counts the previous run.
function seasonProgressOf(s: Session) {
  const state = s.seasonState;
  if (!state) return undefined;
  const from = state.startsAt, until = from + state.days * SEASON_DAY_MS;
  const done = s.missions.filter(m => m.season?.id === state.id && m.deliveredAt !== undefined && (m.scheduledAt ?? 0) >= from && (m.scheduledAt ?? 0) < until).length;
  return { id: state.id, done, total: state.days, running: s.missions.some(m => !!m.season && m.status === 'queued') };
}
// Pins resolve against the missions this viewer may see. A mission that exists but is withheld is a hidden placeholder.
function trophySource(s: Session, shown: { id?: string; title?: string; text?: string; completion?: string }[]): TrophySource {
  return {
    mission: id => {
      if (!s.missions.some(m => m.id === id)) return undefined;
      const view = shown.find(m => m.id === id);
      return view?.title === undefined || view.text === undefined ? 'hidden' : { title: view.title, text: view.text, completion: view.completion };
    },
    reflection: id => s.reflections?.[id],
  };
}
function visible(s: Session, user: User) {
  if(user.role==='wife')return {...s,seasonProgress:seasonProgressOf(s),trophies:trophyEntries(s.pins,user,trophySource(s,s.missions))};
  const hidden=new Set(s.missions.filter(m=>m.surprise&&!m.revealedAt).map(m=>m.id));
  // A queued non-secret surprise is sealed: he sees that something is coming and when, never its category. Secret items stay fully hidden until delivery.
  // Season packs are her plan: he sees each occurrence only once it is delivered.
  const missions:Partial<Mission>[]=s.missions.flatMap((m):Partial<Mission>[]=>{
    if(m.season&&!m.deliveredAt)return [];
    if((m.secret||m.surprise)&&!m.deliveredAt)return m.surprise&&!m.secret&&m.status==='queued'?[{id:m.id,revision:m.revision,status:'queued',surprise:true,sealed:true,revealsAt:m.scheduledAt}]:[];
    if(hidden.has(m.id))return [{id:m.id,revision:m.revision,status:m.status,surprise:true,deliveredAt:m.deliveredAt}];
    if(m.replacementId&&hidden.has(m.replacementId)){const {replacementId,...rest}=m;return [rest];}
    return [m];
  });
  const allowed=(n:any)=>!n.missionId||!hidden.has(n.missionId);
  return { ...s, commands:undefined, notes:undefined, whispers:undefined, whisperSent:(s.whispers??[]).length, spark:undefined, savedEvenings:undefined, chapterState:undefined, adoration:undefined, seasonProgress:seasonProgressOf(s), trophies:trophyEntries(s.pins,user,trophySource(s,missions)), pins:s.pins?.map(({ref,...pin})=>pin), missions, history:s.history.filter(allowed),inbox:s.inbox.filter(allowed), ...(s.sequence?{sequence:s.sequence.filter(id=>missions.some(m=>m.id===id))}:{}) };
}
function runNight(s: Session, mood: 'soft'|'playful'|'strict', lang: 'he'|'en', steps: z.infer<typeof nightStep>[]) {
  if(eveningClosed(s))fail(409,'Evening is closed');
  if(steps.length>(s.pace??3))fail(400,'Too many steps for the current pace');
  if(eveningUsed(s.missions)+steps.length>(s.pace??3))fail(409,'Evening limit reached for the current pace');
  if(steps.some(st=>(lang==='he'?st.he:st.en).length>160))fail(400,'Step title too long');
  const nights=s.nights??=[];if(nights.length>=50)fail(409,'Night list is full');
  const at=Date.now(),missionIds:string[]=[];
  for(const st of steps){const body=lang==='he'?st.he:st.en;const m:Mission={id:randomUUID(),revision:s.revision,title:body,text:body,points:st.points,secret:false,completionStyle:'simple',status:'queued',scheduledAt:at+st.minutesFromNow*60000,createdAt:at};s.missions.push(m);missionIds.push(m.id);}
  const night={id:randomUUID(),mood,at,missionIds};nights.push(night);
  const counts=s.moodCounts??={soft:0,playful:0,strict:0};counts[mood]++;
  return night;
}
// cameraEnabled is the IDSWYFT_CAMERA_ENABLED flag (read by server/index.ts). cameraConsentVersion is a test seam; production uses the shared constant.
export async function createApp(pool: Pool, origin: string, providers: Partial<Record<PublicProvider, PublicIdentityProvider>> = {}, verifier?: PublicVerifier, options: { cameraEnabled?: boolean; cameraConsentVersion?: string | null } = {}) {
  const mode = hrMode();
  if (mode === 'public') adminHashFromEnv();
  const configured = new URL(origin);
  if (configured.origin !== origin || (process.env.NODE_ENV === 'production' && configured.protocol !== 'https:')) throw new Error('APP_ORIGIN must be an exact origin; production requires HTTPS');
  await pool.query(await readFile(new URL('../db/001-foundation.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/002-guests.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/003-private-game.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/004-imported-ideas.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/005-devotions.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/006-public-accounts.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/007-public-verification.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/008-public-admin.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/009-public-room.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/010-public-conversations.sql', import.meta.url), 'utf8'));
  const app = express(); app.disable('x-powered-by');
  app.set('trust proxy',process.env.TRUST_PROXY?.split(',').map(v=>v.trim())||false);
  // Public mode shows reviewer images as blob: object URLs; private mode keeps its existing policy.
  const imgSrc = mode === 'public' ? "'self' data: blob:" : "'self' data:";
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src ${imgSrc}; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` });
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    if(process.env.NODE_ENV==='production')res.set('Strict-Transport-Security','max-age=31536000');
    const requestOrigin = `${req.protocol}://${req.host}`;
    const sameAddress = req.headers.origin === requestOrigin && (process.env.NODE_ENV !== 'production' || req.protocol === 'https');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin !== origin && !sameAddress) return res.status(403).json({ error: 'Origin rejected', expectedOrigin: origin });
    next();
  });
  const jsonBody = express.json({ limit: '16kb' }), mediaBody = express.json({ limit: '24mb' });
  app.use((req, res, next) => (mode === 'public' && req.method === 'POST' && req.path === '/api/public/verification' ? mediaBody : jsonBody)(req, res, next));
  app.use('/api',(req,res,next)=>{if(req.method==='POST'&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)))return res.status(400).json({error:'A JSON object is required'});next();});
  async function transaction<T>(fn: (c: PoolClient) => Promise<T>) {
    const c = await pool.connect();
    try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  async function rate(req: Request, bucket: string, limit: number) {
    const key = `${bucket}:${req.ip}`;
    const window = Math.floor(Date.now()/600000);
    const r = await pool.query('INSERT INTO rate_limits(key,period,hits) VALUES($1,$2,1) ON CONFLICT(key) DO UPDATE SET period=$2,hits=CASE WHEN rate_limits.period=$2 THEN rate_limits.hits+1 ELSE 1 END RETURNING hits', [key,window]);
    if (r.rows[0].hits > limit) fail(429,'Too many attempts; retry in ten minutes');
  }
  const tokenOf = (req: Request) => /(?:^|;\s*)hr_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || '';
  async function claimPlayer(c:PoolClient,u:User):Promise<User> {
    const game=(await c.query('SELECT * FROM private_game WHERE singleton=true FOR UPDATE')).rows[0];
    if(game[u.role] && game[u.role]!==u.id)fail(409,'Role occupied: this private game has one player per role');
    if(u.pair_id && u.pair_id!==game.pair_id)fail(409,'This identity belongs to another game');
    if(game[u.role]===u.id)return {...u,pair_id:game.pair_id};
    game[u.role]=u.id;
    if(game.wife && game.husband){
      game.pair_id=randomUUID();
      await c.query('INSERT INTO pairs(id,wife,husband) VALUES($1,$2,$3)',[game.pair_id,game.wife,game.husband]);
      await c.query('UPDATE users SET pair_id=$1 WHERE id=ANY($2::uuid[])',[game.pair_id,[game.wife,game.husband]]);
    }
    await c.query('UPDATE private_game SET wife=$1,husband=$2,pair_id=$3 WHERE singleton=true',[game.wife,game.husband,game.pair_id]);
    return {...u,pair_id:game.pair_id};
  }
  async function auth(req: Request): Promise<User> {
    const r = await pool.query('SELECT u.id,u.email,u.nickname,u.role,u.pair_id FROM users u JOIN auth_sessions a ON a.user_id=u.id WHERE a.hash=$1 AND a.expires>now()', [hash(tokenOf(req))]);
    if(!r.rows[0])fail(401,'Please sign in');
    return transaction(c=>claimPlayer(c,r.rows[0]));
  }
  async function login(res: Response, user: User) {
    const token = randomBytes(32).toString('hex');
    await pool.query("INSERT INTO auth_sessions VALUES($1,$2,now()+interval '7 days')", [hash(token), user.id]);
    res.cookie('hr_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7*86400000, path: '/' });
  }
  if (mode === 'public') app.use(['/api/register', '/api/login', '/api/guest'], (_req: Request, res: Response) => res.status(404).json({ error: 'Unknown endpoint' }));
  app.post('/api/register', async (req,res) => {
    await rate(req,'register',20);
    const b = z.object({ email:z.email().max(254).transform(v=>v.toLowerCase()), password:z.string().min(12).max(128), role:z.enum(['wife','husband']), adult:z.literal(true) }).parse(req.body);
    const salt = randomBytes(16).toString('hex'); const digest = (await scrypt(b.password,salt,64) as Buffer).toString('hex');
    const user=await transaction(async c=>{
      const r=await c.query('INSERT INTO users(id,email,password,role,adult) VALUES($1,$2,$3,$4,true) RETURNING id,email,nickname,role,pair_id',[randomUUID(),b.email,`${salt}:${digest}`,b.role]);
      return claimPlayer(c,r.rows[0]);
    });
    await login(res,user);res.json({user});
  });
  app.post('/api/guest', async (req,res) => {
    const b=z.strictObject({nickname:z.string().trim().min(1).max(40).regex(/^[^\p{Cc}\p{Cf}]+$/u).optional(),role:z.enum(['wife','husband']),adult:z.literal(true)}).parse(req.body);
    const user=await transaction(async c=>{
      const game=(await c.query('SELECT * FROM private_game WHERE singleton=true FOR UPDATE')).rows[0];
      if(game[b.role])return (await c.query('SELECT id,email,nickname,role,pair_id FROM users WHERE id=$1',[game[b.role]])).rows[0];
      const r=await c.query('INSERT INTO users(id,nickname,role,adult) VALUES($1,$2,$3,true) RETURNING id,email,nickname,role,pair_id',[randomUUID(),b.nickname??(b.role==='wife'?'Wife':'Husband'),b.role]);
      return claimPlayer(c,r.rows[0]);
    });
    await login(res,user);res.json({user});
  });
  app.post('/api/login', async (req,res) => {
    await rate(req,'login',40);
    const b = z.object({ email:z.string().max(254),password:z.string().max(128) }).parse(req.body);
    const r = await pool.query('SELECT * FROM users WHERE email=$1',[b.email.toLowerCase()]);
    const u = r.rows[0]; const [salt,digest] = (u?.password || '00000000000000000000000000000000:'+ '0'.repeat(128)).split(':');
    const actual = await scrypt(b.password,salt,64) as Buffer;
    if (!timingSafeEqual(actual,Buffer.from(digest,'hex')) || !u) fail(401,'Invalid credentials');
    const user=await transaction(c=>claimPlayer(c,u));
    await login(res,user);res.json({ok:true});
  });
  app.get('/api/ideas',async(req,res)=>{await auth(req);res.json({ideas:(await pool.query('SELECT * FROM imported_ideas ORDER BY id')).rows});});
  app.post('/api/logout', async (req,res) => { await pool.query('DELETE FROM auth_sessions WHERE hash=$1',[hash(tokenOf(req))]); res.clearCookie('hr_session',{ path:'/' }); res.json({ok:true}); });
  if (mode === 'public') {
    const providerName = z.enum(['google','apple']);
    const callbackUrl = (name: PublicProvider) => `${origin}/api/public/auth/${name}/callback`;
    const publicTokenOf = (req: Request) => /(?:^|;\s*)hr_public_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || '';
    const publicUser = (row: any) => ({ id: row.id, nickname: row.nickname, role: row.role, gender: row.gender, status: row.verified_at ? 'verified' : 'pending_verification' });
    const publicLogin = async (res: Response, userId: string) => {
      const token = randomBytes(32).toString('hex');
      await pool.query("INSERT INTO public_sessions VALUES($1,$2,now()+interval '7 days')", [hash(token), userId]);
      res.cookie('hr_public_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7*86400000, path: '/' });
    };
    app.get('/api/public/config', (_req,res) => { res.json({ mode }); });
    app.get('/api/public/auth/:provider/start', async (req,res) => {
      await rate(req,'public-start',60);
      const name = providerName.parse(req.params.provider);
      const adapter = providers[name] ?? fail(503,'provider not configured');
      const state = randomKey(), pkce = pkcePair();
      await pool.query('DELETE FROM public_auth_states WHERE expires_at < now()');
      await pool.query("INSERT INTO public_auth_states(token,provider,code_verifier,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')", [state, name, pkce.verifier]);
      res.json({ url: adapter.authorizeUrl({ state, codeChallenge: pkce.challenge, redirectUri: callbackUrl(name) }) });
    });
    app.get('/api/public/auth/:provider/callback', async (req,res) => {
      await rate(req,'public-callback',60);
      const name = providerName.parse(req.params.provider);
      const query = z.object({ code: z.string().min(1).max(2048), state: z.string().min(1).max(128) }).parse(req.query);
      await pool.query('DELETE FROM public_auth_states WHERE expires_at < now()');
      const flow = (await transaction(c => c.query('DELETE FROM public_auth_states WHERE token=$1 AND expires_at > now() RETURNING provider,code_verifier', [query.state]))).rows[0];
      if (!flow || flow.provider !== name) return fail(400,'Sign-in expired; start again');
      const adapter = providers[name] ?? fail(503,'provider not configured');
      const { subject, email, emailVerified } = await adapter.exchange({ code: query.code, codeVerifier: flow.code_verifier, redirectUri: callbackUrl(name) });
      const emailSha = emailVerified && email ? publicEmailHash(email) : null;
      const identity = await pool.query('SELECT public_user_id FROM auth_identities WHERE provider=$1 AND provider_subject=$2', [name, subject]);
      if (identity.rows[0]) {
        if (emailSha) await pool.query('UPDATE public_users SET email_sha256=$2 WHERE id=$1', [identity.rows[0].public_user_id, emailSha]);
        await publicLogin(res, identity.rows[0].public_user_id);
        return res.redirect('/');
      }
      const token = randomKey();
      await pool.query("INSERT INTO public_auth_states(token,provider,code_verifier,pending_subject,pending_email_sha256,expires_at) VALUES($1,$2,'',$3,$4,now()+interval '10 minutes')", [token, name, subject, emailSha]);
      res.redirect(`/#public-pending=${token}`);
    });
    app.post('/api/public/register', async (req,res) => {
      await rate(req,'public-register',20);
      const b = z.object({
        pendingToken: z.string().min(1).max(128),
        nickname: z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N}_ ]+$/u),
        role: z.enum(['sub','dom']),
        gender: z.enum(['woman','man','non_binary','other']),
      }).parse(req.body);
      const id = randomUUID();
      const row = await transaction(async c => {
        const pending = (await c.query('SELECT provider,pending_subject,pending_email_sha256 FROM public_auth_states WHERE token=$1 AND pending_subject IS NOT NULL AND expires_at > now() FOR UPDATE', [b.pendingToken])).rows[0] ?? fail(400,'Sign-in expired; start again');
        const r = await c.query('INSERT INTO public_users(id,nickname,nickname_key,role,gender,email_sha256) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,nickname,role,gender,verified_at', [id, b.nickname, b.nickname.toLowerCase(), b.role, b.gender, pending.pending_email_sha256 ?? null]);
        await c.query('INSERT INTO auth_identities(provider,provider_subject,public_user_id) VALUES($1,$2,$3)', [pending.provider, pending.pending_subject, id]);
        await c.query('DELETE FROM public_auth_states WHERE token=$1', [b.pendingToken]);
        return r.rows[0];
      });
      await publicLogin(res, id);
      res.json({ user: publicUser(row) });
    });
    const signedPublic = async (req: Request) => {
      const r = await pool.query('SELECT u.id,u.nickname,u.role,u.gender,u.verified_at,u.email_sha256 FROM public_users u JOIN public_sessions s ON s.public_user_id=u.id WHERE s.hash=$1 AND s.expires>now()', [hash(publicTokenOf(req))]);
      return r.rows[0] ?? fail(401,'Please sign in');
    };
    app.get('/api/public/me', async (req,res) => { const user = await signedPublic(req); res.json({ user: publicUser(user), isAdmin: isPublicAdmin(user) }); });
    app.post('/api/public/logout', async (req,res) => { await pool.query('DELETE FROM public_sessions WHERE hash=$1',[hash(publicTokenOf(req))]); res.clearCookie('hr_public_session',{ path:'/' }); res.json({ok:true}); });
    const verificationDir = verificationDirectory();
    const verificationRetention = retentionMs();
    const cameraEnabled = options.cameraEnabled === true;
    const cameraConsentVersion = options.cameraConsentVersion === undefined ? CAMERA_CONSENT_VERSION : options.cameraConsentVersion;
    const verificationView = (row: any) => row ? { id: row.id, method: row.method, status: row.status, reason: row.reason ?? null, createdAt: row.created_at, decidedAt: row.decided_at ?? null } : null;
    const reviewer = async (req: Request) => {
      await rate(req,'public-admin',120);
      const user = await signedPublic(req);
      if (!isPublicAdmin(user)) fail(403,'Reviewer role required');
      return user;
    };
    const purge = () => purgeExpiredVerificationMedia(pool, new Date(), verificationDir).catch(error => console.error('Verification media purge failed', error.code || error.name));
    await purge();
    setInterval(purge, 3600000).unref();
    app.post('/api/public/consent', async (req,res) => {
      await rate(req,'public-consent',30);
      const user = await signedPublic(req);
      const versions = [VERIFICATION_CONSENT_VERSION, ...(cameraConsentVersion ? [cameraConsentVersion] : [])] as [string, ...string[]];
      const b = z.object({ kind: z.literal('verification'), textVersion: z.enum(versions) }).parse(req.body);
      await transaction(async c => {
        await c.query('SELECT id FROM public_users WHERE id=$1 FOR UPDATE', [user.id]);
        await c.query('INSERT INTO public_consents(id,public_user_id,kind,text_version,ip_hash) SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS (SELECT 1 FROM public_consents WHERE public_user_id=$2 AND kind=$3 AND text_version=$4)', [randomUUID(), user.id, b.kind, b.textVersion, hash(req.ip ?? '')]);
      });
      res.json({ consented: true });
    });
    app.get('/api/public/verification', async (req,res) => {
      const user = await signedPublic(req);
      const latest = (await pool.query('SELECT id,method,status,reason,created_at,decided_at FROM public_verifications WHERE public_user_id=$1 ORDER BY created_at DESC LIMIT 1', [user.id])).rows[0];
      const cameraConsented = cameraConsentVersion !== null && await hasConsentVersion(pool, user.id, cameraConsentVersion);
      res.json({ status: user.verified_at ? 'verified' : 'pending_verification', consented: await hasVerificationConsent(pool, user.id, cameraConsentVersion), cameraConsented, cameraEnabled: cameraEnabled && cameraConsentVersion !== null, verification: verificationView(latest) });
    });
    app.post('/api/public/verification', async (req,res) => {
      await rate(req,'public-verification',60);
      const user = await signedPublic(req);
      const adapter = verifier ?? fail(503,'verification not configured');
      if (!(await hasVerificationConsent(pool, user.id, cameraConsentVersion))) fail(409,'Consent required');
      const b = z.object({ method: z.enum(['id_document','camera_age']), media: z.array(z.string().max(7500000)).min(1).max(VERIFICATION_MEDIA_MAX_ITEMS), liveness: cameraLivenessSchema.optional() }).parse(req.body);
      const camera = cameraEnabled && b.method === 'camera_age';
      if (camera) {
        const cameraVersion = cameraConsentVersion ?? fail(409,'camera consent not available yet');
        if (!(await hasConsentVersion(pool, user.id, cameraVersion))) fail(409,'Consent required');
        if (b.media.length !== 2 || !b.liveness) fail(400,'Camera check needs a front photo, a live selfie and liveness frames');
      }
      const images = b.media.map(decodeImage);
      const id = randomUUID();
      await transaction(async c => {
        const locked = (await c.query('SELECT verified_at FROM public_users WHERE id=$1 FOR UPDATE', [user.id])).rows[0];
        if (locked.verified_at) fail(409,'Already verified');
        const recent = (await c.query("SELECT count(*)::int AS n FROM public_verifications WHERE public_user_id=$1 AND created_at>now()-interval '24 hours'", [user.id])).rows[0].n;
        if (recent >= VERIFICATION_ATTEMPTS_PER_DAY) fail(429,'Too many verification attempts; try again tomorrow');
        await c.query("INSERT INTO public_verifications(id,public_user_id,method,status) VALUES($1,$2,$3,'pending')", [id, user.id, b.method]);
        try {
          // Camera checks store the front and the selfie only; the liveness frames are never written.
          const paths = await storeMedia(verificationDir, id, images);
          for (const [index, path] of paths.entries()) {
            const kind = b.method === 'id_document' || (camera && index === 0) ? 'document' : 'selfie';
            await c.query('INSERT INTO public_verification_media(id,verification_id,kind,storage_path) VALUES($1,$2,$3,$4)', [randomUUID(), id, kind, path]);
          }
        } catch (error) {
          await discardMedia(verificationDir, id);
          throw error;
        }
      });
      let outcome: PublicVerifierResult;
      try { outcome = await adapter.check({ method: b.method, media: images.map(image => image.bytes), liveness: camera ? b.liveness : undefined }); }
      catch { outcome = { result: 'review', reason: 'automatic check unavailable' }; }
      const result = outcome.result === 'passed' || outcome.result === 'failed' ? outcome.result : 'review';
      const reason = String(outcome.reason ?? '').slice(0, 300);
      const decided = result !== 'review';
      const row = await transaction(async c => {
        const r = await c.query('UPDATE public_verifications SET status=$2,reason=$3,decided_at=$4,purge_after=$5 WHERE id=$1 RETURNING id,method,status,reason,created_at,decided_at', [id, result, reason, decided ? new Date() : null, result === 'passed' ? new Date(Date.now() + verificationRetention) : null]);
        if (result === 'passed') await c.query('UPDATE public_users SET verified_at=COALESCE(verified_at,now()) WHERE id=$1', [user.id]);
        return r.rows[0];
      });
      res.json({ verification: verificationView(row), status: result === 'passed' ? 'verified' : 'pending_verification' });
    });
    app.get('/api/public/admin/reviews', async (req,res) => {
      await reviewer(req);
      const rows = (await pool.query("SELECT v.id,v.method,v.status,v.reason,v.created_at,v.decided_at,u.nickname FROM public_verifications v JOIN public_users u ON u.id=v.public_user_id WHERE v.status IN ('review','failed') AND v.reviewer_id IS NULL ORDER BY v.created_at")).rows;
      res.json({ reviews: rows.map(row => ({ ...verificationView(row), nickname: row.nickname })) });
    });
    app.get('/api/public/admin/reviews/:id/media', async (req,res) => {
      const actor = await reviewer(req);
      const id = uuid.parse(req.params.id);
      const index = z.coerce.number().int().min(0).max(VERIFICATION_MEDIA_MAX_ITEMS - 1).parse(req.query.index ?? 0);
      const verification = (await pool.query('SELECT status FROM public_verifications WHERE id=$1', [id])).rows[0] ?? fail(404,'Review unavailable');
      if (verification.status === 'purged') fail(410,'Media has been deleted');
      if (!['review','failed'].includes(verification.status)) fail(409,'Only items awaiting review have media to review');
      const media = (await pool.query('SELECT storage_path FROM public_verification_media WHERE verification_id=$1 ORDER BY created_at,id', [id])).rows;
      const item = media[index] ?? fail(404,'Media unavailable');
      await pool.query('INSERT INTO public_admin_audit(id,actor_id,action,target_verification_id) VALUES($1,$2,$3,$4)', [randomUUID(), actor.id, 'media-view', id]);
      res.sendFile(join(verificationDir, item.storage_path), (error?: Error) => { if (error && !res.headersSent) res.status(410).json({ error: 'Media has been deleted' }); });
    });
    app.post('/api/public/admin/reviews/:id/decision', async (req,res) => {
      const actor = await reviewer(req);
      const id = uuid.parse(req.params.id);
      const b = z.object({ decision: z.enum(['approve','reject']), reason: z.string().trim().min(1).max(300) }).parse(req.body);
      const row = await transaction(async c => {
        const verification = (await c.query('SELECT public_user_id,status FROM public_verifications WHERE id=$1 FOR UPDATE', [id])).rows[0] ?? fail(404,'Review unavailable');
        if (!['review','failed'].includes(verification.status)) fail(409,'Only items awaiting review can be decided');
        const approve = b.decision === 'approve';
        const r = await c.query('UPDATE public_verifications SET status=$2,reason=$3,reviewer_id=$4,decided_at=$5,purge_after=$6 WHERE id=$1 RETURNING id,method,status,reason,created_at,decided_at', [id, approve ? 'passed' : 'failed', b.reason, actor.id, new Date(), new Date(Date.now() + verificationRetention)]);
        if (approve) await c.query('UPDATE public_users SET verified_at=COALESCE(verified_at,now()) WHERE id=$1', [verification.public_user_id]);
        await c.query('INSERT INTO public_admin_audit(id,actor_id,action,target_verification_id,reason) VALUES($1,$2,$3,$4,$5)', [randomUUID(), actor.id, b.decision, id, b.reason]);
        return r.rows[0];
      });
      res.json({ verification: verificationView(row) });
    });
    // General room. Only verified users read or post. Doms post, optionally addressed to a verified sub; subs only read.
    const roomUser = async (req: Request) => {
      const user = await signedPublic(req);
      requireVerified({ status: user.verified_at ? 'verified' : 'pending_verification' });
      return user;
    };
    // Events are rows of the room sequence: room posts and removals, conversation state changes, and conversation messages. One feed serves SSE and polling.
    type FeedRow = { seq: number; kind: 'room' | 'conversation' | 'conversation_message'; id: string };
    type FeedEvent = { id: number; event: string; data: unknown };
    const latestSeq = async () => Number((await pool.query('SELECT GREATEST((SELECT COALESCE(max(seq),0) FROM room_messages),(SELECT COALESCE(max(seq),0) FROM conversations),(SELECT COALESCE(max(seq),0) FROM conversation_messages)) AS seq')).rows[0].seq);
    const feedAfter = async (after: number, limit: number): Promise<FeedRow[]> => (await pool.query("SELECT seq, kind, id::text AS id FROM (SELECT seq, 'room' AS kind, id FROM room_messages WHERE seq>$1 UNION ALL SELECT seq, 'conversation', id FROM conversations WHERE seq>$1 UNION ALL SELECT seq, 'conversation_message', id FROM conversation_messages WHERE seq>$1) feed ORDER BY seq LIMIT $2", [after, limit])).rows.map(row => ({ seq: Number(row.seq), kind: row.kind as FeedRow['kind'], id: row.id as string }));
    // Conversation events reach the two participants only. A request is announced to the sub; the dom sees its own opening message.
    const eventFor = async (viewerId: string, row: FeedRow, hidden: Set<string>): Promise<FeedEvent | null> => {
      if (row.kind === 'room') {
        const message = (await pool.query(`${roomMessageSql} WHERE m.id=$1`, [row.id])).rows[0];
        return message && !roomHidden(message, hidden) ? { id: row.seq, event: 'room', data: roomView(message) } : null;
      }
      if (row.kind === 'conversation') {
        const conversation = (await pool.query(`${conversationRowSql} WHERE c.id=$1`, [row.id])).rows[0];
        if (!conversation || !participantOf(conversation, viewerId) || hidden.has(otherOf(conversation, viewerId))) return null;
        if (conversation.state === 'requested' && conversation.dom_id === viewerId) return null;
        return { id: row.seq, event: conversation.state === 'requested' ? 'conversation_requested' : 'conversation_updated', data: conversationView(conversation, viewerId) };
      }
      const message = (await pool.query(`${conversationMessageSql} WHERE m.id=$1`, [row.id])).rows[0];
      const conversation = message && (await pool.query(`${conversationRowSql} WHERE c.id=$1`, [message.conversation_id])).rows[0];
      if (!message || !conversation || !participantOf(conversation, viewerId) || hidden.has(otherOf(conversation, viewerId))) return null;
      return { id: row.seq, event: 'conversation_message', data: conversationMessageView(message, viewerId) };
    };
    // Every conversation write takes the room lock first, so its seq lands in commit order with room events.
    const lockedConversation = async (c: PoolClient, id: string, user: { id: string }) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('public-room'))");
      return (await visibleConversation(c, id, user.id, await roomHiddenIds(c, user.id), true)) ?? fail(404,'Conversation unavailable');
    };
    const conversationFor = async (id: string, viewerId: string) => conversationView((await pool.query(`${conversationRowSql} WHERE c.id=$1`, [id])).rows[0], viewerId);
    // A dom's addressed post opens a conversation request. Its opening message is the first conversation message.
    const requestConversation = (user: { id: string }, body: string, nickname: string, key?: string) => transaction(async c => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('public-room'))");
      const targetKey = nickname.toLowerCase();
      if (key) {
        if ((await c.query('SELECT 1 FROM room_messages WHERE author_id=$1 AND idempotency_key=$2', [user.id, key])).rows.length) fail(409,'Idempotency key was used for a different message');
        const prior = (await c.query('SELECT m.conversation_id, m.body, s.nickname_key AS target_key FROM conversation_messages m JOIN conversations k ON k.id=m.conversation_id JOIN public_users s ON s.id=k.sub_id WHERE m.author_id=$1 AND m.idempotency_key=$2', [user.id, key])).rows[0];
        if (prior) {
          if (prior.body !== body || prior.target_key !== targetKey) fail(409,'Idempotency key was used for a different message');
          return prior.conversation_id as string;
        }
      }
      const recent = (await c.query("SELECT count(*)::int AS n FROM conversation_messages WHERE author_id=$1 AND created_at>now()-interval '10 minutes'", [user.id])).rows[0].n;
      if (recent >= CONVERSATION_MESSAGES_PER_TEN_MINUTES) fail(429,'Too many messages; try again in ten minutes');
      const target = (await c.query("SELECT t.id FROM public_users t WHERE t.nickname_key=$1 AND t.role='sub' AND t.verified_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM room_blocks k WHERE (k.blocker_id=$2 AND k.blocked_id=t.id) OR (k.blocker_id=t.id AND k.blocked_id=$2))", [targetKey, user.id])).rows[0] ?? fail(404,'Recipient unavailable');
      if ((await c.query("SELECT 1 FROM conversations WHERE dom_id=$1 AND sub_id=$2 AND state IN ('requested','accepted')", [user.id, target.id])).rows.length) fail(409,'A conversation with this sub is already open');
      if ((await c.query('SELECT 1 FROM conversations WHERE dom_id=$1 AND sub_id=$2 AND cooldown_until>now()', [user.id, target.id])).rows.length) fail(409,'Wait 30 days after a declined or closed conversation before asking again');
      const id = randomUUID();
      await c.query("INSERT INTO conversations(id,dom_id,sub_id,state,opening_body) VALUES($1,$2,$3,'requested',$4)", [id, user.id, target.id, body]);
      await c.query('INSERT INTO conversation_messages(id,conversation_id,author_id,body,idempotency_key) VALUES($1,$2,$3,$4,$5)', [randomUUID(), id, user.id, body, key ?? null]);
      return id;
    });
    app.post('/api/public/room/messages', async (req,res) => {
      await rate(req,'room-post',120);
      const user = await roomUser(req);
      if (user.role !== 'dom') fail(403,'Only doms can post in the room');
      const b = z.object({ body: roomBody, targetNickname: z.string().trim().min(1).max(20).optional(), idempotencyKey: uuid.optional() }).parse(req.body);
      if (b.targetNickname !== undefined) {
        const id = await requestConversation(user, b.body, b.targetNickname, b.idempotencyKey);
        res.json({ conversation: await conversationFor(id, user.id) });
        return;
      }
      const message = await transaction(async c => {
        // Room writes are serialised so event seq order matches commit order for SSE and polling readers.
        await c.query("SELECT pg_advisory_xact_lock(hashtext('public-room'))");
        if (b.idempotencyKey) {
          const prior = (await c.query(`${roomMessageSql} WHERE m.author_id=$1 AND m.idempotency_key=$2`, [user.id, b.idempotencyKey])).rows[0];
          if (prior) {
            if (prior.body !== b.body || prior.target_id !== null) fail(409,'Idempotency key was used for a different message');
            return prior;
          }
          if ((await c.query('SELECT 1 FROM conversation_messages WHERE author_id=$1 AND idempotency_key=$2', [user.id, b.idempotencyKey])).rows.length) fail(409,'Idempotency key was used for a different message');
        }
        const recent = (await c.query("SELECT count(*)::int AS n FROM room_messages WHERE author_id=$1 AND created_at>now()-interval '10 minutes'", [user.id])).rows[0].n;
        if (recent >= ROOM_POSTS_PER_TEN_MINUTES) fail(429,'Too many posts; try again in ten minutes');
        const id = randomUUID();
        await c.query('INSERT INTO room_messages(id,author_id,body,idempotency_key) VALUES($1,$2,$3,$4)', [id, user.id, b.body, b.idempotencyKey ?? null]);
        return (await c.query(`${roomMessageSql} WHERE m.id=$1`, [id])).rows[0];
      });
      res.json({ message: roomView(message) });
    });
    app.get('/api/public/room', async (req,res) => {
      await rate(req,'room-read',300);
      const user = await roomUser(req);
      const q = z.object({ after: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(), limit: z.coerce.number().int().min(1).max(ROOM_PAGE_MAX).default(50) }).parse(req.query);
      const hidden = await roomHiddenIds(pool, user.id);
      // Without a cursor the room opens on its latest messages. The cursor is read first, so anything newer is polled next time.
      if (q.after === undefined) {
        const cursor = await latestSeq();
        const rows = (await pool.query(`SELECT * FROM (${roomMessageSql} ORDER BY m.seq DESC LIMIT $1) latest ORDER BY latest.seq`, [q.limit])).rows;
        res.json({ messages: rows.filter(row => !roomHidden(row, hidden)).map(roomView), events: [], cursor, hasMore: false });
        return;
      }
      // With a cursor, it returns what came after that seq: room messages as messages, conversation events as events.
      const feed = await feedAfter(q.after, q.limit);
      const events: FeedEvent[] = [];
      for (const row of feed) {
        const event = await eventFor(user.id, row, hidden);
        if (event) events.push(event);
      }
      res.json({
        messages: events.filter(event => event.event === 'room').map(event => event.data),
        events: events.filter(event => event.event !== 'room'),
        cursor: feed.length ? feed[feed.length - 1].seq : q.after,
        hasMore: feed.length === q.limit,
      });
    });
    app.get('/api/public/events', async (req,res) => {
      await rate(req,'room-events',60);
      await roomUser(req);
      const last = req.get('Last-Event-ID');
      let cursor = last && /^\d{1,15}$/.test(last) ? Number(last) : await latestSeq();
      res.set({ 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      res.write('retry: 3000\n\n');
      let closed = false, pumping = false;
      const stop = () => { closed = true; clearInterval(timer); clearInterval(heartbeat); };
      // Each open stream checks the table every two seconds. Re-authenticates each pass, so a sign-out ends the stream.
      const pump = async () => {
        if (closed || pumping) return;
        pumping = true;
        try {
          const viewer = await roomUser(req);
          const hidden = await roomHiddenIds(pool, viewer.id);
          let rows: FeedRow[];
          do {
            rows = await feedAfter(cursor, 200);
            for (const row of rows) {
              cursor = row.seq;
              const event = await eventFor(viewer.id, row, hidden);
              if (event && !closed) res.write(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
            }
          } while (rows.length === 200 && !closed);
        } catch { stop(); res.end(); }
        finally { pumping = false; }
      };
      const timer = setInterval(() => void pump(), 2000);
      const heartbeat = setInterval(() => { if (!closed) res.write(': heartbeat\n\n'); }, 25000);
      res.on('close', stop);
      void pump();
    });
    app.post('/api/public/room/messages/:id/report', async (req,res) => {
      await rate(req,'room-report',60);
      const user = await roomUser(req);
      const id = uuid.parse(req.params.id);
      const b = z.object({ reason: z.string().trim().min(1).max(300) }).parse(req.body);
      const message = (await pool.query(`${roomMessageSql} WHERE m.id=$1`, [id])).rows[0];
      if (!message || message.removed_at || roomHidden(message, await roomHiddenIds(pool, user.id))) fail(404,'Message unavailable');
      if (message.author_id === user.id) fail(400,'You cannot report your own message');
      // One report per user per message; a repeat is accepted and changes nothing.
      await pool.query('INSERT INTO room_reports(id,message_id,reporter_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT(message_id,reporter_id) DO NOTHING', [randomUUID(), id, user.id, b.reason]);
      res.json({ reported: true });
    });
    app.post('/api/public/room/blocks', async (req,res) => {
      await rate(req,'room-block',60);
      const user = await roomUser(req);
      const b = z.object({ userId: uuid.optional(), nickname: z.string().trim().min(1).max(20).optional() }).refine(v => (v.userId === undefined) !== (v.nickname === undefined), 'Give either userId or nickname').parse(req.body);
      const target = (await pool.query(`SELECT id FROM public_users WHERE ${b.userId !== undefined ? 'id=$1' : 'nickname_key=$1'}`, [b.userId ?? b.nickname!.toLowerCase()])).rows[0] ?? fail(404,'Recipient unavailable');
      if (target.id === user.id) fail(400,'You cannot block yourself');
      await pool.query('INSERT INTO room_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [user.id, target.id]);
      res.json({ blocked: true, userId: target.id });
    });
    app.delete('/api/public/room/blocks/:userId', async (req,res) => {
      await rate(req,'room-block',60);
      const user = await roomUser(req);
      const target = uuid.parse(req.params.userId);
      await pool.query('DELETE FROM room_blocks WHERE blocker_id=$1 AND blocked_id=$2', [user.id, target]);
      res.json({ blocked: false, userId: target });
    });
    app.post('/api/public/admin/room/messages/:id/remove', async (req,res) => {
      const actor = await reviewer(req);
      const id = uuid.parse(req.params.id);
      const b = z.object({ reason: z.string().trim().min(1).max(300) }).parse(req.body);
      const row = await transaction(async c => {
        await c.query("SELECT pg_advisory_xact_lock(hashtext('public-room'))");
        const message = (await c.query('SELECT removed_at FROM room_messages WHERE id=$1 FOR UPDATE', [id])).rows[0] ?? fail(404,'Message unavailable');
        if (message.removed_at) fail(409,'Message already removed');
        await c.query("UPDATE room_messages SET removed_at=now(),removed_by=$2,seq=nextval('room_events_seq') WHERE id=$1", [id, actor.id]);
        await c.query('INSERT INTO public_admin_audit(id,actor_id,action,target_message_id,reason) VALUES($1,$2,$3,$4,$5)', [randomUUID(), actor.id, 'room-remove', id, b.reason]);
        return (await c.query(`${roomMessageSql} WHERE m.id=$1`, [id])).rows[0];
      });
      res.json({ message: roomView(row) });
    });
    app.get('/api/public/admin/room/reports', async (req,res) => {
      await reviewer(req);
      const rows = (await pool.query('SELECT m.id, m.body, m.removed_at, a.nickname AS author_nickname, t.nickname AS target_nickname, count(r.id)::int AS report_count, array_agg(r.reason ORDER BY r.created_at) AS reasons, max(r.created_at) AS last_reported_at FROM room_messages m JOIN room_reports r ON r.message_id=m.id JOIN public_users a ON a.id=m.author_id LEFT JOIN public_users t ON t.id=m.target_id GROUP BY m.id, a.nickname, t.nickname ORDER BY count(r.id) DESC, max(r.created_at) DESC LIMIT 100')).rows;
      res.json({ reports: rows.map(row => ({ id: row.id, body: row.removed_at ? null : row.body, removed: row.removed_at !== null, nickname: row.author_nickname, targetNickname: row.target_nickname, reportCount: row.report_count, reasons: row.reasons, lastReportedAt: row.last_reported_at })) });
    });
    // Private conversations between a dom and a sub. Only the two participants see one; a block hides it both ways.
    app.get('/api/public/conversations', async (req,res) => {
      await rate(req,'conversation-read',300);
      const user = await roomUser(req);
      const hidden = await roomHiddenIds(pool, user.id);
      const rows = (await pool.query(`SELECT x.*, (SELECT max(m.created_at) FROM conversation_messages m WHERE m.conversation_id=x.id) AS last_message_at FROM (${conversationRowSql} WHERE c.dom_id=$1 OR c.sub_id=$1) x ORDER BY x.created_at DESC LIMIT 100`, [user.id])).rows;
      res.json({ conversations: rows.filter(row => !hidden.has(otherOf(row, user.id))).map(row => conversationView(row, user.id)) });
    });
    app.get('/api/public/conversations/:id', async (req,res) => {
      await rate(req,'conversation-read',300);
      const user = await roomUser(req);
      const id = uuid.parse(req.params.id);
      const row = await visibleConversation(pool, id, user.id, await roomHiddenIds(pool, user.id));
      if (!row) fail(404,'Conversation unavailable');
      const messages = (await pool.query(`SELECT * FROM (${conversationMessageSql} WHERE m.conversation_id=$1 ORDER BY m.seq DESC LIMIT $2) latest ORDER BY latest.seq`, [row.id, CONVERSATION_PAGE_MAX])).rows;
      res.json({ conversation: conversationView(row, user.id), messages: messages.map(message => conversationMessageView(message, user.id)) });
    });
    app.post('/api/public/conversations/:id/accept', async (req,res) => {
      await rate(req,'conversation-write',120);
      const user = await roomUser(req);
      const id = uuid.parse(req.params.id);
      await transaction(async c => {
        const row = await lockedConversation(c, id, user);
        if (row.sub_id !== user.id) fail(403,'Only the sub can answer a request');
        if (row.state !== 'requested') fail(409,'The conversation is not waiting for an answer');
        await c.query("UPDATE conversations SET state='accepted',decided_at=now(),seq=nextval('room_events_seq'),updated_at=now() WHERE id=$1", [row.id]);
      });
      res.json({ conversation: await conversationFor(id, user.id) });
    });
    app.post('/api/public/conversations/:id/decline', async (req,res) => {
      await rate(req,'conversation-write',120);
      const user = await roomUser(req);
      const id = uuid.parse(req.params.id);
      await transaction(async c => {
        const row = await lockedConversation(c, id, user);
        if (row.sub_id !== user.id) fail(403,'Only the sub can answer a request');
        if (row.state !== 'requested') fail(409,'The conversation is not waiting for an answer');
        await c.query("UPDATE conversations SET state='declined',decided_at=now(),cooldown_until=now()+$2::interval,seq=nextval('room_events_seq'),updated_at=now() WHERE id=$1", [row.id, CONVERSATION_COOLDOWN]);
      });
      res.json({ conversation: await conversationFor(id, user.id) });
    });
    // Closing an accepted conversation starts the cooldown. Withdrawing a request does not: the dom may ask again at once.
    app.post('/api/public/conversations/:id/close', async (req,res) => {
      await rate(req,'conversation-write',120);
      const user = await roomUser(req);
      const id = uuid.parse(req.params.id);
      await transaction(async c => {
        const row = await lockedConversation(c, id, user);
        if (row.state !== 'requested' && row.state !== 'accepted') fail(409,'This conversation is closed');
        await c.query("UPDATE conversations SET state='closed',closed_at=now(),closed_by=$2,cooldown_until=CASE WHEN state='accepted' THEN now()+$3::interval ELSE NULL END,seq=nextval('room_events_seq'),updated_at=now() WHERE id=$1", [row.id, user.id, CONVERSATION_COOLDOWN]);
      });
      res.json({ conversation: await conversationFor(id, user.id) });
    });
    app.post('/api/public/conversations/:id/messages', async (req,res) => {
      await rate(req,'conversation-write',120);
      const user = await roomUser(req);
      const id = uuid.parse(req.params.id);
      const b = z.object({ body: conversationBody, idempotencyKey: uuid.optional() }).parse(req.body);
      const message = await transaction(async c => {
        const row = await lockedConversation(c, id, user);
        if (b.idempotencyKey) {
          const prior = (await c.query(`${conversationMessageSql} WHERE m.author_id=$1 AND m.idempotency_key=$2`, [user.id, b.idempotencyKey])).rows[0];
          if (prior) {
            if (prior.conversation_id !== row.id || prior.body !== b.body) fail(409,'Idempotency key was used for a different message');
            return prior;
          }
        }
        if (row.state !== 'accepted') fail(409, row.state === 'requested' ? 'Messages open after the request is accepted' : 'This conversation is closed');
        const recent = (await c.query("SELECT count(*)::int AS n FROM conversation_messages WHERE author_id=$1 AND created_at>now()-interval '10 minutes'", [user.id])).rows[0].n;
        if (recent >= CONVERSATION_MESSAGES_PER_TEN_MINUTES) fail(429,'Too many messages; try again in ten minutes');
        const messageId = randomUUID();
        await c.query('INSERT INTO conversation_messages(id,conversation_id,author_id,body,idempotency_key) VALUES($1,$2,$3,$4,$5)', [messageId, row.id, user.id, b.body, b.idempotencyKey ?? null]);
        return (await c.query(`${conversationMessageSql} WHERE m.id=$1`, [messageId])).rows[0];
      });
      res.json({ message: conversationMessageView(message, user.id) });
    });
    app.post('/api/public/conversations/messages/:messageId/report', async (req,res) => {
      await rate(req,'conversation-report',60);
      const user = await roomUser(req);
      const id = uuid.parse(req.params.messageId);
      const b = z.object({ reason: z.string().trim().min(1).max(300) }).parse(req.body);
      const message = (await pool.query(`${conversationMessageSql} WHERE m.id=$1`, [id])).rows[0];
      const conversation = message ? await visibleConversation(pool, message.conversation_id, user.id, await roomHiddenIds(pool, user.id)) : undefined;
      if (!message || !conversation || message.removed_at) fail(404,'Message unavailable');
      if (message.author_id === user.id) fail(400,'You cannot report your own message');
      // One report per user per message; a repeat is accepted and changes nothing.
      await pool.query('INSERT INTO conversation_reports(id,message_id,reporter_id,reason) VALUES($1,$2,$3,$4) ON CONFLICT(message_id,reporter_id) DO NOTHING', [randomUUID(), id, user.id, b.reason]);
      res.json({ reported: true });
    });
    app.post('/api/public/admin/conversations/messages/:messageId/remove', async (req,res) => {
      const actor = await reviewer(req);
      const id = uuid.parse(req.params.messageId);
      const b = z.object({ reason: z.string().trim().min(1).max(300) }).parse(req.body);
      const row = await transaction(async c => {
        await c.query("SELECT pg_advisory_xact_lock(hashtext('public-room'))");
        const message = (await c.query('SELECT removed_at FROM conversation_messages WHERE id=$1 FOR UPDATE', [id])).rows[0] ?? fail(404,'Message unavailable');
        if (message.removed_at) fail(409,'Message already removed');
        await c.query("UPDATE conversation_messages SET removed_at=now(),removed_by=$2,seq=nextval('room_events_seq') WHERE id=$1", [id, actor.id]);
        await c.query('INSERT INTO public_admin_audit(id,actor_id,action,target_message_id,reason) VALUES($1,$2,$3,$4,$5)', [randomUUID(), actor.id, 'conversation-remove', id, b.reason]);
        return (await c.query(`${conversationMessageSql} WHERE m.id=$1`, [id])).rows[0];
      });
      res.json({ message: conversationMessageView(row, actor.id) });
    });
    app.get('/api/public/admin/conversations/reports', async (req,res) => {
      await reviewer(req);
      const rows = (await pool.query('SELECT m.id, m.body, m.removed_at, a.nickname AS author_nickname, count(r.id)::int AS report_count, array_agg(r.reason ORDER BY r.created_at) AS reasons, max(r.created_at) AS last_reported_at FROM conversation_messages m JOIN conversation_reports r ON r.message_id=m.id JOIN public_users a ON a.id=m.author_id GROUP BY m.id, a.nickname ORDER BY count(r.id) DESC, max(r.created_at) DESC LIMIT 100')).rows;
      res.json({ reports: rows.map(row => ({ id: row.id, body: row.removed_at ? null : row.body, removed: row.removed_at !== null, nickname: row.author_nickname, reportCount: row.report_count, reasons: row.reasons, lastReportedAt: row.last_reported_at })) });
    });
  }
  const listeners = new Map<string,Set<Response>>();
  const emit = (pair: string) => { for(const res of listeners.get(pair) || []) res.write('data: refresh\n\n'); };
  app.get('/api/events', async (req,res) => {
    const u = await auth(req); if (!u.pair_id) fail(409,'Pair first');
    res.set({'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'}); res.flushHeaders();
    const set = listeners.get(u.pair_id!) || new Set<Response>(); listeners.set(u.pair_id!,set); set.add(res); res.write('data: refresh\n\n');
    const timer = setInterval(async()=>{ try { await auth(req); res.write(': heartbeat\n\n'); } catch { res.end(); } },15000);
    req.on('close',()=>{ clearInterval(timer); set.delete(res); if (!set.size) listeners.delete(u.pair_id!); });
  });
  async function locked(c: PoolClient, id: string, u: User, tick=true) {
    const r=await c.query('SELECT * FROM sessions WHERE id=$1 FOR UPDATE',[uuid.parse(id)]);
    if(!r.rows[0] || r.rows[0].pair_id!==u.pair_id) fail(403,'Session unavailable');
    const s=r.rows[0].data as Session; if(tick)advance(s); return s;
  }
  async function save(c:PoolClient,s:Session) {await c.query('UPDATE sessions SET status=$2,data=$3 WHERE id=$1',[s.id,s.status,JSON.stringify(s)]);}
  // Her adoration queue for one session: waiting = not revealed yet, ready = revealed but not sipped.
  async function adorationQueue(c:PoolClient,u:User,sessionId:string){
    if(u.role!=='wife')return undefined;
    const r=await c.query('SELECT count(*) FILTER (WHERE delivered_at IS NULL)::int AS waiting,count(*) FILTER (WHERE delivered_at IS NOT NULL AND rated=false)::int AS ready FROM tributes WHERE receiver_id=$1 AND session_id=$2',[u.id,sessionId]);
    const row=r.rows[0]??{waiting:0,ready:0};
    return {waiting:row.waiting as number,ready:row.ready as number};
  }
  app.get('/api/state',async(req,res)=>{
    const u=await auth(req);
    const now=Date.now();
    const {sessions,ensured,queen,adoration,spark}=await transaction(async c=>{
      const ensured=await ensureSession(c,u);
      const ids=(await c.query('SELECT id FROM sessions WHERE pair_id=$1 ORDER BY id',[u.pair_id])).rows;
      const values=[],allMissions:Mission[]=[];
      let active:Session|undefined;
      for(const {id} of ids){
        const s=await locked(c,id,u);await save(c,s);
        if(!active||(!terminal(s)&&terminal(active)))active=s;
        allMissions.push(...s.missions);
        const view:any=visible(s,u);
        const queue=await adorationQueue(c,u,id);
        if(queue)view.adoration={...(view.adoration??{}),...queue};
        values.push(view);
      }
      // Her daily spark is derived for the current session from the library plus imported ideas.
      let spark:Spark|undefined;
      if(u.role==='wife'&&active){
        const imported=(await c.query('SELECT id,category,he,en,minutes,intensity,tags FROM imported_ideas ORDER BY id')).rows as SparkIdea[];
        const day=Math.floor(now/86400000),stored=active.spark;
        const checkIn=active.checkIns?.[u.id];
        spark=dailySpark([...library,...imported],{now,rerolls:stored?.day===day?stored.rerolls:0,dismissed:stored?.dismissed??[],energy:checkIn?.energy,mood:checkIn?.mood});
      }
      return {sessions:values,ensured,queen:u.role==='wife'?queenLevel(queenProgress(allMissions)):undefined,adoration:u.role==='wife'?adorationTally(allMissions):undefined,spark};
    });
    if(ensured&&u.pair_id)emit(u.pair_id);
    // Derived per viewer on every read; the digest is never stored or pushed.
    const digest=weeklyDigest(sessions.flatMap((view:any)=>view.missions),u.role,now);
    res.json({user:u,mode,sessions,serverNow:Date.now(),digest,...(queen?{queenLevel:queen}:{}),...(adoration?{adorationTally:adoration}:{}),...(spark?{spark}:{})});
  });
  app.get('/api/sessions/:id',async(req,res)=>{const u=await auth(req); const session=await transaction(async c=>{const s=await locked(c,req.params.id as string,u);await save(c,s);const view:any=visible(s,u);const queue=await adorationQueue(c,u,s.id);if(queue)view.adoration={...(view.adoration??{}),...queue};return view;});res.json({session,serverNow:Date.now()});});
  app.post('/api/sessions',async(req,res)=>{
    const u=await auth(req);if(!u.pair_id) fail(409,'Pair first');
    const b=z.object({terms:z.string().trim().max(4000).default(''),minutes:z.number().int().min(1).max(525600).optional()}).parse(req.body);
    const s=newSession(b.terms,b.minutes);notice(s,'session-created',u.id);
    await transaction(async c=>{await c.query('SELECT id FROM pairs WHERE id=$1 FOR UPDATE',[u.pair_id]);const old=(await c.query("SELECT id FROM sessions WHERE pair_id=$1 AND status NOT IN ('stopped','expired')",[u.pair_id])).rows;for(const {id} of old){const previous=await locked(c,id,u);await save(c,previous);if(!terminal(previous))fail(409,'A session is already active');}await c.query('INSERT INTO sessions VALUES($1,$2,$3,$4)',[s.id,u.pair_id,s.status,JSON.stringify(s)]);});
    emit(u.pair_id!);res.json({session:visible(s,u)});
  });
  app.post('/api/sessions/:id/:op',async(req,res)=>{
    const u=await auth(req),op=req.params.op as string,b=req.body;
    const result=await transaction(async c=>{
      const s=await locked(c,req.params.id as string,u,op!=='reflection');
      if(op==='reflection'){
        const data=reflectionSchema.parse(b),previous=s.reflections?.[u.id];
        if(previous?.appreciation!==data.appreciation||previous?.repeat!==data.repeat){
          (s.reflections??={})[u.id]=data;notice(s,op,u.id);await save(c,s);
        }
        return {ok:true};
      }
      const keyedRequest=['complete','review','adjust','replace','reward','reward-request','reward-decision','wish-add','wish-request','wish-decision','quick','her-night','evening-close','evening-run','sip','grant','seal','tribute-reveal','chamberlain-decree','chamberlain-compose','repeat-stop','adore','whisper','whisper-delete','spark-reroll','spark-dismiss','season-start','season-stop','pin','unpin','auction','auction-bid'].includes(op);
      let requestKey:string|undefined;
      if(keyedRequest){
        if(u.role!==(['review','replace','reward','reward-decision','wish-add','wish-request','quick','her-night','evening-close','evening-run','sip','grant','seal','tribute-reveal','chamberlain-decree','chamberlain-compose','repeat-stop','whisper-delete','spark-reroll','spark-dismiss','season-start','season-stop','pin','unpin','auction'].includes(op)?'wife':'husband'))fail(403,'Wrong role for action');
        // Newer clients always send a key; an older cached bundle still works, just without replay.
        requestKey=uuid.parse(b.key??randomUUID());
        const previous=await c.query('SELECT result FROM request_keys WHERE session_id=$1 AND user_id=$2 AND kind=$3 AND key=$4',[s.id,u.id,op,requestKey]);
        // A committed retry is a read of the original result, even after return, pause or stop.
        if(previous.rowCount){await save(c,s);return previous.rows[0].result;}
      }
      // Persist expiry even when a subsequent action must be rejected. Curation stays open on ended sessions.
      if(terminal(s)&&op!=='read'&&!['pin','unpin'].includes(op)){await save(c,s);return {terminal:true};}
      const wife=()=>{if(u.role!=='wife')fail(403,'Wife role required');};
      const husband=()=>{if(u.role!=='husband')fail(403,'Husband role required');};
      const gameplay=()=>{if(suspended(s))fail(409,'Pause is active');};
      let mission:Mission|undefined;
      if(['edit','queue','deliver','cancel','ack','refuse','complete','review','adjust','replace','reveal','rate','repeat-stop','adore'].includes(op)){mission=s.missions.find(m=>m.id===uuid.parse(b.mission));if(!mission)fail(404,'Mission unavailable');}
      let response:any={ok:true};
      if(op==='stop'){s.status='stopped';for(const m of s.missions)if(!['approved','refused','cancelled'].includes(m.status))m.status='cancelled';}
      else if(op==='pause'){if(!s.pauses.includes(u.id))s.pauses.push(u.id);}
      else if(op==='resume'){s.pauses=s.pauses.filter(id=>id!==u.id);}
      // Curation stays open on ended sessions so the archive can be arranged after play stops.
      else if(op==='pin'){
        wife();const data=z.object({kind:z.enum(['mission','completion','reflection']),ref:uuid}).parse(b);
        const pins=s.pins??=[];
        if(pins.some(p=>p.kind===data.kind&&p.ref===data.ref))fail(409,'Already pinned');
        if(pins.length>=TROPHY_LIMIT)fail(409,'Trophy case is full');
        if(data.kind==='reflection'){if(!s.reflections?.[data.ref])fail(404,'Pin target unavailable');}
        else{const target=s.missions.find(m=>m.id===data.ref)??fail(404,'Pin target unavailable');if(data.kind==='completion'&&!target.completion?.trim())fail(409,'Completion required');}
        const pin:TrophyPin={id:randomUUID(),kind:data.kind,ref:data.ref,at:Date.now()};pins.push(pin);response={pin:{id:pin.id,kind:pin.kind,at:pin.at}};
      }
      else if(op==='unpin'){
        wife();const id=uuid.parse(b.pin);const pins=s.pins??[];if(!pins.some(p=>p.id===id))fail(404,'Pin unavailable');s.pins=pins.filter(p=>p.id!==id);
      }
      else if(op==='approve'||op==='revise'){/* Agreement flow removed; keep no-op for compatibility. */}
      else if(op==='aftercare'){husband();s.lastCareAt=Date.now();}
      else if(op==='read'){const ids=z.array(uuid).max(500).parse(b.ids);for(const n of s.inbox)if(ids.includes(n.id)&&!n.readBy.includes(u.id))n.readBy.push(u.id);}
      else if(op==='checkin'){
        const data=checkInSchema.parse(b);(s.checkIns??={})[u.id]=data;
      }
      else if(op==='message'){
        const key=uuid.parse(b.key);
        const previous=await c.query('SELECT result FROM request_keys WHERE session_id=$1 AND user_id=$2 AND kind=$3 AND key=$4',[s.id,u.id,op,key]);
        if(previous.rowCount){await save(c,s);return previous.rows[0].result;}
        const message={id:randomUUID(),by:u.id,text:text.parse(b.text),at:Date.now()};s.messages.push(message);response={message};
        await c.query('INSERT INTO request_keys VALUES($1,$2,$3,$4,$5)',[s.id,u.id,op,key,JSON.stringify(response)]);
      }
      else if(op==='propose'){
        husband();
        const key=uuid.parse(b.key);
        const previous=await c.query('SELECT result FROM request_keys WHERE session_id=$1 AND user_id=$2 AND kind=$3 AND key=$4',[s.id,u.id,op,key]);
        if(previous.rowCount){await save(c,s);return previous.rows[0].result;}
        const data=z.object({title:z.string().trim().min(1).max(160),text,points:z.number().int().min(0).max(100),category:z.string().trim().max(80).optional()}).parse(b);
        const list=s.proposals??=[];if(list.length>=20)fail(409,'Proposal list is full');
        const proposal:Proposal={id:randomUUID(),by:u.id,...data,at:Date.now(),status:'pending'};list.push(proposal);response={proposal};
        await c.query('INSERT INTO request_keys VALUES($1,$2,$3,$4,$5)',[s.id,u.id,op,key,JSON.stringify(response)]);
      }
      else if(op==='proposal-decide'){
        wife();
        const id=uuid.parse(b.proposal);const proposal=s.proposals?.find(p=>p.id===id)??fail(404,'Proposal unavailable');
        if(proposal.status!=='pending')fail(409,'Proposal already decided');
        if(z.boolean().parse(b.adopt)){
          // Adoption only creates an editable draft in her composer; explicit delivery is still hers.
          const m:Mission={id:randomUUID(),revision:s.revision,status:'draft',title:proposal.title,text:proposal.text,points:proposal.points,secret:false,completionStyle:'simple',createdAt:Date.now()};
          s.missions.push(m);proposal.status='adopted';proposal.missionId=m.id;response={proposal,mission:m};
        }else{proposal.status='declined';response={proposal};}
      }
      else if(op==='rate'&&mission){
        wife();const data=z.object({rating:z.enum(['love','like','skip'])}).parse(b);
        if(mission.status!=='approved')fail(409,'Approved mission required');
        mission.rating=data.rating;mission.ratedAt=Date.now();response={mission};
      }
      else if(op==='note-save'){
        wife();const data=z.object({text:z.string().trim().min(1).max(1000)}).parse(b);
        const list=s.notes??=[];if(list.length>=50)fail(409,'Note list is full');const note={id:randomUUID(),text:data.text,at:Date.now()};list.push(note);response={note};
      }
      else if(op==='note-delete'){wife();const id=uuid.parse(b.note);s.notes=(s.notes??[]).filter(n=>n.id!==id);}
      else if(op==='pace'){wife();const data=paceSchema.parse(b);s.pace=data.commandsPerEvening;response={pace:s.pace};}
      else if(op==='evening-close'){
        wife();let closed=0;for(const m of s.missions)if(m.status==='queued'&&!m.chapter){m.status='cancelled';closed++;}
        s.eveningClosedAt=Date.now();response={closed};
      }
      else if(op==='evening-save'){
        wife();const data=eveningSchema.parse(b);const list=s.savedEvenings??=[];if(list.length>=20)fail(409,'Saved evenings list is full');
        const evening={id:randomUUID(),...data,createdAt:Date.now()};list.push(evening);response={evening};
      }
      else if(op==='evening-delete'){wife();const id=uuid.parse(b.evening);s.savedEvenings=(s.savedEvenings??[]).filter(e=>e.id!==id);}
      else if(op==='tribute-queue'){
        if(u.role!=='husband')fail(403,'Husband role required');
        const key=z.string().uuid().parse(b.key);
        // A committed retry returns the original tribute even if the session changed state since.
        const previous=await c.query('SELECT result FROM request_keys WHERE session_id=$1 AND user_id=$2 AND kind=$3 AND key=$4',[s.id,u.id,'tribute',key]);
        if(previous.rowCount){await save(c,s);return previous.rows[0].result;}
        gameplay();
        const data=z.object({kind:z.enum(['note','voice','photo','service','greeting']),text,media:z.string().trim().max(4000).optional()}).parse(b);
        if(!u.pair_id)fail(404,'Pair not found');
        const pair=await c.query('SELECT wife FROM pairs WHERE id=$1',[u.pair_id]);
        if(pair.rowCount===0)fail(404,'Pair not found');
        const tributeId=randomUUID();
        await c.query('INSERT INTO tributes(id,session_id,giver_id,receiver_id,kind,text,media,delivered_at,rated) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[tributeId,s.id,u.id,pair.rows[0].wife,data.kind,data.text,data.media||null,null,false]);
        response={ok:true,tributeId};
        await c.query('INSERT INTO request_keys VALUES($1,$2,$3,$4,$5)',[s.id,u.id,'tribute',key,JSON.stringify(response)]);
      }
      else if(op==='tribute-reveal'){
        if(u.role!=='wife')fail(403,'Wife role required');
        gameplay();
        // One devotion is due her: reveal a specific one, or the oldest still waiting.
        // Tributes belong to the session that received them; never leak an older arc into this one.
        const delivered = b.tributeId===undefined
          ? await c.query('UPDATE tributes SET delivered_at=now() WHERE id=(SELECT id FROM tributes WHERE receiver_id=$1 AND session_id=$2 AND delivered_at IS NULL ORDER BY created_at ASC LIMIT 1) AND receiver_id=$1 AND session_id=$2 AND delivered_at IS NULL RETURNING *',[u.id,s.id])
          : await c.query('UPDATE tributes SET delivered_at=now() WHERE id=$1 AND receiver_id=$2 AND session_id=$3 AND delivered_at IS NULL RETURNING *',[z.string().uuid().parse(b.tributeId),u.id,s.id]);
        if(delivered.rowCount===0)fail(404,'No devotion is waiting for you');
        const tribute=delivered.rows[0];
        // Keep the words in her state so the panel can actually show what he wrote.
        s.adoration={...(s.adoration??{}),last:{id:tribute.id,kind:tribute.kind,text:tribute.text,media:tribute.media??null,at:Date.now()}};
        response={ok:true,tribute};
      }
      else if(op==='sip'){
        if(u.role!=='wife')fail(403,'Wife role required');
        gameplay();
        // Claim the tribute in the same statement so a double tap cannot sip twice.
        const latest=await c.query('UPDATE tributes SET rated=true WHERE id=(SELECT id FROM tributes WHERE receiver_id=$1 AND session_id=$2 AND delivered_at IS NOT NULL AND rated=false ORDER BY delivered_at DESC LIMIT 1) AND rated=false RETURNING id',[u.id,s.id]);
        if(latest.rowCount===0)fail(404,'No adoration to sip yet');
        s.adoration={...(s.adoration??{}),sippedFor:latest.rows[0].id};
        s.herPoints=(s.herPoints??0)+2;
        response={ok:true,glow:s.herPoints};
      }
      else if(op==='grant'){
        if(u.role!=='wife')fail(403,'Wife role required');
        gameplay();
        // The earned moment belongs to the sip she just took, not to a re-queried newest row.
        const sipped=s.adoration?.sippedFor;
        if(!sipped)fail(404,'Sip a devotion before granting the earned moment');
        if(s.adoration?.grantedFor===sipped)fail(409,'This earned moment was already granted');
        s.adoration={...(s.adoration??{}),grantedFor:sipped,grantedAt:Date.now()};
        s.herPoints=(s.herPoints??0)+3;
        response={ok:true,glow:s.herPoints};
      }
      else if(op==='seal'){
        if(u.role!=='wife')fail(403,'Wife role required');
        gameplay();
        s.adoration={...(s.adoration??{}),sealedAt:Date.now()};
        response={ok:true};
      }
      else if(op==='chamberlain-decree'){
        if(u.role!=='wife')fail(403,'Wife role required');
        gameplay();
        const decree=z.object({mood:z.enum(['worship','tease','discipline','service','rest']),season:z.string().trim().max(80).optional()}).parse(b);
        const composition=chamberlainCompose(decree,s);
        const composed=chamberlainPersistComposition(s,composition);
        // The cliffhanger is kept with the chapter, never sent on her behalf.
        s.chapterState={decree,at:Date.now(),cliffhanger:composed.cliffhanger};
        response={ok:true,composition,missionIds:composed.missionIds,cliffhanger:composed.cliffhanger};
      }
      else if(op==='chamberlain-compose'){
        if(u.role!=='wife')fail(403,'Wife role required');
        gameplay();
        const decree=s.chapterState?.decree;
        // Return the rejection so TypeScript keeps the decree narrowed below.
        if(!decree)return fail(404,'No decree found for this session');
        const composition=chamberlainCompose(decree,s);
        const composed=chamberlainPersistComposition(s,composition);
        s.chapterState={decree,at:Date.now(),cliffhanger:composed.cliffhanger};
        response={ok:true,composition,missionIds:composed.missionIds,cliffhanger:composed.cliffhanger};
      }
      else {
        // Stopping a repeating chain, his private adoration and her daily spark stay available during either personal pause.
        if(!['repeat-stop','adore','spark-reroll','spark-dismiss'].includes(op))gameplay();
        if(op==='auction'){
          wife();const data=z.object({title:z.string().trim().min(1).max(160),description:text,minBid:z.number().int().min(1).max(AUCTION_LIMITS.maxBid),closesAt:z.number().int()}).parse(b);
          const now=Date.now();
          if(data.closesAt<=now)fail(400,'Closing time must be in the future');
          if(data.closesAt>now+AUCTION_LIMITS.maxAheadMs)fail(400,'Closing time must be within seven days');
          const lots=s.auctions??=[];
          if(lots.filter(lot=>lot.status==='open').length>=AUCTION_LIMITS.open)fail(409,'Too many open auctions');
          if(lots.length>=AUCTION_LIMITS.stored)fail(409,'Auction list is full');
          const lot:Auction={id:randomUUID(),title:data.title,description:data.description,minBid:data.minBid,closesAt:data.closesAt,status:'open',bids:[],createdAt:now};
          lots.push(lot);response={auction:lot};
        }
        else if(op==='auction-bid'){
          husband();const data=z.object({auction:uuid,amount:z.number().int().min(1).max(AUCTION_LIMITS.maxBid)}).parse(b);
          const lot=s.auctions?.find(item=>item.id===data.auction)??fail(404,'Auction unavailable');
          if(lot.status!=='open'||lot.closesAt<=Date.now())fail(409,'Auction is closed');
          if(data.amount<lot.minBid)fail(409,'Bid is below the minimum');
          if(data.amount<=(highestBid(lot.bids)??0))fail(409,'Bid must beat the current highest bid');
          lot.bids.push({amount:data.amount,at:Date.now()});response={auction:lot};
        }
        else if(op==='extend'){wife();s.remaining+=z.number().int().min(1).max(525600).parse(b.minutes)*60000;}
        else if(op==='persona'){wife();s.persona=z.enum(['strict','playful','caring']).parse(b.persona);}
        else if(op==='followup'){wife();const item=z.string().trim().min(1).max(4000).parse(b.text);const list=s.followups??=[];if(!list.includes(item))list.push(item);}
        else if(op==='reward'){
          wife();const data=z.object({title:z.string().trim().min(1).max(160),description:text,cost:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)}).parse(b);
          const reward={...data,id:randomUUID()};(s.rewards??=[]).push(reward);response={reward};
        }
        else if(op==='reward-request'){
          husband();const rewardId=uuid.parse(b.reward);const reward=s.rewards?.find(r=>r.id===rewardId)??fail(404,'Reward unavailable');
          const request:RewardRequest={...reward,id:randomUUID(),rewardId:reward.id,status:'pending'};(s.rewardRequests??=[]).push(request);response={request};
        }
        else if(op==='reward-decision'){
          wife();const requestId=uuid.parse(b.request);const request=s.rewardRequests?.find(r=>r.id===requestId)??fail(404,'Reward request unavailable');
          const approve=z.boolean().parse(b.approve);if(request.status!=='pending')fail(409,'Reward request already decided');
          if(approve&&s.points<request.cost)fail(409,'Insufficient points');
          if(approve)s.points-=request.cost;request.status=approve?'approved':'declined';response={request,points:s.points};
        }
        else if(op==='sequence'){
          wife();const ids=z.array(uuid).max(3).refine(ids=>new Set(ids).size===ids.length).parse(b.missions);
          for(const id of ids)if(!s.missions.some(m=>m.id===id))fail(404,'Mission unavailable');
          s.sequence=ids;s.autoProgress=b.autoProgress===undefined?false:z.boolean().parse(b.autoProgress);
        }
        else if(op==='mission'){
          wife();const key=uuid.parse(b.key);
          const previous=await c.query('SELECT result FROM request_keys WHERE session_id=$1 AND user_id=$2 AND kind=$3 AND key=$4',[s.id,u.id,op,key]);
          if(previous.rowCount)return previous.rows[0].result;
          const data=draftSchema.parse(b);
          const m:Mission={...data,id:randomUUID(),revision:s.revision,status:'draft',createdAt:Date.now()};s.missions.push(m);response={mission:m};
          await c.query('INSERT INTO request_keys VALUES($1,$2,$3,$4,$5)',[s.id,u.id,op,key,JSON.stringify(response)]);
        }
        else if(op==='quick'){
          wife();const data=z.object({preset:z.string().max(40).optional(),lang:z.enum(['he','en']).default('he'),title:z.string().trim().min(1).max(160).optional(),text:text.optional(),points:z.number().int().min(0).max(100).optional(),scheduledAt:z.number().int().optional()}).parse(b);
          if(eveningClosed(s))fail(409,'Evening is closed');
          const preset=data.preset?quickPresets.find(p=>p.id===data.preset)??fail(404,'Command unavailable'):undefined;
          const body=preset?(data.lang==='he'?preset.he:preset.en):data.text;
          const title=preset?body:data.title;
          if(!title||!body)throw Object.assign(new Error('Title and text are required'),{status:400});
          if(data.scheduledAt!==undefined&&data.scheduledAt<Date.now())throw Object.assign(new Error('Schedule must be in the future'),{status:400});
          if(data.scheduledAt!==undefined&&data.scheduledAt>Date.now()+31536000000)throw Object.assign(new Error('Schedule must be within one year'),{status:400});
          if(eveningUsed(s.missions)>=(s.pace??3))fail(409,'Evening limit reached for the current pace');
          const m:Mission={id:randomUUID(),revision:s.revision,title,text:body,points:preset?preset.points:(data.points??0),secret:false,completionStyle:'simple',status:'pending',deliveredAt:Date.now(),createdAt:Date.now()};
          if(data.scheduledAt!==undefined){m.status='queued';m.scheduledAt=data.scheduledAt;delete m.deliveredAt;}
          s.missions.push(m);response={mission:m};
        }
        else if(op==='her-night'){
          wife();const data=nightSchema.parse(b);
          response={night:runNight(s,data.mood,data.lang,data.steps)};
        }
        else if(op==='evening-run'){
          wife();const data=z.object({evening:uuid,lang:z.enum(['he','en']).default('he')}).parse(b);
          const saved=s.savedEvenings?.find(e=>e.id===data.evening)??fail(404,'Evening unavailable');
          response={night:runNight(s,saved.mood,data.lang,saved.steps)};
        }
        else if(op==='wish-add'){
          wife();const data=z.object({title:z.string().trim().min(1).max(160),description:z.string().trim().max(4000).default(''),link:z.string().trim().regex(/^https?:\/\/\S+$/i).max(2000).optional()}).parse(b);
          const list=s.wishes??=[];if(list.length>=50)fail(409,'Wish list is full');const wish:Wish={id:randomUUID(),...data,createdAt:Date.now()};list.push(wish);response={wish};
        }
        else if(op==='wish-remove'){
          wife();const id=uuid.parse(b.wish);const wish=s.wishes?.find(w=>w.id===id)??fail(404,'Wish unavailable');
          if(s.wishRequests?.some(r=>r.wish===wish.id&&r.status==='pending'))fail(409,'Wish has a pending request');
          s.wishes=s.wishes!.filter(w=>w.id!==id);
        }
        else if(op==='wish-price'){
          husband();const id=uuid.parse(b.wish);const wish=s.wishes?.find(w=>w.id===id)??fail(404,'Wish unavailable');
          if(s.wishRequests?.some(r=>r.wish===id&&r.status==='pending'))fail(409,'Wish has a pending request');
          wish.cost=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(b.cost);
        }
        else if(op==='wish-request'){
          wife();const id=uuid.parse(b.wish);const wish=s.wishes?.find(w=>w.id===id)??fail(404,'Wish unavailable');
          if(s.wishRequests?.some(r=>r.wish===id&&r.status==='pending'))fail(409,'Wish already requested');
          const list=s.wishRequests??=[];if(list.length>=200)fail(409,'Wish request list is full');
          const cost=wish.cost??fail(409,'Wish is not priced yet');
          const request:WishRequest={id:randomUUID(),wish:id,title:wish.title,cost,status:'pending',at:Date.now()};list.push(request);response={request};
        }
        else if(op==='wish-decision'){
          husband();const requestId=uuid.parse(b.request);const request=s.wishRequests?.find(r=>r.id===requestId)??fail(404,'Wish request unavailable');
          const approve=z.boolean().parse(b.approve);if(request.status!=='pending')fail(409,'Wish request already decided');
          if(approve){
            if(s.points<request.cost)fail(409,'Insufficient points for wish');
            s.points-=request.cost;
          }
          request.status=approve?'approved':'declined';response={request,points:s.points};
        }
        else if(op==='command-save'){
          wife();const data=z.object({title:z.string().trim().min(1).max(160),text:text,points:z.number().int().min(0).max(100)}).parse(b);
          const list=s.commands??=[];if(list.length>=20)fail(409,'Command list is full');list.push({id:randomUUID(),...data});
        }
        else if(op==='command-delete'){wife();const id=uuid.parse(b.command);s.commands=(s.commands??[]).filter(c=>c.id!==id);}
        else if(op==='whisper'){
          husband();
          const body=z.string().trim().min(1).max(400).parse(b.text);
          const list=s.whispers??=[];
          if(list.length>=20)fail(409,'Whisper list is full');
          list.push({id:randomUUID(),text:body,at:Date.now()});
          response={ok:true,whisperSent:list.length};
        }
        else if(op==='whisper-delete'){
          wife();const id=uuid.parse(b.whisper);
          s.whispers=(s.whispers??[]).filter(item=>item.id!==id);
        }
        else if(op==='spark-reroll'){
          wife();
          const day=Math.floor(Date.now()/86400000),spark=s.spark??={day,rerolls:0,dismissed:[]};
          if(spark.day!==day){spark.day=day;spark.rerolls=0;}
          if(spark.rerolls>=SPARK_REROLLS)fail(409,'Daily spark reroll limit reached');
          spark.rerolls+=1;
          response={ok:true,rerolls:spark.rerolls};
        }
        else if(op==='spark-dismiss'){
          wife();
          const idea=z.string().trim().min(1).max(160).parse(b.idea);
          const spark=s.spark??={day:Math.floor(Date.now()/86400000),rerolls:0,dismissed:[]};
          if(!spark.dismissed.includes(idea)){
            if(spark.dismissed.length>=SPARK_DISMISSED)fail(409,'Spark dismiss list is full');
            spark.dismissed.push(idea);
          }
          response={ok:true,dismissed:spark.dismissed.length};
        }
        else if(op==='season-start'){
          wife();
          const data=z.object({pack:z.string().min(1).max(40),startsAt:z.number().int().optional(),lang:z.enum(['he','en']).default('he')}).parse(b);
          const pack=seasonPack(data.pack)??fail(404,'Season unavailable');
          if(s.missions.some(m=>!!m.season&&m.status==='queued'))fail(409,'A season is already running');
          const now=Date.now(),startsAt=data.startsAt??seasonStartDefault(now);
          if(startsAt<now)fail(400,'Schedule must be in the future');
          if(startsAt+(pack.days-1)*SEASON_DAY_MS>now+31536000000)fail(400,'Schedule must be within one year');
          for(let day=1;day<=pack.days;day++){
            const item=seasonItemFor(pack,day);
            s.missions.push({id:randomUUID(),revision:s.revision,title:data.lang==='he'?item.title.he:item.title.en,text:data.lang==='he'?item.text.he:item.text.en,points:item.points,secret:false,completionStyle:'simple',status:'queued',scheduledAt:startsAt+(day-1)*SEASON_DAY_MS,createdAt:now,season:{id:pack.id,day}});
          }
          s.seasonState={id:pack.id,startsAt,days:pack.days};
          response={season:{id:pack.id,days:pack.days,startsAt}};
        }
        else if(op==='season-stop'){
          wife();
          const data=z.object({pack:z.string().min(1).max(40).optional()}).parse(b);
          const state=s.seasonState??fail(409,'No season is running');
          if(state.stoppedAt!==undefined)fail(409,'No season is running');
          if(data.pack!==undefined&&data.pack!==state.id)fail(404,'Season unavailable');
          let cancelled=0;for(const m of s.missions)if(m.season&&m.status==='queued'){m.status='cancelled';cancelled++;}
          state.stoppedAt=Date.now();response={cancelled};
        }
        else if(mission){
          const m=mission;if(m.revision!==s.revision)fail(409,'Mission belongs to a previous agreement');
          if(['edit','queue','deliver','cancel','review','replace','repeat-stop'].includes(op))wife();else husband();
          if(op==='edit'){if(m.status!=='draft')fail(409,'Delivered terms are immutable');const data=draftSchema.parse({...m,...b});Object.assign(m,data);}
          else if(op==='queue'){
            if(!['draft','queued'].includes(m.status))fail(409,'Draft required');
            const at=z.number().int().min(Date.now()).max(Date.now()+31536000000).parse(b.scheduledAt);
            // Repeat is chosen when queueing. A successor already in a chain cannot change its own pacing.
            if(b.repeat!==undefined&&b.repeat!==null){
              if(m.repeatOf)fail(409,'Repeating chain settings are fixed');
              m.repeat=z.enum(['daily','weekly']).parse(b.repeat);m.repeatStopped=undefined;
            }
            m.scheduledAt=at;m.status='queued';
          }
          else if(op==='deliver'){if(!['draft','queued'].includes(m.status))fail(409,'Draft required');m.status='pending';m.deliveredAt=Date.now();repeatSuccessor(s,m,Date.now());}
          else if(op==='cancel'){if(['approved','refused'].includes(m.status))fail(409,'Mission already final');const wasRepeating=m.status==='queued'&&!!m.repeat&&!m.repeatStopped;m.status='cancelled';if(wasRepeating)repeatSuccessor(s,m,Date.now());}
          else if(op==='reveal'){if(!m.surprise||!m.deliveredAt||m.status!=='pending')fail(409,'Pending surprise required');if(m.revealedAt){await save(c,s);return {ok:true};}m.revealedAt=Date.now();}
          else if(op==='ack'){if(m.surprise&&!m.revealedAt)fail(409,'Reveal invitation first');if(!['pending','acknowledged'].includes(m.status))fail(409,'Pending mission required');m.status='acknowledged';m.acknowledgedAt??=Date.now();}
          else if(op==='refuse'){if(!['pending','acknowledged','revision','adjustment','refused'].includes(m.status))fail(409,'Mission cannot be refused here');m.status='refused';}
          else if(op==='adjust'){
            if(m.surprise&&!m.revealedAt)fail(409,'Reveal invitation first');
            if(!['pending','acknowledged','revision'].includes(m.status))fail(409,'Pending, acknowledged or returned invitation required');
            const data=z.object({reason:z.enum(['softer','adjust']),note:z.string().trim().max(4000).optional()}).parse(b);
            m.adjustment={reason:data.reason,...(data.note?{note:data.note}:{}),at:Date.now()};m.status='adjustment';
            response={mission:m};
          }
          else if(op==='replace'){
            if(m.status!=='adjustment'||m.replacementId)fail(409,'Unreplaced adjustment required');
            const data=draftSchema.parse(b);
            const replacement:Mission={...data,id:randomUUID(),revision:s.revision,status:'draft',replaces:m.id};
            s.missions.push(replacement);m.replacementId=replacement.id;m.status='cancelled';response={mission:replacement};
          }
          else if(op==='complete'){
            const expectedVersion=z.number().int().min(0).parse(b.expectedVersion);
            if(expectedVersion!==(m.submissionVersion??0))fail(409,'Submission changed; refresh before completing');
            if(!['acknowledged','revision'].includes(m.status))fail(409,'Acknowledged or returned work required');
            m.completion=m.completionStyle==='simple'?z.string().trim().max(4000).default('').parse(b.text):text.parse(b.text);m.submissionVersion=expectedVersion+1;m.status='submitted';
            response={mission:m.id,submissionVersion:m.submissionVersion,completion:m.completion,status:m.status};
          }
          else if(op==='repeat-stop'){
            wife();
            const root=m.repeatOf??m.id;
            m.repeatStopped=true;
            const orig=s.missions.find(x=>x.id===root);
            if(orig)orig.repeatStopped=true;
            for(const other of s.missions){if((other.repeatOf??other.id)===root&&other.status==='queued'){other.status='cancelled';}}
            response={ok:true};
          }
          else if(op==='adore'){
            husband();
            if(m.status!=='approved')fail(409,'Approved mission required');
            m.adoration=z.enum(['loved','liked','ok']).parse(b.adoration);m.adoredAt=Date.now();
            response={ok:true};
          }
          else if(op==='review'){
            const approve=z.boolean().parse(b.approve),version=z.number().int().min(0).parse(b.submissionVersion);
            if(version!==(m.submissionVersion??0))fail(409,'Submission changed; review the current work');
            if(m.status!=='submitted')fail(409,'Submitted work required');
            if(approve){const award=await c.query('INSERT INTO awards VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING points',[m.id,s.id,m.points]);if(award.rowCount){s.points+=m.points;s.herPoints=(s.herPoints??0)+m.points;}m.status='approved';m.approvedAt=Date.now();
              const index=s.sequence?.indexOf(m.id)??-1,next=index>=0?s.missions.find(item=>item.id===s.sequence?.[index+1]):undefined;
              if(s.autoProgress===true&&next?.status==='draft'&&next.revision===s.revision){next.status='pending';next.deliveredAt=Date.now();notice(s,'mission-delivered','server',next.surprise?{missionId:next.id}:undefined);}
            }else m.status='revision';
            response={mission:m.id,submissionVersion:version,status:m.status,points:s.points};
          }
        }else fail(404,'Unknown action');
      }
      if(op!=='read'&&!op.startsWith('note-')&&!['evening-save','evening-delete','pace','tribute-queue','tribute-reveal','sip','grant','seal','chamberlain-decree','chamberlain-compose','adore'].includes(op))notice(s,op,u.id,op==='reward-request'?{rewardRequestId:response.request.id}:op==='reward-decision'?{rewardRequestId:response.request.id,outcome:response.request.status}:(response.mission?.surprise?{missionId:response.mission.id}:mission?.surprise?{missionId:mission.id}:undefined));
      if(requestKey)await c.query('INSERT INTO request_keys VALUES($1,$2,$3,$4,$5)',[s.id,u.id,op,requestKey,JSON.stringify(response)]);
      s.last=Date.now();await save(c,s);return response;
    });
    if(result.terminal)fail(409,'Session is terminal');
    if(u.pair_id)emit(u.pair_id);res.json(result);
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Unknown endpoint'}));
  app.use((error:any,_req:Request,res:Response,_next:NextFunction)=>{
    const status=error instanceof z.ZodError?400:error.code==='23505'?409:error.status||500;
    if(status===500)console.error('API failure',error.code || error.name);
    res.status(status).json({error:status===500?'Server error':error instanceof z.ZodError?'Invalid or missing input':status===409&&error.code==='23505'?'Already exists':error.message});
  });
  return app;
}
