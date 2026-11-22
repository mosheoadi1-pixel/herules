import type { Pool } from 'pg';
import { z } from 'zod';

export const ROOM_BODY_MAX = 1000;
export const ROOM_POSTS_PER_TEN_MINUTES = 20;
export const ROOM_PAGE_MAX = 100;

// Code points, not UTF-16 units, so Hebrew and emoji count as one character each. The database check uses char_length, which agrees.
export const roomBody = z.string().trim().min(1).refine(value => [...value].length <= ROOM_BODY_MAX);

export const roomMessageSql = 'SELECT m.id, m.seq, m.author_id, m.target_id, m.body, m.removed_at, m.created_at, a.nickname AS author_nickname, t.nickname AS target_nickname FROM room_messages m JOIN public_users a ON a.id=m.author_id LEFT JOIN public_users t ON t.id=m.target_id';

// A removed message keeps its place in the room, with no body.
export const roomView = (row: any) => ({
  id: row.id as string,
  seq: Number(row.seq),
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

export const roomHidden = (row: { author_id: string; target_id: string | null }, hidden: Set<string>) => hidden.has(row.author_id) || (row.target_id !== null && hidden.has(row.target_id));
