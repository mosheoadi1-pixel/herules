# HER RULES — implementation verification

## Timeout uncertainty and form locking — 2026-11-09

Timeouts of mutation requests now retain a bilingual unknown-outcome warning and block ordinary actions until explicit risk acknowledgement, even after successful state reads. Pause and stop remain independent. A same-payload retry of a keyed action retains its UUID only while the page stays open. The warning survives reload within the same tab when session storage is available; it does not coordinate other tabs or survive unavailable/cleared storage. A read cannot establish that an unkeyed timed-out request has finished, and acknowledging the warning does not make a retry safe.

The reward, check-in and reflection fieldsets also remain disabled while a failed refresh is unreconciled. Chromium first reproduced enabled check-in inputs and the missing timeout warning. The final regression holds an unkeyed check-in until timeout, waits for a successful state read, then sends its captured request separately to model late arrival and verifies that the server commits it while ordinary controls stay blocked; it checks warning persistence across a same-tab reload. A separate committed-but-held keyed message response verifies explicit acknowledgement and reuse of the original UUID without a duplicate. The browser suite also checks each field in the three fieldsets and existing independent safety paths.

Final `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:browser`, and `git diff --check` exited 0 (line-ending warnings only for diff check; two intentional database rollback fixtures log `API failure 23514`). No live server restart or physical-device testing.

---

## Failed reconciliation correction — 2026-11-09

After a mutation response or error, ordinary submissions remain locked until a successful state read begun after the latest action; newer safety actions invalidate older in-flight reads. The status is explained in Hebrew and English, polling retries automatically, and pause/stop remain independent. A fresh 401 clears the stale identity and releases the lock for sign-in.

The browser regression initially timed out waiting for the missing recovery status. It now commits a real check-in, returns 503 to state reads, verifies both localized statuses and blocked submission, performs a real successful pause while locked, then restores state reads and observes polling recovery. A separate browser identity verifies a post-save 401 returns to an enabled sign-in and can re-enter. The earlier response-order test now observes the check-in JSON being consumed instead of sleeping 100ms. Existing held-save, bounded-burst and safety tests pass.

Final `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run test:browser` exited 0; `git diff --check` exited 0 with line-ending warnings. The two `API failure 23514` messages are expected rollback fixtures. No live server restart or physical-device testing.

---

## Bounded refresh correction — 2026-11-09

The previous refresh coordination queued one read per trigger. Refresh now shares one pending follow-up while a read is active; a mutation waits for a read that starts after its response, including when an earlier follow-up has already begun. Safety requests remain independent.

Chromium regression first reproduced 11 reads for a held state response and eight partner events. The corrected test holds the old response across two five-second polls and an event burst, commits a check-in, and verifies at most two reads and a fresh post-commit snapshot while controls remain locked. A second ordering holds a mutation response while the prior follow-up starts, then verifies a further read after that response. Existing held-save, pause and stop checks still pass. An unrelated timing-sensitive browser assertion was changed to wait for the delivered acknowledgement button rather than only the already-visible draft heading.

Final `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run test:browser` all exited 0. `git diff --check` exited 0 with line-ending warnings. Two intentional `API failure 23514` messages are rollback fixtures. No live server restart or physical-device testing.

---

## Reward review corrections — 2026-11-09

- Reward request and decision history entries now carry an optional request ID; decisions also carry their immutable approved/declined outcome. The history view resolves only the associated request snapshot (title, description, cost); old generic history remains readable, and inbox notices remain generic. PostgreSQL checks both roles, duplicate decisions and archive state; Chromium checks both roles, both outcomes and the stopped archive, an injected legacy generic entry and absence of unrelated secret mission text.
- Milestone navigation now retains unsaved composer fields and the existing edit target. Chromium exercises a genuinely unsaved draft while a partner's committed check-in response is held, then an unsaved edit to an existing draft, saving that edit to the original mission.
- The reward form uses a disabled fieldset while saving and refreshing; independent pause/stop controls remain enabled. Chromium holds the committed reward response and then a separate authoritative state response, checks all three inputs disabled during both stages, then confirms the form unlocks and one reward exists. This exposed a pre-existing refresh-coalescing race: a busy refresh used to return without waiting. Refreshes now wait for preceding reads and perform their own read before returning.
- Test-first evidence: missing history request metadata failed the focused PostgreSQL test; Chromium separately observed the unlocked reward input, missing detailed history and cleared unsaved title. An additional held-state test observed premature unlocking during refresh before the refresh coordination fix. A later browser run exposed a strict selector collision in an existing reflection assertion; it was narrowed to the saved paragraph.
- Final verification: `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run test:browser` each exited 0; `git diff --check` exited 0 with line-ending warnings. The two `API failure 23514` log lines are intentional rollback fixtures. Browser tests use disposable PostgreSQL and headless Chromium; no live server was restarted.

