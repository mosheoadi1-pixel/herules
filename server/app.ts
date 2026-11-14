import express, { type Request, type Response, type NextFunction } from 'express';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { quickPresets } from '../src/quick.ts';
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
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
export type User = { id: string; email: string|null; nickname: string|null; role: 'wife'|'husband'; pair_id: string|null };
export type Mission = { id: string; revision: number; title: string; text: string; points: number; secret: boolean; surprise?:boolean; category?:string; revealedAt?:number; completionStyle?: 'simple'|'written'; status: string; scheduledAt?: number; completion?: string; submissionVersion?: number; deliveredAt?: number; acknowledgedAt?: number; adjustment?: {reason:'softer'|'adjust';note?:string;at:number}; replaces?: string; replacementId?: string; approvedAt?: number };
export type Reward = {id:string; title:string; description:string; cost:number};
export type RewardRequest = Reward & {rewardId:string; status:'pending'|'approved'|'declined'};
export type Session = { id: string; status: string; terms: string; revision: number; revisions: { revision: number; terms: string }[]; approvals: string[]; pauses: string[]; remaining: number; last: number; started: boolean; points: number; missions: Mission[]; rewards?: Reward[]; rewardRequests?: RewardRequest[]; sequence?: string[]; autoProgress?:boolean; persona?:'strict'|'playful'|'caring'; followups?:string[]; checkIns?: Record<string,CheckIn>; reflections?: Record<string,Reflection>; messages: {id:string; by:string; text:string; at:number}[]; history: { at:number; event:string; by:string; rewardRequestId?:string; outcome?:'approved'|'declined' }[]; inbox: {id:string; at:number; event:string; readBy:string[]}[]; herPoints?: number; herWishes?: {id:string;title:string;cost:number}[]; commands?: {id:string;title:string;text:string;points:number}[]; lastCareAt?: number };
const suspended = (s: Session) => s.approvals.length !== 2 || s.pauses.length > 0;
const terminal = (s: Session) => ['stopped','expired'].includes(s.status);
function notice(s: Session, event: string, by: string, reward?:{rewardRequestId?:string;outcome?:'approved'|'declined';missionId?:string}) {
  const at = Date.now(); s.history.push({ at, event, by, ...reward });
  s.inbox.push({ id: randomUUID(), at, event, readBy: [], ...(reward?.missionId?{missionId:reward.missionId}:{}) });
}
function advance(s: Session) {
  const now = Date.now();
  if (!terminal(s) && s.started && !suspended(s)) {
    s.remaining = Math.max(0, s.remaining - (now - s.last));
    if (!s.remaining) { s.status = 'expired'; notice(s, 'expired', 'server'); }
    else for (const m of s.missions) if (m.status === 'queued' && m.scheduledAt! <= now) { m.status = 'pending'; m.deliveredAt = now; notice(s, 'mission-delivered', 'server',m.surprise?{missionId:m.id}:undefined); }
  }
  s.last = now;
}
function visible(s: Session, user: User) {
  if(user.role==='wife')return s;
  const hidden=new Set(s.missions.filter(m=>m.surprise&&!m.revealedAt).map(m=>m.id));
  const missions=s.missions.filter(m => (!(m.secret||m.surprise) || !!m.deliveredAt)).map(m=>{if(hidden.has(m.id))return {id:m.id,revision:m.revision,status:m.status,surprise:true,category:m.category,deliveredAt:m.deliveredAt};if(m.replacementId&&hidden.has(m.replacementId)){const {replacementId,...rest}=m;return rest;}return m;});
  const allowed=(n:any)=>!n.missionId||!hidden.has(n.missionId);
  return { ...s, commands:undefined, missions, history:s.history.filter(allowed),inbox:s.inbox.filter(allowed), ...(s.sequence?{sequence:s.sequence.filter(id=>missions.some(m=>m.id===id))}:{}) };
}
export async function createApp(pool: Pool, origin: string) {
  const configured = new URL(origin);
  if (configured.origin !== origin || (process.env.NODE_ENV === 'production' && configured.protocol !== 'https:')) throw new Error('APP_ORIGIN must be an exact origin; production requires HTTPS');
  await pool.query(await readFile(new URL('../db/001-foundation.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/002-guests.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/003-private-game.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../db/004-imported-ideas.sql', import.meta.url), 'utf8'));
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
  app.get('/api/state',async(req,res)=>{
    const u=await auth(req);
    const sessions=await transaction(async c=>{const ids=(await c.query('SELECT id FROM sessions WHERE pair_id=$1 ORDER BY id',[u.pair_id])).rows; const values=[]; for(const {id} of ids){const s=await locked(c,id,u);await save(c,s);values.push(visible(s,u));}return values;});
    res.json({user:u,sessions,serverNow:Date.now()});
  });
  app.get('/api/sessions/:id',async(req,res)=>{const u=await auth(req); const session=await transaction(async c=>{const s=await locked(c,req.params.id as string,u);await save(c,s);return visible(s,u);});res.json({session,serverNow:Date.now()});});
  app.post('/api/sessions',async(req,res)=>{
    const u=await auth(req);if(!u.pair_id) fail(409,'Pair first');
    const b=z.object({terms:text,minutes:z.number().int().min(1).max(525600)}).parse(req.body);
    const s:Session={id:randomUUID(),status:'active',terms:b.terms,revision:1,revisions:[{revision:1,terms:b.terms}],approvals:[],pauses:[],remaining:b.minutes*60000,last:Date.now(),started:false,points:0,missions:[],messages:[],history:[],inbox:[]};notice(s,'session-created',u.id);
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
      const keyedRequest=['complete','review','adjust','replace','reward','reward-request','reward-decision','quick'].includes(op);
      let requestKey:string|undefined;
      if(keyedRequest){
        if(u.role!==(['review','replace','reward','reward-decision','quick'].includes(op)?'wife':'husband'))fail(403,'Wrong role for action');
        requestKey=uuid.parse(b.key);
        const previous=await c.query('SELECT result FROM request_keys WHERE session_id=$1 AND user_id=$2 AND kind=$3 AND key=$4',[s.id,u.id,op,requestKey]);
        // A committed retry is a read of the original result, even after return, pause or stop.
        if(previous.rowCount){await save(c,s);return previous.rows[0].result;}
      }
      // Persist expiry even when a subsequent action must be rejected.
      if(terminal(s)&&op!=='read'){await save(c,s);return {terminal:true};}
      const wife=()=>{if(u.role!=='wife')fail(403,'Wife role required');};
      const husband=()=>{if(u.role!=='husband')fail(403,'Husband role required');};
      const gameplay=()=>{if(suspended(s))fail(409,'Mutual approval and no pauses required');};
      let mission:Mission|undefined;
      if(['edit','queue','deliver','cancel','ack','refuse','complete','review','adjust','replace','reveal'].includes(op)){mission=s.missions.find(m=>m.id===uuid.parse(b.mission));if(!mission)fail(404,'Mission unavailable');}
      let response:any={ok:true};
      if(op==='stop'){s.status='stopped';for(const m of s.missions)if(!['approved','refused','cancelled'].includes(m.status))m.status='cancelled';}
      else if(op==='pause'){if(!s.pauses.includes(u.id))s.pauses.push(u.id);}
      else if(op==='resume'){s.pauses=s.pauses.filter(id=>id!==u.id);}
      else if(op==='approve'){
        if(z.number().int().parse(b.revision)!==s.revision)fail(409,'Agreement changed; review current revision');
        await c.query('INSERT INTO approvals VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[s.id,s.revision,u.id]);
        if(!s.approvals.includes(u.id))s.approvals.push(u.id);if(s.approvals.length===2)s.started=true;
      }
      else if(op==='revise'){
        s.terms=text.parse(b.terms);s.revision++;s.revisions.push({revision:s.revision,terms:s.terms});s.approvals=[];
        for(const m of s.missions)if(!['approved','refused','cancelled'].includes(m.status))m.status='cancelled';
      }
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
          const m:Mission={...data,id:randomUUID(),revision:s.revision,status:'draft'};s.missions.push(m);response={mission:m};
          await c.query('INSERT INTO request_keys VALUES($1,$2,$3,$4,$5)',[s.id,u.id,op,key,JSON.stringify(response)]);
        }
        else if(op==='quick'){
          wife();const data=z.object({preset:z.string().max(40).optional(),lang:z.enum(['he','en']).default('he'),title:z.string().trim().min(1).max(160).optional(),text:text.optional(),points:z.number().int().min(0).max(100).optional(),scheduledAt:z.number().int().optional()}).parse(b);
          const preset=data.preset?quickPresets.find(p=>p.id===data.preset)??fail(404,'Command unavailable'):undefined;
          const body=preset?(data.lang==='he'?preset.he:preset.en):data.text;
          const title=preset?body:data.title;
          if(!title||!body)throw Object.assign(new Error('Title and text are required'),{status:400});
          if(data.scheduledAt!==undefined&&(data.scheduledAt<Date.now()||data.scheduledAt>Date.now()+31536000000))throw Object.assign(new Error('Schedule must be within one year'),{status:400});
          const m:Mission={id:randomUUID(),revision:s.revision,title,text:body,points:preset?preset.points:(data.points??0),secret:false,completionStyle:'simple',status:'pending',deliveredAt:Date.now()};
          if(data.scheduledAt!==undefined){m.status='queued';m.scheduledAt=data.scheduledAt;delete m.deliveredAt;}
          s.missions.push(m);response={mission:m};
        }
        else if(op==='herwish'){
          wife();const data=z.object({title:z.string().trim().min(1).max(160),cost:z.number().int().min(0).max(100000)}).parse(b);
          const list=s.herWishes??=[];if(list.length>=20)fail(409,'Wish list is full');list.push({id:randomUUID(),...data});
        }
        else if(op==='herwish-redeem'){
          wife();const id=uuid.parse(b.wish);const wish=s.herWishes?.find(w=>w.id===id)??fail(404,'Wish unavailable');
          if((s.herPoints??0)<wish.cost)fail(409,'Not enough points');s.herPoints=(s.herPoints??0)-wish.cost;s.herWishes=s.herWishes!.filter(w=>w.id!==id);
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
          else if(op==='queue'){if(!['draft','queued'].includes(m.status))fail(409,'Draft required');m.scheduledAt=z.number().int().min(Date.now()).max(Date.now()+31536000000).parse(b.scheduledAt);m.status='queued';}
          else if(op==='deliver'){if(!['draft','queued'].includes(m.status))fail(409,'Draft required');m.status='pending';m.deliveredAt=Date.now();}
          else if(op==='cancel'){if(['approved','refused'].includes(m.status))fail(409,'Mission already final');m.status='cancelled';}
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
      if(op!=='read')notice(s,op,u.id,op==='reward-request'?{rewardRequestId:response.request.id}:op==='reward-decision'?{rewardRequestId:response.request.id,outcome:response.request.status}:(response.mission?.surprise?{missionId:response.mission.id}:mission?.surprise?{missionId:mission.id}:undefined));
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
