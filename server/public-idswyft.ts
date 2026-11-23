import { randomUUID } from 'node:crypto';
import type { CameraLiveness, PublicVerificationMethod, PublicVerifier, PublicVerifierResult } from './public-verification.ts';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type Json = Record<string, any>;
type Options = { apiKey: string; baseUrl?: string; sandbox?: boolean; countryCode?: string; cameraEnabled?: boolean; fetch?: FetchLike };
type Image = { bytes: Buffer; mime: string };

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

// Identity sessions decide only on the live-capture (or its status) result. Any age estimate flag goes to a person.
function identityDecide(body: Json | null): PublicVerifierResult | undefined {
  if (!body || typeof body !== 'object') return undefined;
  if (body.final_result === 'failed' || body.liveness_results?.passed === false || body.face_match_results?.passed === false) return { result: 'failed', reason: 'Identity or liveness check failed' };
  if (body.final_result === 'manual_review') return review('Needs a person to review');
  if (body.age_estimation?.flag != null) return review('Age estimate needs a person');
  if (body.final_result === 'verified') return { result: 'passed', reason: 'Identity and liveness check passed' };
  return undefined;
}

// The exact shape Idswyft validates for head-turn liveness. Frames are sent as bare base64, never as data URLs.
const livenessMetadata = (liveness: CameraLiveness) => ({
  challenge_type: liveness.challenge_type,
  challenge_direction: liveness.challenge_direction,
  frames: liveness.frames.map(frame => ({ frame_base64: frame.frame_base64, timestamp: frame.timestamp, phase: frame.phase })),
  start_timestamp: liveness.start_timestamp,
  end_timestamp: liveness.end_timestamp,
});

export function createIdswyftVerifier({ apiKey, baseUrl = 'https://api.idswyft.app', sandbox = false, countryCode = 'IL', cameraEnabled = false, fetch: fetchImpl = globalThis.fetch as FetchLike }: Options): PublicVerifier {
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
  const sessionId = (started: Json | null) => {
    const id = started?.verification_id;
    if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Idswyft session missing');
    return id;
  };
  const documentForm = (image: Image) => {
    const form = new FormData();
    form.append('document', new Blob([new Uint8Array(image.bytes)], { type: image.mime }), image.mime === 'image/png' ? 'document.png' : 'document.jpg');
    form.append('document_type', 'auto');
    form.append('country_code', countryCode);
    return form;
  };
  const jsonHeaders = { 'Content-Type': 'application/json' };
  const sandboxField = sandbox ? { sandbox: true } : {};

  // Age-only session on the ID front. Used alone for id_document and as the first camera check.
  const ageSession = async (front: Image): Promise<PublicVerifierResult> => {
    const started = await request('/api/v2/verify/initialize', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ user_id: randomUUID(), verification_mode: 'age_only', age_threshold: 18, ...sandboxField }),
    });
    const id = sessionId(started);
    const uploaded = await request(`/api/v2/verify/${id}/front-document`, { method: 'POST', body: documentForm(front) });
    const first = decide(uploaded);
    if (first) return first;
    const status = await request(`/api/v2/verify/${id}/status`, { method: 'GET' });
    return decide(status) ?? review('Could not confirm the result; needs a person');
  };

  // Identity session: ID front, then a live selfie with head-turn liveness metadata.
  const identitySession = async (front: Image, selfie: Image, liveness: CameraLiveness): Promise<PublicVerifierResult> => {
    const started = await request('/api/v2/verify/initialize', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ user_id: randomUUID(), verification_mode: 'identity', ...sandboxField }),
    });
    const id = sessionId(started);
    const uploaded = await request(`/api/v2/verify/${id}/front-document`, { method: 'POST', body: documentForm(front) });
    // Only a failure or a review from the front stage stops here; a pass is never taken before liveness and face match.
    const early = decide(uploaded);
    if (early && early.result !== 'passed') return early;
    const form = new FormData();
    form.append('selfie', new Blob([new Uint8Array(selfie.bytes)], { type: selfie.mime }), selfie.mime === 'image/png' ? 'selfie.png' : 'selfie.jpg');
    form.append('liveness_metadata', JSON.stringify(livenessMetadata(liveness)));
    const captured = await request(`/api/v2/verify/${id}/live-capture`, { method: 'POST', body: form });
    const first = identityDecide(captured);
    if (first) return first;
    const status = await request(`/api/v2/verify/${id}/status`, { method: 'GET' });
    return identityDecide(status) ?? review('Could not confirm the result; needs a person');
  };

  // Both sessions must pass. A failed or unclear age check stops before the identity session starts.
  const cameraCheck = async (front: Image, selfie: Image, liveness: CameraLiveness): Promise<PublicVerifierResult> => {
    const age = await ageSession(front);
    if (age.result !== 'passed') return age;
    const identity = await identitySession(front, selfie, liveness);
    if (identity.result !== 'passed') return identity;
    return { result: 'passed', reason: 'Age and identity checks passed' };
  };

  return {
    async check({ method, media, liveness }: { method: PublicVerificationMethod; media: Buffer[]; liveness?: CameraLiveness }) {
      if (method === 'camera_age') {
        if (!cameraEnabled) return review('Selfie check needs a person');
        const [frontBytes, selfieBytes] = media;
        const front = frontBytes ? imageMime(frontBytes) : undefined;
        const selfie = selfieBytes ? imageMime(selfieBytes) : undefined;
        if (media.length !== 2 || !liveness || !frontBytes || !selfieBytes || !front || !selfie) return review('Camera check input incomplete');
        try { return await cameraCheck({ bytes: frontBytes, mime: front }, { bytes: selfieBytes, mime: selfie }, liveness); }
        catch { return review('Automatic check unavailable'); }
      }
      const bytes = media[0];
      const mime = bytes ? imageMime(bytes) : undefined;
      if (!bytes || !mime) return review('Unsupported image');
      try { return await ageSession({ bytes, mime }); }
      catch { return review('Automatic check unavailable'); }
    },
  };
}
