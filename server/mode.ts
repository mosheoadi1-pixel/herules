export type HrMode = 'private' | 'public';

export function hrMode(env: NodeJS.ProcessEnv = process.env): HrMode {
  const value = env.HR_MODE || 'private';
  if (value === 'private' || value === 'public') return value;
  throw new Error('HR_MODE must be "private" or "public"');
}