---

## Rewards and milestones — 2026-11-09

Implemented the session reward catalog, snapshot requests and wife decisions using the existing PostgreSQL session row lock and retry-key transaction. Five distinct approved missions expose an optional ordinary bonus composer; nothing is created or delivered automatically. The existing imported-ideas reset/seed code was not changed.

Test-first evidence: the focused experience test initially returned 404 `Unknown action` for reward creation; the browser test initially timed out waiting for the Rewards tab. After implementation, `npm.cmd test` and `npm.cmd run build` exited 0. The PostgreSQL suite exercises role restrictions, invalid and zero costs, request snapshots, insufficient funds, concurrent competing approvals and duplicate retries, transaction rollback, holds, archive/new-session isolation and unique mission progress. Two intentional constraint fixtures log `API failure 23514`.

`npm.cmd run test:browser` exited 0 with two isolated roles exercising creation, requests, approval, insufficient-balance feedback and decline, and milestone availability during pause plus opening the optional composer without creating a mission. Reward navigation is included in 320/390/768px Hebrew/English overflow checks. `npm.cmd run test:production` exited 0 against a disposable PostgreSQL instance and production entry. Browser testing required fixes to test selectors and waiting for the asynchronous pause refresh; those intermediate failures are not passing evidence.

No live server restart, deployment, dependency installation or commit. Physical-device and screen-reader checks were not performed.

---

## Final five-cycle verification — 2026-11-09

All five approved cycles implemented on `improve-shared-experience`, with separate implementation and independent subagent review. Final review found an own-save edit race; the correction received independent scoped **PASS / Ship**. The earlier current/archive report-loss finding was also fixed and independently re-reviewed. Entries below retain historical stage evidence; their pending-review statements are superseded by this section.

After the last code correction, the controller independently reran all commands in the existing checkout:

| Command | Result |
| --- | --- |
| `npm.cmd test` | Exit 0, all seven suites; intentional `API failure 23514` verifies transaction rollback. |
| `npm.cmd run build` | Exit 0, TypeScript and Vite, 17 modules; `index-BmaeEnjV.js`. |
| `npm.cmd run test:browser` | Exit 0, all Chromium groups including held-save field locking, unsaved input retention, both completion styles, adjustment/replacement, guided sequence, optional reflections, RTL/LTR at 320/390/768, PWA, timeout/retry and independent safety controls. |
| `npm.cmd run test:production` | Exit 0, disposable real production entry/database/assets/cookies/headers/Origin smoke. |
| `git diff --check` | Exit 0; Windows line-ending warnings only. |

No live application restart, deployment, new dependencies, or commits. Tests used disposable databases. Physical-device and screen-reader behavior, external deployment and load/security audits were not checked. Existing startup reset still deletes all game data. Unsaved form input is not preserved across reload or session switching.

---

## Current correction: independent final review P2 own-save race — 2026-11-09

Independent final review supplied a reproduced **P2**: while an own check-in/reflection save of A was pending, fields still accepted B; the saved-own refresh effect then replaced B with A. Partner-refresh retention checks did not cover this distinct own-save race. This finding supersedes any implication of final acceptance in earlier entries.

Minimal frontend correction: check-in fieldset uses `disabled={busy||ended}`; reflection uses a labelled fieldset with `disabled={busy}`. Existing `run` holds busy through the save and authoritative refresh and releases it in `finally`. Reflection remains editable after session end; terminal check-ins stay disabled. Safety controls retain their independent request path outside both fieldsets. No server or API changes.

Fresh evidence on Node v26.13.0, disposable browser cluster 55435:

