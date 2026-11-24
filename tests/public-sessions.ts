import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createApp } from '../server/app.ts';
import { validSessionStart } from '../server/public-sessions.ts';
import { startDatabase } from '../scripts/db/runtime.mjs';

const previousMode = process.env.HR_MODE;
const previousAdmins = process.env.HR_ADMIN_PUBLIC_IDS;
const directory = await mkdtemp(join(tmpdir(), 'her-rules-sessions-'));
const db = await startDatabase(directory, 55450);
const pool = new pg.Pool({ connectionString: db.url });
const origin = 'http://localhost:4200';
const servers: Server[] = [];
const streams: AbortController[] = [];
let base = '';

async function listen() {
  const app = await createApp(pool, origin);
  const server = app.listen(0);
  servers.push(server);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
}
async function call(path: string, status: number, cookie = '', body?: object, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${base}/api/public${path}`, {
    method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${data}`);
  return status === 404 ? null : JSON.parse(data);
}
async function member(role: 'dom' | 'sub', verified = true) {
  const id = randomUUID(), token = randomBytes(32).toString('hex');
  await pool.query("INSERT INTO public_users(id,nickname,nickname_key,role,gender,verified_at) VALUES($1,$2,$2,$3,'other',CASE WHEN $4 THEN now() END)", [id, `User ${id.slice(0,8)}`, role, verified]);
  await pool.query("INSERT INTO public_sessions VALUES($1,$2,now()+interval '1 hour')", [createHash('sha256').update(token).digest('hex'), id]);
  return { id, cookie: `hr_public_session=${token}` };
}
type Member = Awaited<ReturnType<typeof member>>;
async function conversation(dom: Member, sub: Member, state = 'accepted') {
  const id = randomUUID();
  await pool.query("INSERT INTO conversations(id,dom_id,sub_id,state,opening_body) VALUES($1,$2,$3,$4,'Opening')", [id, dom.id, sub.id, state]);
  return id;
}
const listPath = (id: string) => `/conversations/${id}/session-requests`;
const playPath = (id: string) => `/play/${id}`;
const act = (who: Member, id: string, verb: string, status = 200, body: object = {}) => call(`/session-requests/${id}/${verb}`, status, who.cookie, body);
const startsIn = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const proposal = { title: 'Private title', details: 'Private details', startsAt: startsIn(1) };
type Event = { id: number; event: string; data: { id: string; conversationId?: string; state?: string } };

async function liveThrough(who: Member, after: number, marker: string) {
  const ctrl = new AbortController();
  streams.push(ctrl);
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    const response = await fetch(`${base}/api/public/events`, {
      headers: { Cookie: who.cookie, 'Last-Event-ID': String(after) }, signal: ctrl.signal,
    });
    assert.equal(response.status, 200);
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    const events: Event[] = [];
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      assert.ok(!done, 'SSE stopped before the public marker');
      buffer += value;
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const frame = /^id: (\d+)\nevent: (\w+)\ndata: (.+)$/.exec(block);
        if (!frame) continue;
        const data = JSON.parse(frame[3]);
        if (frame[2] === 'room' && data.id === marker) return events;
        events.push({ id: Number(frame[1]), event: frame[2], data });
      }
    }
  } finally { clearTimeout(timeout); ctrl.abort(); }
}

