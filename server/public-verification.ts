import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { CAMERA_CONSENT_VERSION, VERIFICATION_CONSENT_VERSION } from '../src/verification-consent.ts';

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

// The automatic check returns a result; it doesn't own stored media or review state.
export interface PublicVerifier {
  check(input: { method: PublicVerificationMethod; media: Buffer[]; liveness?: CameraLiveness }): Promise<PublicVerifierResult>;
}
type VerificationImage = { mime: 'image/jpeg' | 'image/png'; bytes: Buffer };

export const VERIFICATION_MEDIA_MAX_ITEMS = 3;
export const VERIFICATION_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const VERIFICATION_ATTEMPTS_PER_DAY = 3;
const DAY_MS = 86400000;
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const DATA_URL = /^data:(image\/jpeg|image\/png);base64,([A-Za-z0-9+/]+={0,2})$/;

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

export function legacyVerificationDirectory(env: NodeJS.ProcessEnv = process.env) {
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
export function decodeImage(value: string): VerificationImage {
  const match = DATA_URL.exec(value);
  if (!match) throw httpError(400, 'Unsupported image type');
  const mime = match[1] === 'image/png' ? 'image/png' : 'image/jpeg';
  const bytes = Buffer.from(match[2], 'base64');
  const signature = mime === 'image/png' ? PNG : JPEG;
  if (!bytes.subarray(0, signature.length).equals(signature)) throw httpError(400, 'Unsupported image type');
  if (bytes.length > VERIFICATION_MEDIA_MAX_BYTES) throw httpError(413, 'Image too large');
  return { mime, bytes };
}

export async function storeVerificationMedia(client: PoolClient, verificationId: string, images: (VerificationImage & { kind: 'document' | 'selfie' })[]) {
  for (const [index, image] of images.entries()) {
    await client.query('INSERT INTO public_verification_media(id,verification_id,kind,image_index,content_type,image_bytes) VALUES($1,$2,$3,$4,$5,$6)',
      [randomUUID(), verificationId, image.kind, index, image.mime, image.bytes]);
  }
}

export async function loadVerificationMedia(client: PoolClient, verificationId: string, index: number, legacyDir: string): Promise<VerificationImage | undefined> {
  const legacyPath = `${verificationId.toLowerCase()}/${index}`;
  const jpg = `${legacyPath}.jpg`, png = `${legacyPath}.png`;
  const { rows: [item] } = await client.query<{ image_bytes: Buffer | null; content_type: VerificationImage['mime'] | null; storage_path: string | null }>(
    'SELECT image_bytes,content_type,storage_path FROM public_verification_media WHERE verification_id=$1 AND (image_index=$2 OR storage_path IN ($3,$4)) ORDER BY image_index NULLS LAST LIMIT 1',
    [verificationId, index, jpg, png]);
  if (!item) return undefined;
  if (item.image_bytes && item.content_type) return { mime: item.content_type, bytes: item.image_bytes };
  const path = item.storage_path;
  if (path !== jpg && path !== png) return undefined;
  try {
    return { mime: path === png ? 'image/png' : 'image/jpeg', bytes: await readFile(join(legacyDir, path)) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') throw httpError(410, 'Media has been deleted');
    throw error;
  }
}

// The camera check can take up to seven 30-second requests. After five minutes,
// allow human review of a saved upload whose automatic check didn't finish.
export async function queueStalledVerificationReviews(pool: Pool) {
  await pool.query(`UPDATE public_verifications v SET status='review',reason='automatic check unavailable'
    WHERE v.status='pending' AND v.created_at <= now()-interval '5 minutes'
    AND EXISTS (SELECT 1 FROM public_verification_media m WHERE m.verification_id=v.id)`);
}

export async function hasConsentVersion(pool: Pool, userId: string, version: string) {
  const r = await pool.query('SELECT 1 FROM public_consents WHERE public_user_id=$1 AND kind=$2 AND text_version=$3 LIMIT 1', [userId, 'verification', version]);
  return r.rows.length > 0;
}

// The current camera consent covers the ID photo too.
export async function hasVerificationConsent(pool: Pool, userId: string, cameraVersion: string | null = CAMERA_CONSENT_VERSION) {
  if (await hasConsentVersion(pool, userId, VERIFICATION_CONSENT_VERSION)) return true;
  return cameraVersion !== null && hasConsentVersion(pool, userId, cameraVersion);
}

// The verification decision and audit stay; only the stored images are removed.
export async function purgeExpiredVerificationMedia(pool: Pool, now = new Date(), legacyDir = legacyVerificationDirectory()) {
  const due = (await pool.query<{ id: string }>("SELECT id FROM public_verifications WHERE status<>'purged' AND purge_after<=$1", [now])).rows;
  let purged = 0;
  const failures: unknown[] = [];
  for (const { id } of due) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [expired] } = await client.query<{ on_disk: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM public_verification_media WHERE verification_id=v.id AND storage_path IS NOT NULL
      ) AS on_disk FROM public_verifications v WHERE id=$1 AND status<>'purged' AND purge_after<=$2 FOR UPDATE`, [id, now]);
      if (expired) {
        if (expired.on_disk) await rm(join(legacyDir, id), { recursive: true, force: true });
        await client.query('DELETE FROM public_verification_media WHERE verification_id=$1', [id]);
        await client.query("UPDATE public_verifications SET status='purged',purge_after=NULL WHERE id=$1", [id]);
      }
      await client.query('COMMIT');
      if (expired) purged++;
    } catch (error) {
      await client.query('ROLLBACK');
      // A missing or unwritable legacy mount must not delay deletion of other uploads.
      failures.push(error);
    } finally {
      client.release();
    }
  }
  if (failures.length) throw failures[0];
  return purged;
}

export const retentionMs = (env: NodeJS.ProcessEnv = process.env) => retentionDays(env) * DAY_MS;
