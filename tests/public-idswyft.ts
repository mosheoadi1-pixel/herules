import assert from 'node:assert/strict';
import { createIdswyftVerifier } from '../server/public-idswyft.ts';

const apiKey = 'ik_test_only_not_a_real_key';
const baseUrl = 'https://idswyft.example.test';
const verificationId = '770e8400-e29b-41d4-a716-446655440003';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const jpegBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const pngBytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 9)]);

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown; signal: unknown };
type Answer = Response | Error;
type Script = { init?: Answer; upload?: Answer; status?: Answer };

const complete = (over: Record<string, unknown> = {}) => ({ success: true, verification_id: verificationId, status: 'COMPLETE', current_step: 1, age_verification: { is_of_age: true, age_threshold: 18 }, final_result: 'verified', ...over });
const json = (body: unknown, status = 200) => Response.json(body, { status });

function fakeIdswyft(script: Script = {}) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), method: init?.method ?? 'GET', headers: { ...(init?.headers as Record<string, string>) }, body: init?.body, signal: init?.signal });
    const answer = (value: Answer | undefined, fallback: () => Response) => {
      if (value instanceof Error) throw value;
      return value ?? fallback();
    };
    if (url.pathname === '/api/v2/verify/initialize') return answer(script.init, () => json({ success: true, verification_id: verificationId, status: 'AWAITING_FRONT' }, 201));
    if (url.pathname === `/api/v2/verify/${verificationId}/front-document`) return answer(script.upload, () => json(complete(), 201));
    if (url.pathname === `/api/v2/verify/${verificationId}/status`) return answer(script.status, () => json(complete()));
    return json({ error: 'not found' }, 404);
  };
  return { fetch, calls };
}

const verifier = (script: Script = {}, options: { sandbox?: boolean; countryCode?: string } = {}) => {
  const fake = fakeIdswyft(script);
  return { ...fake, check: createIdswyftVerifier({ apiKey, baseUrl, fetch: fake.fetch, ...options }).check };
};
const run = async (script: Script = {}, media: Buffer[] = [jpegBytes]) => {
  const fake = verifier(script);
  const outcome = await fake.check({ method: 'id_document', media });
  return { outcome, calls: fake.calls };
};

{
  const { outcome, calls } = await run();
  assert.deepEqual(outcome, { result: 'passed', reason: 'Age check passed' });
  assert.equal(calls[0].url, `${baseUrl}/api/v2/verify/initialize`);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['X-API-Key'], apiKey, 'every request carries the API key header');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.ok(calls[0].signal, 'the initialize request has a timeout signal');
  const init = JSON.parse(String(calls[0].body));
  assert.match(init.user_id, uuid, 'user_id is a UUID');
  assert.equal(init.verification_mode, 'age_only');
  assert.equal(init.age_threshold, 18);
  assert.equal('sandbox' in init, false, 'sandbox is not sent by default');
}

{
  const { calls } = await run();
  assert.equal(calls[1].url, `${baseUrl}/api/v2/verify/${verificationId}/front-document`);
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].headers['X-API-Key'], apiKey);
  assert.ok(calls[1].signal, 'the upload has a timeout signal');
  const form = calls[1].body as FormData;
  assert.ok(form instanceof FormData, 'the upload is multipart form data');
  const document = form.get('document') as File;
  assert.ok(document instanceof File);
  assert.equal(document.type, 'image/jpeg');
  assert.ok(Buffer.from(await document.arrayBuffer()).equals(jpegBytes), 'the uploaded bytes are the image bytes');
  assert.equal(form.get('document_type'), 'auto');
  assert.equal(form.get('country_code'), 'IL', 'country code defaults to IL');
}

{
  const { calls } = await run({}, [pngBytes]);
  const document = (calls[1].body as FormData).get('document') as File;
  assert.equal(document.type, 'image/png', 'a PNG is sent with its own content type');
}

{
  const fake = verifier({}, { sandbox: true, countryCode: 'US' });
  await fake.check({ method: 'id_document', media: [jpegBytes] });
  assert.equal(JSON.parse(String(fake.calls[0].body)).sandbox, true, 'sandbox option adds sandbox true');
  assert.equal(((fake.calls[1].body as FormData).get('country_code')), 'US');
}

