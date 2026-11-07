# SDD ledger — plan: docs/superpowers/plans/2026-11-07-remote-foundation.md

## Supplied CSV replacement — 42 selectable ideas

User reported still seeing200. Applied the pending replacement rather than asking again: removed160 everyday suggestions, retained40 bold entries with original IDs, imported2 CSV entries verbatim after trimming plus faithful English translations, defaults10minutes/intensity3 and distinct custom IDs/tag. No SQL or persisted mission/history changes. First regression failed200vs42; all final test/build/browser/production suites exited0. Actual live localhost:3000 module verified42total/2custom in Chromium. Scoped reviewer ses_e48e725aeffe9Wsh5n4DuQ5urD approved and independently passed library test; corrected its stale README count finding. Manual CSV integration documented; future file edits require reintegration.

## Approved bounded follow-up: one private game / bolder non-graphic ideas

User approved two roles automatically joining one private game without connection codes. Preserved independent backend identities/consent/safety. Test-first failures: concurrent same-role entry returned two 200s; library count remained160. Implemented singleton row locking, atomic user/role claims, automatic pair formation, invitation UI/API removal, migration adopting a sole existing pair and refusing ambiguous multi-pair data. Added40 explicit bilingual non-graphic bold prompts while preserving existing IDs, total200. No explicit sexual/fetish instructions added.

Final checks under Node26: npm.cmd test, npm.cmd run build, npm.cmd run test:browser, npm.cmd run test:production all exited0. Browser's initial exact intensity-label selector timed out; corrected to the actual accessible label and reran. Actual PostgreSQL migration tests preserve registered credentials, guest cookie, pair IDs, sessions, messages and points; safe ambiguity refusal tested. Guest cookie loss still leaves a reserved role with no self-service recovery, disclosed in UI/docs and sign-out confirmation.

Independent reviewer ses_e490191e8ffeaYgxQ5U9w7P1BC approved spec/quality with no blockers after reading actual source/tests (did not rerun suites). Controller retained originals/production data and left the user's live server running. Documentation updated in README, ARCHITECTURE, PRIVATE-GAME and QA-REVIEW. No commits or deployment.

## All serving addresses

User requested all addresses. Implemented same-origin request-host/protocol matching alongside canonical APP_ORIGIN, rather than allowing arbitrary cross-site authenticated mutations. Production dynamic aliases require HTTPS; trusted proxy configuration controls forwarded headers. Vite dev accepts host aliases. Regression observed 403 before fix; final actual PostgreSQL alias/foreign-origin tests, Chromium IP entry/reload/logout and full existing browser tests, build and production-entry smoke passed. No user-server restart or firewall changes. Guest identity stays host-cookie-bound. Subagents remain unavailable due usage limit.

## Nickname entry and Origin follow-up

User approved browser-bound nickname/role guest entry. Subagent call hit usage limit; inspection found guest implementation and migration/tests already present. Controller tested those changes and fixed a guest test array typing error. Live user-server Origin probes confirmed localhost:3000 accepted while 127.0.0.1:3000 and localhost:5173 rejected. Added failing regression for configured-address diagnostics, observed assertion failure, then added expectedOrigin response and bilingual actionable UI errors without weakening Origin enforcement. PostgreSQL/library and full browser suites passed, then corrected typecheck/build and production-entry smoke passed under Node26. Existing user server left running; restart required for backend diagnostic change. Independent guest-change review unavailable due tool limit.

## Final acceptance

Task 1: complete — independent design approved after binding refinements; actual PostgreSQL setup passed.
Task 2: complete — remote foundation implemented, originals preserved in legacy.
Task 3: complete — independent reviewer reproduced three blockers; all fixed; scoped re-review approved spec compliance and code quality. Controller then reran npm.cmd test, npm.cmd run build, npm.cmd run test:browser, npm.cmd run test:production under Node v26.13.0; each exited 0. No commits or deployment.

User approved architecture, Hebrew default and idea library; requested subagent approval before continuing.

Ruling: Work in the existing directory without commits because repository has no HEAD and all original files are untracked; preserve originals in legacy before replacing entry points. A worktree cannot preserve this initial uncommitted project without creating an unsolicited commit.

Preflight interface scan:
| Tasks | Contract | Result |
| --- | --- | --- |
| 1 / 2 | Approved spec and environment findings | Review required before implementation |
| 2 / 3 | Code plus reproducible test evidence | Reviewer reads finished code; no concurrent writers |
| 1 | Read-only approval | No implementation edits |
| 2 | Backend and frontend matching API | One implementer owns integration |
| 3 | Review and fix loop | Implementation approval requires both spec and quality verdicts |

