# HER RULES — implementation verification

## Latest: user CSV integration and removal of everyday suggestions

Applied the requested replacement: 42 suggestions (2 provided CSV rows +40 retained bold suggestions). Removed original160 everyday entries from library source, preserved retained IDs21–25 per category and gave custom entries separate IDs. Exact supplied Hebrew wording is preserved with whitespace trimming; English translations added, missing duration/intensity normalized to10minutes/3. No database, active mission or history deletion was performed; the predefined catalog lives in frontend source.

Test-first count assertion reproduced the visible issue (200 rather than42). Final npm.cmd test, npm.cmd run build, npm.cmd run test:browser and npm.cmd run test:production all exited0 under Node26. Tests verify exact CSV wording/defaults/removed IDs/retained IDs; Chromium shows42 total and2 under Custom content, with all existing gameplay/safety/mobile checks passing. Also opened the actual running localhost:3000 server in isolated Chromium and imported its served library module: {count:42,custom:2}. Existing guest cookies were untouched. Refresh stale tabs without deleting cookies.

Independent scoped reviewer approved the change and independently ran the library assertions successfully. Its documentation-count finding was corrected in README and ARCHITECTURE. CSV remains a manually integrated input, not an automatic importer. No physical-device or external deployment checks added. Older200-item descriptions below are historical.

## Latest: one private two-player game and 200 ideas

User approved automatic connection for exactly two roles. Removed invitation UI/API; singleton row locking now reserves one identity per role and automatically creates the pair. Existing sole pairs are adopted without rewriting IDs or session data. Third identities, concurrent duplicate-role claims, and preexisting unrelated logins cannot replace role owners. Logout/expiry deliberately retains role reservations. Guest sign-out asks for confirmation; lost-cookie recovery remains unimplemented.

Test-first evidence: the slot-race regression initially observed two successful wife claims rather than one success/one conflict; the library assertion initially observed 160 rather than 200. After implementation:

- `npm.cmd test` — exit 0 under Node26: 200 unique bilingual ideas, 25 per category, exactly five bold prompts per category; actual PostgreSQL concurrent role claims with rollback/no orphan user, automatic shared pair, third-player rejection, no invitation endpoints, independent consent, all prior mission/clock/safety invariants. Migration cluster 55437 verifies existing registered login, existing guest cookie, pair/session/message/point preservation, repeat startup, and safe failure on ambiguous multi-pair upgrade.
- `npm.cmd run build` — exit 0: TypeScript and Vite production build.
- `npm.cmd run test:browser` — exit 0: real Chromium and PostgreSQL, noncanonical IP entry/reload, first-player waiting, automatic second-player connection, third-player rejection, absence of invitation UI, independent approvals and all existing completion/text/pause/safety/PWA/legacy checks. Bold filter shows 40 entries (five when combined with roleplay), favorites/dice/editing work, and 320/390/768px RTL/LTR layouts have no horizontal overflow. Zero uncaught page errors. First run failed because an exact accessible-name selector did not match the intensity label's nested options; changed the selector, then reran successfully. Disabled unused test-server WebSockets to avoid collision with the user's running dev server.
- `npm.cmd run test:production` — exit 0: actual production entry and migrations, built assets, cookie/header/Origin checks and legacy CSP.

Independent read-only subagent review returned **APPROVED spec/quality**, with no blockers for role concurrency, takeover prevention, data preservation, consent/safety and non-graphic bilingual content. It inspected source/tests but did not independently rerun the controller's commands. Earlier QA sections describe prior revisions, not the current invitation-free product.

Not verified: physical-device LAN access, external TLS, load, manual multi-pair operator selection or guest recovery. Initial roles can be claimed by anyone who can reach the app; it must be privately reachable during setup. The live user server was not restarted or its data reset.

## Address aliases — latest behavior

User requested all addresses. Added test-first regression: noncanonical 127.0.0.1 entry failed 403 before implementation. Backend now accepts exact request-origin aliases as well as configured APP_ORIGIN; production dynamic aliases require HTTPS. Vite development entry permits all hostnames. PostgreSQL integration confirms IP and domain aliases accepted, unrelated origins/null origins/different ports and untrusted forwarded headers rejected. A domain fixture initially used fetch, which did not send the custom Host; corrected it to an actual node:http request. Real Chromium verified nonconfigured 127.0.0.1 guest entry, cookie persistence on reload and logout. Final npm.cmd test, build, test:browser and test:production passed under Node26. Browser suite still reports the nonfatal existing-server HMR-port warning. User's running server was not restarted; restart needed. Physical LAN devices and external TLS aliases remain untested. Earlier exact-configured-only descriptions below are historical.

## Guest entry and Origin diagnostics follow-up

System Node v26.13.0: controller verified default nickname/role guest entry, separate same-name identities, old-schema registered-account preservation, pairing/independent consent, browser reload/logout and optional existing login. `npm.cmd test` passed against real PostgreSQL; `npm.cmd run test:browser` passed all flows including a real 127.0.0.1 versus localhost Origin rejection with actionable Hebrew address diagnostics and successful entry at the configured address. Existing local server HMR port 24678 produced a nonfatal WebSocket-port warning during browser tests. The initial build found an implicit-any guest test array; an explicit User array type fixed it. Subsequent `npm.cmd run build` and `npm.cmd run test:production` exited 0.