| Actual command | Result |
| --- | --- |
| `npm.cmd run test:browser` before fix | Expected RED: `checkin: edits blocked while own save response is held`, actual disabled `false`, expected `true`. |
| `npm.cmd run test:browser` final | **Exit 0**. For both operations, route forwards the real save, asserts HTTP 200, holds the committed response, checks every relevant input/select/textarea is disabled and pause/release plus stop stay enabled; releases response, waits for controls to re-enable, compares all submitted values and independently fetched own saved API values. Existing genuinely unsaved partner-refresh checks (including bilingual reflections), archive restoration, terminal reflection editing, unsaved mission report, mobile RTL/LTR, timeout/retry and actual stalled-request safety tests all PASS; zero uncaught page errors. |
| `npm.cmd run build` | **Exit 0**: TypeScript + Vite, 17 modules, JS `index-BmaeEnjV.js`, CSS `index-DFOXiPn7.css`. |

One intermediate post-fix browser run used the unpaused safety-button name during the already-paused reflection fixture; corrected the test to accept the actual **Release my pause** control, then reran the complete suite successfully. No full `npm.cmd test` or production smoke rerun for this frontend-only correction; their cycle5 passes below predate this correction. No subagents, commits, dependencies or live-process restart. Independent re-review, physical-device/screen-reader QA and external deployment remain unperformed. Startup-reset and unsaved-on-navigation limits remain unchanged.

---

## Current: shared experience cycle5 — 2026-11-09

Fresh controller verification in `D:\her rules`, system Node **v26.13.0**. Prior uncommitted cycles were preserved. Cycle4 independent **PASS** is supplied by the user handoff; its reflection-edit retention conclusion was inspection-only. Cycle5 now supplies actual browser evidence for that gap. No independent final review has been performed in this run; it follows this handoff. Older “Latest” and acceptance entries below are historical, not evidence for this revision.

### Changes and fresh results

- Active invitation precedes optional check-ins and closing reflection. Reflection moved below session content and remains before the new-session form, with explicit stable textarea labels and separately labelled saved answers in Hebrew/English.
- Terminal next-step guidance explains reflection/new session and offers keyboard-operable actions focusing the real appreciation/terms fields. No server interface or stable mission wrapper changed in cycle5.
- Real Chromium regression edits both reflection fields to genuinely unsaved values, changes the partner's reflection, waits for that shared update, and checks both own controls plus independently fetched own persisted values. Repeated in Hebrew and English. Archive selection restores both saved values; switching back to the new session restores empty reflection fields. Existing unsaved written-report current → other → current regression remains passing.
- 320/390/768px Hebrew RTL + English LTR: all six wife session tabs remain free of document overflow; new closing/new-session layouts and check-in controls fit the viewport. Keyboard Enter activates both terminal next-step actions and focuses their actual textareas at every width/language. Both completion styles, adjustment/replacement, held communication, guided sequence and prior foundation flows pass.

| Actual command | Fresh result |
| --- | --- |
| `npm.cmd test` | **Exit 0**: all seven suites (library, guidance, integration, private-game migration, ideas import, startup reset, experience). Intentional `API failure 23514` is the asserted replacement rollback fixture. |
| `npm.cmd run build` | **Exit 0**: TypeScript + Vite, 17 modules; production JS `index-CMdZBhNv.js`, CSS `index-DFOXiPn7.css`. |
| `npm.cmd run test:browser` | **Exit 0**: all groups above plus PWA upgrade/offline, actual 15-second timeout/same-key retry, held-request pause/stop, legacy strict CSP, zero uncaught page errors. |
| `npm.cmd run test:production` | **Exit 0**: actual isolated `server/index.ts`, PostgreSQL startup/migrations, built assets, Secure/HttpOnly/SameSite cookies, HSTS, HTTPS Origin enforcement, no source serving, worker headers and legacy CSP. This is production-entry smoke, not a full production-mode browser replay. |
| `git diff --check` | **Exit 0**; existing LF/CRLF conversion warnings only. |

Tests use disposable clusters on ports 55434–55440 (browser 55435, production 55436, experience 55440); no live process restart or live database access. The production test starts/stops only its disposable server. No subagents, commits, new dependencies, deployment or new explicit content.

Test development: two preliminary browser runs exposed test selector issues (saved textarea text participates in implicit accessible names; text selector matched both summary and textarea). Corrected selectors, then observed the expected RED for the missing **Reflect on this session** action. After implementation the complete browser suite passed. Reflection retention itself passed before polish and needed coverage, not a state-management fix.

### Current limits

Independent final review pending. No physical-device, screen-reader, external HTTPS/proxy, load/security audit or deployment QA. Unsaved reflection fields survive partner refresh, not reload/session switching; saved entries restore on selection. The existing startup reset still erases gameplay, reflections, check-ins, cookies and imported data. No live-app acceptance is claimed from disposable checks.

---

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
