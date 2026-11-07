# HER RULES — remote foundation

A Hebrew-first/RTL React + TypeScript app with a single same-origin TypeScript server and **actual PostgreSQL**. One private game, exactly two player identities: enter a nickname, choose a role, and join automatically. No registration or invitation code is required. Each adult independently approves exact agreement revisions and acknowledges optional missions. The original browser-only prototype is preserved at [`legacy/`](legacy/README.md); its simulated identities and consent are never used by the remote app.

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

Open **http://localhost:3000** in two separate browser profiles or devices. Enter a nickname and select wife in one, husband in the other, then self-attest adulthood. The first player waits; the second joins the same game automatically. Create a session, open Agreement in each browser and independently approve. The wife can draft/send/schedule; the husband acknowledges before written completion; the wife reviews for a single point award. Each role has one permanently reserved identity; third-player or duplicate-role entry is rejected. Existing paired accounts can still use their original cookies or email/password login.

Guest access expires seven days after entry. Signing out, clearing cookies or changing the address/browser loses guest access; **the occupied role is not released to another person**. Keep the same browser and address. There is no self-service guest recovery. Keep the game privately reachable while its initial roles are unclaimed. Upgrade preservation and multi-pair migration: [docs/PRIVATE-GAME.md](docs/PRIVATE-GAME.md).

`.env.example` lists environment values, but files are **not automatically loaded**. `DATABASE_URL` is required. `APP_ORIGIN` is the canonical address; additional IP/domain addresses work automatically when the browser sends requests back to the same address serving the game. First startup applies the idempotent initial SQL migration. Existing data is retained. Database startup/shutdown/recovery details: [docs/DB-SETUP.md](docs/DB-SETUP.md).

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

The importer validates the entire file before inserting and rolls back on database errors. Existing built-in and imported ideas remain. Identical normalized imported rows are skipped on reimport; editing any field creates a new idea. This does not deduplicate against built-in ideas. Imported rows are stored in `imported_ideas`, available only through an authenticated API, and appear alongside the built-in library. Restart the website once after installing this change, then reopen the library tab or refresh the page after each import. No website restart is needed for subsequent imports. There is no browser upload endpoint.

## Implemented

- Salted scrypt passwords; hashed opaque seven-day HttpOnly cookie sessions; logout revocation; exact-Origin mutation checks; PostgreSQL-backed attempt limits.
- One private game with two fixed role slots. Row-locked, transactional entry automatically forms the shared pair; losing concurrent claims roll back. Invitation screens and API endpoints were removed. Old invitation records are retained as legacy data, never used for entry.
- Versioned, immutable agreement history and unique per-user approvals. Changed terms suspend gameplay and cancel unfinished missions until two fresh approvals.
- Independent pauses, owner-only release, irreversible stop and terminal expiry. Safety controls use an independent request path, available during a pending ordinary request. Requests time out after 15 seconds and refresh authoritative state; a timeout does not imply the server rolled back. Server clock counts only active time across the union of all suspensions.
- Wife-owned draft editing, explicit sending, cancellation and scheduling; acknowledgement, penalty-free refusal, text completion, return for revision and one-time review/points. Delivered terms cannot be edited.
- UUID retry keys for mission creation, messages, completion and review. Completion uses an expected submission version; reviews bind to the exact submission version. Duplicate completion/review UUIDs transactionally return their original stored results even after newer work or stop, without changing that work. Secret drafts are excluded from husband responses until delivery; history/inbox use generic metadata.
- Persisted text, inbox/read state and history; content-free pair-authenticated SSE plus five-second authorized polling, including scheduling/reconnect fallback.
- **42 bilingual suggestions**: your two supplied CSV tasks plus the retained 40 bold prompts across eight categories. The original 160 everyday suggestions were removed. The Custom content tag isolates your additions; missing CSV metadata uses 10 suggested minutes and intensity3. Hebrew wording is preserved with whitespace trimming only, with English translations. The CSV is manually integrated, not watched or automatically imported. Duration/intensity/activity filters, favorites, last-ten avoidance and editable dice suggestions remain available. Existing retained IDs stay stable; removed IDs are not reused. Existing database missions/history are unaffected.
- Responsive burgundy/black/gold interface, Hebrew default/RTL and English/LTR, status/error announcements and keyboard focus styles.
- Root PWA worker replacement/old-cache cleanup, SVG icons and manifest. Navigation is network-first with a nonsensitive offline notice; no authenticated response is cached and `/api` is never intercepted.

