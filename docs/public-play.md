# Public paired play

An accepted invitation opens exactly one session immediately. The agreed time
(the counter time when applicable) appears in the session but is not a start
gate. Neither person is navigated into play automatically. Use **Open session**
on its invitation, or **My play sessions** in the messaging inbox to return
later, including after the chat closes.

Only the two currently verified participants in the original conversation can
read or change play. A block hides it both ways and prevents actions; unblocking
restores visibility without resetting the session. Cancelling the plan, closing
its chat, or stopping play makes it permanently read-only. Neither a stop nor a
block reverses already earned points. Play uses scoped polling while its pane
is open and visible, and does not put gameplay payloads on the room feed.

| State | Actions |
| --- | --- |
| No active mission | Dom assigns |
| Waiting for acceptance | Sub accepts or declines |
| Accepted | Sub marks complete or declines |
| Waiting for review | Dom approves or returns with a reason; Sub may still decline |
| Returned for revision | Sub marks complete again or declines |
| Approved / declined | Terminal; Dom may assign another mission |

Either participant can stop open play. Approval is explicit and awards the
mission's points exactly once to the **sub who completed it**. The personal
total spans all that account's sessions and partners and is visible only to
that account. The dom does not get a parallel tally. No points are spent.

There is one active mission at a time and a 100-mission lifetime cap per session.
Titles are 1–160 Unicode code points, instructions 1–4,000, and return reasons
1–1,000, after trimming. Points are integers from 0 through 100. The inbox uses
20-session keyset pages. No private-game data or mission library is copied.

The migration backfills only currently accepted invitations, using their existing
conversation membership. Acceptance creates the play row in the same transaction
as the plan transition. Gameplay mutations share the messaging lock with block,
chat close, and plan changes. They use public actor-scoped UUID retry keys;
mission versions reject stale reviews or completions even after resubmission.