## 2026-11-07 — PostgreSQL setup gate only

- The database-setup worker scope covered local runtime setup only, without app implementation, commits, deployment or nested agents. This is a worker-level restriction, not a withdrawal of the controller user's authorization for agents. Read the approved design and implementation plan. This evidence satisfies the runtime prerequisite only; it is not an independent architecture/security approval or acceptance of tasks 2/3.
- System Node is v16.18.0. Verified and used `C:\Users\ovadia\Downloadsold\agent\.venv\Lib\site-packages\playwright\driver\node.exe` v24.18.1 with the installed npm CLI and modern Node prepended to PATH.
- Both Docker engine contexts are unavailable; no PostgreSQL commands on PATH or standard PostgreSQL installation directory. Selected actual PostgreSQL 18.6 Windows binaries from dev dependency `embedded-postgres@18.6.0-beta.19`; runtime SQL driver `pg@8.16.3`. Locked installation reproduced with `npm ci` (18 added, 19 audited, zero reported vulnerabilities).
- Added only package foundation/lockfile, `.gitignore`, `scripts/db/{runtime,start,test}.mjs`, and `docs/DB-SETUP.md`; appended this ledger entry. Original prototype and existing spec/plan/README/QA files were not modified.
- Final `npm run db:test` against a real isolated cluster passed schema/table creation, Hebrew persistence across connections, transactional isolation/rollback, overlapping queries with distinct backend PIDs, graceful shutdown with refused connections, restart persistence, and test-cluster cleanup. Foreground `db:start` also accepted a SQL connection returning 42, then stopped via Enter while retaining data.
- Resolved Windows startup pipe inheritance; replaced unavailable `pg_controldata` inspection with server shutdown log/PID-file/network assertions. Uses bundled `pg_ctl` for clean shutdown instead of the wrapper's forced Windows taskkill. Earlier aborted cluster was stopped; failed-run temporary directories may remain as diagnostic artifacts.
- Ready development connection: `postgresql://postgres:local-dev-only@127.0.0.1:55432/postgres`. Start with `npm run db:start` under Node 24, Enter/Ctrl+C to stop; data lives in ignored `.local/postgres`. Exact commands, verification output, recovery procedure and package decisions: [DB-SETUP.md](DB-SETUP.md).
- Gate verdict: real local PostgreSQL is available for subsequent app integration tests. No application schema, authentication/API/UI, browser tests, app build or production deployment was implemented or validated in this gate.

## 2026-11-07 — Task 2 integrated remote foundation

User supplied the independently approved design as binding and authorized full integration in this existing workspace. **At the controller level the user authorized accelerated subagent implementation; the implementer/worker task prohibited nested agents.** The earlier wording incorrectly attributed that worker restriction to the user and is corrected here. This worker implemented directly with no nested agents, commits, pushes or deployment. The repository still has no original committed baseline; original entry HTML/worker/manifest and historical README/QA were preserved under `legacy/` before root replacement. All application/document edits used `apply_patch`; npm managed dependency installation and lockfile changes.

### Scope delivered

- React/TypeScript, one Express/TypeScript server, real PostgreSQL initial schema and transactions, authentication, adult self-attestation, fixed roles, pairing/invitation revocation/expiry/race protection, consent revisions, owner-only pauses and terminal stop/expiry.
- Server-owned union-suspension clock, draft/edit/send/schedule/cancel/acknowledge/refuse/complete/return/review lifecycle, unique approvals/awards/request UUIDs, unchanged committed points after stop, secret recipient projection, text, persisted inbox/read state and history.
- Pair-authenticated content-free SSE plus five-second authorized polling, tested with SSE blocked. Hebrew default/RTL and English/LTR responsive UI with actual separate-account actions.
- 160 explicit bilingual ideas (20 per category), activity/boundary metadata, filters/search/favorites, last-ten avoidance, editable suggestions and optional dice (no automatic delivery). No branching/media/push/voice/achievement claims.
- Root worker upgrade/old-cache cleanup, generic offline notice, API bypass/no-store, SVG icons and manifest; legacy worker remains scoped below `/legacy/`.

### Test-first and corrected failures