## Verification

```powershell
npm.cmd test                 # library + isolated real PostgreSQL app integration
npm.cmd run build            # TypeScript check + Vite production bundle
npm.cmd run test:browser     # Chromium, accounts, mobile, worker upgrade, stalled-request safety, legacy CSP
npm.cmd run test:production  # after build: actual production entry/assets/cookie/CSP smoke
```

The tests use independent disposable PostgreSQL clusters/ports **55434–55437**, never the development cluster. Browser testing loads the installed Playwright package (not its bundled Node executable); override `PLAYWRIGHT_MODULE` with its absolute package directory on another machine. Chromium must be installed. The legacy demo uses an external script and delegated mission handlers under the same strict script CSP as the remote app. See [QA-REVIEW.md](QA-REVIEW.md) for exact executed evidence and limitations.

## Hosting and operational requirements

Nothing was deployed externally. To run the built app, `npm.cmd run build`, then set `NODE_ENV=production`, a real **HTTPS** `APP_ORIGIN`, a private production `DATABASE_URL`, and `npm.cmd start`. A TLS reverse proxy must forward SSE without buffering and allow heartbeat connections. The app sets Secure cookies and HSTS in production; plaintext local HTTP is only for development.

- Use a dedicated database, protected credentials and verified database TLS where required. The bundled local superuser/password is disposable development only. Startup applies numbered SQL files 001–003; provision with an owner and review migration permissions before restricting the runtime role. These scripts are repeat-safe but not a general migration-versioning framework. Future changes need explicit migrations and rehearsed rollback/restore procedures.
- `TRUST_PROXY` is optional, comma-separated trusted proxy IPs/CIDRs (Express syntax, e.g. `loopback`). Configure it only when network access is restricted to those proxies; otherwise forwarded IPs are ignored. Rate limits are per trusted client IP, ten-minute fixed windows: guest entry/registration 20, login 40. Shared NATs share a bucket. Without trusted-proxy configuration, a proxy shares one bucket for all clients.
- Back up PostgreSQL with managed encrypted snapshots or `pg_dump`; regularly restore to an isolated database. Backups and restore procedures have **not** been exercised for production. Never cache `/api` or HTML at a reverse proxy/CDN; redact cookies, bodies and invitation codes in access/error tooling.
- Run periodic maintenance for expired auth sessions/invitations and old rate-limit windows. Retention, export/deletion policy and account recovery need operational design before real sensitive user data is collected. Session content is stored as database text/JSONB, not end-to-end encrypted.
- Persisted inbox is the notification fallback. Delivery is evaluated on authorized reads, so scheduled content appears on reconnect/poll; no worker sends a background notification. iOS/Safari installation, icon raster fallbacks and real-device behavior require HTTPS/device QA. The app does not promise offline gameplay or reliable alerts while closed.

## Explicit follow-up scope

Media upload/recording, web push, live voice, branching gameplay, achievements/levels, password recovery/email verification, pair unlinking/deletion and account data export are not implemented. Independent implementation review identified three blockers; all were fixed and scoped re-review approved spec compliance and code quality. The controller reran all four verification commands successfully. This is local foundation acceptance, not production security certification. No production load/security audit, physical-device QA or external deployment is claimed. [Architecture](docs/ARCHITECTURE.md) · [implementation ledger](docs/IMPLEMENTATION-LEDGER.md).
