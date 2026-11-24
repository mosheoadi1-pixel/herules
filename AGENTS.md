# AGENTS.md

Hebrew-first/RTL React + TypeScript app ("HER RULES") with one same-origin Express server and real PostgreSQL. One private game, two roles: `wife` (drafts, delivers, reviews, awards points) and `husband` (acknowledges, completes).

## Commands

```bash
npm ci                                  # restore lockfile (needs network)
npm run db:start                        # dev PostgreSQL on 55432, foreground
export DATABASE_URL='postgresql://postgres:local-dev-only@127.0.0.1:55432/postgres'
export APP_ORIGIN='http://localhost:3000'
npm run dev                             # tsx server/index.ts + Vite middleware, port 3000
npm run build                           # tsc --noEmit && vite build  <-- the only static gate
npm test                                # 12 suites, chained with &&; stops at first failure
npx tsx tests/roulette.ts               # run one suite
npm run test:browser                    # Playwright/Chromium; spawns its own DB
npm run test:production                 # requires `npm run build` first
```

- **There is no lint or formatter.** No ESLint/Prettier/Biome config. `npm run build` is the typecheck.
- On Windows PowerShell use `npm.cmd` / `npx.cmd` (`npm.ps1` is blocked by execution policy).
- Suites not in `npm test`: `idea-destinations`, `roulette`, `inspiration-browser`, `redesign-browser`, `browser`, `production`.

## Hard constraints

- **The DB harness is Windows-x64 only.** `scripts/db/runtime.mjs` throws on any other `process.platform` and hardcodes `node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe`. Every suite calls `startDatabase()`, so `db:start`, `db:test` and all of `npm test` cannot run on Linux/macOS without editing that module.
- `engines.node >= 24`. Older Node is untested; `tsx` and Vite run the TS sources directly.
- **No dotenv.** `.env` is gitignored and never loaded; config comes from the process environment only. Startup throws without `DATABASE_URL`. `.env.example` documents the rest.
- `APP_ORIGIN` must be an exact origin (no path/trailing slash) and HTTPS when `NODE_ENV=production`. Non-GET requests are rejected with 403 unless the `Origin` header equals `APP_ORIGIN` or the request's own host — test HTTP clients must send a matching `Origin`.
- `HR_RESET_GAME_ON_START=1` wipes sessions, points, approvals, cookies and messages and reseeds identities/tasks. Dev and test only.
- Test suites each spin a disposable cluster on a fixed port (55434–55449; `tests/foryou.ts` needs no database) and never touch `.local/postgres`. Ports must be free; ports collide if two suites run concurrently.
- Browser suites `require()` Playwright from a hardcoded Windows path; override with `PLAYWRIGHT_MODULE=<absolute package dir>`. Chromium must be installed.

## Architecture

- One process. `server/index.ts` creates the pg pool, calls `createApp`, mounts Vite middleware in dev and `dist/` in production. The server is **never compiled** — `npm start` runs `tsx server/index.ts`, so there is no built server artifact.
- `src/` and `server/` form a single module graph: `server/app.ts` imports `../src/quick.ts` and `../src/progress.ts`; `src/app-shared.ts` type-imports from `../server/app`. Imports use explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`, `noEmit`) — extensionless imports break the typecheck.
- Session state is **one JSONB aggregate** in `sessions.data` (`Session` in `server/app.ts`). `approvals`, `awards` and `request_keys` are separate tables. Mutations take `SELECT ... FOR UPDATE` and must commit the aggregate, side rows, history and retry record atomically.
- Idempotency is `request_keys(session_id, user_id, kind, key)`: a replayed UUID returns the originally stored result. Reuse that mechanism instead of inventing another.
- New `Session`/`Mission` fields must be **optional** in the types. Rows written by older versions are not migrated; missing fields default in code.
- Schema lives in `db/NNN-*.sql`, applied in numeric order from `createApp` **on every startup**. Files must be repeat-safe (`CREATE TABLE IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` before re-adding). A new migration needs a new file *and* a `pool.query(await readFile(...))` line in `createApp` — and it also runs against existing databases, so no destructive `ALTER`s.
- Every user-facing string is a `[he, en]` tuple (`src/i18n.ts`); server error text is mapped to bilingual copy through `serverMessages`. UI defaults to Hebrew RTL. Don't hardcode English-only labels.

## Where to trust, and what is stale

- `README.md` and `docs/` are exhaustive but drift from the code: they describe the client as `src/main.tsx` + `src/style.css` while the UI now lives in `src/components/*` (dashboard also hosts `ForYou`, `Garden` and `Proposals` panels), say migrations `001–003` while `004-imported-ideas.sql` is also applied, and list suite ports `55434–55440` while `tests/play-flow.ts` uses `55441`. Prefer code and `package.json` over prose.
- `QA-REVIEW.md`: only the newest dated section is current; older sections are historical records of past cycles.
- `legacy/` is a frozen browser-only prototype kept for reference. Don't refactor it toward parity.
- `.opencode/skills/` holds generic design/brand skills unrelated to app code — ignore them when working on this app.

## Container quirks in this checkout

- Outbound TLS from libcurl- and Node-based tools crashes the sandbox runtime (`free(): invalid pointer`): `git clone/fetch/push` over HTTPS, `curl`, `npm`, `node fetch`. Use the existing **SSH** remote for git; Python 3 and `ssh` networking work.
- `node_modules/` is absent and cannot be installed here, so builds and tests are not runnable in this container as-is; treat them as verification to run on the Windows host.
