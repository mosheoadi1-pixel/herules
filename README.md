# HER RULES — remote foundation

A Hebrew-first/RTL React + TypeScript app with a single same-origin TypeScript server and **actual PostgreSQL**. One private game, exactly two player identities: choose wife or husband and enter. Repeated entry from any browser reuses that role's identity. Each adult independently approves exact agreement revisions and acknowledges optional missions. The original browser-only prototype is preserved at [`legacy/`](legacy/README.md).

## Local run (Windows, system Node 26)

From `D:\her rules`, use the installed system Node (**v26.13.0** verified). In PowerShell use **`npm.cmd`**, because `npm.ps1` is blocked by execution policy; no policy change is needed:

```powershell
node --version
npm.cmd ci
npm.cmd run db:start
```

Leave that database terminal running. In a second terminal:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:local-dev-only@127.0.0.1:55432/postgres'
$env:APP_ORIGIN = 'http://localhost:3000'
npm.cmd run dev
```

Open **http://localhost:3000** in two separate browser profiles or devices. Select wife in one, husband in the other, then self-attest adulthood. Both identities are already paired. Create a session, open Agreement in each browser and independently approve. The wife can draft/send/schedule; the husband acknowledges before simple or written completion; the wife reviews for a single point award.

Login cookies expire after seven days. Signing out, clearing cookies, or changing browsers is fine: choose the same role again. Anyone who can reach the app can enter either role; keep its address privately reachable.

Surprise-invitation redaction applies only to responses for the husband role. It does not protect a surprise from anyone who can reach the app and enter the wife role, which can see the full draft and invitation.

`.env.example` lists environment values, but files are **not automatically loaded**. `DATABASE_URL` is required. `APP_ORIGIN` is the canonical address; additional IP/domain addresses work automatically when the browser sends requests back to the same address serving the game.

**Startup does not reset gameplay by default.** Set `HR_RESET_GAME_ON_START=1` to reset on startup (development and test only; never set it in production). When enabled, startup clears gameplay (including adjustment requests and linked replacements), messages, points, approvals and login cookies, and creates the two paired identities. Imported ideas remain in the database, and the **513 tasks from `custom-tasks-template.csv`** are added if missing. The 42 built-in suggestions also remain available. Reset and seed run in one transaction before accepting requests; a seed failure rolls back the reset and prevents startup. Deploy the CSV with the application. Imported ideas persist when the server reconnects to the same persistent PostgreSQL database; moving to a different database requires copying the ideas or importing the CSV there. No active gameplay session is created automatically.

Database process startup/shutdown details: [docs/DB-SETUP.md](docs/DB-SETUP.md). Older architecture and migration documents describe the previous persistent-account behavior; this startup-reset behavior supersedes it.

### Origin rejected / כתובת משחק לא תואמת

The server accepts same-origin requests through **any address serving the game**, including localhost, 127.0.0.1, LAN IPs and domains, without adding each address to a list. Unrelated websites, missing/null origins and mismatched ports remain rejected. `APP_ORIGIN` also remains an explicitly trusted canonical origin. Development Vite host filtering permits these aliases. Restart `npm.cmd run dev` after updating the backend. For another device use the PC's reachable LAN address and app port; localhost on a phone refers to the phone. Firewalls/routing must permit access. Production aliases require HTTPS; configure `TRUST_PROXY` only for a trusted TLS proxy so Express can determine the actual external host/protocol. Cookies are per host: switching addresses does not transfer guest identity.

## Import ideas from CSV

From PowerShell in the project directory, with the database running:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:local-dev-only@127.0.0.1:55432/postgres'
npm.cmd run import:ideas -- "D:\path\ideas.csv"
```

Save the CSV as UTF-8 (an Excel UTF-8 BOM is supported), with this exact header:

The additional categories `teasing`, `cleaning`, `cooking`, `worship`, `devotion`, `training`, `dresscode`, `public`, and `denial` are also supported in CSV imports and library filters. Existing database category constraints are upgraded automatically on import or application startup.

```csv
category,he,en,minutes,intensity,tags
challenges,שיחה משותפת,A conversation together,5,2,conversation|home
```

Categories: `challenges`, `timed`, `rewards`, `consequences`, `roleplay`, `anticipation`, `random`, `secret`, `teasing`, `cleaning`, `cooking`, `worship`, `devotion`, `training`, `dresscode`, `public`, `denial`. Minutes must be an integer from 1 to 525600; intensity must be a positive integer, with values above 3 automatically converted to 3 (Bold) before storage and duplicate checking. Both language texts are required (maximum 4000 characters). Separate tags with `|`; tags may be empty. Quote fields containing commas, double quotes, or newlines; escape an embedded quote as `""`.

The importer validates the entire file before inserting and rolls back on database errors. Identical normalized imported rows are skipped on reimport; editing any field creates a new idea. A row whose Hebrew or English text matches a built-in suggestion from `src/library.ts` (trimmed comparison) is also skipped, so imports and the seeded template never duplicate the built-in library. Imported rows are stored in `imported_ideas`, available through the role-authenticated API alongside the built-in library. Refresh the library after importing. Ideas persist across website restarts when the same database is used. There is no browser upload endpoint.

## Implemented

- The optional idea wheel draws from all consequence ideas, independently of library filters, and displays the result in a dialog for review or editing. It does not send a mission automatically.
- On supported browsers, each player can enable notifications using the account control. When the game tab is open but hidden, new partner or server updates produce a generic notification without sensitive content. This is not web push: a closed tab cannot receive notifications. Browser permission and a secure context (HTTPS or localhost) are required.

