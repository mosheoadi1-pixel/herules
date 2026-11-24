import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp } from '../server/app.ts';
import type { PublicIdentityProvider } from '../server/public-auth.ts';
import { createIdswyftVerifier } from '../server/public-idswyft.ts';
import { cameraLivenessSchema, type CameraLiveness } from '../server/public-verification.ts';
import { CAMERA_CONSENT_VERSION, VERIFICATION_CONSENT_VERSION } from '../src/verification-consent.ts';

const phases = ['turn1_start', 'turn1_peak', 'turn1_return', 'turn_start', 'turn_peak', 'turn_return'] as const;
const apiKey = 'ik_test_only_not_a_real_key';
const baseUrl = 'https://idswyft.example.test';
const ageId = '880e8400-e29b-41d4-a716-446655440001';
const identityId = '880e8400-e29b-41d4-a716-446655440002';
const testCameraVersion = 'verification-camera-test';
const frontBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const selfieBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(80, 5)]);
const frameBase64 = (value: number) => Buffer.alloc(32, value).toString('base64');
const liveness: CameraLiveness = {
  challenge_type: 'head_turn',
  challenge_direction: 'left',
  frames: phases.map((phase, index) => ({ frame_base64: frameBase64(index + 1), timestamp: 500 * index + 500, phase })),
  start_timestamp: 0,
  end_timestamp: 9000,
};
const expectedMetadata = { ...liveness, frames: liveness.frames.map(({ frame_base64, timestamp, phase }) => ({ frame_base64, timestamp, phase })) };

type Call = { path: string; method: string; headers: Record<string, string>; body: unknown };
type Answer = Response | Error;
type Script = { initAge?: Answer; ageUpload?: Answer; initIdentity?: Answer; identityUpload?: Answer; live?: Answer; status?: Answer };
const json = (body: unknown, status = 200) => Response.json(body, { status });
const ageVerified = { success: true, verification_id: ageId, status: 'COMPLETE', current_step: 1, age_verification: { is_of_age: true, age_threshold: 18 }, final_result: 'verified' };
const identityFront = { success: true, verification_id: identityId, status: 'AWAITING_SELFIE', current_step: 2 };
const identityVerified = { success: true, verification_id: identityId, status: 'COMPLETE', final_result: 'verified', liveness_results: { passed: true }, face_match_results: { passed: true } };

function fakeIdswyft(script: Script = {}) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, method: init?.method ?? 'GET', headers: { ...(init?.headers as Record<string, string>) }, body: init?.body });
    const answer = (value: Answer | undefined, fallback: () => Response) => {
      if (value instanceof Error) throw value;
      return value ?? fallback();
    };
    if (url.pathname === '/api/v2/verify/initialize') {
      const mode = JSON.parse(String(init?.body)).verification_mode;
      if (mode === 'age_only') return answer(script.initAge, () => json({ success: true, verification_id: ageId, status: 'AWAITING_FRONT' }, 201));
      return answer(script.initIdentity, () => json({ success: true, verification_id: identityId, status: 'AWAITING_FRONT' }, 201));
    }
    if (url.pathname === `/api/v2/verify/${ageId}/front-document`) return answer(script.ageUpload, () => json(ageVerified, 201));
    if (url.pathname === `/api/v2/verify/${identityId}/front-document`) return answer(script.identityUpload, () => json(identityFront, 201));
    if (url.pathname === `/api/v2/verify/${identityId}/live-capture`) return answer(script.live, () => json(identityVerified, 200));
    if (url.pathname === `/api/v2/verify/${ageId}/status` || url.pathname === `/api/v2/verify/${identityId}/status`) return answer(script.status, () => json(identityVerified, 200));
    return json({ error: 'not found' }, 404);
  };
  return { fetch, calls };
}

const verifierWith = (script: Script = {}, cameraEnabled = true) => {
  const fake = fakeIdswyft(script);
  return { calls: fake.calls, check: createIdswyftVerifier({ apiKey, baseUrl, fetch: fake.fetch, cameraEnabled }).check };
};
const runCamera = async (script: Script = {}, cameraEnabled = true, live: CameraLiveness | null = liveness, media: Buffer[] = [frontBytes, selfieBytes]) => {
  const verifier = verifierWith(script, cameraEnabled);
  const outcome = await verifier.check({ method: 'camera_age', media, liveness: live ?? undefined });
  return { outcome, calls: verifier.calls };
};
const paths = (calls: Call[]) => calls.map(call => `${call.method} ${call.path}`);