try {
  process.env.HR_MODE = 'private';
  await listen();
  await call(listPath(randomUUID()), 404);
  await call(listPath(randomUUID()), 404, '', proposal);
  await call(`/session-requests/${randomUUID()}/accept`, 404, '', {});
  await call('/play', 404);
  await call(playPath(randomUUID()), 404, '', { action: 'stop', idempotencyKey: randomUUID() });
  const guest = await fetch(`${base}/api/guest`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'wife', adult: true }),
  });
  assert.equal(guest.status, 200);
  const privateCookie = /hr_session=[a-f0-9]{64}/.exec(guest.headers.get('set-cookie') ?? '')?.[0];
  assert.ok(privateCookie);
  await guest.json();
  process.env.HR_MODE = 'public';
  const admin = await member('dom');
  process.env.HR_ADMIN_PUBLIC_IDS = admin.id;
  await listen(); // Also exercises repeat-safe migration.
  const dom = await member('dom'), sub = await member('sub'), outsider = await member('sub'), pending = await member('sub', false);
  const id = await conversation(dom, sub), path = listPath(id);
  const unaccepted = await conversation(dom, outsider, 'requested');
  const unverified = await conversation(dom, pending);
  await call(path, 401);
  await call(path, 403, pending.cookie);
  await call(path, 404, outsider.cookie);
  await call(path, 404, outsider.cookie, proposal);
  await call(listPath(unaccepted), 409, dom.cookie, proposal);
  await call(listPath(unverified), 404, dom.cookie, proposal);
  await call(path, 403, sub.cookie, proposal);
  assert.deepEqual((await call(path, 200, sub.cookie)).sessionRequests, []);
  for (const body of [
    { title: ' ' }, { title: 'x'.repeat(121) }, { details: '' }, { details: 'x'.repeat(1001) },
    { startsAt: startsIn(-1) }, { startsAt: startsIn(91) }, { startsAt: proposal.startsAt.slice(0, -1) },
    { startsAt: '2099-02-30T11:00:00+02:00' }, { idempotencyKey: 'not-uuid' },
  ]) await call(path, 400, dom.cookie, { ...proposal, ...body });
  const now = Date.now(), boundary = now + 90 * 86400000;
  assert.ok(validSessionStart(new Date(boundary), now));
  assert.ok(!validSessionStart(new Date(boundary + 1), now));
  assert.ok(!validSessionStart(new Date(now), now));

  const cursor = (await call('/room', 200, sub.cookie)).cursor;
  const payload = { ...proposal, startsAt: proposal.startsAt.replace('Z', '+00:00'), idempotencyKey: randomUUID() };
  const [first, retry] = await Promise.all([call(path, 200, dom.cookie, payload), call(path, 200, dom.cookie, payload)]);
  const request = first.sessionRequest;
  assert.deepEqual(first, retry);
  assert.equal(request.startsAt, proposal.startsAt);
  assert.equal(request.state, 'requested');
  await call(path, 409, dom.cookie, { ...payload, title: 'changed' });
  await call(path, 409, dom.cookie, proposal);
  await act(outsider, request.id, 'accept', 404);
  await act(dom, request.id, 'accept', 403);
  await act(dom, request.id, 'counter', 403, { startsAt: startsIn(2) });
  await act(sub, request.id, 'withdraw', 403);
  await act(sub, request.id, 'cancel', 409);
  await act(sub, request.id, 'counter', 400, { startsAt: startsIn(-1) });
  await act(sub, request.id, 'counter', 400, { startsAt: startsIn(91) });
  await act(sub, request.id, 'counter', 400, { startsAt: proposal.startsAt });
  const alternative = startsIn(2);
  const countered = (await act(sub, request.id, 'counter', 200, { startsAt: alternative })).sessionRequest;
  assert.equal(countered.state, 'countered');
  assert.equal(countered.counterStartsAt, alternative);
  await call(path, 409, dom.cookie, proposal);
  await act(sub, request.id, 'accept', 403);
  await act(sub, request.id, 'counter', 409, { startsAt: startsIn(3) });
  const accepted = (await act(dom, request.id, 'accept')).sessionRequest;
  assert.equal(accepted.state, 'accepted');
  assert.equal(accepted.counterStartsAt, alternative);
  assert.deepEqual((await act(dom, request.id, 'accept')).sessionRequest, accepted);
  await act(sub, request.id, 'accept', 409);
  assert.equal(accepted.playId, request.id);
  assert.equal((await call(playPath(accepted.playId), 200, sub.cookie)).session.scheduledAt, alternative);
  assert.deepEqual(await call(path, 200, dom.cookie, payload), first, 'a late retry returns the original response and does not add a transition');
  assert.equal((await act(sub, request.id, 'cancel')).sessionRequest.state, 'cancelled');
  assert.equal((await call(playPath(accepted.playId), 200, sub.cookie)).session.state, 'cancelled');
  await act(dom, request.id, 'cancel', 409);

  const marker = (await call('/room/messages', 200, dom.cookie, { body: 'Public marker' })).message;
  const feed = (await call(`/room?after=${cursor}&limit=100`, 200, sub.cookie)).events as Event[];
  assert.deepEqual(feed.map(event => event.data.state), ['requested','countered','accepted','cancelled']);
  assert.ok(feed.every((event, i) => event.event === 'session_request_updated' && event.data.id === request.id
    && event.data.conversationId === id && event.id > (feed[i - 1]?.id ?? cursor) && event.id < marker.seq));
  assert.ok(!JSON.stringify(feed).includes('Private'));
  assert.deepEqual((await call(`/room?after=${cursor}`, 200, dom.cookie)).events, feed);
  const [resume, outside] = await Promise.all([liveThrough(sub, feed[0].id, marker.id), liveThrough(outsider, cursor, marker.id)]);
  assert.deepEqual(resume, feed.slice(1));
  assert.deepEqual(outside, []);
  assert.deepEqual((await call(`/room?after=${cursor}`, 200, outsider.cookie)).events, []);

  // Exercise every remaining transition with a fresh pair and race competing creates/actions.
  const dom2 = await member('dom'), sub2 = await member('sub');
  const id2 = await conversation(dom2, sub2), path2 = listPath(id2);
  const propose = async () => (await call(path2, 200, dom2.cookie, proposal)).sessionRequest.id as string;
  const race = (path: string, cookie: string, body: object) => fetch(`${base}/api/public${path}`, {
    method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const competing = await Promise.all([race(path2, dom2.cookie, proposal), race(path2, dom2.cookie, { ...proposal, title: 'Other' })]);
  assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
  const { sessionRequest: winner } = await competing.find(result => result.ok)!.json();
  const answers = await Promise.all(['accept','decline'].map(verb => race(`/session-requests/${winner.id}/${verb}`, sub2.cookie, {})));
  assert.deepEqual(answers.map(result => result.status).sort(), [200, 409]);
  const declined = await propose();
  assert.equal((await act(sub2, declined, 'decline')).sessionRequest.state, 'declined');
  const withdrawn = await propose();
  assert.equal((await act(dom2, withdrawn, 'withdraw')).sessionRequest.state, 'withdrawn');
  for (const verb of ['decline','withdraw']) {
    const counter = await propose();
    await act(sub2, counter, 'counter', 200, { startsAt: alternative });
    assert.equal((await act(dom2, counter, verb)).sessionRequest.state, verb === 'decline' ? 'declined' : 'withdrawn');
  }
  const direct = await propose();
  assert.equal((await act(sub2, direct, 'accept')).sessionRequest.state, 'accepted');
  assert.equal((await act(dom2, direct, 'cancel')).sessionRequest.state, 'cancelled');

  const stillOpen = (await call(path, 200, dom.cookie, proposal)).sessionRequest.id;
  await call('/room/blocks', 200, sub.cookie, { userId: dom.id });
  const blockMarker = (await call('/room/messages', 200, dom2.cookie, { body: 'Another public marker' })).message;
  for (const who of [dom, sub]) {
    await call(path, 404, who.cookie);
    await call(path, 404, who.cookie, proposal);
    await act(who, stillOpen, who === sub ? 'accept' : 'withdraw', 404);
    const blockedEvents = (await call(`/room?after=${cursor}`, 200, who.cookie)).events as Event[];
    assert.deepEqual(blockedEvents.map(({ event, data }) => ({ event, data })), [{ event: 'messaging_refresh', data: {} }]);
    assert.deepEqual((await liveThrough(who, cursor, blockMarker.id)).filter(event => event.event === 'session_request_updated'), []);
  }
  await call(`/room/blocks/${dom.id}`, 200, sub.cookie, undefined, 'DELETE');
  await call(`/conversations/${id}/close`, 200, sub.cookie, {});
  await call(path, 409, dom.cookie, proposal);
  await act(sub, stillOpen, 'accept', 409);
  assert.equal((await call(path, 200, sub.cookie)).sessionRequests.find((item: {id: string}) => item.id === stillOpen).state, 'requested');

  const budgetDom = await member('dom'), budgetSub = await member('sub');
  const budgetPath = listPath(await conversation(budgetDom, budgetSub));
  for (let i = 0; i < 5; i++) {
    const created = (await call(budgetPath, 200, budgetDom.cookie, proposal)).sessionRequest;
    await act(budgetDom, created.id, 'withdraw');
  }
  await call(budgetPath, 429, budgetDom.cookie, proposal);
  const otherPath = listPath(await conversation(budgetDom, outsider));
  await call(otherPath, 429, budgetDom.cookie, proposal);
  await pool.query("UPDATE public_session_events SET created_at=now()-interval '11 minutes' WHERE seq=(SELECT min(seq) FROM public_session_events WHERE actor_id=$1)", [budgetDom.id]);
  const last = (await call(budgetPath, 200, budgetDom.cookie, proposal)).sessionRequest;
  await act(budgetDom, last.id, 'withdraw', 429);
  await act(budgetSub, last.id, 'accept');

  const d = await member('dom'), s = await member('sub'), secondD = await member('dom'), secondS = await member('sub');
  const pair = await conversation(d, s), pair2 = await conversation(secondD, secondS), cross = await conversation(secondD, s);
  const newPlan = async (who: Member, conv: string) => (await call(listPath(conv), 200, who.cookie, proposal)).sessionRequest;
  const getPlay = (who: Member, id: string, status = 200) => call(playPath(id), status, who.cookie);
  const seedPlay = async (dom: Member, sub: Member, conv: string) => (await act(sub, (await newPlan(dom, conv)).id, 'accept')).sessionRequest.playId as string;
  const legacyPlay = async (id:string) => { await pool.query('DELETE FROM public_game_sessions WHERE id=$1',[id]); return id; };
  const gamePath=(id:string)=>`${playPath(id)}/game`;
  const game=(who:Member,id:string,status=200)=>call(gamePath(id),status,who.cookie);
  const op=(who:Member,id:string,name:string,body:object={},status=200,revision=1,key=randomUUID())=>
    call(`${gamePath(id)}/${name}`,status,who.cookie,{key,revision,body});
  const mutate = (who: Member, id: string, body: object, status = 200) =>
    call(playPath(id), status, who.cookie, { idempotencyKey: randomUUID(), ...body });
  const missionInput = { action: 'assign', title: 'Couple-only mission', instructions: 'Couple-only instructions', points: 17 };
  const step = (who: Member, id: string, mission: { id: string; version: number }, action: string, status = 200, extra: object = {}) =>
    mutate(who, id, { action, missionId: mission.id, version: mission.version, ...extra }, status);
  const total = async (who: Member) => (await call('/play', 200, who.cookie)).points;
  const start = await newPlan(d, pair);
  await getPlay(s, start.id, 404);
  const both = await Promise.all([act(s, start.id, 'accept'), act(s, start.id, 'accept')]);
  assert.deepEqual(both[0], both[1]);
  const play = both[0].sessionRequest.playId;
  assert.equal(play, start.id);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public_play_sessions WHERE request_id=$1', [play])).rows[0].n, 1);
  for (const [who, status] of [[secondD, 404], [secondS, 404], [admin, 404], [pending, 403]] as const) {
    await getPlay(who, play, status);
    await mutate(who, play, missionInput, status);
    await mutate(who, play, { action: 'stop' }, status);
  }
  for (const who of [secondD, secondS, admin]) assert.deepEqual(await call('/play', 200, who.cookie), { sessions: [], points: '0', next: null });
  await call('/play', 401, privateCookie);
  await call(playPath(play), 401, privateCookie, { action: 'stop', idempotencyKey: randomUUID() });
  const separatePlay = await legacyPlay(await seedPlay(secondD, secondS, pair2));
  assert.deepEqual((await call('/play', 200, secondS.cookie)).sessions.map((p: { id: string }) => p.id), [separatePlay]);
  assert.deepEqual((await call('/play', 200, s.cookie)).sessions.map((p: { id: string }) => p.id), [play]);
  const overview = await getPlay(s, play);
  assert.equal(overview.session.state, 'open', 'the future scheduled time is not an opening gate');
  assert.deepEqual(overview.missions, []);
  assert.ok(!('points' in overview) && !('points' in overview.session));
  await mutate(d,play,missionInput,409);
  await legacyPlay(play);
  const playCursor = (await call('/room', 200, s.cookie)).cursor;
  await mutate(s, play, missionInput, 403);
  for (const input of [
    { points: -1 }, { points: 101 }, { points: 0.5 }, { points: '20' }, { title: ' ' }, { title: 'x'.repeat(161) },
    { instructions: '\0' }, { instructions: 'i'.repeat(4001) }, { recipient: secondS.id },
  ]) await mutate(d, play, { ...missionInput, ...input }, 400);
  const assignKey = randomUUID();
  const [assigned, replay] = await Promise.all([
    mutate(d, play, { ...missionInput, idempotencyKey: assignKey }),
    mutate(d, play, { ...missionInput, idempotencyKey: assignKey }),
  ]);
  assert.deepEqual(assigned, replay);
  await mutate(d, play, { ...missionInput, idempotencyKey: assignKey, points: 19 }, 409);
  await mutate(d, play, missionInput, 409);
  const m = assigned.mission;
  assert.deepEqual((await getPlay(s, play)).missions, [m]);
  assert.equal(m.state, 'assigned');
  await step(secondS, separatePlay, m, 'accept', 404);
  await step(s, play, m, 'complete', 409);
  await step(d, play, m, 'approve', 409);
  await step(d, play, m, 'accept', 403);
  await step(s, play, m, 'approve', 403);
  const acknowledged = (await step(s, play, m, 'accept')).mission;
  await step(s, play, m, 'complete', 409);
  const submitted = (await step(s, play, acknowledged, 'complete')).mission;
  assert.equal(await total(s), '0');
  await step(d, play, submitted, 'return', 400, { reason: ' ' });
  await step(d, play, submitted, 'return', 400, { reason: 'x'.repeat(1001) });
  const returned = (await step(d, play, submitted, 'return', 200, { reason: 'One more detail' })).mission;
  assert.equal(returned.state, 'returned');
  assert.equal(returned.returnReason, 'One more detail');
  await step(d, play, submitted, 'approve', 409);
  const revised = (await step(s, play, returned, 'complete')).mission;
  await step(d, play, submitted, 'approve', 409);
  assert.equal(await total(s), '0');
  const approve = { action: 'approve', missionId: revised.id, version: revised.version, idempotencyKey: randomUUID() };
  const approvals = await Promise.all([
    race(playPath(play), d.cookie, approve), race(playPath(play), d.cookie, approve),
    race(playPath(play), d.cookie, { ...approve, idempotencyKey: randomUUID() }),
  ]);
  // Either retry pair wins or the independent key wins; exactly one award in either ordering.
  assert.ok(approvals.every(result => [200, 409].includes(result.status)));
  assert.equal(approvals[0].status, approvals[1].status);
  assert.notEqual(approvals[0].status, approvals[2].status, 'one distinct review key wins');
  assert.deepEqual((await pool.query('SELECT recipient_id,points FROM public_play_awards WHERE mission_id=$1', [m.id])).rows,
    [{ recipient_id: s.id, points: 17 }]);
  assert.equal(await total(s), '17');
  assert.equal(await total(d), '0');
  const declinedMission = (await mutate(d, play, { ...missionInput, points: 100 })).mission;
  await step(s, play, declinedMission, 'decline');
  assert.equal(await total(s), '17');
  const playMarker = (await call('/room/messages', 200, d.cookie, { body: 'Marker after gameplay' })).message;
  for (const who of [s, secondS, admin]) {
    assert.deepEqual((await call(`/room?after=${playCursor}`, 200, who.cookie)).events, []);
    assert.deepEqual(await liveThrough(who, playCursor, playMarker.id), []);
  }
  await mutate(s, play, { action: 'stop' });
  assert.equal((await getPlay(d, play)).session.state, 'stopped');
  await mutate(d, play, missionInput, 409);
  assert.deepEqual(await mutate(d, play, { ...missionInput, idempotencyKey: assignKey }), assigned, 'replay does not write into stopped play');

  const otherPlay = await legacyPlay(await seedPlay(secondD, s, cross));
  const other = (await mutate(secondD, otherPlay, { ...missionInput, points: 3 })).mission;
  const otherAccepted = (await step(s, otherPlay, other, 'accept')).mission;
  const otherSubmitted = (await step(s, otherPlay, otherAccepted, 'complete')).mission;
  await step(secondD, otherPlay, otherSubmitted, 'approve');
  assert.equal(await total(s), '20', 'one account earns across distinct partners and sessions');
  assert.equal(await total(secondS), '0');
  assert.equal(await total(secondD), '0');
  await act(secondD, otherPlay, 'cancel');
  assert.equal((await getPlay(s, otherPlay)).session.state, 'cancelled');
  await mutate(secondD, otherPlay, missionInput, 409);
  await call('/room/blocks', 200, s.cookie, { userId: secondD.id });
  for (const who of [s, secondD]) {
    await getPlay(who, otherPlay, 404);
    await mutate(who, otherPlay, { action: 'stop' }, 404);
    assert.ok(!(await call('/play', 200, who.cookie)).sessions.some((row: { id: string }) => row.id === otherPlay));
  }
  assert.equal(await total(s), '20', 'blocking does not alter points earned');
  await call(`/room/blocks/${secondD.id}`, 200, s.cookie, undefined, 'DELETE');
  const racePlan = await legacyPlay(await seedPlay(d, s, pair));
  const zero = (await mutate(d, racePlan, { ...missionInput, points: 0 })).mission;
  const zeroAccepted = (await step(s, racePlan, zero, 'accept')).mission;
  const zeroSubmitted = (await step(s, racePlan, zeroAccepted, 'complete')).mission;
  const blockRace = await Promise.all([
    race(playPath(racePlan), d.cookie, { action: 'approve', missionId: zero.id, version: zeroSubmitted.version, idempotencyKey: randomUUID() }),
    race('/room/blocks', s.cookie, { userId: d.id }),
  ]);
  assert.equal(blockRace[1].status, 200);
  assert.ok([200, 404].includes(blockRace[0].status));
  assert.equal((await pool.query('SELECT points FROM public_play_awards WHERE mission_id=$1', [zero.id])).rowCount, Number(blockRace[0].ok));
  await mutate(d, racePlan, missionInput, 404);
  await call(`/room/blocks/${d.id}`, 200, s.cookie, undefined, 'DELETE');
  if (!blockRace[0].ok) await step(d, racePlan, zeroSubmitted, 'approve');
  assert.equal(await total(s), '20');
  const cancelRace = await Promise.all([
    race(`/session-requests/${racePlan}/cancel`, s.cookie, {}),
    race(playPath(racePlan), d.cookie, { ...missionInput, idempotencyKey: randomUUID() }),
  ]);
  assert.equal(cancelRace[0].status, 200);
  assert.ok([200, 409].includes(cancelRace[1].status));
  assert.equal((await getPlay(d, racePlan)).session.state, 'cancelled');
  await mutate(d, racePlan, missionInput, 409);
  await pool.query('UPDATE public_users SET verified_at=NULL WHERE id=$1', [secondS.id]);
  await getPlay(secondD, separatePlay, 404);
  await mutate(secondD, separatePlay, missionInput, 404);
  await pool.query('UPDATE public_users SET verified_at=now() WHERE id=$1', [secondS.id]);
  await call(`/conversations/${pair2}/close`, 200, secondS.cookie, {});
  assert.equal((await getPlay(secondD, separatePlay)).session.state, 'closed');
  await mutate(secondD, separatePlay, missionInput, 409);

  // Simulate rows from before the play migration; backfill does not trust
  // proposer/HTTP payload for membership and does not reopen cancelled plans.
  const legacy = Array.from({ length: 21 }, () => randomUUID());
  const legacyCancelled = randomUUID();
  await pool.query(`INSERT INTO public_session_requests(id,conversation_id,proposer_id,title,details,starts_at,state)
    SELECT id,$1,$2,'Legacy plan','Historical plan',now()-interval '1 day','accepted' FROM unnest($3::uuid[]) ids(id)`, [pair, admin.id, legacy]);
  await pool.query(`INSERT INTO public_session_requests(id,conversation_id,proposer_id,title,details,starts_at,state)
    VALUES($1,$2,$3,'Old cancellation','Historical plan',now()-interval '1 day','cancelled')`, [legacyCancelled,pair,d.id]);
  await listen();
  await listen();
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public_play_sessions WHERE request_id=ANY($1::uuid[])', [legacy])).rows[0].n, legacy.length);
  assert.equal((await getPlay(s, legacy[0])).session.state, 'open');
  await getPlay(admin, legacy[0], 404);
  await getPlay(s, legacyCancelled, 404);
  await pool.query(`INSERT INTO public_play_missions(id,session_id,title,instructions,points,state)
    SELECT id,$1,'Prior mission','Instructions',0,'declined' FROM unnest($2::uuid[]) ids(id)`,
    [legacy[0], Array.from({ length: 100 }, () => randomUUID())]);
  assert.equal((await getPlay(s, legacy[0])).missions.length, 100);
  await mutate(d, legacy[0], missionInput, 409);
  const newer = await call('/play', 200, s.cookie);
  const older = await call(`/play?${new URLSearchParams(newer.next)}`, 200, s.cookie);
  assert.equal(newer.sessions.length, 20);
  const listed = [...newer.sessions, ...older.sessions].map(row => row.id);
  assert.equal(new Set(listed).size, 24);
  assert.equal(listed.length, 24);
  assert.equal(older.points, '20');
  assert.equal(older.next, null);

  const migrated=(await game(s,play)).sessions[0];
  assert.equal(migrated.status,'stopped');
  assert.equal(migrated.points,17);
  assert.deepEqual(migrated.missions.map((mission:any)=>[mission.id,mission.status]),[[m.id,'approved'],[declinedMission.id,'refused']]);
  assert.equal(await total(s),'20','legacy lifetime award is not copied');
  await listen();
  assert.deepEqual((await game(s,play)).sessions[0].missions,migrated.missions);
  assert.equal((await game(s,otherPlay)).sessions[0].status,'stopped');

  const rich=await seedPlay(d,s,pair);
  for(const [who,status] of [[secondD,404],[secondS,404],[admin,404],[pending,403]] as const){
    await game(who,rich,status);
    await op(who,rich,'stop',{},status);
  }
  const draft={title:'Hidden draft title',text:'Hidden mission instructions',points:23,secret:true,surprise:true,category:'care',completionStyle:'written'};
  await op(d,rich,'mission',draft,409);
  await op(d,rich,'agreement-accept',{revision:1});
  await op(d,rich,'mission',draft,409);
  await op(s,rich,'agreement-propose',{revision:1,terms:'Cannot change',minutes:10},403);
  await op(d,rich,'agreement-propose',{revision:1,terms:'Shared limits',minutes:10});
  await op(s,rich,'agreement-accept',{revision:1},409);
  await op(s,rich,'agreement-accept',{revision:2},200,2);
  await op(d,rich,'agreement-accept',{revision:2},200,2);
  const {mission:secret}=await op(d,rich,'mission',draft,200,2);
  await op(d,rich,'note-save',{text:'Hidden private note'},200,2);
  await op(s,rich,'ack',{mission:secret.id},404,2);
  let snapshot=await game(s,rich);
  assert.equal(snapshot.play.role,'sub');
  assert.equal(snapshot.sessions[0].remaining<=600000,true);
  assert.ok(!['Hidden','queenLevel','spark',secret.id].some(term=>JSON.stringify(snapshot).includes(term)));
  assert.equal((await game(d,rich)).play.role,'dom');
  await op(d,rich,'deliver',{mission:secret.id},200,2);
  await op(s,rich,'ack',{mission:secret.id},409,2);
  assert.ok(!JSON.stringify(await game(s,rich)).includes(draft.text));
  await op(s,rich,'reveal',{mission:secret.id},200,2);
  assert.ok(JSON.stringify(await game(s,rich)).includes(draft.text));
  await op(s,rich,'ack',{mission:secret.id},200,2);
  await op(s,rich,'pause');
  await op(d,rich,'pause');
  await op(s,rich,'resume');
  await op(s,rich,'complete',{mission:secret.id,text:'Completion',expectedVersion:0},409,2);
  await op(d,rich,'resume');
  await op(s,rich,'complete',{mission:secret.id,text:'Completion',expectedVersion:0},200,2);
  await op(s,rich,'review',{mission:secret.id,approve:true,submissionVersion:1},403,2);
  const review={revision:2,key:randomUUID(),body:{mission:secret.id,approve:true,submissionVersion:1}};
  const attempts=await Promise.all([review,review,{...review,key:randomUUID()}].map(body=>race(`${gamePath(rich)}/review`,d.cookie,body)));
  assert.equal(attempts[0].status,attempts[1].status);
  assert.notEqual(attempts[0].status,attempts[2].status);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public_game_awards WHERE mission_id=$1',[secret.id])).rows[0].n,1);
  assert.equal(await total(s),'43');
  const {reward}=await op(d,rich,'reward',{title:'Tea together',description:'A game reward',cost:20},200,2);
  const requests=await Promise.all([1,2].map(()=>op(s,rich,'reward-request',{reward:reward.id},200,2)));
  const decisions=await Promise.all(requests.map(({request})=>race(`${gamePath(rich)}/reward-decision`,d.cookie,
    {revision:2,key:randomUUID(),body:{request:request.id,approve:true}})));
  assert.deepEqual(decisions.map(r=>r.status).sort(),[200,409]);
  assert.equal((await game(s,rich)).sessions[0].points,3);
  assert.equal(await total(s),'43','spending from this session does not affect lifetime earnings');
  await op(s,rich,'agreement-withdraw',{revision:2},200,2);
  await op(d,rich,'quick',{title:'No consent',text:'No consent'},409,2);
  await act(s,rich,'cancel');
  await op(s,rich,'reflection',{appreciation:'Closed'},409);
  await call('/room/blocks',200,s.cookie,{userId:d.id});
  await game(d,rich,404);
  await game(s,rich,404);
  assert.equal(await total(s),'43');
  console.log('PASS paired gameplay: consent, independent pause, roles, secret projection, concurrent awards and spending, migration, archive and isolation');
  console.log('PASS public-play: scoped lifecycle, stale and concurrent actions, backfill, paging, cross-partner awards, block/verification and no room feed payloads');
  console.log('PASS public-sessions: mode and verification gates, roles, time limits, transitions, idempotency, concurrency, rate limit, block/close, poll and SSE privacy and resume');
} finally {
  if (previousMode === undefined) delete process.env.HR_MODE; else process.env.HR_MODE = previousMode;
  if (previousAdmins === undefined) delete process.env.HR_ADMIN_PUBLIC_IDS; else process.env.HR_ADMIN_PUBLIC_IDS = previousAdmins;
  for (const stream of streams) stream.abort();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  await pool.end();
  await db.stop();
  await rm(directory, { recursive: true, force: true });
}