- Each session has a reward shop. The wife defines a title, description and nonnegative integer cost; the husband requests a snapshot of a reward. The wife can decline without a charge or approve if the current available balance is sufficient. Requests do not reserve points. Approval is an in-game decision and does not obligate real-world activity.
- The Rewards tab shows available points, requests and the number of unique approved missions towards five. At five, the wife can open the ordinary mission composer for an optional bonus; no invitation is created or delivered automatically. Progress remains visible during holds and in archived sessions.
- Salted scrypt passwords; hashed opaque seven-day HttpOnly cookie sessions; logout revocation; exact-Origin mutation checks; PostgreSQL-backed attempt limits.
- One private game with two reusable role identities. Row-locked entry reuses the same identity even for concurrent/repeated logins. No login attempt limit applies to role entry. Invitation screens and API endpoints were removed.
- Versioned, immutable agreement history and unique per-user approvals. Changed terms suspend gameplay and cancel unfinished missions until two fresh approvals.
- Independent pauses, owner-only release, irreversible stop and terminal expiry. Safety controls use an independent request path, available during a pending ordinary request. Requests time out after 15 seconds; a subsequent state read cannot establish whether a timed-out request will still commit later. The UI keeps an unknown-outcome warning and blocks ordinary actions until the user explicitly acknowledges the risk; safety remains available. The warning survives reload in the same tab when session storage is available. Retry keys are held in memory, so a same-payload keyed retry uses the same key only while the page remains open; after reload or in another tab it may use a new key. Server clock counts only active time across the union of all suspensions.
- Wife-owned draft editing, explicit sending, cancellation and scheduling; acknowledgement, penalty-free refusal, simple or written completion, return for revision and one-time review/points. Delivered terms cannot be edited.
- Adjustable invitations: the husband may request a softer version or another adjustment on a pending, acknowledged or returned invitation, with an optional note. Completion waits in `adjustment`; the wife can author a linked replacement draft. Only successful replacement creation cancels the original, retaining its delivered terms and prior work. Replacement needs separate delivery and fresh acknowledgement. Decline requires no explanation, including while waiting for adjustment.
- UUID retry keys for mission creation, messages, adjustment, replacement, completion and review. Completion uses an expected submission version; reviews bind to the exact submission version. Duplicate adjustment/replacement/completion/review UUIDs transactionally return their original stored results even after newer work or stop, without changing that work. Secret drafts are excluded from husband responses until delivery; existing nonsecret draft visibility is unchanged. History/inbox use generic metadata.
- Persisted text, inbox/read state and history; messages work before agreement approval, during agreement review and during either/both personal pauses. Messages never approve terms, release pauses or resume gameplay; no sending after stop/expiry. Content-free pair-authenticated SSE plus five-second authorized polling, including scheduling/reconnect fallback.
- **42 built-in bilingual suggestions plus 513 seeded custom tasks**. CSV metadata is validated on startup; intensity above 3 is normalized to 3. Duration/intensity/activity filters, favorites, last-ten avoidance and editable dice suggestions remain available.
- Responsive burgundy/black/gold interface, Hebrew default/RTL and English/LTR, status/error announcements and keyboard focus styles.
- Root PWA worker replacement/old-cache cleanup, SVG icons and manifest. Navigation is network-first with a nonsensitive offline notice; no authenticated response is cached and `/api` is never intercepted.

### Rewards operation contract

Each operation is `POST /api/sessions/:id/:op` and accepts a retry `key` UUID. `reward` (wife) takes `{ key, title, description, cost }`, with trimmed nonempty title (maximum 160), description (maximum 4000) and a nonnegative safe integer cost. `reward-request` (husband) takes `{ key, reward: UUID }`; it snapshots the reward title, description and cost into a pending request. `reward-decision` (wife) takes `{ key, request: UUID, approve: boolean }`. A new operation requires current mutual approval, no pause, and a nonterminal session. A committed retry returns its original result even during a hold or after ending; fresh attempts against decided requests fail. Insufficient balance returns 409 and leaves the request pending. Session-row locking makes balance checking, deduction, decision, generic history/inbox notice and retry storage atomic. Old sessions without the optional arrays load as empty; new sessions start with no shop data. Existing startup reset clears them with session data and preserves imported ideas.

Progress is derived from distinct approved mission IDs rather than stored as a separate counter. Refusal and holds do not reduce it; ordinary mission controls still require fresh agreement and acknowledgement. Rewards and requests remain viewable in the selected archive.

### Cycle 1 operation contract

Both operations are `POST /api/sessions/:id/:op`, require the current agreement revision, mutual approvals and no pauses for a **new** request, and return `{ mission: Mission }`:

| Operation | Role | JSON body |
| --- | --- | --- |
| `adjust` | husband | `{ key: UUID, mission: UUID, reason: "softer" \| "adjust", note?: string }` |
| `replace` | wife | `{ key: UUID, mission: UUID, title: string, text: string, points?: integer, secret?: boolean }` |

`note` is trimmed, at most 4000 characters; absent/blank notes are omitted from storage. Replacement uses the same draft schema as mission creation: trimmed title 1–160 characters, trimmed text 1–4000, points 0–100 (default 0), secret default false. The UI prefills the original values for editing. For `adjust`, `mission` must be pending, acknowledged or revision. Only `replace` requires the original mission to be in `adjustment` and not already replaced. Fields from the client such as status, links, acknowledgement and submission version are not copied into a replacement.

Optional `Mission` fields (old session JSON needs no migration): `adjustment: { reason: "softer" | "adjust", note?: string, at: number }` (server epoch milliseconds), `replacementId: UUID` on the cancelled original, `replaces: UUID` on the new draft. Adjustment metadata remains available on the original after replacement/refusal/cancellation. `adjustment` is a waiting state, never eligible for completion or review. Agreement revision and permanent stop still cancel unfinished invitations.

Keys are scoped by session/user/operation. Reuse a key only to retry the same intent: a committed retry returns its original result, even during a hold or after terminal state, without applying it again. A fresh-key second adjustment/replacement is rejected by the mission state; concurrent replacements create at most one draft. Original cancellation, replacement, links, history and retry result commit or roll back together under the session row lock. New messages retain their existing `{ key: UUID, text: string }` contract and reject terminal sessions, including retries after terminal state.

### Cycle 2 check-in contract

`POST /api/sessions/:id/checkin` accepts `{ minutes: integer 1–1440, energy: "low" | "medium" | "high", mood: "connection" | "playful" | "quiet" }` and returns `{ ok: true }`. The row-locked update replaces only `Session.checkIns[authenticatedUser.id]`; supplied identity/map fields are ignored. Both participants see the optional map in session/state responses. Old sessions need no migration. Invalid input is 400; stopped/expired sessions reject updates with 409. Holds and missing agreement approvals do not block check-ins. Check-ins never approve agreements, release pauses, accept invitations or award points, and are never required to play. Reposting replaces the own entry; no retry UUID is needed.

The bilingual form defaults to 15 minutes, medium energy and connection without saving automatically. It reloads own saved values on session/identity or saved-value changes; partner updates do not overwrite own edits. Both summaries remain visible in the archive, with editing disabled. Check-ins share the existing startup-reset lifecycle.

### Cycle 3 guided session contract

