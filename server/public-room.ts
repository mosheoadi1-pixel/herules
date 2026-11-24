import type { Pool } from 'pg';
import { z } from 'zod';

export const ROOM_BODY_MAX = 1000;
export const ROOM_POSTS_PER_TEN_MINUTES = 20;
export const ROOM_PAGE_MAX = 100;
export const MAIN_ROOM = 'main';
export const roomId = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const messagingNickname = z.string().trim().min(1).max(20);

// Code points, not UTF-16 units, so Hebrew and emoji count as one character each. The database check uses char_length, which agrees.
export const roomBody = z.string().trim().min(1).refine(value => [...value].length <= ROOM_BODY_MAX);

export const roomMessageSql = 'SELECT m.id, m.seq, m.room_id, m.author_id, m.target_id, m.body, m.removed_at, m.created_at, a.nickname AS author_nickname, t.nickname AS target_nickname FROM room_messages m JOIN public_users a ON a.id=m.author_id LEFT JOIN public_users t ON t.id=m.target_id';

// A removed message keeps its place in the room, with no body.
export const roomView = (row: any) => ({
  id: row.id as string,
  seq: Number(row.seq),
  roomId: row.room_id as string,
  authorId: row.author_id as string,
  nickname: row.author_nickname as string,
  targetId: (row.target_id ?? null) as string | null,
  targetNickname: (row.target_nickname ?? null) as string | null,
  body: row.removed_at ? null : row.body as string,
  removed: row.removed_at !== null,
  createdAt: row.created_at as Date,
});

// Users a viewer has blocked or who have blocked the viewer. Blocks hide in both directions.
export async function roomHiddenIds(pool: Pick<Pool, 'query'>, viewerId: string) {
  const rows = (await pool.query('SELECT CASE WHEN blocker_id=$1 THEN blocked_id ELSE blocker_id END AS other FROM room_blocks WHERE blocker_id=$1 OR blocked_id=$1', [viewerId])).rows;
  return new Set<string>(rows.map(row => row.other as string));
}

// Call these queries with $1 = viewer. A new verification period does not
// revive grants from the old period; blocks additionally delete the pair's grants.
export const messagingVisible = (other: string) => `NOT EXISTS (
  SELECT 1 FROM room_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=${other}) OR (b.blocked_id=$1 AND b.blocker_id=${other})
)`;
export const activeRoomGrant = `d.role='dom' AND d.verified_at=g.grantor_verified_at`;

export async function refreshMessaging(db: Pick<Pool, 'query'>, ...ids: string[]) {
  await db.query(`INSERT INTO public_messaging_refresh(viewer_id)
    SELECT DISTINCT id FROM unnest($1::uuid[]) AS viewers(id)
    ON CONFLICT(viewer_id) DO UPDATE SET seq=EXCLUDED.seq`, [ids]);
}
