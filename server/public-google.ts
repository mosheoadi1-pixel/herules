import type { PublicIdentityProvider } from './public-auth.ts';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type Claims = Record<string, unknown>;

const authorizeEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const tokeninfoEndpoint = 'https://oauth2.googleapis.com/tokeninfo';
const issuers = ['https://accounts.google.com', 'accounts.google.com'];
const timeoutMs = 10_000;

const fail = (message: string): never => {
  throw new Error(message);
};

const payloadOf = (idToken: string): Claims => {
  try {
    const part = idToken.split('.')[1] ?? '';
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (claims && typeof claims === 'object') return claims as Claims;
  } catch {
    // reported below
  }
  return fail('Google id_token is malformed');
};

function assertClaims(claims: Claims, clientId: string) {
  if (!issuers.includes(String(claims.iss))) fail('Google id_token issuer mismatch');
  if (claims.aud !== clientId) fail('Google id_token audience mismatch');
  if (!(Number(claims.exp) * 1000 > Date.now())) fail('Google id_token expired');
  if (typeof claims.sub !== 'string' || claims.sub === '') fail('Google id_token has no subject');
}

export function createGoogleProvider({ clientId, clientSecret, fetch: fetchImpl = globalThis.fetch as FetchLike }: { clientId: string; clientSecret: string; fetch?: FetchLike }): PublicIdentityProvider {
  const request = async (url: string | URL, init: RequestInit, message: string) => {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      return fail(message);
    }
  };
  return {
    name: 'google',
    authorizeUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL(authorizeEndpoint);
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return url.toString();
    },
    async exchange({ code, codeVerifier, redirectUri }) {
      const response = await request(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      }, 'Google token exchange unavailable');
      if (!response.ok) fail('Google token exchange failed');
      const idToken = (await response.json().catch(() => null) as { id_token?: unknown } | null)?.id_token;
      if (typeof idToken !== 'string' || idToken === '') return fail('Google token response has no id_token');

      const payload = payloadOf(idToken);
      assertClaims(payload, clientId);

      const tokeninfo = new URL(tokeninfoEndpoint);
      tokeninfo.searchParams.set('id_token', idToken);
      const info = await request(tokeninfo, { method: 'GET' }, 'Google id_token check unavailable');
      if (!info.ok) fail('Google id_token rejected');
      const claims = await info.json().catch(() => null) as Claims | null;
      if (!claims) return fail('Google id_token check returned no claims');
      assertClaims(claims, clientId);
      if (claims.sub !== payload.sub) fail('Google id_token subject mismatch');
      return { subject: claims.sub as string };
    },
  };
}

export function googleProviderFromEnv(env: NodeJS.ProcessEnv = process.env): PublicIdentityProvider | undefined {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  return createGoogleProvider({ clientId, clientSecret });
}
