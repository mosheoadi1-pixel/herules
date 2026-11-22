import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGoogleProvider, googleProviderFromEnv } from '../server/public-google.ts';
import { pkcePair } from '../server/public-auth.ts';

const origin = 'http://localhost:4196';
const redirectUri = `${origin}/api/public/auth/google/callback`;
const clientId = 'test-client-id.apps.googleusercontent.com';
const clientSecret = 'test-only-not-a-real-secret';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const tokeninfoUrl = 'https://oauth2.googleapis.com/tokeninfo';

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (payload: Record<string, unknown>) => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.unverified-signature`;
const now = () => Math.floor(Date.now() / 1000);
const claims = (over: Record<string, unknown> = {}) => ({ iss: 'https://accounts.google.com', aud: clientId, exp: now() + 3600, sub: 'google-subject-1', ...over });

type Call = { url: string; init?: RequestInit };
function fakeGoogle({ payload = claims(), info = claims(), tokenOk = true }: { payload?: Record<string, unknown>; info?: Record<string, unknown>; tokenOk?: boolean } = {}) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), init });
    if (`${url.origin}${url.pathname}` === tokenUrl) {
      if (!tokenOk) return new Response('{"error":"invalid_grant"}', { status: 400 });
      return Response.json({ access_token: 'unused', id_token: jwt(payload) });
    }
    if (`${url.origin}${url.pathname}` === tokeninfoUrl) return Response.json(info);
    return new Response('not found', { status: 404 });
  };
  return { fetch, calls };
}

const provider = (fetch: ReturnType<typeof fakeGoogle>['fetch']) => createGoogleProvider({ clientId, clientSecret, fetch });

{
  const pkce = pkcePair();
  const url = new URL(provider(fakeGoogle().fetch).authorizeUrl({ state: 'state-value-123', codeChallenge: pkce.challenge, redirectUri }));
  assert.equal(`${url.origin}${url.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), clientId);
  assert.equal(url.searchParams.get('redirect_uri'), redirectUri);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email', 'only openid and email are requested');
  assert.equal(url.searchParams.get('state'), 'state-value-123');
  assert.equal(url.searchParams.get('code_challenge'), pkce.challenge);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('prompt'), 'select_account');
  assert.equal(url.searchParams.get('client_secret'), null, 'the authorization URL never carries the secret');
}

{
  const pkce = pkcePair();
  const google = fakeGoogle();
  const result = await provider(google.fetch).exchange({ code: 'auth-code-abc', codeVerifier: pkce.verifier, redirectUri });
  assert.deepEqual(result, { subject: 'google-subject-1' });
  assert.equal(google.calls.length, 2, 'one token request and one tokeninfo check');
  const token = google.calls[0];
  assert.equal(token.url, tokenUrl);
  assert.equal(token.init?.method, 'POST');
  assert.ok(token.init?.signal, 'token request has a timeout signal');
  const body = new URLSearchParams(String(token.init?.body));
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'auth-code-abc');
  assert.equal(body.get('client_id'), clientId);
  assert.equal(body.get('client_secret'), clientSecret);
  assert.equal(body.get('redirect_uri'), redirectUri);
  assert.equal(body.get('code_verifier'), pkce.verifier);
  assert.equal(createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url'), pkce.challenge, 'the sent verifier matches the S256 challenge');
  assert.equal(new URL(google.calls[1].url).searchParams.get('id_token') !== null, true, 'tokeninfo receives the id_token');
  assert.ok(google.calls[1].init?.signal, 'tokeninfo request has a timeout signal');
}

{
  await assert.rejects(provider(fakeGoogle({ info: claims({ aud: 'someone-else.apps.googleusercontent.com' }) }).fetch).exchange({ code: 'c', codeVerifier: 'v', redirectUri }), /audience mismatch/);
  await assert.rejects(provider(fakeGoogle({ info: claims({ iss: 'https://evil.example.test' }) }).fetch).exchange({ code: 'c', codeVerifier: 'v', redirectUri }), /issuer mismatch/);
  await assert.rejects(provider(fakeGoogle({ info: claims({ exp: now() - 10 }) }).fetch).exchange({ code: 'c', codeVerifier: 'v', redirectUri }), /expired/);
  await assert.rejects(provider(fakeGoogle({ payload: claims({ aud: 'other' }) }).fetch).exchange({ code: 'c', codeVerifier: 'v', redirectUri }), /audience mismatch/, 'the id_token payload is checked too');
  await assert.rejects(provider(fakeGoogle({ info: claims({ sub: 'google-subject-2' }) }).fetch).exchange({ code: 'c', codeVerifier: 'v', redirectUri }), /subject mismatch/);
  await assert.rejects(provider(fakeGoogle({ info: claims({ sub: '' }) }).fetch).exchange({ code: 'c', codeVerifier: 'v', redirectUri }), /no subject/);
  await assert.rejects(provider(fakeGoogle({ tokenOk: false }).fetch).exchange({ code: 'secret-code-xyz', codeVerifier: 'v', redirectUri }), (error: Error) => {
    assert.equal(error.message, 'Google token exchange failed');
    assert.ok(!error.message.includes('secret-code-xyz') && !error.message.includes(clientSecret), 'errors never include the code or secret');
    return true;
  });
  const offline = createGoogleProvider({ clientId, clientSecret, fetch: async () => { throw new Error('socket hang up'); } });
  await assert.rejects(offline.exchange({ code: 'c', codeVerifier: 'v', redirectUri }), /unavailable/);
}

{
  const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
  try {
    assert.equal(googleProviderFromEnv({}), undefined, 'no env means Google is not registered');
    assert.equal(googleProviderFromEnv({ GOOGLE_CLIENT_ID: clientId }), undefined, 'a missing secret means Google is not registered');
    assert.equal(googleProviderFromEnv({ GOOGLE_CLIENT_SECRET: clientSecret }), undefined, 'a missing client ID means Google is not registered');
    assert.equal(googleProviderFromEnv({ GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: clientSecret }), undefined, 'a blank client ID means Google is not registered');
    assert.equal(googleProviderFromEnv({ GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret })?.name, 'google');
  } finally {
    if (saved.id === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = saved.id;
    if (saved.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET = saved.secret;
  }
}

console.log('PASS public-google: start URL, PKCE verifier and secret in token exchange, id_token checks, env registration');
