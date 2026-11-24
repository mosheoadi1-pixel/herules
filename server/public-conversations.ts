import type { Pool } from 'pg';
import { roomBody } from './public-room.ts';

export const CONVERSATION_MESSAGES_PER_TEN_MINUTES = 20;
export const CONVERSATION_PAGE_MAX = 200;
export const CONVERSATION_COOLDOWN = '30 days';
export const conversationBody = roomBody;

export const conversationRowSql = 'SELECT c.id, c.dom_id, c.sub_id, c.state, c.created_at, c.decided_at, c.closed_at, c.cooldown_until, d.nickname AS dom_nickname, s.nickname AS sub_nickname FROM conversations c JOIN public_users d ON d.id=c.dom_id JOIN public_users s ON s.id=c.sub_id';
export const conversationMessageSql = 'SELECT m.id, m.seq, m.conversation_id, m.author_id, m.body, m.removed_at, m.created_at, a.nickname AS author_nickname FROM conversation_messages m JOIN public_users a ON a.id=m.author_id';

export const participantOf = (row: { dom_id: string; sub_id: string }, viewerId: string) => row.dom_id === viewerId || row.sub_id === viewerId;
export const otherOf = (row: { dom_id: string; sub_id: string }, viewerId: string) => (row.dom_id === viewerId ? row.sub_id : row.dom_id);

// The other side appears by nickname only. Requests show the dom the sub's nickname and the sub the dom's.
export const conversationView = (row: any, viewerId: string) => {
  const dom = row.dom_id === viewerId;
  const state = row.state as string;
  return {
    id: row.id as string,
    state,
    role: dom ? 'dom' : 'sub',
    otherNickname: (dom ? row.sub_nickname : row.dom_nickname) as string,
    createdAt: row.created_at as Date,
    decidedAt: (row.decided_at ?? null) as Date | null,
    closedAt: (row.closed_at ?? null) as Date | null,
    cooldownUntil: (row.cooldown_until ?? null) as Date | null,
    lastMessageAt: (row.last_message_at ?? null) as Date | null,
    canMessage: state === 'accepted',
    canAnswer: !dom && state === 'requested',
    canClose: state === 'requested' || state === 'accepted',
  };
};

// A removed message keeps its place in the conversation, with no body.
export const conversationMessageView = (row: any, viewerId: string) => ({
  id: row.id as string,
  seq: Number(row.seq),
  conversationId: row.conversation_id as string,
  nickname: row.author_nickname as string,
  mine: row.author_id === viewerId,
  body: row.removed_at ? null : row.body as string,
  removed: row.removed_at !== null,
  createdAt: row.created_at as Date,
});

// Only currently verified participants with no block may see a conversation.
export async function visibleConversation(db: Pick<Pool, 'query'>, id: string, viewerId: string, hidden: Set<string>, lock = false) {
  const row = (await db.query(`${conversationRowSql} WHERE c.id=$1 AND d.verified_at IS NOT NULL AND s.verified_at IS NOT NULL${lock ? ' FOR UPDATE OF c FOR SHARE OF d,s' : ''}`, [id])).rows[0];
  if (!row || !participantOf(row, viewerId) || hidden.has(otherOf(row, viewerId))) return undefined;
  return row;
}
