import express, { type Request, type Response, type NextFunction } from 'express';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { quickPresets } from '../src/quick.ts';
import { devotionStreak, eveningClosed, eveningUsed, missionStreak, queenLevel, queenProgress, type QueenLevel, type StreakStats } from '../src/progress.ts';
import { chamberlainCompose, chamberlainPersistComposition } from '../src/chamberlain.ts';
import { library, type Idea } from '../src/library.ts';
import { pickSpark, sparkDay, sparkDismissedCap, sparkRerollCap, sparkRerollsUsed, type SparkPick } from '../src/spark.ts';
import { SEASON_DAY_MS, seasonItemFor, seasonPack, seasonStartDefault } from '../src/seasons.ts';
import { WHEEL_COST_MAX } from '../src/wheels.ts';
import { AUCTION_LIMITS, highestBid, settleAuction, type AuctionOutcome } from '../src/auctions.ts';
import { TROPHY_LIMIT, trophyEntries, type TrophyEntry, type TrophyPin, type TrophySource } from '../src/trophies.ts';
import { weeklyDigest, type WeeklyDigest } from '../src/digest.ts';
const scrypt = promisify(scryptCallback);
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const text = z.string().trim().min(1).max(4000);
const uuid = z.string().uuid();
const completionStyle=z.enum(['simple','written']);
const draftSchema=z.object({title:z.string().trim().min(1).max(160),text,points:z.number().int().min(0).max(100).default(0),secret:z.boolean().default(false),completionStyle:completionStyle.default('simple'),surprise:z.boolean().default(false),category:z.string().trim().max(80).optional()}).refine(v=>!v.surprise||!!v.category);
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
export type Mission = { id: string; revision: number; title: string; text: string; titleEn?: string; textEn?: string; points: number; secret: boolean; chapter?: boolean; surprise?:boolean; category?:string; revealedAt?:number; completionStyle?: 'simple'|'written'; status: string; scheduledAt?: number; completion?: string; submissionVersion?: number; deliveredAt?: number; acknowledgedAt?: number; adjustment?: {reason:'softer'|'adjust';note?:string;at:number}; replaces?: string; replacementId?: string; approvedAt?: number; rating?: 'love'|'like'|'skip'; ratedAt?: number; createdAt?: number; repeat?: 'daily'|'weekly'; repeatOf?: string; repeatStopped?: boolean; season?: {id:string;day:number}; sealed?: boolean; revealsAt?: number };
export type Reward = {id:string; title:string; description:string; cost:number};
export type RewardRequest = Reward & {rewardId:string; status:'pending'|'approved'|'declined'};
export type Wish = {id:string; title:string; description:string; link?:string; cost?:number; createdAt:number};
export type WishRequest = {id:string; wish:string; title:string; cost:number; status:'pending'|'approved'|'declined'; at:number};
export type Proposal = { id: string; by: string; title: string; text: string; points: number; category?: string; at: number; status: 'pending'|'adopted'|'declined'; missionId?: string };
export type Auction = {id:string; title:string; description:string; minBid:number; closesAt:number; status:'open'|'closed'|'void'; bids:{amount:number;at:number}[]; winningBid?:number; outcome?:AuctionOutcome; createdAt:number};
export type Session = { id: string; status: string; terms: string; revision: number; revisions: { revision: number; terms: string }[]; approvals: string[]; pauses: string[]; remaining: number; unlimited?: boolean; last: number; started: boolean; points: number; missions: Mission[]; rewards?: Reward[]; rewardRequests?: RewardRequest[]; sequence?: string[]; autoProgress?:boolean; persona?:'strict'|'playful'|'caring'; followups?:string[]; checkIns?: Record<string,CheckIn>; reflections?: Record<string,Reflection>; messages: {id:string; by:string; text:string; at:number}[]; history: { at:number; event:string; by:string; rewardRequestId?:string; outcome?:'approved'|'declined'|AuctionOutcome; points?:number }[]; inbox: {id:string; at:number; event:string; readBy:string[]}[]; herPoints?: number; proposals?: Proposal[]; wishes?: Wish[]; wishRequests?: WishRequest[]; commands?: {id:string;title:string;text:string;points:number}[]; notes?: {id:string;text:string;at:number}[]; nights?: {id:string;mood:'soft'|'playful'|'strict';at:number;missionIds:string[]}[]; moodCounts?: Record<'soft'|'playful'|'strict',number>; lastCareAt?: number; pace?: 1|2|3; eveningClosedAt?: number; savedEvenings?: {id:string;name:string;mood:'soft'|'playful'|'strict';steps:{he:string;en:string;points:number;minutesFromNow:number}[];createdAt:number}[]; chapterState?: { decree?: { mood: string; season?: string }; at?: number; cliffhanger?: { he: string; en: string } }; adoration?: { sippedFor?: string; grantedFor?: string; grantedAt?: number; sealedAt?: number; waiting?: number; ready?: number; last?: { id: string; kind: string; text: string; media?: string | null; at: number } }; whispers?: {id:string;text:string;at:number}[]; whisperSent?: number; sparkDismissed?: string[]; sparkReroll?: {day:string;count:number}; spark?: SparkPick|null; streaks?: {devotion:StreakStats;mission:StreakStats}; queenLevel?: QueenLevel; seasonState?: {id:string;startsAt:number;days:number;stoppedAt?:number}; seasonProgress?: {id:string;done:number;total:number;running:boolean}; wheelCost?: number; auctions?: Auction[]; pins?: TrophyPin[]; trophies?: TrophyEntry[]; digest?: WeeklyDigest };
const suspended = (s: Session) => s.pauses.length > 0;
const terminal = (s: Session) => ['stopped','expired'].includes(s.status);
function notice(s: Session, event: string, by: string, reward?:{rewardRequestId?:string;outcome?:'approved'|'declined'|AuctionOutcome;missionId?:string;points?:number}) {
  const at = Date.now(); s.history.push({ at, event, by, ...reward });
  s.inbox.push({ id: randomUUID(), at, event, readBy: [], ...(reward?.missionId?{missionId:reward.missionId}:{}) });
}
const repeatStep:Record<'daily'|'weekly',number>={daily:86400000,weekly:7*86400000};
const repeatSchema=z.enum(['daily','weekly']);
// Queues the occurrence after a queued repeating mission leaves the queue (delivered, sent now, or cancelled).
// Called only on those transitions, so each occurrence creates at most one successor. A stale successor skips forward by whole intervals instead of delivering a backlog.
function nextOccurrence(s: Session, m: Mission, now: number) {
  if (!m.repeat || m.scheduledAt === undefined) return;
  const root = m.repeatOf ?? m.id;
  if (s.missions.find(x => x.id === root)?.repeatStopped) return;
  const step = repeatStep[m.repeat];
  let at = m.scheduledAt + step;
  while (at <= now) at += step;
  s.missions.push({ id: randomUUID(), revision: s.revision, title: m.title, text: m.text, points: m.points, secret: m.secret, surprise: m.surprise, category: m.category, completionStyle: m.completionStyle, repeat: m.repeat, repeatOf: root, status: 'queued', scheduledAt: at, createdAt: now });
}
// Auction lots close on wall-clock time regardless of holds. Terminal sessions void every open lot; held sessions void due lots without charging.
function settleAuctions(s: Session, now: number) {
  const ended = terminal(s), held = suspended(s);
  for (const lot of s.auctions ?? []) {
    if (lot.status !== 'open' || (!ended && lot.closesAt > now)) continue;
    const { outcome, charge } = settleAuction({ bids: lot.bids, points: s.points, terminal: ended, held });
    if (charge) { s.points -= charge; lot.winningBid = charge; }
    lot.status = outcome === 'void' ? 'void' : 'closed';
    lot.outcome = outcome;
    notice(s, 'auction-close', 'server', { outcome });
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
    if (!terminal(s)) for (const m of s.missions) if (m.status === 'queued' && m.scheduledAt! <= now) { m.status = 'pending'; m.deliveredAt = now; nextOccurrence(s, m, now); notice(s, 'mission-delivered', 'server',m.surprise?{missionId:m.id}:undefined); }
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
// Derived at response time, never stored. Counts delivered occurrences of the current run only (scheduledAt inside its window), so a restarted pack does not count the old run.
function seasonProgressOf(s: Session) {
  const state=s.seasonState;
  if(!state)return undefined;
  const from=state.startsAt,until=from+state.days*SEASON_DAY_MS;
  const done=s.missions.filter(m=>m.season?.id===state.id&&m.deliveredAt!==undefined&&(m.scheduledAt??0)>=from&&(m.scheduledAt??0)<until).length;
  return {id:state.id,done,total:state.days,running:s.missions.some(m=>!!m.season&&m.status==='queued')};
}
// A queued, non-secret surprise is sealed for the husband until it is delivered. Secret items stay fully hidden.
function sealed(m: Mission) {
  return !!m.surprise && !m.secret && m.status === 'queued' && m.deliveredAt === undefined && m.scheduledAt !== undefined;
}
// Pins resolve per viewer against the missions that viewer may see. A mission that exists but is withheld (no title in the visible view) is a hidden placeholder.
function trophySource(s: Session, shown: { id: string; title?: string; text?: string; completion?: string }[]): TrophySource {
  return {
    mission: id => { if(!s.missions.some(m => m.id === id)) return undefined; const view = shown.find(m => m.id === id); return view?.title === undefined || view.text === undefined ? 'hidden' : { title: view.title, text: view.text, completion: view.completion }; },
    reflection: id => s.reflections?.[id],
  };
}
function visible(s: Session, user: User) {
  const seasonProgress=seasonProgressOf(s);
  if(user.role==='wife')return {...s,seasonProgress,trophies:trophyEntries(s.pins,user,trophySource(s,s.missions))};
  const hidden=new Set(s.missions.filter(m=>m.surprise&&!m.revealedAt).map(m=>m.id));
  const missions=s.missions.filter(m => (!(m.secret||m.surprise) || !!m.deliveredAt || sealed(m)) && !(m.season&&!m.deliveredAt)).map(({repeatStopped,...m})=>{if(sealed(m))return {id:m.id,revision:m.revision,status:'queued' as const,surprise:true as const,sealed:true as const,revealsAt:m.scheduledAt!};if(hidden.has(m.id))return {id:m.id,revision:m.revision,status:m.status,surprise:true,deliveredAt:m.deliveredAt};if(m.replacementId&&hidden.has(m.replacementId)){const {replacementId,...rest}=m;return rest;}return m;});
  const allowed=(n:any)=>!n.missionId||!hidden.has(n.missionId);
  return { ...s, commands:undefined, notes:undefined, savedEvenings:undefined, chapterState:undefined, adoration:undefined, whispers:undefined, sparkDismissed:undefined, sparkReroll:undefined, seasonProgress, missions, trophies:trophyEntries(s.pins,user,trophySource(s,missions)), pins:s.pins?.map(({ref,...pin})=>pin), history:s.history.filter(allowed),inbox:s.inbox.filter(allowed), ...(s.sequence?{sequence:s.sequence.filter(id=>missions.some(m=>m.id===id))}:{}) };
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
export async function createApp(pool: Pool, origin: string, options: { clock?: () => number } = {}) {
  const clock = options.clock ?? Date.now;
  let ideaCache: { marker: string; ideas: Idea[] } | null = null;
  async function libraryIdeas(): Promise<Idea[]> {
    const { n, last } = (await pool.query('SELECT count(*)::int AS n, max(id) AS last FROM imported_ideas')).rows[0];
    const marker = `${n}|${last ?? ''}`;
    if (ideaCache?.marker !== marker) {
      const rows = (await pool.query('SELECT id,category,he,en,minutes,intensity,tags FROM imported_ideas ORDER BY id')).rows as Idea[];
      ideaCache = { marker, ideas: [...library, ...rows] };
    }
    return ideaCache.ideas;
  }
  async function sparkFor(s: Session, wifeId: string): Promise<SparkPick | null> {
    if (terminal(s)) return null;
    const day = sparkDay(clock());
    return pickSpark(await libraryIdeas(), { sessionId: s.id, day, reroll: sparkRerollsUsed(s.sparkReroll, day), dismissed: s.sparkDismissed, checkIn: s.checkIns?.[wifeId] });
  }
  async function digestFor(s: Session, u: User, view: ReturnType<typeof visible>, nowMs: number): Promise<WeeklyDigest> {
    const wife = u.role === 'wife' && !terminal(s);
    const day = sparkDay(nowMs);
    // Withheld placeholders are partial but never approved, so they add nothing to the digest.
    return weeklyDigest({
      viewer: u.role, now: nowMs, missions: view.missions as Mission[], history: view.history, rewardRequests: view.rewardRequests, auctions: view.auctions,
      ideas: wife ? await libraryIdeas() : undefined,
      spark: wife ? { sessionId: s.id, reroll: sparkRerollsUsed(s.sparkReroll, day), dismissed: s.sparkDismissed, checkIn: s.checkIns?.[u.id] } : undefined,
    });
  }
  const configured = new URL(origin);
  if (configured.origin !== origin || (process.env.NODE_ENV === 'production' && configured.protocol !== 'https:')) throw new Error('APP_ORIGIN must be an exact origin; production requires HTTPS');
  await pool.query(await readFile(new URL('../db/001-foundation.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/002-guests.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/003-private-game.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/004-imported-ideas.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/005-devotions.sql', import.meta.url), 'utf8'));
  const app = express(); app.disable('x-powered-by');
  app.set('trust proxy',process.env.TRUST_PROXY?.split(',').map(v=>v.trim())||false);
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    if(process.env.NODE_ENV==='production')res.set('Strict-Transport-Security','max-age=31536000');
    const requestOrigin = `${req.protocol}://${req.host}`;
    const sameAddress = req.headers.origin === requestOrigin && (process.env.NODE_ENV !== 'production' || req.protocol === 'https');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin !== origin && !sameAddress) return res.status(403).json({ error: 'Origin rejected', expectedOrigin: origin });
    next();
  });
  app.use(express.json({ limit: '16kb' }));
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
    const {sessions,ensured}=await transaction(async c=>{
      const ensured=await ensureSession(c,u);
      const ids=(await c.query('SELECT id FROM sessions WHERE pair_id=$1 ORDER BY id',[u.pair_id])).rows;
      const values=[];
      for(const {id} of ids){
        const s=await locked(c,id,u);await save(c,s);
        const nowMs=clock();
        const base=visible(s,u);
        const view:any=u.role==='wife'?{...base,spark:await sparkFor(s,u.id),queenLevel:queenLevel(queenProgress(s.missions))}:base;
        const queue=await adorationQueue(c,u,id);
        if(queue)view.adoration={...(view.adoration??{}),...queue};
        view.streaks={devotion:devotionStreak(view.missions,nowMs),mission:missionStreak(view.missions,nowMs)};
        view.digest=await digestFor(s,u,view,nowMs);
        values.push(view);
      }
      return {sessions:values,ensured};
    });
    if(ensured&&u.pair_id)emit(u.pair_id);
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
      const keyedRequest=['complete','review','adjust','replace','reward','reward-request','reward-decision','wish-add','wish-request','wish-decision','quick','her-night','evening-close','evening-run','sip','grant','seal','tribute-reveal','chamberlain-decree','chamberlain-compose','repeat-stop','season-start','season-stop','spark-reroll','spark-dismiss','whisper','whisper-delete','wheel-config','wheel-spin','auction','auction-bid','pin','unpin'].includes(op);
      let requestKey:string|undefined;
      if(keyedRequest){
        if(u.role!==(['review','replace','reward','reward-decision','wish-add','wish-request','quick','her-night','evening-close','evening-run','sip','grant','seal','tribute-reveal','chamberlain-decree','chamberlain-compose','repeat-stop','season-start','season-stop','spark-reroll','spark-dismiss','whisper-delete','wheel-config','wheel-spin','auction','pin','unpin'].includes(op)?'wife':'husband'))fail(403,'Wrong role for action');
        // Newer clients always send a key; an older cached bundle still works, just without replay.
        requestKey=uuid.parse(b.key??randomUUID());
        const previous=await c.query('SELECT result FROM request_keys WHERE session_id=$1 AND user_id=$2 AND kind=$3 AND key=$4',[s.id,u.id,op,requestKey]);
        // A committed retry is a read of the original result, even after return, pause or stop.
        if(previous.rowCount){await save(c,s);return previous.rows[0].result;}
      }
      // Persist expiry even when a subsequent action must be rejected.
      // Curation (pin, unpin) stays open on ended sessions so the archive can be arranged after the session ends.
      if(terminal(s)&&op!=='read'&&!['pin','unpin'].includes(op)){await save(c,s);return {terminal:true};}
      const wife=()=>{if(u.role!=='wife')fail(403,'Wife role required');};
      const husband=()=>{if(u.role!=='husband')fail(403,'Husband role required');};
      const gameplay=()=>{if(suspended(s))fail(409,'Pause is active');};
      let mission:Mission|undefined;
      if(['edit','queue','deliver','cancel','ack','refuse','complete','review','adjust','replace','reveal','rate'].includes(op)){mission=s.missions.find(m=>m.id===uuid.parse(b.mission));if(!mission)fail(404,'Mission unavailable');}
      let response:any={ok:true},spent:number|undefined;
      if(op==='stop'){s.status='stopped';for(const m of s.missions)if(!['approved','refused','cancelled'].includes(m.status))m.status='cancelled';}
      else if(op==='pause'){if(!s.pauses.includes(u.id))s.pauses.push(u.id);}
      else if(op==='resume'){s.pauses=s.pauses.filter(id=>id!==u.id);}
      else if(op==='approve'||op==='revise'){/* Agreement flow removed; keep no-op for compatibility. */}
      else if(op==='aftercare'){husband();s.lastCareAt=Date.now();}
      else if(op==='read'){const ids=z.array(uuid).max(500).parse(b.ids);for(const n of s.inbox)if(ids.includes(n.id)&&!n.readBy.includes(u.id))n.readBy.push(u.id);}
      else if(op==='spark-reroll'){
        wife();const day=sparkDay(clock()),used=sparkRerollsUsed(s.sparkReroll,day);
        if(used>=sparkRerollCap)fail(409,'Spark reroll limit reached for today');
        s.sparkReroll={day,count:used+1};response={spark:await sparkFor(s,u.id)};
      }
      else if(op==='spark-dismiss'){
        wife();const data=z.object({id:z.string().min(1).max(120)}).parse(b);
        s.sparkDismissed=[...(s.sparkDismissed??[]).filter(id=>id!==data.id),data.id].slice(-sparkDismissedCap);response={spark:await sparkFor(s,u.id)};
      }
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
      else if(op==='whisper'){
        husband();const data=z.object({text:z.string().trim().min(1).max(400)}).parse(b);
        const list=s.whispers??=[];if(list.length>=20)fail(409,'Whisper list is full');
        list.push({id:randomUUID(),text:data.text,at:Date.now()});s.whisperSent=(s.whisperSent??0)+1;response={whisperSent:s.whisperSent};
      }
      else if(op==='whisper-delete'){wife();const id=uuid.parse(b.whisper);const list=s.whispers??[];if(!list.some(item=>item.id===id))fail(404,'Whisper unavailable');s.whispers=list.filter(item=>item.id!==id);}
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
        wife();let closed=0;for(const m of s.missions.filter(item=>item.status==='queued'&&!item.chapter)){m.status='cancelled';closed++;nextOccurrence(s,m,Date.now());}
        s.eveningClosedAt=Date.now();response={closed};
      }
      else if(op==='repeat-stop'){
        wife();const target=s.missions.find(m=>m.id===uuid.parse(b.mission))??fail(404,'Mission unavailable');
        if(!target.repeat&&!target.repeatOf)fail(409,'Repeating series required');
        const root=target.repeatOf??target.id;(s.missions.find(m=>m.id===root)??target).repeatStopped=true;
        let cancelled=0;for(const m of s.missions)if((m.id===root||m.repeatOf===root)&&m.status==='queued'){m.status='cancelled';cancelled++;}
        response={cancelled};
      }
      else if(op==='season-stop'){
        wife();const data=z.object({pack:z.string().min(1).max(40).optional()}).parse(b);
        const state=s.seasonState??fail(409,'No season is running');if(state.stoppedAt!==undefined)fail(409,'No season is running');
        if(data.pack!==undefined&&data.pack!==state.id)fail(404,'Season unavailable');
        let cancelled=0;for(const m of s.missions)if(m.season&&m.status==='queued'){m.status='cancelled';cancelled++;}
        state.stoppedAt=Date.now();response={cancelled};
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
      else if(op==='wheel-config'){wife();const data=z.object({cost:z.number().int().min(0).max(WHEEL_COST_MAX)}).parse(b);s.wheelCost=data.cost;response={wheelCost:s.wheelCost};}
      else if(op==='auction-bid'){
        husband();const data=z.object({auction:uuid,amount:z.number().int().min(1).max(AUCTION_LIMITS.maxBid)}).parse(b);
        const lot=s.auctions?.find(item=>item.id===data.auction)??fail(404,'Auction unavailable');
        if(lot.status!=='open'||lot.closesAt<=Date.now())fail(409,'Auction is closed');
        if(data.amount<lot.minBid)fail(409,'Bid is below the minimum');
        if(data.amount<=(highestBid(lot.bids)??0))fail(409,'Bid must beat the current highest bid');
        lot.bids.push({amount:data.amount,at:Date.now()});response={auction:lot};
      }
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
      else {
        gameplay();
        if(op==='extend'){wife();s.remaining+=z.number().int().min(1).max(525600).parse(b.minutes)*60000;}
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
          wife();const data=z.object({preset:z.string().max(40).optional(),lang:z.enum(['he','en']).default('he'),title:z.string().trim().min(1).max(160).optional(),text:text.optional(),points:z.number().int().min(0).max(100).optional(),scheduledAt:z.number().int().optional(),repeat:repeatSchema.optional()}).parse(b);
          if(eveningClosed(s))fail(409,'Evening is closed');
          const preset=data.preset?quickPresets.find(p=>p.id===data.preset)??fail(404,'Command unavailable'):undefined;
          const body=preset?(data.lang==='he'?preset.he:preset.en):data.text;
          const title=preset?body:data.title;
          if(!title||!body)throw Object.assign(new Error('Title and text are required'),{status:400});
          if(data.scheduledAt!==undefined&&data.scheduledAt<Date.now())throw Object.assign(new Error('Schedule must be in the future'),{status:400});
          if(data.scheduledAt!==undefined&&data.scheduledAt>Date.now()+31536000000)throw Object.assign(new Error('Schedule must be within one year'),{status:400});
          if(data.repeat!==undefined&&data.scheduledAt===undefined)throw Object.assign(new Error('Repeat needs a schedule'),{status:400});
          if(eveningUsed(s.missions)>=(s.pace??3))fail(409,'Evening limit reached for the current pace');
          const m:Mission={id:randomUUID(),revision:s.revision,title,text:body,points:preset?preset.points:(data.points??0),secret:false,completionStyle:'simple',status:'pending',deliveredAt:Date.now(),createdAt:Date.now()};
          if(data.scheduledAt!==undefined){m.status='queued';m.scheduledAt=data.scheduledAt;delete m.deliveredAt;if(data.repeat){m.repeat=data.repeat;m.repeatOf=m.id;}}
          s.missions.push(m);response={mission:m};
        }
        else if(op==='season-start'){
          wife();const data=z.object({pack:z.string().min(1).max(40),startsAt:z.number().int().optional(),lang:z.enum(['he','en']).default('he')}).parse(b);
          const pack=seasonPack(data.pack)??fail(404,'Season unavailable');
          if(s.missions.some(m=>!!m.season&&m.status==='queued'))fail(409,'A season is already running');
          const now=Date.now(),startsAt=data.startsAt??seasonStartDefault(now);
          if(startsAt<now)throw Object.assign(new Error('Schedule must be in the future'),{status:400});
          if(startsAt+(pack.days-1)*SEASON_DAY_MS>now+31536000000)throw Object.assign(new Error('Schedule must be within one year'),{status:400});
          for(let day=1;day<=pack.days;day++){
            const item=seasonItemFor(pack,day);
            s.missions.push({id:randomUUID(),revision:s.revision,title:data.lang==='he'?item.title.he:item.title.en,text:data.lang==='he'?item.text.he:item.text.en,points:item.points,secret:false,completionStyle:'simple',status:'queued',scheduledAt:startsAt+(day-1)*SEASON_DAY_MS,createdAt:now,season:{id:pack.id,day}});
          }
          s.seasonState={id:pack.id,startsAt,days:pack.days};response={season:{id:pack.id,days:pack.days,startsAt}};
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
            s.points-=request.cost;spent=request.cost;
          }
          request.status=approve?'approved':'declined';response={request,points:s.points};
        }
        else if(op==='wheel-spin'){
          wife();const cost=s.wheelCost??0;if((s.herPoints??0)<cost)fail(409,'Not enough points for a spin');s.herPoints=(s.herPoints??0)-cost;spent=cost;response={herPoints:s.herPoints};
        }
        else if(op==='auction'){
          wife();const data=z.object({title:z.string().trim().min(1).max(160),description:text,minBid:z.number().int().min(1).max(AUCTION_LIMITS.maxBid),closesAt:z.number()}).parse(b);
          const now=Date.now();
          if(data.closesAt<=now)throw Object.assign(new Error('Closing time must be in the future'),{status:400});
          if(data.closesAt>now+AUCTION_LIMITS.maxAheadMs)throw Object.assign(new Error('Closing time must be within seven days'),{status:400});
          const lots=s.auctions??=[];
          if(lots.filter(lot=>lot.status==='open').length>=AUCTION_LIMITS.open)fail(409,'Too many open auctions');
          if(lots.length>=AUCTION_LIMITS.stored)fail(409,'Auction list is full');
          const lot:Auction={id:randomUUID(),title:data.title,description:data.description,minBid:data.minBid,closesAt:data.closesAt,status:'open',bids:[],createdAt:now};
          lots.push(lot);response={auction:lot};
        }
        else if(op==='command-save'){
          wife();const data=z.object({title:z.string().trim().min(1).max(160),text:text,points:z.number().int().min(0).max(100)}).parse(b);
          const list=s.commands??=[];if(list.length>=20)fail(409,'Command list is full');list.push({id:randomUUID(),...data});
        }
        else if(op==='command-delete'){wife();const id=uuid.parse(b.command);s.commands=(s.commands??[]).filter(c=>c.id!==id);}
        else if(mission){
          const m=mission;if(m.revision!==s.revision)fail(409,'Mission belongs to a previous agreement');
          if(['edit','queue','deliver','cancel','review','replace'].includes(op))wife();else husband();
          if(op==='edit'){if(m.status!=='draft')fail(409,'Delivered terms are immutable');const data=draftSchema.parse({...m,...b});Object.assign(m,data);}
          else if(op==='queue'){if(!['draft','queued'].includes(m.status))fail(409,'Draft required');const data=z.object({scheduledAt:z.number().int().min(Date.now()).max(Date.now()+31536000000),repeat:repeatSchema.optional()}).parse(b);m.scheduledAt=data.scheduledAt;m.status='queued';if(data.repeat){m.repeat=data.repeat;m.repeatOf??=m.id;}else delete m.repeat;}
          else if(op==='deliver'){if(!['draft','queued'].includes(m.status))fail(409,'Draft required');const wasQueued=m.status==='queued';m.status='pending';m.deliveredAt=Date.now();if(wasQueued)nextOccurrence(s,m,m.deliveredAt);}
          else if(op==='cancel'){if(['approved','refused'].includes(m.status))fail(409,'Mission already final');const wasQueued=m.status==='queued';m.status='cancelled';if(wasQueued)nextOccurrence(s,m,Date.now());}
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
      if(op!=='read'&&!op.startsWith('note-')&&!op.startsWith('spark-')&&!['evening-save','evening-delete','pace','tribute-queue','tribute-reveal','sip','grant','seal','chamberlain-decree','chamberlain-compose','whisper-delete','wheel-config'].includes(op))notice(s,op,u.id,op==='reward-request'?{rewardRequestId:response.request.id}:op==='reward-decision'?{rewardRequestId:response.request.id,outcome:response.request.status}:op==='wheel-spin'||op==='wish-decision'?{points:spent}:(response.mission?.surprise?{missionId:response.mission.id}:mission?.surprise?{missionId:mission.id}:undefined));
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
