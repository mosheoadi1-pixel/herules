# HER RULES remote foundation architecture

Acceptance update: independent scoped re-review approved the three blocker fixes for spec compliance and code quality. Controller reran integration/library, build, browser and production-entry suites under Node v26.13.0 successfully. Pending-review wording below reflects the earlier handoff.

## Boundaries and files

- `src/main.tsx`, `src/style.css`: React client, Hebrew-first labels and direction, actual authenticated API calls. No role-switch simulation. Local storage contains only language and nonsensitive favorite idea IDs; recent suggestion IDs live in memory. Creation/message/completion/review UUIDs are kept in memory across failed retries of the same session/mission/payload, then discarded on success. They do not persist across page reloads. Submission versions prevent stale work from being applied even with a fresh UUID.
- `src/library.ts`: 42 Hebrew/English activity pairs across eight categories: two user-supplied CSV entries and 40 retained bold suggestions. Original160 everyday entries removed from source; retained IDs21–25 per category remain unchanged, with distinct custom IDs. Tests verify exact supplied Hebrew text, normalization defaults, deleted-ID absence, bilingual uniqueness and last-ten exclusion. CSV integration is manual; the file is not a runtime database or auto-import source. Existing mission records copy their own text and are not rewritten when the library changes.
- `server/index.ts`: one Express listener; Vite middleware during development, built assets in production; public worker and scoped legacy assets. PostgreSQL pool and shutdown handling.
- `server/app.ts`: bounded schema validation, authentication, exact Origin, limits, authorized reads, transactional domain transitions, SSE and generic errors. SQL uses parameters. Errors do not log request bodies, tokens or sensitive values.
- `db/001-foundation.sql`, `002-guests.sql`, `003-private-game.sql`: repeat-safe numbered schema changes, guest identity constraints and immutable roles, and a singleton two-role game with sole-pair adoption. This is not a general migration-versioning framework.
- `public/`: manifest, SVG app icons and root worker replacement. `legacy/`: preserved local prototype and historical documentation; `demo.js` externalizes its script, and allowlisted delegated `data-action`/`data-mission` handlers replace generated inline handlers. The shared `script-src 'self'` CSP is unchanged. Its v2 scoped worker includes the external script and upgrades old legacy caches; the original root cache-first worker is retained as `tests/fixtures/old-root-sw.js` for upgrade testing.

## Persistence and atomicity

`users` stores fixed role and adulthood self-attestation, with either nickname or registered email/salted scrypt digest; `auth_sessions` stores SHA-256 cookie hashes and expiration. `private_game` has a single checked primary-key row, one unique user per role, and an optional pair ID. Every identity claim locks this row. Opposite-role completion creates `pairs` and assigns both users atomically. Concurrent duplicate-role claims roll back new user creation. Login/auth checks the selected role owner, so preexisting unrelated accounts cannot bypass the two-player limit. Logout and expiry never release a slot. A sole preexisting pair is adopted unchanged; multiple existing pairs require explicit administrative selection before startup. Legacy invitation records are retained but their API surface is removed. See PRIVATE-GAME.md for operational details.

`sessions` contains a pair-owned JSONB aggregate and indexed status. A partial unique index prevents more than one nonterminal session per pair. Reads and mutations acquire `SELECT ... FOR UPDATE`, validate pair membership and advance server time before operating. A pair lock serializes new-session creation. `approvals(session_id, revision, user_id)`, `awards(mission_id)` and `request_keys(session_id, user_id, kind, key)` independently enforce unique approvals, point awards and creation/message/completion/review retries in PostgreSQL. Session JSON and these rows commit together or roll back together.

This aggregate is deliberately small-foundation architecture: it trades normalized queryability for a single auditable transactional state machine. Full history/messages are returned on state refresh; there is no pagination or archival compaction. Long/high-volume sessions increase payload, lock and write costs; normalize/paginate before scaling. Identity claims serialize on the private-game row. SSE listeners are process-local; five-second database polling remains correct across restarts or multiple processes, but no multi-node realtime/load behavior is verified.

## Consent, time and terminal state

Each revision retains its exact text. Both authenticated participants approve the current integer revision; stale versions fail. Replacement terms retain prior text, clear current approvals and cancel unfinished missions. Either participant may propose revised terms or pause/stop during review. The wife owns mission drafting/delivery/review and duration extension; the husband owns acknowledgement/refusal/completion.

Time is stored as remaining active milliseconds plus a backend `last` timestamp. It does not begin until first mutual approval. Before every locked read/mutation, elapsed server milliseconds are deducted **only** when started, mutually approved, unpaused and nonterminal. A boolean union of all participant pauses and agreement review gates subtraction, so overlapping suspensions never add time twice. Browser intervals are display-only. Expiry is committed even when the triggering gameplay request must fail. Stop is terminal; later locked gameplay fails; awards committed earlier stay history. Reading/marking inbox remains available after termination. No mission-specific expiry exists.

