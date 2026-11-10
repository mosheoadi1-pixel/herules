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

**Every application startup resets gameplay**, including server restarts and deployments. It clears gameplay (including adjustment requests and linked replacements), messages, points, approvals and login cookies, and creates the two paired identities. Imported ideas remain in the database, and the **193 tasks from `custom-tasks-template.csv`** are added if missing. The 42 built-in suggestions also remain available. Reset and seed run in one transaction before accepting requests; a seed failure rolls back the reset and prevents startup. Deploy the CSV with the application. Imported ideas persist when the server reconnects to the same persistent PostgreSQL database; moving to a different database requires copying the ideas or importing the CSV there. No active gameplay session is created automatically.

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

The additional categories `teasing`, `cleaning`, and `cooking` are also supported in CSV imports and library filters. Existing database category constraints are upgraded automatically on import or application startup.

```csv
category,he,en,minutes,intensity,tags
challenges,שיחה משותפת,A conversation together,5,2,conversation|home
```

Categories: `challenges`, `timed`, `rewards`, `consequences`, `roleplay`, `anticipation`, `random`, `secret`. Minutes must be an integer from 1 to 525600; intensity must be a positive integer, with values above 3 automatically converted to 3 (Bold) before storage and duplicate checking. Both language texts are required (maximum 4000 characters). Separate tags with `|`; tags may be empty. Quote fields containing commas, double quotes, or newlines; escape an embedded quote as `""`.

The importer validates the entire file before inserting and rolls back on database errors. Identical normalized imported rows are skipped on reimport; editing any field creates a new idea. This does not deduplicate against built-in ideas. Imported rows are stored in `imported_ideas`, available through the role-authenticated API alongside the built-in library. Refresh the library after importing. Ideas persist across website restarts when the same database is used. There is no browser upload endpoint.

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
- **42 built-in bilingual suggestions plus 193 seeded custom tasks**. CSV metadata is validated on startup; intensity above 3 is normalized to 3. Duration/intensity/activity filters, favorites, last-ten avoidance and editable dice suggestions remain available.
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

## Verification

```powershell
npm.cmd test                 # library + isolated real PostgreSQL app integration
npx.cmd tsx tests/experience.ts # focused cycles 1–4 real PostgreSQL coverage
npx.cmd tsx tests/guidance.ts  # pure role/current-invitation derivation
npx.cmd tsx tests/idea-destinations.ts # destination filtering and suggestion pools
npx.cmd tsx tests/roulette.ts   # roulette spin landing calculations
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