Wrote `tests/integration.ts` before `server/app.ts`, ran it and observed missing-module failure; wrote and ran the library test before its implementation with the same expected absence. Those are initial red-entry failures, not a claim that every assertion was independently mutation-tested. Actual PostgreSQL then caught reserved identifier `window`; renamed the rate-limit column to `period`. Typecheck caught a nullable pair ID and CSS side-effect import typing; fixed both. Browser tests exposed overly exact label/glyph selectors. The initial worker fixture used page routing, which did not reliably intercept the worker script; replaced it with real HTTP serving of the preserved cache-first worker followed by the replacement. The final worker test verifies an actual previously installed cache-first worker, not merely a synthetic cache.

### Final commands and observed evidence

Node path: `C:\Users\ovadia\Downloadsold\agent\.venv\Lib\site-packages\playwright\driver\node.exe` (**v24.18.1**); npm CLI: `C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`. Each command used the modern Node directory prepended to PATH. Final verification ran `npm test`, `npm run build` then `npm run test:production`, and `npm run test:browser`; all exited **0**.

1. **`npm test`**: library count/unique bilingual texts/eight categories/metadata/last-ten avoidance; real PostgreSQL cluster **55434** with Origin/auth/cookies/logout/throttling, revoked/expired/concurrent invitation redemption, wrong-account denial, single active session, secret exclusion/state/history/inbox/SSE, immutable delivery, creation/message retry keys, acknowledgement, return/resubmission, concurrent single award, penalty-free refusal, pause union/review-clock fixtures, stale consent, scheduling while paused, concurrent stop/review ordering and terminal expiry.
2. **`npm run build`**: `tsc --noEmit && vite build` passed; 16 transformed modules; HTML **0.64 kB**, CSS **5.70 kB**, JS **278.95 kB / 88.36 kB gzip**.
3. **`npm run test:browser`**: actual installed Playwright Chromium, real PostgreSQL cluster **55435**, app **4180**, three isolated contexts. Wife/husband register/pair/approve, secret draft/send/ack/completion/review, text persisted through reload and SSE-blocked polling, independent pauses, category/favorite filtering and dice-to-edit. **320/390/768px**, Hebrew RTL and English LTR, all six wife tabs: no document horizontal overflow. Actual preserved root cache-first worker upgraded over HTTP, old cache removed, new remote UI loaded, CacheStorage empty, API no-store and safe offline notice. Unrelated direct access rejected, terminal stop verified, **zero uncaught page errors**.
4. **`npm run test:production`**: actual `server/index.ts` child process, built assets and migrations against real PostgreSQL **55436**, app **4181**. Secure/HttpOnly/SameSite production cookies, HSTS, exact HTTPS-configured Origin rejection, worker headers, scoped legacy and no source-file serving. Loopback HTTP transport with an HTTPS Origin configuration is a configuration smoke, **not live TLS/deployment verification**.

Tests stop their child/browser/server processes and gracefully stop/remove their disposable clusters; `.local/postgres` is not used or deleted. README, QA-REVIEW and ARCHITECTURE now contain runnable instructions and the implemented behavior instead of prototype claims.

### Acceptance handoff / limitations

Historical handoff: Task 2 was implemented and locally verified, but that was **not acceptance**. Task 3 subsequently blocked acceptance on the three findings recorded below. No acceptance verdict is inferred from the earlier design approval. No physical iOS/Android/Safari/Firefox, screen-reader audit, live slow-network, load/soak test, backup/restore drill, external TLS deployment or production security audit. SVG icons need real iOS/raster-fallback QA. No account recovery/email verification/unpair/export/deletion tooling. Aggregates/history are unpaginated, pair formation globally serialized and SSE process-local (polling is durable fallback); production scaling/retention and private DB/HTTPS/proxy/backups require operational work documented in README. No media, push, branching, achievements/levels or live voice is implemented.

## 2026-11-07 — Corrections after BLOCKED independent acceptance

Controller/user authorized accelerated agent implementation; workers were prohibited from spawning nested agents. Corrected the earlier misattribution in both worker sections above. This correction task used no nested agents and made no commits or external deployment; all source/docs edits used `apply_patch`. Existing partial submission changes were inspected and retained after interruption. Unrelated environment artifacts were not removed.

### Confirmed defects and implementation