Queued missions have absolute backend schedule timestamps. Authorized reads deliver eligible missions only while active; suspension holds them until resume. Queued secret drafts are not yet visible to the husband. There is no background scheduler and no claim of notification delivery while closed.

## Mission lifecycle

```
wife: draft -> queued -> pending (delivery)
              draft -> pending (explicit send)
husband: pending -> acknowledged -> submitted
                  -> refused        | wife: -> approved (+points once)
                  -> refused        | wife: -> revision -> submitted
wife: unfinished -> cancelled
agreement replacement / stop: unfinished -> cancelled
```

Only drafts can be edited; queued drafts can be sent or rescheduled, not edited. Delivered terms bind to the immutable revision. Refusal has no point change. Completion requires explicit acknowledgement; state reads, disconnects and timers never acknowledge. Duplicate creation/message UUIDs return the first committed result. A committed stop wins over any later gameplay lock holder, including a concurrent reviewer.

`complete` now requires `{mission, key: UUID, expectedVersion, text}`. The first submission has expected version 0; accepted completions increment `submissionVersion` and are allowed only from acknowledged/returned state. `review` requires `{mission, key: UUID, submissionVersion, approve}` and can change only that exact currently submitted work. Existing pre-version records are treated as version 0; clients missing the new required fields receive 400 and must refresh/update. No destructive migration is needed because the version is a JSONB field.

Under the session row lock, completion/review first authorize the actor and look up the caller-scoped UUID in `request_keys`. A committed duplicate returns the original stored result before any new gameplay transition, even during pause, after resubmission or after stop. New requests validate current version/state, then atomically persist their result, history, state and award. A retry of an OLD return/completion cannot return/overwrite NEW work; a fresh-key stale approval fails 409. Read-only replay after stop does not resume gameplay or add history/awards.

Pause/resume/stop use native safety buttons and an independent `runSafety` path; neither the ordinary busy context nor its early-return guard applies. Safety requests can be sent while a draft/message is stalled, and stop can be sent independently of another safety request. All API fetches have a 15-second AbortController deadline, including response-body reading; timeout releases ordinary busy state after reconciliation and retains its retry key. Aborting a client fetch cannot undo a committed server transaction. Safety still requires connectivity and server row-lock acquisition; the UI never reports server-confirmed success based on a local click alone.

## API surface

- `POST /api/guest`, `/register`, `/login`, `/logout` (registration retained for existing clients; also subject to the fixed role slots)
- Invitation/redeem endpoints removed; both players join automatically on entry.
- `GET /api/state`, `/api/sessions/:id`, `/api/events`
- `POST /api/sessions` with terms and duration
- `POST /api/sessions/:id/:op`: `approve`, `revise`, `pause`, `resume`, `stop`, `extend`, `mission`, `edit`, `queue`, `deliver`, `cancel`, `ack`, `refuse`, `complete`, `review`, `message`, `read`

Identity and role always come from the opaque cookie session. Foreign session IDs return a generic denial. Responses omit password/session/invite hashes. The wife sees secret drafts; the husband sees them only after delivery. Recipient history and inbox contain generic event metadata; SSE contains exactly a content-free `refresh` invalidation. Event subscribers authenticate to a pair and revalidate auth on heartbeat. Logout immediately revokes API reads/mutations; an already-open stream closes on its next heartbeat (up to 15s), and its payload never contains content.

Mutations require the configured canonical Origin or an Origin matching the request's exact host, port and protocol, plus bounded JSON. This permits any address serving the app without allowing unrelated cross-site requests; dynamic production addresses must be HTTPS. Express derives forwarded host/protocol only through explicitly trusted `TRUST_PROXY` settings. Cookies are HttpOnly, SameSite=Lax, seven days and Secure in production. PostgreSQL-backed attempt counters survive process restarts. Security headers include no-referrer, nosniff, anti-framing, a same-origin CSP and production HSTS. No CORS permission is granted. Sensitive content remains plaintext within the protected database/transport boundary; there is no E2E encryption, verified age/identity, recovery flow or deployment audit.

## Refresh and PWA

React subscribes to same-origin pair-authenticated SSE, refetching authorized state on invalidation; independent five-second polling supplies reconnect and scheduling fallback. A stale connection is shown visibly. The root worker never intercepts `/api`, never caches responses, and uses network-first navigation plus a generic offline notice. Activation deletes old `her-rules*` demo caches except the isolated legacy namespace, calls `skipWaiting` and claims clients. A pre-existing cache-first prototype may display the old page until the browser checks and activates the replacement worker; a refresh then loads the remote app. Authenticated data never becomes offline state.

## Operations and deferred work

See README for current system Node 26 / `npm.cmd` commands, HTTPS, exact Origin, cookie, database credentials, proxy/SSE, backups and iOS requirements. Tests use disposable real PostgreSQL and desktop Chromium mobile emulation, not physical iOS/Android or a hosted network. Media, push, live voice, branching, achievements/levels and account lifecycle tooling are follow-ups. Independent implementation review blocked the earlier revision; these corrections await reviewer reinspection.
