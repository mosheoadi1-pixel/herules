import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).refine(value => !value.includes('\0') && [...value].length <= max);
export const sessionStart = z.iso.datetime({ offset: true }).transform(value => new Date(value)).refine(value => Number.isFinite(value.getTime()));
export const sessionProposal = z.object({ title: text(120), details: text(1000), startsAt: sessionStart, idempotencyKey: z.uuid().optional() });
export const sessionAction = z.enum(['accept', 'decline', 'counter', 'withdraw', 'cancel']);
export const validSessionStart = (value: Date, now = Date.now()) => value.getTime() > now && value.getTime() <= now + 90 * 24 * 60 * 60 * 1000;

// The conversation participants determine the roles, not the caller's payload.
const transitions = {
  requested: { dom: { withdraw: 'withdrawn' }, sub: { accept: 'accepted', decline: 'declined', counter: 'countered' } },
  countered: { dom: { accept: 'accepted', decline: 'declined', withdraw: 'withdrawn' }, sub: {} },
  accepted: { dom: { cancel: 'cancelled' }, sub: { cancel: 'cancelled' } },
} as const;
type Action = z.infer<typeof sessionAction>;
type State = keyof typeof transitions | 'declined' | 'withdrawn' | 'cancelled';
export function sessionTransition(state: State, role: 'dom' | 'sub', action: Action) {
  const allowed: Partial<Record<Action, State>> = state in transitions ? transitions[state as keyof typeof transitions][role] : {};
  return allowed[action];
}
export function sessionActionExists(state: State, action: Action) {
  return !!(sessionTransition(state, 'dom', action) ?? sessionTransition(state, 'sub', action));
}

export const sessionView = (row: any) => ({
  id: row.id as string,
  conversationId: row.conversation_id as string,
  title: row.title as string,
  details: row.details as string,
  startsAt: row.starts_at as Date,
  counterStartsAt: row.counter_starts_at as Date | null,
  state: row.state as State,
  createdAt: row.created_at as Date,
  updatedAt: row.updated_at as Date,
});

// Shared visibility for history and feed. Closed conversations retain history, while blocks hide it.
// The SQL is used with conversations aliased to c and the viewer bound as $2.
export const sessionVisibleSql = `($2 IN (c.dom_id,c.sub_id))
  AND EXISTS (SELECT 1 FROM public_users WHERE id=c.dom_id AND verified_at IS NOT NULL)
  AND EXISTS (SELECT 1 FROM public_users WHERE id=c.sub_id AND verified_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM room_blocks
    WHERE (blocker_id=c.dom_id AND blocked_id=c.sub_id) OR (blocker_id=c.sub_id AND blocked_id=c.dom_id))`;