// Schema: the liveness object is validated before anything reaches Idswyft.
{
  assert.equal(cameraLivenessSchema.safeParse(liveness).success, true, 'a six-frame head turn is accepted');
  const bad: [string, unknown][] = [
    ['five frames', { ...liveness, frames: liveness.frames.slice(0, 5) }],
    ['seven frames', { ...liveness, frames: [...liveness.frames, liveness.frames[0]] }],
    ['unknown phase', { ...liveness, frames: liveness.frames.map((frame, index) => index === 0 ? { ...frame, phase: 'blink' } : frame) }],
    ['bad direction', { ...liveness, challenge_direction: 'up' }],
    ['other challenge', { ...liveness, challenge_type: 'blink' }],
    ['start not zero', { ...liveness, start_timestamp: 1 }],
    ['end over 60 s', { ...liveness, end_timestamp: 60001 }],
    ['fractional timestamp', { ...liveness, frames: liveness.frames.map((frame, index) => index === 0 ? { ...frame, timestamp: 1.5 } : frame) }],
    ['extra key', { ...liveness, extra: true }],
    ['frame over 1 MB', { ...liveness, frames: liveness.frames.map((frame, index) => index === 0 ? { ...frame, frame_base64: Buffer.alloc(1024 * 1024 + 1, 1).toString('base64') } : frame) }],
    ['frame with data prefix', { ...liveness, frames: liveness.frames.map((frame, index) => index === 0 ? { ...frame, frame_base64: `data:image/jpeg;base64,${frameBase64(1)}` } : frame) }],
  ];
  for (const [name, value] of bad) assert.equal(cameraLivenessSchema.safeParse(value).success, false, `${name} is rejected`);
  const exactlyOneMegabyte = { ...liveness, frames: liveness.frames.map((frame, index) => index === 0 ? { ...frame, frame_base64: Buffer.alloc(1024 * 1024, 1).toString('base64') } : frame) };
  assert.equal(cameraLivenessSchema.safeParse(exactlyOneMegabyte).success, true, 'a frame of exactly 1 MB is accepted');
}

// Adapter: flag off, then both sessions in order.
{
  const { outcome, calls } = await runCamera({}, false);
  assert.deepEqual(outcome, { result: 'review', reason: 'Selfie check needs a person' }, 'flag off keeps the camera method at review');
  assert.equal(calls.length, 0, 'flag off never reaches Idswyft');
}

{
  const { outcome, calls } = await runCamera();
  assert.deepEqual(outcome, { result: 'passed', reason: 'Age and identity checks passed' });
  assert.deepEqual(paths(calls), [
    'POST /api/v2/verify/initialize',
    `POST /api/v2/verify/${ageId}/front-document`,
    'POST /api/v2/verify/initialize',
    `POST /api/v2/verify/${identityId}/front-document`,
    `POST /api/v2/verify/${identityId}/live-capture`,
  ], 'the age session runs first, then the identity session');
  assert.equal(JSON.parse(String(calls[0].body)).verification_mode, 'age_only');
  assert.equal(JSON.parse(String(calls[2].body)).verification_mode, 'identity');
  assert.ok(calls.every(call => call.headers['X-API-Key'] === apiKey), 'every call carries the API key header');
  const ageForm = calls[1].body as FormData;
  assert.equal(ageForm.get('country_code'), 'IL');
  const identityForm = calls[3].body as FormData;
  assert.equal(identityForm.get('document_type'), 'auto');
  assert.equal(identityForm.get('country_code'), 'IL');
  assert.ok(Buffer.from(await (identityForm.get('document') as File).arrayBuffer()).equals(frontBytes), 'the identity session receives the same front image');
  const live = calls[4].body as FormData;
  const selfie = live.get('selfie') as File;
  assert.equal(selfie.type, 'image/jpeg');
  assert.ok(Buffer.from(await selfie.arrayBuffer()).equals(selfieBytes), 'the live selfie is the second image');
  const metadata = String(live.get('liveness_metadata'));
  assert.deepEqual(JSON.parse(metadata), expectedMetadata, 'liveness metadata has the exact Idswyft shape');
  assert.ok(!metadata.includes('data:'), 'frames are bare base64 without a data URL prefix');
}