`POST /api/sessions/:id/sequence` accepts `{ missions: UUID[], autoProgress?: boolean }` (0–3 distinct existing mission IDs in the selected session) and returns `{ ok: true }`. The optional setting defaults to false when omitted, including on legacy sessions. Only the wife may update it, with mutual current agreement approvals, no personal pauses and a nonterminal session. The session row lock protects validation and replacement; no SQL migration is required. Invalid arrays/UUIDs/duplicates or non-boolean settings are 400, missing mission IDs 404, wrong role 403 during play, holds/terminal 409. `[]` clears the selection. Like check-ins, this is a replaceable setting without a retry UUID; reposting may add a generic notice. Husband responses filter sequence IDs through mission visibility so secret undelivered IDs are not exposed.

Guidance chooses the first visible unfinished current-revision mission in the selected order. Otherwise it prioritizes role-actionable invitations (wife: review, adjustment, draft; husband: acknowledgement, completion/returned work), retaining existing order within each state, then a waiting invitation. Final/stale cards remain reachable in collapsible cards. If the wife opts in, approval of a selected mission delivers its immediately following selected mission only when that mission is a current-revision draft; no entry is skipped. The approval, delivery, notice, award and retry record commit together under the session row lock. Refusal, return for revision, pauses, stale agreements, stop, expiry and committed review retries do not progress the sequence. A delivered surprise still requires an explicit reveal, and every invitation still requires explicit acknowledgement. Without opt-in the sequence is presentation only. Replacement IDs are not silently substituted into a chosen sequence; they remain ordinary new drafts available through the existing cards/selector. Existing scheduled delivery rules remain unchanged.

One current invitation renders its action forms once. Bilingual next-step guidance explains agreement, personal/partner pauses, partner waiting and terminal state, with direct focused agreement navigation. After entry the repeated hero is collapsed; the composer is collapsed initially and after save, and opens for editing/library choices with existing draft values intact. Other and archived cards remain reachable; check-ins follow the invitation area and do not determine guidance or eligibility. The sequence shares the existing startup-reset lifecycle.

### Cycle 4 completion and reflection contracts

`Mission.completionStyle?: "simple" | "written"` is optional for old JSON: **missing means written**. New `mission` and `replace` requests accept the enum and default to **simple**; invalid values return 400. `edit` accepts the same enum only on a draft, preserving the existing style if omitted. Delivered/queued terms cannot be edited; the wife selects the style in the bilingual draft or replacement form before delivery. Replacements are new drafts with their own choice, never inherited acceptance or work.

`POST /api/sessions/:id/complete` retains `{ key: UUID, mission: UUID, expectedVersion: integer }`. Optional `text` is trimmed/max 4000; simple permits omitted/empty/whitespace text, stored as `""`. Written and missing-style legacy missions require nonempty trimmed text. Both need explicit acknowledgement (or returned work), mutual current approvals and no pauses; neither bypasses wife review. Response remains `{ mission: UUID, submissionVersion, completion, status: "submitted" }`. `review` still binds to `submissionVersion`, and committed keyed retries return their original snapshot after later work, holds or stop. Distinct-key stale submissions/reviews fail; awards remain one-time. The simple UI uses **Done**, while written retains the report-and-review form. Stable mission DOM preserves genuinely unsaved reports across focus changes.

`POST /api/sessions/:id/reflection` accepts `{ appreciation?: string, repeat?: string }`, trims both (default `""`), max **1000 each**, at least one nonempty; invalid input is 400. Returns `{ ok: true }`. Under the existing authenticated pair/session row lock it upserts only `Session.reflections[authenticatedUser.id]`; supplied identity/map fields are ignored. Both users see the optional map in session/state responses. No migration or retry UUID: same-value retries do not duplicate entries or notices. Changed values replace the own entry and add only generic reflection history/inbox metadata.

Reflection is optional before approval, during either/both pauses or agreement review, and after permanent stop/expiry. It does not advance/reset the clock or trigger scheduled delivery, alter approvals/pauses/status/missions/points, or resume gameplay. Ordinary authorized reads still perform existing clock advancement. The bilingual closing section remains editable after ending and appears before the new-session form. Appreciation is never compulsory or tied to points. Partner refreshes preserve unsaved own reflection fields. New sessions do not inherit reflections; startup reset clears these fields with all other session data.

### Cycle 5 practical polish

The active invitation comes before optional check-in editing and reflection in reading/keyboard order. Reflection follows session content rather than pushing the invitation down the page; saved answers identify **Appreciation** and **Next time** separately. Explicit textarea labels retain clear accessible names after typing. After stop/expiry, next-step guidance offers **Reflect on this session** and **Start another session** buttons that focus the actual forms. A new session still requires fresh independent approvals; neither navigation action resumes play.

The browser suite checks genuinely unsaved reflection edits in **both languages** during changed partner reflections, with an independent API read proving own saved values stay unchanged. It also verifies saved reflection restoration when selecting an archive and blank fields on returning to the new session. Existing unsaved written-report retention across current/other/current invitation focus remains covered. At **320/390/768px**, Hebrew RTL and English LTR checks include closing reflection/new-session layouts, check-in controls, and keyboard-activated end-state focus actions. Unsaved reflection edits are not persisted across reload or session changes; save before leaving a session.

### Recurring missions contract

`POST /api/sessions/:id/queue` accepts `{ mission: UUID, scheduledAt: integer, repeat?: "daily" | "weekly" }`. `scheduledAt` stays required; `repeat` is optional and must be one of the two values (otherwise 400). Repeat without a valid schedule is 400, husband calls are 403, and delivered or cancelled missions are 409. Re-queueing an occurrence without `repeat` makes that occurrence a one-off. `quick` accepts the same optional `repeat`, but only together with `scheduledAt` (`Repeat needs a schedule`, 400). `mission`, `edit` and `replace` ignore a `repeat` field; repeat can be set only through `queue` and `quick`.

Chain fields are optional on `Mission`: `repeat`, `repeatOf` (the chain root's id; the root's `repeatOf` is its own id) and `repeatStopped` (root only). The stop flag is stored on the root and is removed from husband responses; `repeat` and `repeatOf` are visible to him like any mission field.

