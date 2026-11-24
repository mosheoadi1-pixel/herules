import { z } from 'zod';
import { sessionMembershipSql } from './public-sessions.ts';

const text = (max: number) => z.string().trim().min(1).refine(value => !value.includes('\0') && [...value].length <= max);
const key = { idempotencyKey: z.uuid() };
const mission = { missionId: z.uuid(), version: z.number().int().min(0).max(2147483646), ...key };
export const playAction = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('assign'), title: text(160), instructions: text(4000), points: z.number().int().min(0).max(100), ...key }),
  z.strictObject({ action: z.literal('stop'), ...key }),
  z.strictObject({ action: z.literal('return'), ...mission, reason: text(1000) }),
  z.strictObject({ action: z.enum(['accept','decline','complete','approve']), ...mission }),
]);
export const PLAY_MISSION_LIMIT = 100;
export const PLAY_PAGE_SIZE = 20;

const transitions = {
  assigned: { sub: { accept: 'accepted', decline: 'declined' }, dom: {} },
  accepted: { sub: { complete: 'submitted', decline: 'declined' }, dom: {} },
  submitted: { sub: { decline: 'declined' }, dom: { approve: 'approved', return: 'returned' } },
  returned: { sub: { complete: 'submitted', decline: 'declined' }, dom: {} },
  approved: { sub: {}, dom: {} },
  declined: { sub: {}, dom: {} },
} as const;
export type PlayMissionState = keyof typeof transitions;
type MissionAction = Exclude<z.infer<typeof playAction>['action'], 'assign' | 'stop'>;
export function missionTransition(state: PlayMissionState, role: 'dom' | 'sub', action: MissionAction) {
  const allowed: Partial<Record<MissionAction, PlayMissionState>> = transitions[state][role];
  return allowed[action];
}

export const playFrom = `FROM public_play_sessions p JOIN public_session_requests r ON r.id=p.request_id
  JOIN conversations c ON c.id=r.conversation_id JOIN public_users d ON d.id=c.dom_id JOIN public_users s ON s.id=c.sub_id`;
// Use the columns actually locked by FOR SHARE so PostgreSQL rechecks
// verification when waiting behind a concurrent account update.
export const playVisibleSql = `${sessionMembershipSql} AND d.verified_at IS NOT NULL AND s.verified_at IS NOT NULL`;
export const playSelect = `SELECT p.request_id,p.stopped_at,r.title,
  to_char(p.opened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS opened_cursor,
  COALESCE(r.counter_starts_at,r.starts_at) AS scheduled_at,r.state AS plan_state,
  c.state AS chat_state,c.dom_id,c.sub_id,d.nickname AS dom_nickname,s.nickname AS sub_nickname ${playFrom}`;
export const playView = (row: any, viewerId: string) => ({
  id: row.request_id as string,
  title: row.title as string,
  scheduledAt: row.scheduled_at as Date,
  role: (row.dom_id === viewerId ? 'dom' : 'sub') as 'dom' | 'sub',
  partner: (row.dom_id === viewerId ? row.sub_nickname : row.dom_nickname) as string,
  state: (row.plan_state !== 'accepted' ? 'cancelled' : row.stopped_at ? 'stopped' : row.chat_state !== 'accepted' ? 'closed' : 'open') as
    'cancelled' | 'stopped' | 'closed' | 'open',
});
export const missionView = (row: any) => ({
  id: row.id as string, title: row.title as string, instructions: row.instructions as string, points: row.points as number,
  state: row.state as PlayMissionState, version: row.version as number, returnReason: row.return_reason as string | null,
});
