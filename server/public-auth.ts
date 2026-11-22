import { createHash, randomBytes } from 'node:crypto';

export type PublicProvider = 'google' | 'apple';
export type PublicIdentityProvider = {
  name: PublicProvider;
  authorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchange(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<{ subject: string }>;
};

const base64url = (value: Buffer) => value.toString('base64url');
export const randomKey = () => base64url(randomBytes(32));
export function pkcePair() {
  const verifier = randomKey();
  return { verifier, challenge: base64url(createHash('sha256').update(verifier).digest()) };
}