// Adapter: age session stops the flow before the identity session.
{
  const { outcome, calls } = await runCamera({ ageUpload: json({ success: true, verification_id: ageId, status: 'HARD_REJECTED', rejection_reason: 'UNDERAGE' }, 201) });
  assert.equal(outcome.result, 'failed', 'UNDERAGE fails the camera check');
  assert.equal(calls.length, 2, 'the identity session never starts after an age failure');
}

{
  const cases: [string, Script, 'failed' | 'review'][] = [
    ['age final failed', { ageUpload: json({ ...ageVerified, final_result: 'failed' }, 201) }, 'failed'],
    ['age DOB_NOT_FOUND', { ageUpload: json({ success: true, verification_id: ageId, status: 'HARD_REJECTED', rejection_reason: 'DOB_NOT_FOUND' }, 201) }, 'review'],
    ['age HTTP 500', { ageUpload: json({ error: 'boom' }, 500) }, 'review'],
    ['age timeout', { ageUpload: Object.assign(new Error('timed out'), { name: 'TimeoutError' }) }, 'review'],
    ['identity front UNDERAGE', { identityUpload: json({ success: true, verification_id: identityId, status: 'HARD_REJECTED', rejection_reason: 'UNDERAGE' }, 201) }, 'failed'],
    ['liveness failed', { live: json({ ...identityVerified, final_result: 'failed', liveness_results: { passed: false } }, 200) }, 'failed'],
    ['face mismatch', { live: json({ ...identityVerified, final_result: 'failed', face_match_results: { passed: false } }, 200) }, 'failed'],
    ['age estimation flag', { live: json({ ...identityVerified, age_estimation: { document_face_age: 30, live_face_age: 44, declared_age: null, age_discrepancy: 14, flag: 'LARGE_DISCREPANCY' } }, 200) }, 'review'],
    ['live manual review', { live: json({ ...identityVerified, final_result: 'manual_review' }, 200) }, 'review'],
    ['live timeout', { live: Object.assign(new Error('timed out'), { name: 'TimeoutError' }) }, 'review'],
    ['live VALIDATION_ERROR', { live: json({ success: false, error: 'VALIDATION_ERROR' }, 400) }, 'review'],
    ['identity initialize 500', { initIdentity: json({ error: 'boom' }, 500) }, 'review'],
    ['live incomplete and status 500', { live: json({ success: true, status: 'FACE_MATCHING' }, 200), status: json({ error: 'nope' }, 500) }, 'review'],
  ];
  for (const [name, script, expected] of cases) {
    const { outcome } = await runCamera(script);
    assert.equal(outcome.result, expected, name);
  }
}

{
  const { outcome, calls } = await runCamera({ identityUpload: json({ success: true, verification_id: identityId, status: 'COMPLETE', age_verification: { is_of_age: true, age_threshold: 18 } }, 201), live: json({ ...identityVerified, final_result: 'manual_review' }, 200) });
  assert.equal(outcome.result, 'review', 'a complete-looking identity front never passes before liveness');
  assert.ok(calls.some(call => call.path.endsWith('/live-capture')), 'the live capture still runs after the front stage');
}

{
  const { outcome, calls } = await runCamera({ live: json({ ...identityVerified, age_estimation: { flag: null } }, 200) });
  assert.equal(outcome.result, 'passed', 'a null age estimation flag does not block a pass');
  assert.equal(calls.length, 5);
}

{
  const { outcome, calls } = await runCamera({}, true, null);
  assert.equal(outcome.result, 'review', 'a missing liveness object is never sent to Idswyft');
  assert.equal(calls.length, 0);
}

{
  const { outcome, calls } = await runCamera({}, true, liveness, [frontBytes]);
  assert.equal(outcome.result, 'review', 'a single image is not a camera check');
  assert.equal(calls.length, 0);
}

