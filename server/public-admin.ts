import { createHash } from 'node:crypto';
import { reviewerIds } from './public-verification.ts';

const adminHashPattern = /^[0-9a-f]{64}$/;

// The only form of the email ever stored: SHA-256 hex of the lowercased, trimmed address.
export const publicEmailHash = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

// Optional. Unset or empty turns email-based admin off. A set value must be a SHA-256 hex digest, never an email.
export function adminHashFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const value = env.ADMIN_HASH;
  if (value === undefined || value === '') return undefined;
  if (!adminHashPattern.test(value)) throw new Error('ADMIN_HASH must be 64 lowercase hex characters (SHA-256 of the admin email)');
  return value;
}

// Decided on the server only. The admin's email hash matches ADMIN_HASH, or the user id is listed in HR_ADMIN_PUBLIC_IDS.
export function isPublicAdmin(user: { id: string; email_sha256?: string | null }, env: NodeJS.ProcessEnv = process.env) {
  const adminHash = adminHashFromEnv(env);
  if (adminHash && user.email_sha256 === adminHash) return true;
  return reviewerIds(env).includes(user.id);
}
