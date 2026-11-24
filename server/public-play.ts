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

export type PlayMissionState = 'assigned'|'accepted'|'submitted'|'returned'|'approved'|'declined';

export const playFrom = `FROM public_play_sessions p JOIN public_session_requests r ON r.id=p.request_id
  JOIN conversations c ON c.id=r.conversation_id JOIN public_users d ON d.id=c.dom_id JOIN public_users s ON s.id=c.sub_id`;
// Use the columns actually locked by FOR SHARE so PostgreSQL rechecks
// verification when waiting behind a concurrent account update.
export const playVisibleSql = `${sessionMembershipSql} AND d.verified_at IS NOT NULL AND s.verified_at IS NOT NULL`;
export const playSelect = `SELECT p.request_id,p.stopped_at,r.title,r.details,g.data->>'status' AS game_state,
  CASE WHEN g.data IS NULL THEN NULL WHEN NOT (g.data->>'started')::boolean THEN 'waiting'
    WHEN jsonb_array_length(g.data->'pauses')>0 THEN 'paused' ELSE 'active' END AS availability,
  to_char(p.opened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS opened_cursor,
  COALESCE(r.counter_starts_at,r.starts_at) AS scheduled_at,r.state AS plan_state,
  c.state AS chat_state,c.dom_id,c.sub_id,d.nickname AS dom_nickname,s.nickname AS sub_nickname ${playFrom}
  LEFT JOIN public_game_sessions g ON g.id=p.request_id`;
export const playView = (row: any, viewerId: string) => ({
  id: row.request_id as string,
  title: row.title as string,
  scheduledAt: row.scheduled_at as Date,
  role: (row.dom_id === viewerId ? 'dom' : 'sub') as 'dom' | 'sub',
  partner: (row.dom_id === viewerId ? row.sub_nickname : row.dom_nickname) as string,
  ...(row.availability ? {availability:row.availability as 'waiting'|'paused'|'active'} : {}),
  state: (row.plan_state !== 'accepted' ? 'cancelled' : row.stopped_at ? 'stopped' : row.chat_state !== 'accepted' ? 'closed' : row.game_state === 'expired' ? 'expired' : 'open') as
    'cancelled' | 'stopped' | 'closed' | 'expired' | 'open',
});
export const missionView = (row: any) => ({
  id: row.id as string, title: row.title as string, instructions: row.instructions as string, points: row.points as number,
  state: row.state as PlayMissionState, version: row.version as number, returnReason: row.return_reason as string | null,
});

// API contract for paired gameplay. Bootstrap/login, private admin/import, and
// arbitrary singleton operations are not delegated to the game engine.
export const pairedGameOps = z.enum([
  'agreement-propose','agreement-accept','agreement-withdraw','reflection','pause','resume','stop',
  'pin','unpin','aftercare','read','checkin','message','propose','proposal-decide','rate',
  'note-save','note-delete','pace','evening-close','evening-save','evening-delete','tribute-queue',
  'tribute-reveal','sip','grant','seal','chamberlain-decree','chamberlain-compose','auction','auction-bid',
  'persona','followup','reward','reward-request','reward-decision','sequence','mission','quick','her-night',
  'evening-run','wish-add','wish-remove','wish-price','wish-request','wish-decision','command-save',
  'command-delete','whisper','whisper-delete','spark-reroll','spark-dismiss','season-start','season-stop',
  'edit','queue','deliver','cancel','ack','refuse','complete','review','adjust','replace','reveal',
  'repeat-stop','adore',
]);
export const pairedGameBody = z.strictObject({
  key:z.uuid(),revision:z.number().int().positive(),body:z.record(z.string(),z.unknown()),
}).refine(input=>!/(?<!\\)(?:\\\\)*\\u0000/.test(JSON.stringify(input)));
export const pairedAgreement = z.strictObject({
  revision:z.number().int().positive(),
  terms:text(4000),
  minutes:z.number().int().min(1).max(525600).nullable(),
});
export const pairedAgreementVersion = pairedAgreement.pick({revision:true});