1. **Submission retry ambiguity:** completion/review previously acted on whichever work was current. Added JSONB `submissionVersion` (pre-version records default to 0), mandatory caller UUIDs and expected/exact version fields. Under the existing session lock, authorized caller-scoped `request_keys` lookup returns an exact original completion/review result for committed retries. New submissions use compare-and-set and new reviews require the exact submitted version; request result, history, state and unique point award commit together. Replays during pause/after newer work/after stop do not rerun a gameplay transition. Client creates/reuses keys per operation/mission/payload and sends the displayed version. In-memory retry keys survive failed requests, not page reloads; server records are durable.
2. **Busy state blocked safety:** safety buttons no longer consume `BusyContext` and use `runSafety`, bypassing the ordinary `run` guard. Pause/resume/stop have no dependency on an ordinary in-flight request. All API fetches/body reads have a 15-second abort deadline; timeout reconciles authoritative state, releases ordinary busy state and retains the UUID because a server commit may have happened. Safety still needs connectivity and database locking; no local-success fiction is introduced.
3. **Legacy CSP breakage:** extracted executable script to `legacy/demo.js`; generated buttons use allowlisted delegated `data-action`/`data-mission` listeners, not inline handlers/eval. Production script CSP is unchanged and shared with root. Legacy v2 scoped worker caches the external script and upgrades its old namespace with network-first reads. The original root cache-first worker is an exact test fixture so the existing upgrade regression is preserved.

### Red evidence / interruption handling

- Integration regression failed on missing version (`undefined !== 1`) before the submission fix.
- Under Node 26, held-draft browser regression failed because Pause resolved to a disabled button; after fixing safety, the legacy regression failed because Create did not change state under CSP. These failures are retained as evidence, not passing results.
- Interrupted browser attempts left disposable clusters `her-rules-browser-oqAaiz`, `her-rules-browser-6FBo1G` and `her-rules-browser-68560L`; stopped the affected test clusters with `pg_ctl -m fast`, never the development cluster. A temporarily incomplete `node_modules`/changing npm environment caused module-not-found and Windows locked-DLL errors; restored a separate control binary in approved temporary space to stop the affected cluster, then restored the lockfile install. No production or user data was deleted. Subsequent instructed runtime is system Node 26, without a bundled-Node PATH override.

### Exact final verification (all exit 0)

From `D:\her rules`, `node --version` returned **v26.13.0**, `npm.cmd --version` **11.20.0**. PowerShell policy still blocks `npm.ps1`; used `npm.cmd`, without changing execution policy. Fresh final checks:

```powershell
node --version
npm.cmd test
npm.cmd run build
npm.cmd run test:production
npm.cmd run test:browser
```

- **Integration/library:** three PASS lines. Actual PostgreSQL 18.6 cluster 55434 covers all prior safety invariants plus OLD → returned → NEW interleaved old return/completion/approval, exact original replay results, fresh-key stale rejection, same-key duplicate completion/review concurrency, distinct-key compare-and-set races, replay after stop and single point effects. Library remains 160 unique bilingual ideas/eight categories/metadata/last-ten avoidance.
- **Build:** TypeScript no-emit and Vite passed; 16 modules; HTML 0.64 kB, CSS 5.70 kB, JS **279.56 kB (88.57 kB gzip)**.
- **Browser:** seven PASS lines plus registration checkpoint, real Chromium and PostgreSQL 55435/app 4180. Earlier account/polling/mobile/PWA/ownership flow retained. A real committed-but-held message response triggers the actual 15-second timeout; retry reuses UUID and exactly one message exists. Held draft and held message each allow **actual same-browser pause 200 and stop 200**, then release with 409/no late effect. Legacy creation, simulated agreement, delegated edit/send/ack/complete/remove work with **zero CSP violations** and **zero uncaught page errors**. 320/390/768px RTL/LTR checks remain passing.
- **Production:** real `server/index.ts` child uses system Node 26, actual PostgreSQL 55436/app 4181, built assets, Secure/HttpOnly/SameSite cookies/HSTS/exact Origin, root worker headers, source exclusion and legacy external script under the identical strict script CSP. Loopback configuration smoke, not live TLS hosting.

Test cleanup stopped/removed final disposable clusters. The user's separately running development server/database were preserved. README, QA-REVIEW, ARCHITECTURE and current DB-SETUP instructions now use system Node 26 / `npm.cmd`; old Node 24 gate evidence remains labeled historical. **Fixes are ready for reviewer reinspection; BLOCKED acceptance has not been self-overridden.** Physical-device/TLS/load/backup/security-audit limitations and deferred features remain as previously documented.