Live reproduction on the user's running server: anonymous logout with Origin http://localhost:3000 returned 200; http://127.0.0.1:3000 and http://localhost:5173 returned 403 Origin rejected. No authenticated user data was changed. Exact-Origin enforcement remains intact; wrong-origin responses now include the configured public address and both ordinary/safety error displays explain recovery. The existing development server must be restarted to load backend changes. Subagent launch for guest implementation reported a usage-limit failure; partial guest changes were already present on inspection. Controller verified and corrected these directly; no independent guest-change acceptance is claimed.

## Final acceptance update

Independent scoped re-review approved **spec compliance** and **code quality** after verifying all three blockers were addressed: versioned durable submission/review retries, independent safety requests during stalled ordinary work, and CSP-compatible legacy scripts. No new blocking defects were found in those corrections.

The controller subsequently reran `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:browser`, and `npm.cmd run test:production` under Node v26.13.0; all exited 0. Actual PostgreSQL, browser stalled-request safety/timeout recovery, legacy gameplay, mobile layouts, old-worker migration and production-entry smoke passed. Earlier pending-review statements below describe the implementation handoff before this acceptance. This is local acceptance, not production certification.

Local implementation evidence, 2026-11-07, updated after the independent reviewer **blocked the previous revision** on submission retries, busy-state safety controls and legacy CSP compatibility. Those fixes and regressions are documented below for reinspection; these local results are **not an acceptance verdict**. Binding contract: `docs/superpowers/specs/2026-11-07-remote-foundation-design.md`.

## Runtime and commands

Final correction verification executed from `D:\her rules` with **system Node v26.13.0** (`node --version`) and **`npm.cmd` v11.20.0**. No bundled Node override or execution-policy change. PowerShell's `npm.ps1` is blocked, so the runnable commands use `npm.cmd`. Playwright is loaded as a package by that Node 26 process. Tests use the existing actual PostgreSQL **18.6** Windows runtime, not an in-memory SQL substitute. The prior Node 24 run is historical evidence only, superseded by this rerun.

```powershell
node --version
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run test:production
```

## Verified behavior

### Actual PostgreSQL (`tests/integration.ts`)

Disposable fresh cluster on port 55434, migrations applied, actual HTTP requests and transactions, cleanup/clean database shutdown in `finally`:

- Exact-Origin rejection, HttpOnly/SameSite cookie attributes, login, logout/revoked-cookie denial and login attempt throttling.
- Revoked and expired invitation rejection; concurrent opposite-role recipients compete for one invitation, exactly one succeeds; unrelated account has no session access or SSE subscription.
- One active session per pair; repeated current approval stays unique; stale approval fails and replacement terms cancel unfinished missions and block gameplay.
- Secret content excluded from recipient authorized state (including inbox/history); no password/hash/token leakage in that projection; SSE payload is only `data: refresh`.
- Husband cannot create missions; delivery terms cannot be edited; reads never acknowledge; completion before acknowledgement fails; refusal leaves points unchanged.
- UUID creation/message retries and submission-bound completion/review retries in PostgreSQL. Regression: submit OLD/version 1, return it, submit NEW/version 2, replay old return/completion UUIDs; responses equal the original results, NEW stays submitted with unchanged text/version. Fresh-key stale completion/return/approval requests fail 409. Old retries and stale approvals race against current approval without overwriting NEW work. Same-key concurrent completions/reviews return identical stored results; different-key requests against one expected version allow exactly one transition. Original completion/return results remain replayable after stop without gameplay changes or history/award duplication.
- Both participants pause; releasing one does not release the other. Database-controlled elapsed-time fixtures verify remaining time stays unchanged across overlapping pauses and review. This tests backend clock logic without waiting a real minute.
- A scheduled secret remains hidden while paused and delivers on resume/read after its absolute time.
- Committed stop rejects subsequent gameplay and extension; concurrent stop/review leaves either an earlier committed award or no award, never a review after stop in history. Expiry commits terminally even when extension is attempted.

### Curated library (`tests/library.ts`)

160 unique Hebrew texts and 160 unique English texts; eight categories with 20 each; required duration/intensity/tag metadata; 100 suggestion draws never choose the last ten; an exhausted filtered pool returns no suggestion. Semantic distinctness was curated in source, not inferred solely from the uniqueness assertion.

### Real Chromium (`tests/browser.ts`)

Disposable PostgreSQL cluster on port 55435; application HTTP port 4180; installed Playwright Chromium; three **isolated browser contexts**, not a role switch:

- Separate wife/husband registrations (default Hebrew/RTL), pairing by code, session creation, two independent agreement approvals.
- Secret draft hidden until delivery; explicit acknowledgement before text completion; wife review and point display.
- Text persists after reload; the husband's SSE route is blocked for the text flow so actual five-second polling must supply the update.
- Independent pauses/owner release, library category filtering (20 roleplay ideas), favorite filtering and dice populating an editable draft rather than delivery.
- Widths **320, 390 and 768px**, both Hebrew RTL and English LTR, all six wife session tabs: document width never exceeds viewport width. This is layout emulation, not physical-device validation.
- Actual preserved cache-first prototype worker served over HTTP at `/sw.js`, installed at root with its old demo cache; replacement update removes that cache, loads the remote UI and leaves CacheStorage empty. API responses are `no-store`; offline navigation displays only a generic reconnect notice.
- Unrelated third account denied direct session access; terminal stop in UI; zero uncaught page errors across account pages.
- Real **15-second request timeout**: a message commits but its response is held. The client shows timeout/reconciliation, releases ordinary controls, retries with the same UUID and stores exactly one message.
- Hold a draft POST before delivery to the server, then actually click pause and stop from that same busy browser and assert **both HTTP responses are 200**. Release the held POST and assert 409/no draft created. Repeat independently with a held message POST and a new session. This is request execution evidence, not just an enabled-button assertion.
- Load `/legacy/` with the shared strict `script-src 'self'` CSP, create a demo session, approve its simulated agreement, then exercise generated **edit/send/acknowledge/complete/remove** controls through delegated listeners. Zero CSP violations and zero page errors. The legacy script is external; no script CSP exception was added. Its scoped v2 worker includes the external script and clears its old legacy cache namespace. Root upgrade testing retains an exact original cache-first worker fixture.

### TypeScript / production bundle

`npm run build` runs `tsc --noEmit && vite build`; both pass. Vite builds the actual React entry and copies public manifest/worker/icons. No external deployment was performed.

### Actual production entry (`tests/production.ts`)

After build, a child **system Node 26** process runs **`server/index.ts`** with `NODE_ENV=production`, a fresh real PostgreSQL cluster on **55436**, port **4181**, and the configured HTTPS origin `https://her-rules.example`. All requests stay on local loopback; this does **not** test a deployed TLS endpoint. The smoke test verifies initial migrations/startup, built HTML/JS assets, absence of source-file serving, root worker `no-cache` header, legacy HTML/external script delivery with the **same unchanged script CSP as root**, production Secure/HttpOnly/SameSite cookies, HSTS and rejection of a mismatched HTTP Origin. Child process and cluster are stopped and the temporary database removed.

### Final executed result

All four suites above exited **0 under Node v26.13.0** after the reviewer corrections. `npm.cmd test` emitted **three PASS lines** (library, submission retry/concurrency regression, broader PostgreSQL integration). `npm.cmd run build` completed TypeScript and Vite: 16 modules; HTML **0.64 kB**, CSS **5.70 kB**, JS **279.56 kB / 88.57 kB gzip**. `npm.cmd run test:browser` emitted **seven PASS lines** (account flow/polling, mobile, PWA, timeout/retry, held-request safety, legacy CSP gameplay, unrelated-account/stop/page-errors), plus an account-registration checkpoint. `npm.cmd run test:production` emitted one PASS line. Test `finally` blocks stopped and removed their disposable clusters; the separately running development DB/app were not stopped or modified by these suites. Acceptance remains with the independent reviewer.

## Failures resolved during implementation

- Test-first initial run failed on the absent `server/app.ts`; the library test likewise failed before `src/library.ts` existed.
- Initial schema used reserved SQL word `window`; renamed to `period`. Actual PostgreSQL exposed this before any pass was recorded.
- Typecheck caught nullable pair ID and absent CSS module typing; corrected the nonnull checked call and added Vite type declarations.
- Browser selectors were initially too exact for labels containing populated selects/textarea values and the dice glyph; corrected selectors to match the actual accessible controls.
- Initial worker fixture used page routing, which did not reliably serve a service-worker script. Replaced it with a real HTTP route switching between the preserved old worker and new worker, then reran the full flow. Only this latter result is treated as old-worker upgrade evidence.
- Reviewer regressions were run red: old completion response had no submission version (`undefined !== 1`); a held draft resolved the Pause button as disabled and timed out; legacy Create left state unchanged under CSP. Each now passes with the corrected implementation. Earlier interrupted browser runs produced orphaned disposable PostgreSQL clusters; those were stopped with `pg_ctl -m fast`. A temporarily incomplete dependency tree was restored with `npm ci` after releasing locked test DLLs. No claim is made that interrupted runs passed.

## Limits / remaining review

No external deployment, independent implementation/security acceptance, load/soak tests, database backup/restore drill, physical iOS/Android, screen-reader audit, Safari/Firefox or real slow-network testing. Icons are SVG; raster iOS fallbacks and install polish need device verification. No media, web push, branching gameplay, achievements/levels or live voice. No password recovery/email verification or account export/deletion/unpair flow. Session aggregates/history are unpaginated; single-process SSE and global pair-formation serialization are foundation-scale choices. See README and architecture for operating requirements and privacy/retention limitations.