{
  const cases: [string, Script, { result: string }][] = [
    ['is_of_age true with COMPLETE', {}, { result: 'passed' }],
    ['is_of_age false', { upload: json(complete({ final_result: 'failed', age_verification: { is_of_age: false, age_threshold: 18 } }), 201) }, { result: 'failed' }],
    ['final_result failed', { upload: json(complete({ final_result: 'failed', age_verification: undefined }), 201) }, { result: 'failed' }],
    ['final_result manual_review', { upload: json(complete({ final_result: 'manual_review' }), 201) }, { result: 'review' }],
    ['DOB_NOT_FOUND', { upload: json({ success: true, verification_id: verificationId, status: 'HARD_REJECTED', rejection_reason: 'DOB_NOT_FOUND' }, 201) }, { result: 'review' }],
    ['UNDERAGE', { upload: json({ success: true, verification_id: verificationId, status: 'HARD_REJECTED', rejection_reason: 'UNDERAGE' }, 201) }, { result: 'failed' }],
    ['HTTP 500 on upload', { upload: json({ error: 'boom' }, 500) }, { result: 'review' }],
    ['HTTP 500 on initialize', { init: json({ error: 'boom' }, 500) }, { result: 'review' }],
    ['HTTP 401 on initialize', { init: json({ error: 'bad key' }, 401) }, { result: 'review' }],
    ['HTTP 429 on upload', { upload: json({ error: 'slow down' }, 429) }, { result: 'review' }],
    ['network error on initialize', { init: new TypeError('fetch failed') }, { result: 'review' }],
    ['timeout on upload', { upload: Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }) }, { result: 'review' }],
    ['no final_result and status unavailable', { upload: json({ success: true, verification_id: verificationId, status: 'FACE_MATCHING' }, 201), status: json({ error: 'nope' }, 500) }, { result: 'review' }],
  ];
  for (const [name, script, expected] of cases) {
    const { outcome } = await run(script);
    assert.equal(outcome.result, expected.result, name);
  }
}

{
  const { outcome, calls } = await run({ upload: json({ success: true, verification_id: verificationId, status: 'FACE_MATCHING' }, 201), status: json(complete()) });
  assert.equal(outcome.result, 'passed', 'an incomplete upload response falls back to the status endpoint');
  assert.equal(calls.at(-1)?.url, `${baseUrl}/api/v2/verify/${verificationId}/status`);
  assert.equal(calls.at(-1)?.method, 'GET');
  assert.equal(calls.at(-1)?.headers['X-API-Key'], apiKey);
}

{
  const { outcome, calls } = await run({ init: json({ success: true, verification_id: 'bad/../id', status: 'AWAITING_FRONT' }, 201) });
  assert.equal(outcome.result, 'review', 'a verification id that is not a plain identifier is never used in a path');
  assert.equal(calls.length, 1);
}

{
  const fake = verifier();
  assert.deepEqual(await fake.check({ method: 'camera_age', media: [jpegBytes] }), { result: 'review', reason: 'Selfie check needs a person' });
  assert.equal(fake.calls.length, 0, 'the camera method never reaches Idswyft');
  assert.deepEqual(await fake.check({ method: 'id_document', media: [Buffer.from('GIF89a')] }), { result: 'review', reason: 'Unsupported image' });
  assert.equal(fake.calls.length, 0, 'an unsupported image never reaches Idswyft');
}

{
  const jpegB64 = jpegBytes.toString('base64');
  const leaking = [
    run({ init: new Error(`failure with ${apiKey} and ${jpegB64}`) }),
    run({ upload: json({ error: `${apiKey} ${jpegB64}` }, 500) }),
    run({ upload: json(complete({ rejection_reason: `${apiKey} ${jpegB64}`, final_result: 'manual_review' }), 201) }),
  ];
  for (const { outcome } of await Promise.all(leaking)) {
    assert.ok(!outcome.reason.includes(apiKey), 'the reason never contains the API key');
    assert.ok(!outcome.reason.includes(jpegB64), 'the reason never contains image bytes');
  }
}

console.log('PASS public-idswyft: initialize and upload requests, age_only mapping, review fallbacks, no key or image bytes in reasons');
