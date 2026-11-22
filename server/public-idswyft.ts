import { randomUUID } from 'node:crypto';
import type { PublicVerificationMethod, PublicVerifier, PublicVerifierResult } from './public-verification.ts';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type Json = Record<string, any>;
type Options = { apiKey: string; baseUrl?: string; sandbox?: boolean; countryCode?: string; fetch?: FetchLike };

const timeoutMs = 30_000;
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const idPattern = /^[A-Za-z0-9-]{1,64}$/;

const review = (reason: string): PublicVerifierResult => ({ result: 'review', reason });

function imageMime(bytes: Buffer) {
  if (bytes.subarray(0, PNG.length).equals(PNG)) return 'image/png';
  if (bytes.subarray(0, JPEG.length).equals(JPEG)) return 'image/jpeg';
  return undefined;
}

// Reasons are fixed strings. Nothing from the Idswyft response body is copied into them.
function decide(body: Json | null): PublicVerifierResult | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const reasons = [body.rejection_reason, ...(Array.isArray(body.rejection_reasons) ? body.rejection_reasons : [])].filter((value): value is string => typeof value === 'string');
  const isOfAge = body.age_verification?.is_of_age;
  if (reasons.includes('UNDERAGE') || isOfAge === false) return { result: 'failed', reason: 'Age check failed: under the minimum age' };
  if (reasons.includes('DOB_NOT_FOUND')) return review('Date of birth could not be read; needs a person');
  if (body.final_result === 'manual_review') return review('Needs a person to review');
  if (body.final_result === 'failed') return { result: 'failed', reason: 'ID check failed' };
  if (body.final_result === 'verified' || (body.status === 'COMPLETE' && isOfAge === true)) return { result: 'passed', reason: 'Age check passed' };
  return undefined;
}

export function createIdswyftVerifier({ apiKey, baseUrl = 'https://api.idswyft.app', sandbox = false, countryCode = 'IL', fetch: fetchImpl = globalThis.fetch as FetchLike }: Options): PublicVerifier {
  const base = new URL(baseUrl);
  const request = async (path: string, init: RequestInit = {}): Promise<Json | null> => {
    const response = await fetchImpl(new URL(path, base), {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error('Idswyft request failed');
    return (await response.json().catch(() => null)) as Json | null;
  };
  return {
    async check({ method, media }: { method: PublicVerificationMethod; media: Buffer[] }) {
      if (method !== 'id_document') return review('Selfie check needs a person');
      const bytes = media[0];
      const mime = bytes ? imageMime(bytes) : undefined;
      if (!bytes || !mime) return review('Unsupported image');
      try {
        const started = await request('/api/v2/verify/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: randomUUID(), verification_mode: 'age_only', age_threshold: 18, ...(sandbox ? { sandbox: true } : {}) }),
        });
        const id = started?.verification_id;
        if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Idswyft session missing');
        const form = new FormData();
        form.append('document', new Blob([new Uint8Array(bytes)], { type: mime }), mime === 'image/png' ? 'document.png' : 'document.jpg');
        form.append('document_type', 'auto');
        form.append('country_code', countryCode);
        const uploaded = await request(`/api/v2/verify/${id}/front-document`, { method: 'POST', body: form });
        const first = decide(uploaded);
        if (first) return first;
        const status = await request(`/api/v2/verify/${id}/status`, { method: 'GET' });
        return decide(status) ?? review('Could not confirm the result; needs a person');
      } catch {
        return review('Automatic check unavailable');
      }
    },
  };
}
