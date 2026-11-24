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
  process.env.HR_MODE = 'public';
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
  assert.deepEqual(await call(path, 200, dom.cookie, payload), first, 'a late retry returns the original response and does not add a transition');
  assert.equal((await act(sub, request.id, 'cancel')).sessionRequest.state, 'cancelled');
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
    assert.deepEqual((await call(`/room?after=${cursor}`, 200, who.cookie)).events, []);
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
  console.log('PASS public-sessions: mode and verification gates, roles, time limits, transitions, idempotency, concurrency, rate limit, block/close, poll and SSE privacy and resume');
} finally {
  if (previousMode === undefined) delete process.env.HR_MODE; else process.env.HR_MODE = previousMode;
  for (const stream of streams) stream.abort();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  await pool.end();
  await db.stop();
  await rm(directory, { recursive: true, force: true });
}