- **Successors.** When a queued repeating occurrence leaves the queue by delivery (automatic in `advance()`, or the wife's `deliver`), the server creates exactly one successor: same title, text, points, secret, surprise, category, completion style and `repeat`, `repeatOf` = root id, `status: "queued"`, `scheduledAt` = previous + 24 hours (daily) or + 7 days (weekly), current `revision`, `createdAt` = now. The successor is created only on that queued-to-delivered transition, so a repeated read never duplicates it. If the computed time is already past (for example after a pause or downtime), it moves forward by whole intervals; missed occurrences are not backfilled. Successors are not capped separately; the one-year cap applies only to the queued root.
- **Single cancel.** `cancel` of a queued occurrence cancels only that occurrence and queues its successor, so the series continues. `cancel` of a delivered occurrence creates nothing. Cancelling an already cancelled occurrence creates nothing.
- **Done for tonight.** `evening-close` cancels queued occurrences and queues their successors in the same way.
- **Replacement.** `replace` does not inherit `repeat`. The series continues through the successor that was already queued when the replaced occurrence was delivered.
- **Revision and stop.** `revise` and session `stop` cancel queued occurrences without creating successors, so the series ends. Start a new series by queueing again.
- **`POST /api/sessions/:id/repeat-stop`** takes `{ key: UUID, mission: UUID }`. Wife only, keyed, not gated by approvals or pauses, so it works during holds. It sets `repeatStopped` on the root, cancels that chain's queued occurrences and returns `{ cancelled: number }`. Delivered occurrences stay as they are, and a stopped chain creates no successors. A retry with the same key returns the original result. Terminal sessions return 409. A mission outside a series returns 409 `Repeating series required`.
- **Redaction and play.** Each occurrence is a normal mission for acknowledgement, adjustment, refusal, completion, review and points. A secret undelivered successor is hidden from the husband, and a surprise successor shows only the surprise placeholder.
- **Limits.** Pace: successors get `createdAt` = now, so while the 12-hour evening window runs they count toward the pace limit for quick commands and nights. A daily chain can therefore use one pace slot per delivery. Chains are not capped in length; each occurrence is one mission record in the session JSON until the series is stopped or the session ends. Startup reset clears chain fields with the session data.

The wife's schedule form has a **Repeat** selector (none, daily, weekly). A repeating occurrence shows **Repeats: Daily/Weekly** (`חוזר: יומי/שבועי`) and a **Stop series** button (`עצירת הסדרה`) until the series is stopped.

### Daily spark contract

The wife gets one **Daily spark**: a compact card at the top of her dashboard with one idea, a one-line reason and three actions. The spark is computed on the server only, inside `GET /api/state` for the wife's role. Each session object carries `spark: { id, category, he, en, minutes, intensity, tags }`, or `null` when the session is terminal or no candidate remains. The husband's state never includes `spark`, `sparkReroll` or `sparkDismissed`, and his dashboard renders no card.

- **Pool.** Built-in library ideas plus `imported_ideas`. The imported rows are cached in memory, keyed by row count and largest id, and reloaded only when that marker changes, so repeated polls do not query the full table. Categories `consequences` and `rewards` are never offered.
- **Ranking.** Each candidate scores one point for an energy match and one for a mood match against the wife's latest own check-in (`checkIns[wife]`). Energy: low matches care, rest, touch-light, touch, conversation; high matches training, worship, dare, playful, performance. Mood: connection matches care, romance, devotion, touch, flirtation; playful matches game, dance, play, teasing, music, random; quiet matches conversation, silence, reading, writing. The best-scoring tier is used when it has at least three candidates, otherwise the top eight by score. Without a check-in every candidate scores zero (neutral pick). Dismissed ideas are excluded.
- **Choice.** Within that pool the index is `(hash of session id + UTC day + reroll offset) mod pool size`, where the offset is the day's reroll count. The same session and UTC day therefore give the same spark until she rerolls, and consecutive rerolls always differ while at least two candidates remain.
- **Day.** `YYYY-MM-DD` in UTC from the server clock. A new UTC day restores the reroll allowance and keeps the dismissed list.
- **`POST /api/sessions/:id/spark-reroll`** takes `{ key: UUID }`. Wife only (husband 403), keyed (a retry with the same key returns the stored response and spends no reroll), not gated by approvals or pauses, and not written to history or the inbox. It increments `sparkReroll` for today and returns `{ spark }`. The eleventh reroll on the same UTC day returns 409 `Spark reroll limit reached for today`. Ten rerolls per day is enough to explore a short pool without making the card a slot machine.
- **`POST /api/sessions/:id/spark-dismiss`** takes `{ key: UUID, id: string (1-120) }`. Wife only, keyed, not gameplay-gated, not written to history. It appends the id to `sparkDismissed` (capped at 30; the oldest entry is dropped) and returns `{ spark }` with the next candidate.
- **Fields.** `sparkDismissed?: string[]` and `sparkReroll?: { day: string; count: number }` live in the session JSON, are wife-only, and are removed for the husband in `visible()`. Startup reset clears both with the session data.
- **Favourites** stay in the existing client-local `hr-favorites` list; no server storage. The spark's favourite toggle writes that same list.
- **Draft.** **Send as draft** prefills the mission composer (title up to 150 characters, the spark text, points 2, secret only for the `secret` category, simple completion) and opens it. It does not send anything. Because saving the composer requires active play, the button is disabled while play is held or the session has ended.
- **Privacy.** The spark is never sent to the husband, and the reason line is built from the wife's own check-in on the client.

### Streaks contract

Two derived streaks appear on every session object in `GET /api/state`, for both roles: `streaks: { devotion: { current, longest, todayDone }, mission: { current, longest, todayDone } }`. They are computed on each response by `devotionStreak` and `missionStreak` in `src/progress.ts` and are never stored in the session JSON.

- **Devotion streak.** Consecutive UTC days on which at least one mission has `status: 'approved'` with an `approvedAt`. The day of each approval is its UTC `YYYY-MM-DD` key (the same `sparkDay` helper as the spark).
- **Mission streak.** Consecutive UTC days on which at least one mission has `deliveredAt` set, whatever its later status. Refused, cancelled and superseded missions count if they were delivered; drafts, queued missions and anything never delivered do not.
- **Current.** The run ending today. If today has no qualifying day yet, the run that ends yesterday still counts, so a streak is not broken until the day is over. `todayDone` is true when today itself has a qualifying day. `longest` is the best run over the session's full history.
- **Basis.** UTC calendar days, not local time. The classic `progressStats.streak` is left unchanged: it uses local-time day keys and bridges one grace day, so its value can differ from the new streaks. The new streaks do not bridge gaps.
- **Visibility.** The husband's counts are computed from `visible(session, husband)`, so undelivered secret and surprise missions contribute nothing. Streaks are not secret: the husband sees the same numbers as the wife.
- **Display.** The stats panel shows two cards, "Devotion streak" / "Mission streak", each with its current run, best run and a "today" line, plus a one-line note that a streak continues until the day ends.

### Adoration contract

After an approved mission the husband can tell the wife how it landed: **Loved it** (`loved`), **Liked it** (`liked`) or **Just ok** (`ok`). This is feedback, not currency.

- **Endpoint.** `POST /api/sessions/:id/adore` with `{ key: UUID, mission: UUID, adoration: 'loved' | 'liked' | 'ok' }`. Husband only; the wife gets 403 `Wrong role for action`. Keyed: a retry with the same key returns the stored response and does not re-apply the change.
- **Allowed.** Only on a mission with `status: 'approved'`. Approval is reachable only through his `complete` followed by the wife's review, so an approved mission always carries his completion. Any other status returns 409 `Approved completion required`.
- **Visibility.** A surprise that has not been revealed, or a secret or surprise mission that has not been delivered, returns 404 `Mission unavailable`, the same answer as an unknown id. An approved mission he completed is always visible to him, so this refusal only applies to a forged or stale id.
- **Holds.** Allowed during pauses and while approvals are pending, like ratings: it is his feedback, not gameplay. Rejected with 409 `Session is terminal` on stopped or expired sessions.
- **Overwrite.** He may change his own feedback any number of times; the latest call wins. Each accepted call sets `adoration` and `adoredAt` on the mission. It never touches `rating` or `ratedAt`, which belong to the wife.
- **Points.** None. `points`, `herPoints` and the award record are unchanged.
- **Notice.** Each accepted call writes one generic `adore` entry to history and inbox containing only `at`, `event` and `by`. It carries no mission id, title, category, points or `missionId`. Keyed retries write nothing new.
- **Queen score.** Wife only, computed on each `GET /api/state` by `queenScore` in `src/progress.ts` and never stored. Each session in the wife's state carries `queenScore: { score, breakdown: { loved, liked, ok, total } }`: `score` is the number of approved missions with `adoration: 'loved'`, and `breakdown` counts the approved missions that have any feedback. Approved missions without feedback are not counted. The husband's state has no `queenScore`.
- **Display.** Husband: three toggle buttons under each approved mission in the Missions tab; the chosen one shows `aria-pressed`. Wife: a "Queen score" card in the dashboard stats area showing the loved count, the breakdown and a one-line note that the score comes only from his feedback.

### Whisper contract

A whisper is a short private suggestion from the husband to the wife. Its text is visible only to her.

- **Send.** `POST /api/sessions/:id/whisper` with `{ key: UUID, text }`. Husband only; the wife gets 403 `Wrong role for action`. `text` is trimmed and must be 1–400 characters. Keyed: a retry with the same key returns the original response and adds neither a whisper nor a count.
- **Response.** Only `{ whisperSent: n }`. The response never echoes the text or the whisper id.
- **Storage.** Two session JSON fields. `whispers?: { id, text, at }[]` is the wife's list, capped at 20; a 21st send returns 409 `Whisper list is full` until she deletes one. `whisperSent?: number` is the total number of whispers the husband has sent in this session. It grows with every accepted whisper and deletions do not reduce it; it is not capped.
- **Delete.** `POST /api/sessions/:id/whisper-delete` with `{ key: UUID, whisper: UUID }`. Wife only, keyed. An unknown id returns 404 `Whisper unavailable`; success returns `{ ok: true }`.
- **Turn into a draft.** Client only, with no request. The wife's panel reads the text from her own state and prefills the mission composer: title = first 60 characters, text = the full whisper, points 2, simple completion, not secret. The composer is opened; nothing is sent until she saves or sends a mission herself.
- **Visibility.** `visible()` removes `whispers` from the husband's view. `whisperSent` is visible to both roles because it is only a count. The wife's state carries the full list.
- **Notices.** An accepted whisper writes one content-free `whisper` history entry (`at`, `event`, `by`) and one inbox row with the same event and no text or whisper id. Deletions and retries write nothing. `whisper-delete` is excluded from the generic notice.
- **Holds and terminal.** Whispers are accepted during pauses and while approvals are pending, like messages; they are not gameplay. Stopped or expired sessions return 409 `Session is terminal` for both send and delete.
- **Reset.** The fields live in the session JSON, so startup reset (`HR_RESET_GAME_ON_START=1`) clears them with the other gameplay data.

### Queen levels contract

Queen levels are a derived title on the wife's side, never stored.

- **Thresholds.** Duchess for 0–9 queen progress points, Queen for 10–24, Empress for 25 and above. `next` is the next threshold (10 for Duchess, 25 for Queen, `null` for Empress) and `toNext` is the number of points still needed (`null` at Empress).
- **Progress.** `queenProgress(missions)` in `src/progress.ts` counts each approved mission once, plus each approved mission with `adoration: 'loved'` once more, using the `queenScore` helper for the loved count. Every mission in a session is wife-authored: only wife-only ops create missions (`mission`, `quick`, `her-night`, and repeats of those), and the husband has no mission-creating op. Drafts, queued, pending, submitted, cancelled and refused missions do not count, and a secret mission counts only after it has been approved, which requires delivery. Duplicate mission ids count once.
- **Visibility.** `GET /api/state` adds `queenLevel` to each session object for the wife only, computed at response time as `queenLevel(queenProgress(missions))`: `{ level: 'duchess'|'queen'|'empress', name: { he, en }, next, toNext, progress }`. The husband's state has no `queenLevel`.
- **Display.** The wife's "Queen score" card shows the level name, a `<progress>` bar toward `next` (or "Highest level reached" at Empress), and a note that levels are cosmetic for now.
- **Cosmetic only.** No feature is gated on the level in this version.
- **Future unlocks.** A later version may gate content or rewards by level; this version does not.

### Season packs contract

A season pack is a fixed, bounded, themed arc of daily missions. Packs are defined in code in `src/seasons.ts`.

- **Packs.** `worship-week` (7 days), `service-weekend` (2 days), `queens-month` (30 days, ten items rotating), `hanukkah` (8 nights). Each pack has an id, a bilingual title and description, a length in days, and an items array. Each item has a bilingual title and text and points 0-5. Day n uses `items[(n - 1) % items.length]`.
- **Content rule.** A pack's missions come only from these curated, fixed items. They never draw from the CSV, the imported ideas table or the built-in library. Items are short and explicit. They contain no humiliation (no public degradation, body-shaming or silent-treatment punishment) and no sexual content. `tests/seasons.ts` scans every pack string for these terms and fails on a hit. Hebrew terms match as substrings: מכוער, מכוערת, שמנה, חסר ערך, חסרת ערך, טיפש, טיפשה, מבוזה, השפלה, משפיל, עבדות, זחל, להתחנן, להתעלם, לא לדבר איתה. English terms match whole words: ugly, fat, pathetic, worthless, stupid, idiot, loser, humiliate, humiliating, humiliation, beg, crawl, slave, silent treatment, ignore, ignoring.
- **`season-start`** (wife only, keyed `{ key, pack, startsAt?, lang: 'he'|'en' }`, gameplay-gated: mutual approval and no pauses). An unknown pack returns 404 `Season unavailable`. A second start while a season has queued occurrences returns 409 `A season is already running`. `startsAt` defaults to the next UTC 00:00 at or after now + 1 minute. A `startsAt` in the past returns 400, and so does a last day more than one year out. It creates one queued mission per day, with `scheduledAt = startsAt + (day - 1) * 24h`, `season: { id, day }` and no `repeat`. Response: `{ season: { id, days, startsAt } }`.
- **`season-stop`** (wife only, keyed `{ key, pack? }`, not gameplay-gated, so it works during holds; terminal sessions return 409 `Session is terminal`). With no running season (never started, or already stopped) it returns 409 `No season is running`. A `pack` that does not match the running season returns 404. It cancels queued season occurrences and leaves delivered ones alone. Response: `{ cancelled }`.
- **Session fields.** `seasonState?: { id, startsAt, days, stoppedAt? }` is set on start and gets `stoppedAt` on stop. The startup reset clears it with the session JSON. `seasonProgress` is derived at response time for both roles and never stored: `{ id, done, total, running }`, where `done` counts delivered occurrences of the current run and `running` means at least one queued season occurrence exists.
- **One season at a time.** A new start is refused while any season occurrence is queued. Stopping, or the occurrences all being delivered or cancelled, frees the session.
- **Visibility.** A season mission reaches the husband only after delivery. Queued occurrences and occurrences cancelled before delivery are never sent to him. He sees the progress count, not content.
- **Evening cap.** Season occurrences do not count toward the evening pace limit. "Done for tonight" still cancels queued occurrences like any other queued mission, which ends the run early.
- **Notices.** `season-start` and `season-stop` write content-free history and inbox entries: event name, actor and time only. No pack id, title or text.

## Sealed envelope contract

A queued surprise is sealed for the husband until it is delivered. The wife always sees the full draft and a countdown.

- **Wife.** Unchanged: the full mission, plus `Reveals in Xh Ym` (or `נפתח בעוד Xש' Yד'`) on queued surprises, computed on the client from `scheduledAt`. It refreshes every 30 seconds and is shown only in the Missions tab.
- **Husband, queued surprise** (`surprise`, not secret, status `queued`, not yet delivered). Exactly these keys: `id`, `revision`, `status: 'queued'`, `surprise: true`, `sealed: true`, `revealsAt` (the scheduled time). The UI shows a sealed card with the reveal time in local time and the line "ההזמנה נשמרה עד הזמן הזה. התוכן יוצג רק אז. / The invitation is sealed until then. Its content appears only then." The card holds no title, text, points, category, tags, or repeat and season internals.
- **Husband, delivered surprise not yet revealed** (status `pending`, `deliveredAt` set, `revealedAt` unset). Exactly these keys: `id`, `revision`, `status`, `surprise: true`, `deliveredAt`. The UI shows "Surprise invitation" and the reveal button. It no longer shows the category.
- **Husband, after reveal.** Unchanged: the reveal op (`reveal`) sets `revealedAt` and the full mission is then shown, as before. Acknowledgement still requires an explicit reveal first.
- **Secret items.** A secret queued or undelivered mission (including a secret surprise) is absent from the husband's `missions` entirely, with no sealed card. A secret item is not a sealed envelope; it stays hidden as before.
- **Notices.** No new notices. Surprise-related history and inbox entries carry only `missionId`, and they are dropped for the husband while the surprise is unrevealed. Notices contain no title, text, or category.
- **Redaction point.** `visible()` in `server/app.ts` produces every husband stub. `sealed(m)` decides the queued case; the existing `hidden` set decides the delivered case.

## Wheels contract

The wife's idea wheel offers four named wheels. Every pool comes from the built-in library and imported ideas only.

- **Wheels and pools.** `src/wheels.ts` holds `wheelDefinitions`: `worship`, `tease`, `service` and `dare`. Each has a bilingual name and description, an allowed `categories` list, and an any-of `tags` list (empty means no tag filter). `consequences` and `rewards` appear in no list, so they are excluded from every wheel unless a definition lists them. `dare` may include `challenges` and `timed`. `wheelPool(def, ideas)` filters in input order; `offeredWheels(ideas)` returns only wheels whose pool is non-empty. With the built-in library `tease` and `dare` are offered; `worship` and `service` appear once imported ideas use their categories and tags. If no wheel has ideas, the panel shows "No ideas are available."
- **Weighting.** The wife's own latest check-in gives her mood and energy tags (`moodTags`). An idea sharing a tag weighs 2; every other idea weighs 1. With no check-in, or with "No preference" selected, every idea weighs 1. `pickWheelIndex(weights, seed)` is reproducible when a seed is given; the UI uses `Math.random`.
- **Spin cost.** `wheelCost` is a session number from 0 to 20, default 0, visible to both players as a plain number. The wife sets it with `wheel-config` `{ key, cost }`: wife only, keyed retry, not gameplay-gated, refused on a terminal session, no notice. At cost 0 a spin is purely local and sends nothing. At cost above 0 the spin calls `wheel-spin` `{ key }` before the wheel moves: wife only, keyed retry, gameplay-gated like `herwish-redeem` (mutual approval, no pauses), refused with 409 `Not enough points for a spin` when `herPoints` is below the cost, and deducts `herPoints` once per key. A refused, paused or retried spin writes nothing.
- **Notices.** Each accepted paid spin writes one `wheel-spin` history and inbox entry with only event, actor and time: no wheel, idea or result. `wheel-config` writes no notice.
- **Presentation-only results.** The server never sees which idea is drawn; it only checks and deducts points. The client picks the idea and opens the existing "Choose and edit" path, which feeds the composer. Nothing is sent automatically.
- **Husband.** No access. The wheel sits in the wife-only punishments tab, and both ops return 403 to the husband.

## Auction contract

Auction nights let the wife open short lots and the husband bid with his points. **Deliberate product rule: charged points are burned.** When a lot closes with a winning bid that the husband can pay, that amount leaves the economy. Nobody is credited, not the wife and not the server. Points are never reserved on bid, and losing bids are never charged.

- **Lots.** Session field `auctions?: { id, title, description, minBid, closesAt, status: 'open'|'closed'|'void', bids: { amount, at }[], winningBid?, outcome?: 'charged'|'void'|'no-bids', createdAt }[]`. Title 1–160 characters, description 1–4000, `minBid` an integer 1–100000, `closesAt` after now and at most seven days ahead.
- **`auction`** (wife only, keyed `{ key, title, description, minBid, closesAt }`). Gameplay-gated like her other content ops: mutual approval and no pauses. A past `closesAt` returns 400 `Closing time must be in the future`; one more than seven days out returns 400 `Closing time must be within seven days`. Five open lots return 409 `Too many open auctions`. Fifty stored lots return 409 `Auction list is full`. Lots are never evicted and no operation deletes them, so a full list stays full for that session.
- **`auction-bid`** (husband only, keyed `{ key, auction, amount }`). Not gameplay-gated: bids are accepted during pauses and while approvals are pending, like messages. A terminal session returns 409 `Session is terminal`. An unknown lot returns 404 `Auction unavailable`. A closed lot or one past `closesAt` returns 409 `Auction is closed`. An amount below `minBid` returns 409 `Bid is below the minimum`. An amount not above the current highest bid returns 409 `Bid must beat the current highest bid`. Points are neither checked nor reserved at bid time.
- **Closing.** Evaluated in `advance()` under the row lock on every authorized read, the same place scheduled delivery is evaluated. Lots close on wall-clock time regardless of holds. For each open lot due at or before now: with no bids the lot closes with outcome `no-bids`. On a terminal session every open lot is voided with outcome `void`, whatever its bids. On a held session (a pause or a missing approval) a due lot with bids is voided with outcome `void` and nothing is charged. Otherwise the highest bid is compared with the husband's `points` balance. If the balance covers it, `points` drops by that amount, `winningBid` is recorded, the lot closes with outcome `charged`, and the amount is burned. If not, the lot is voided with outcome `void` and no winner is recorded. A closed or voided lot never changes again, so each lot is charged at most once. Settlement is the pure function `settleAuction` in `src/auctions.ts`.
- **Retries.** Both ops are keyed, and a committed retry replays the original response without a second lot or bid. Auction responses carry the lot only and never the balance.
- **Visibility.** Both roles see every lot's title, description, minimum, closing time, status and outcome. Only the husband bids, so every stored bid is his, and both roles see the bid amounts: the wife as the highest bid, the husband as his own. The husband's balance is never in an auction response or notice. Note that `points` is already in the shared session payload for both roles, as it was before this item.
- **Notices.** `auction`, `auction-bid` and `auction-close` write content-free history entries (`at`, `event`, `by`). The close entry also carries `outcome` only. Inbox rows carry event and time only. None carries an amount, title or id, and the text never reveals the balance.
- **Reset.** Auctions live in the session JSON, so startup reset (`HR_RESET_GAME_ON_START=1`) clears them with the other gameplay data.
- **UI.** Wife: a collapsed "Auctions" panel in the Rewards tab with the create form (title, description, minimum bid, closes in 1–168 hours) and each lot's status, highest bid and countdown. Husband: the same list with a bid field (integer, at least the minimum and above the highest bid) and his own bid. Outcome text is plain and sits in a polite live region. Terminal sessions disable bidding.

## Trophy case contract

The trophy case is a session-scoped "best of" gallery. A pin is a reference to a moment the wife chooses to keep; it never copies content.

- **Kinds and refs.** `pin` `{ key, kind, ref }` accepts three kinds. `mission` and `completion` refs are mission ids. A `completion` pin requires the mission to carry non-empty completion text, otherwise 409 `Completion required`. A `reflection` ref is the author's user id (wife or husband), and that user must have a reflection in the session, otherwise 404 `Pin target unavailable`. Any existing mission may be pinned; the composer offers pins only on approved and submitted cards.
- **Storage and caps.** Session field `pins?: { id, kind, ref, at }[]`, at most 30 (the 31st returns 409 `Trophy case is full`). A duplicate of the same `(kind, ref)` returns 409 `Already pinned`. `unpin` `{ key, pin }` removes one pin; an unknown id returns 404 `Pin unavailable`, and an unpin frees a slot.
- **Roles and retries.** Wife only, both ops are keyed; a committed retry replays the original response. The husband gets 403 `Wrong role for action`.
- **Terminal decision.** Pin and unpin are allowed on stopped and expired sessions so the archive can be curated after the session ends. They are not gameplay-gated, so they also work during holds. Every other mutation on a terminal session still returns 409 `Session is terminal`.
- **Per-viewer resolution.** The wife sees the stored pins with refs. The husband sees each pin's `id`, `kind` and `at` only, never its ref. Each viewer's `trophies` resolve against the same visible data as the rest of that viewer's session. A mission withheld from him (a secret not yet delivered, an undelivered season occurrence, or a surprise not yet revealed or still sealed) resolves to `{ kind, at, hidden: true }` with no id, title, text or completion. A ref that no longer exists resolves to `{ id, kind, at, missing: true }` for both viewers, so the wife can remove it.
- **Derived gallery.** `trophies` is computed on each response, newest pin first. Entry shape: `{ id?, kind, at, author?, title?, text?, hidden?, missing? }`. A mission entry carries `author: 'wife'` with its title and text. A completion entry carries `author: 'husband'` and the completion text. A reflection entry carries the author (the viewer's own role for their own reflection, otherwise the partner's) and the appreciation and repeat texts joined by a newline.
- **Notices.** `pin` and `unpin` write content-free history and inbox entries with event, actor and time only; no id, title, text or ref.
- **Reset.** Pins live in the session JSON, so the startup reset that truncates sessions clears them.
- **UI.** Wife: a pin toggle (`aria-pressed`) on approved and submitted mission cards for the mission and, when present, its completion, and on each reflection. The "Trophy case" panel is collapsed on the dashboard while the session is active and open in the history view. The husband sees the same gallery read-only in the history view.

## Weekly digest contract

The weekly digest is a read-only summary. It is computed on each `/api/state` response for each viewer. Nothing is stored, no notice is written, and no notification, push, or background job runs.

- **Delivery.** Each session in `/api/state` carries `digest`. It is derived from the viewer's own `visible()` output (missions, history, reward requests, auctions), so the husband's digest only ever sees what he may see. `digest` is not part of the stored session JSON.
- **Window.** The seven days before now, inclusive of exactly seven days back, as in `weeklyRecap`. `period` gives the UTC day keys `fromDay` (seven days back) and `toDay` (now), using the spark's UTC day helper.
- **Both viewers.**
  - `approved`: approved missions in the window (`weeklyRecap`).
  - `pointsEarnedHusband`: the points on those approved missions.
  - `pointsHerEarned`: the same value, since each approval adds its points to both players.
  - `pointsSpentHusband`: the cost of approved reward requests decided in the window, plus auction bids charged in the window (burned).
  - `pointsHerSpent`: wish redemptions and wheel spins in the window, summed from the `points` recorded on their history entries.
  - `streaks`: `devotion` and `mission` streaks from `devotionStreak` and `missionStreak`, identical to the state's `streaks`.
  - `topTags`: up to three most frequent categories among approved missions in the window. `Mission` has no tags field, so the category is used. Secret and surprise missions count toward approvals and points but never toward categories.
  - `empty`: true when the window has no approval, no delivery, no reward decision, no auction charge, and no wish or spin.
- **Wife only.**
  - `mostLovedIdea`: `{ title, category?, adoration }` of the approved mission with the highest adoration in the window, `loved` before `liked`. `ok` never qualifies, ties go to the most recent approval, and secret or surprise missions are never chosen.
  - `suggestion`: one idea from the existing spark pool (`pickSpark`) for today's UTC day, the candidate after today's current spark. It is not stored, and it is absent on ended sessions.
- **Husband omissions.** `mostLovedIdea` and `suggestion` are absent from his digest, not null. Every other field is identical for both viewers.
- **Approximations.**
  - Auction charges are counted at the lot's `closesAt`, because no settlement time is stored. The amount is the lot's `winningBid`.
  - Reward decisions are counted at their history time, which is exact.
  - Wish and spin spending counts only history entries written after this item. Those entries now carry `points`. Earlier entries have no recorded cost, so they count as zero.
- **Stored data.** The only change is that `herwish-redeem` and `wheel-spin` history entries carry a `points` number, the amount spent. The inbox is unchanged. The spin notice's keys are now `at`, `by`, `event` and `points`.
- **Empty state.** When `empty` is true, the panel shows "No activity this week yet" instead of zero rows. A wife's next idea still shows.
- **UI.** A "Weekly digest" panel sits on both dashboards, collapsed behind "Show digest". On Sundays (the browser's local day) the panel is highlighted and shows a live Sunday line. The dismissal is not stored, since it is optional.

## Verification

```powershell
npm.cmd test                 # library + isolated real PostgreSQL app integration
npx.cmd tsx tests/experience.ts # focused cycles 1–4 real PostgreSQL coverage
npx.cmd tsx tests/guidance.ts  # pure role/current-invitation derivation
npx.cmd tsx tests/idea-destinations.ts # destination filtering and suggestion pools
npx.cmd tsx tests/roulette.ts   # roulette spin landing calculations
npx.cmd tsx tests/wheels.ts     # wheel pools, mood weighting and seeded picks
npx.cmd tsx tests/inspiration-browser.ts # inspiration browser coverage
npx.cmd tsx tests/redesign-browser.ts # responsive redesign browser coverage
npm.cmd run build            # TypeScript check + Vite production bundle
npm.cmd run test:browser     # Chromium, accounts, mobile, worker upgrade, stalled-request safety, legacy CSP
npm.cmd run test:production  # after build: actual production entry/assets/cookie/CSP smoke
```

The tests use independent disposable PostgreSQL clusters/ports **55434–55440**, never the development cluster. `tests/experience.ts` uses port **55440** and an ephemeral HTTP port, and is included in `npm.cmd test`; its intentional database constraint failure logs `API failure 23514` while verifying replacement rollback and retry. Browser coverage includes adjustment, secret replacement/fresh acknowledgement, chat before approval and chat with both pauses active. Browser testing loads the installed Playwright package (not its bundled Node executable); override `PLAYWRIGHT_MODULE` with its absolute package directory on another machine. Chromium must be installed. The legacy demo uses an external script and delegated mission handlers under the same strict script CSP as the remote app. See the top of [QA-REVIEW.md](QA-REVIEW.md) for fresh cycle5 evidence and limitations (older entries are historical), and the [shared-experience progress ledger](docs/superpowers/plans/2026-11-09-shared-experience-progress.md) for cycle results.

## Hosting and operational requirements

Nothing was deployed externally. To run the built app, `npm.cmd run build`, then set `NODE_ENV=production`, a real **HTTPS** `APP_ORIGIN`, a private production `DATABASE_URL`, and `npm.cmd start`. A TLS reverse proxy must forward SSE without buffering and allow heartbeat connections. The app sets Secure cookies and HSTS in production; plaintext local HTTP is only for development.

- Use a dedicated database, protected credentials and verified database TLS where required. The bundled local superuser/password is disposable development only. Startup applies numbered SQL files 001–003; provision with an owner and review migration permissions before restricting the runtime role. These scripts are repeat-safe but not a general migration-versioning framework. Future changes need explicit migrations and rehearsed rollback/restore procedures.
- `TRUST_PROXY` is optional, comma-separated trusted proxy IPs/CIDRs (Express syntax, e.g. `loopback`). Configure it only when network access is restricted to those proxies; otherwise forwarded IPs are ignored. Rate limits are per trusted client IP, ten-minute fixed windows: guest entry/registration 20, login 40. Shared NATs share a bucket. Without trusted-proxy configuration, a proxy shares one bucket for all clients.
- Back up PostgreSQL with managed encrypted snapshots or `pg_dump`; regularly restore to an isolated database. Backups and restore procedures have **not** been exercised for production. Never cache `/api` or HTML at a reverse proxy/CDN; redact cookies, bodies and invitation codes in access/error tooling.
- Run periodic maintenance for expired auth sessions/invitations and old rate-limit windows. Retention, export/deletion policy and account recovery need operational design before real sensitive user data is collected. Session content is stored as database text/JSONB, not end-to-end encrypted.
- Inbox is the notification fallback until the next application reset. Delivery is evaluated on authorized reads, so scheduled content appears on reconnect/poll; no worker sends a background notification. iOS/Safari installation and real-device behavior require HTTPS/device QA.

## Explicit follow-up scope

Media upload/recording, web push, live voice, branching gameplay, achievements/levels, password recovery/email verification, pair unlinking/deletion and account data export are not implemented. Independent implementation review identified three blockers; all were fixed and scoped re-review approved spec compliance and code quality. The controller reran all four verification commands successfully. This is local foundation acceptance, not production security certification. No production load/security audit, physical-device QA or external deployment is claimed. [Architecture](docs/ARCHITECTURE.md) · [implementation ledger](docs/IMPLEMENTATION-LEDGER.md).