// Database route: flag off, flag on without a camera consent version, flag on with the test-only version.
const directory = await mkdtemp(join(tmpdir(), 'her-rules-camera-'));
const storage = join(directory, 'verification');
const db = await startDatabase(directory, 55448), pool = new pg.Pool({ connectionString: db.url });
const origin = 'http://localhost:4198';
const previous = { mode: process.env.HR_MODE, dir: process.env.HR_VERIFICATION_DIR, admins: process.env.HR_ADMIN_PUBLIC_IDS };
const servers: Server[] = [];
const listen = async (app: Awaited<ReturnType<typeof createApp>>) => { const server = app.listen(0); servers.push(server); await new Promise(resolve => server.once('listening', resolve)); return `http://localhost:${(server.address() as AddressInfo).port}`; };
const post = (base: string, path: string, body: unknown, cookie = '') => fetch(`${base}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body), redirect: 'manual' });
const get = (base: string, path: string, cookie = '') => fetch(`${base}/api${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' });
const cookieOf = (response: Response) => /hr_public_session=[a-f0-9]{64}/.exec(response.headers.get('set-cookie') ?? '')?.[0] ?? '';
const tokenOf = (response: Response) => /#public-pending=([A-Za-z0-9_-]+)$/.exec(response.headers.get('location') ?? '')?.[1] ?? '';
const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;
const mediaMarkers = ['data:image', 'storage_path', '.jpg', '.png', 'frame_base64'];
async function body(response: Response, status = 200) {
  const text = await response.text();
  assert.equal(response.status, status, text);
  for (const marker of mediaMarkers) assert.ok(!text.includes(marker), `marker ${marker} must not appear in a JSON response`);
  return text ? JSON.parse(text) : null;
}
const fakeProvider: PublicIdentityProvider = {
  name: 'google',
  authorizeUrl({ state, redirectUri }) { return `https://accounts.example.test/auth?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`; },
  async exchange({ code }) { return { subject: code.replace(/^code:/, ''), emailVerified: false }; },
};
async function signUp(base: string, code: string, nickname: string) {
  const started = await (await get(base, '/public/auth/google/start')).json();
  const state = new URL(started.url).searchParams.get('state') ?? '';
  const token = tokenOf(await get(base, `/public/auth/google/callback?code=code:${code}&state=${state}`));
  assert.ok(token, `${nickname} gets a pending registration`);
  const registered = await post(base, '/public/register', { pendingToken: token, nickname, role: 'sub', gender: 'woman' });
  assert.equal(registered.status, 200, `${nickname} registers`);
  return { id: (await registered.json()).user.id as string, cookie: cookieOf(registered) };
}
const consent = async (base: string, user: { cookie: string }, version = VERIFICATION_CONSENT_VERSION) => post(base, '/public/consent', { kind: 'verification', textVersion: version }, user.cookie);
const camera = (base: string, user: { cookie: string }, payload: unknown) => post(base, '/public/verification', { method: 'camera_age', ...(payload as object) }, user.cookie);
const verificationCount = async (userId: string) => (await pool.query('SELECT count(*)::int AS n FROM public_verifications WHERE public_user_id=$1', [userId])).rows[0].n as number;

try {
  process.env.HR_MODE = 'public';
  process.env.HR_VERIFICATION_DIR = storage;
  delete process.env.HR_ADMIN_PUBLIC_IDS;

  const offFake = fakeIdswyft();
  const offApp = await listen(await createApp(pool, origin, { google: fakeProvider }, createIdswyftVerifier({ apiKey, baseUrl, fetch: offFake.fetch, cameraEnabled: false }), { cameraEnabled: false }));
  const nullFake = fakeIdswyft();
  const nullApp = await listen(await createApp(pool, origin, { google: fakeProvider }, createIdswyftVerifier({ apiKey, baseUrl, fetch: nullFake.fetch, cameraEnabled: true }), { cameraEnabled: true, cameraConsentVersion: null }));
  const setFake = fakeIdswyft();
  const setApp = await listen(await createApp(pool, origin, { google: fakeProvider }, createIdswyftVerifier({ apiKey, baseUrl, fetch: setFake.fetch, cameraEnabled: true }), { cameraEnabled: true, cameraConsentVersion: testCameraVersion }));

  const ann = await signUp(offApp, 'ann', 'Ann Cole');
  const ben = await signUp(offApp, 'ben', 'Ben Hart');
  for (const user of [ann, ben]) await body(await consent(offApp, user));
  const payload = { media: [dataUrl('image/jpeg', frontBytes), dataUrl('image/jpeg', selfieBytes)], liveness };

  {
    const single = await body(await camera(offApp, ann, { media: [dataUrl('image/jpeg', frontBytes)] }));
    assert.equal(single.verification.status, 'review', 'flag off: the camera method is review');
    assert.equal(single.verification.reason, 'Selfie check needs a person');
    assert.equal(offFake.calls.length, 0, 'flag off: no Idswyft call');
    const two = await body(await camera(offApp, ann, payload));
    assert.equal(two.verification.status, 'review', 'flag off ignores the camera payload');
    assert.equal(offFake.calls.length, 0, 'flag off with two images: still no Idswyft call');
    assert.equal((await body(await get(offApp, '/public/verification', ann.cookie))).cameraEnabled, false, 'flag off reports cameraEnabled false');
  }

  {
    assert.equal((await body(await get(nullApp, '/public/verification', ann.cookie))).cameraEnabled, false, 'no camera consent version: cameraEnabled is false');
    const before = await verificationCount(ben.id);
    const refused = await camera(nullApp, ben, payload);
    assert.equal((await body(refused, 409)).error, 'camera consent not available yet', 'flag on with no camera consent version returns 409');
    assert.equal(nullFake.calls.length, 0, 'the refused camera request never reaches Idswyft');
    assert.equal(await verificationCount(ben.id), before, 'the refused request creates no verification');
    assert.equal(before, 0, 'ben has no earlier attempts');
    assert.equal((await post(nullApp, '/public/consent', { kind: 'verification', textVersion: testCameraVersion }, ben.cookie)).status, 400, 'an unapproved camera consent version is not accepted');
  }

  {
    assert.equal((await body(await get(setApp, '/public/verification', ann.cookie))).cameraEnabled, true, 'flag on with a camera consent version reports cameraEnabled true');
    const withoutCameraConsent = await camera(setApp, ben, payload);
    assert.equal((await body(withoutCameraConsent, 409)).error, 'Consent required', 'the camera path needs the camera consent version too');
    assert.equal(setFake.calls.length, 0);
    await body(await post(setApp, '/public/consent', { kind: 'verification', textVersion: testCameraVersion }, ann.cookie));
    const annBefore = await verificationCount(ann.id);

    const needsInput = 'Camera check needs a front photo, a live selfie and liveness frames';
    assert.equal((await body(await camera(setApp, ann, { media: [dataUrl('image/jpeg', frontBytes)], liveness }), 400)).error, needsInput, 'one image is refused');
    assert.equal((await body(await camera(setApp, ann, { media: [dataUrl('image/jpeg', frontBytes), dataUrl('image/jpeg', selfieBytes)] }), 400)).error, needsInput, 'two images without liveness are refused');
    assert.equal((await body(await camera(setApp, ann, { media: [dataUrl('image/jpeg', frontBytes), dataUrl('image/jpeg', selfieBytes)], liveness: { ...liveness, frames: liveness.frames.slice(0, 5) } }), 400)).error, 'Invalid or missing input', 'five frames are refused');
    assert.equal((await body(await camera(setApp, ann, { media: [dataUrl('image/jpeg', frontBytes), dataUrl('image/jpeg', selfieBytes)], liveness: { ...liveness, frames: liveness.frames.map((frame, index) => index === 0 ? { ...frame, phase: 'blink' } : frame) } }), 400)).error, 'Invalid or missing input', 'an unknown phase is refused');
    assert.equal(await verificationCount(ann.id), annBefore, 'refused camera requests create no verification');
    assert.equal(setFake.calls.length, 0, 'refused camera requests never reach Idswyft');

    const passed = await body(await camera(setApp, ann, payload));
    assert.equal(passed.verification.status, 'passed', 'both sessions verified passes');
    assert.equal(passed.status, 'verified');
    assert.equal(setFake.calls.length, 5, 'the camera path makes the five expected Idswyft calls');
    const media = (await pool.query('SELECT kind,storage_path FROM public_verification_media WHERE verification_id=$1 ORDER BY storage_path', [passed.verification.id])).rows;
    assert.deepEqual(media.map(row => row.kind), ['document', 'selfie'], 'only the front and the selfie are stored');
    assert.deepEqual(readdirSync(join(storage, passed.verification.id)).sort(), ['0.jpg', '1.jpg'], 'no file is written for the frames');
    assert.ok(readFileSync(join(storage, passed.verification.id, '0.jpg')).equals(frontBytes), 'the stored front is the ID image');
    assert.ok(readFileSync(join(storage, passed.verification.id, '1.jpg')).equals(selfieBytes), 'the stored selfie is the live image');
    assert.ok(existsSync(join(storage, passed.verification.id, '1.jpg')));
    assert.equal((await body(await get(setApp, '/public/me', ann.cookie))).user.status, 'verified', 'a passed camera check verifies the user');

    const identity = await body(await post(setApp, '/public/verification', { method: 'id_document', media: [dataUrl('image/jpeg', frontBytes)] }, ben.cookie));
    assert.equal(identity.verification.status, 'passed', 'the id_document path is unchanged with the flag on');
  }

  // The approved camera consent (v3) is the shared constant: v2 alone does not unlock the camera, v3 unlocks both methods.
  const cameraVersion = CAMERA_CONSENT_VERSION as string;
  assert.ok(cameraVersion, 'the approved camera consent version is set');
  const prodFake = fakeIdswyft();
  const prodApp = await listen(await createApp(pool, origin, { google: fakeProvider }, createIdswyftVerifier({ apiKey, baseUrl, fetch: prodFake.fetch, cameraEnabled: true }), { cameraEnabled: true }));
  const dee = await signUp(prodApp, 'dee', 'Dee Marsh');
  const eve = await signUp(prodApp, 'eve', 'Eve Stone');

  {
    assert.equal((await body(await get(prodApp, '/public/verification', dee.cookie))).cameraEnabled, true, 'flag on with the approved v3 text reports cameraEnabled true');
    await body(await consent(prodApp, dee));
    const view = await body(await get(prodApp, '/public/verification', dee.cookie));
    assert.equal(view.consented, true, 'v2 counts for the ID method');
    assert.equal(view.cameraConsented, false, 'v2 alone does not count for the camera method');
    assert.equal((await body(await camera(prodApp, dee, payload), 409)).error, 'Consent required', 'camera method with only v2 accepted returns 409');
    assert.equal(prodFake.calls.length, 0, 'the refused camera request never reaches Idswyft');
    await body(await consent(prodApp, dee, cameraVersion));
    assert.equal((await body(await get(prodApp, '/public/verification', dee.cookie))).cameraConsented, true, 'v3 accepted counts for the camera method');
    const passed = await body(await camera(prodApp, dee, payload));
    assert.equal(passed.verification.status, 'passed', 'camera method with v3 accepted proceeds');
    assert.equal(prodFake.calls.length, 5, 'the accepted camera request makes the five Idswyft calls');
  }

  {
    await body(await consent(prodApp, eve, cameraVersion));
    const view = await body(await get(prodApp, '/public/verification', eve.cookie));
    assert.equal(view.consented, true, 'v3 accepted counts for the ID method');
    const identity = await body(await post(prodApp, '/public/verification', { method: 'id_document', media: [dataUrl('image/jpeg', frontBytes)] }, eve.cookie));
    assert.equal(identity.verification.status, 'passed', 'ID method with v3 accepted proceeds');
  }

  console.log('PASS public-camera: schema bounds, flag off review, both sessions in order, age and identity failure and review mapping, route refusals, stored media only, camera consent v3 gate');
} finally {
  for (const [key, value] of [['HR_MODE', previous.mode], ['HR_VERIFICATION_DIR', previous.dir], ['HR_ADMIN_PUBLIC_IDS', previous.admins]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  await pool.end();
  await db.stop();
  await rm(directory, { recursive: true, force: true });
}
