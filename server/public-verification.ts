import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Pool } from 'pg';
import { z } from 'zod';
import { VERIFICATION_CONSENT_VERSION } from '../src/verification-consent.ts';

export type PublicVerificationMethod = 'id_document' | 'camera_age';
export type PublicVerifierResult = { result: 'passed' | 'failed' | 'review'; reason: string };

export const LIVENESS_PHASES = ['turn1_start', 'turn1_peak', 'turn1_return', 'turn_start', 'turn_peak', 'turn_return'] as const;
const FRAME_MAX_BYTES = 1024 * 1024;
// Head-turn frames captured in the browser. Used for the automatic check only; never stored.
export const cameraLivenessSchema = z.strictObject({
  challenge_type: z.literal('head_turn'),
  challenge_direction: z.enum(['left', 'right']),
  frames: z.array(z.strictObject({
    frame_base64: z.string().max(Math.ceil(FRAME_MAX_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/).refine(value => Buffer.from(value, 'base64').length <= FRAME_MAX_BYTES, 'Frame too large'),
    timestamp: z.number().int().min(0).max(60000),
    phase: z.enum(LIVENESS_PHASES),
  })).length(6),
  start_timestamp: z.literal(0),
  end_timestamp: z.number().int().min(0).max(60000),
});
export type CameraLiveness = z.infer<typeof cameraLivenessSchema>;

// The automatic check. It only decides; storage, status and audit stay in app.ts.
export interface PublicVerifier {
  check(input: { method: PublicVerificationMethod; media: Buffer[]; liveness?: CameraLiveness }): Promise<PublicVerifierResult>;
}

export const VERIFICATION_MEDIA_MAX_ITEMS = 3;
export const VERIFICATION_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const VERIFICATION_ATTEMPTS_PER_DAY = 3;
const DAY_MS = 86400000;
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const DATA_URL = /^data:(image\/jpeg|image\/png);base64,([A-Za-z0-9+/]+={0,2})$/;

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

export function verificationDirectory(env: NodeJS.ProcessEnv = process.env) {
  return resolve(env.HR_VERIFICATION_DIR || '.local/verification');
}

export function retentionDays(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.HR_VERIFICATION_RETENTION_DAYS;
  if (raw === undefined || raw === '') return 7;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > 365) throw new Error('HR_VERIFICATION_RETENTION_DAYS must be an integer from 1 to 365');
  return value;
}

// Reviewers are listed by public_user id in HR_ADMIN_PUBLIC_IDS (comma separated). Never set from the UI.
export function reviewerIds(env: NodeJS.ProcessEnv = process.env) {
  return (env.HR_ADMIN_PUBLIC_IDS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
}

// For future routes that need a verified user. Nothing in this phase is gated on it.
export function requireVerified<T extends { status: string }>(user: T): T {
  if (user.status !== 'verified') throw httpError(403, 'Verification required');
  return user;
}

// Checks the declared type and the file signature, so a renamed file is not accepted.
export function decodeImage(value: string) {
  const match = DATA_URL.exec(value);
  if (!match) throw httpError(400, 'Unsupported image type');
  const mime = match[1];
  const bytes = Buffer.from(match[2], 'base64');
  const signature = mime === 'image/png' ? PNG : JPEG;
  if (!bytes.subarray(0, signature.length).equals(signature)) throw httpError(400, 'Unsupported image type');
  if (bytes.length > VERIFICATION_MEDIA_MAX_BYTES) throw httpError(413, 'Image too large');
  return { mime, bytes };
}

export async function storeMedia(dir: string, verificationId: string, images: { mime: string; bytes: Buffer }[]) {
  const folder = join(dir, verificationId);
  await mkdir(folder, { recursive: true });
  const paths: string[] = [];
  for (const [index, image] of images.entries()) {
    const name = `${index}.${image.mime === 'image/png' ? 'png' : 'jpg'}`;
    await writeFile(join(folder, name), image.bytes, { flag: 'wx', mode: 0o600 });
    paths.push(`${verificationId}/${name}`);
  }
  return paths;
}

export async function discardMedia(dir: string, verificationId: string) {
  await rm(join(dir, verificationId), { recursive: true, force: true });
}

export async function hasConsentVersion(pool: Pool, userId: string, version: string) {
  const r = await pool.query('SELECT 1 FROM public_consents WHERE public_user_id=$1 AND kind=$2 AND text_version=$3 LIMIT 1', [userId, 'verification', version]);
  return r.rows.length > 0;
}

export const hasVerificationConsent = (pool: Pool, userId: string) => hasConsentVersion(pool, userId, VERIFICATION_CONSENT_VERSION);

// Deletes files and media rows for decided verifications past their purge time. The verification row stays
// with status 'purged' and keeps its method, decision date, reviewer and reason.
export async function purgeExpiredVerificationMedia(pool: Pool, now = new Date(), dir = verificationDirectory()) {
  const due = (await pool.query("SELECT id FROM public_verifications WHERE status<>'purged' AND purge_after IS NOT NULL AND purge_after<=$1", [now])).rows;
  for (const { id } of due) {
    await discardMedia(dir, id);
    await pool.query("WITH gone AS (DELETE FROM public_verification_media WHERE verification_id=$1) UPDATE public_verifications SET status='purged', purge_after=NULL WHERE id=$1", [id]);
  }
  return due.length;
}

export const retentionMs = (env: NodeJS.ProcessEnv = process.env) => retentionDays(env) * DAY_MS;
