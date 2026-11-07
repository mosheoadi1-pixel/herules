# Local PostgreSQL setup gate

Original database-tooling gate verified on Windows x64, 2026-11-07; the original gate evidence below predates the app. Current remote-app commands and reviewer-fix verification use **system Node v26.13.0 and `npm.cmd`** (PowerShell blocks `npm.ps1`; do not change execution policy). See README/QA-REVIEW for the implemented application and current app tests.

## Decision

- `pg@8.16.3` is the runtime SQL driver.
- `embedded-postgres@18.6.0-beta.19` is a development-only binary distributor/cluster initializer. Its Windows package runs **actual PostgreSQL 18.6**, not an in-memory SQL substitute. The wrapper has a prerelease version; PostgreSQL reports 18.6.
- Exact top-level versions plus `package-lock.json` provide repeatable `npm ci`. Install scripts and platform optional dependencies must be enabled. The initial install needs network access; installed binaries run locally without Docker or a Windows service.
- Use bundled `pg_ctl.exe` to start/stop. The wrapper's Windows `stop()` uses forced `taskkill`, so it is deliberately not used. `pg_ctl stop -m fast -w` disconnects clients, rolls back active work, and performs a clean shutdown.
- No React, Express, TypeScript, validation or browser packages yet: those belong to app implementation.

## Exact setup and normal commands (PowerShell)

Run from `D:\her rules`:

```powershell
node --version
npm.cmd ci
npm.cmd run db:test
npm.cmd run db:start
```

At the original gate, the Playwright-bundled Node reported **v24.18.1** and system Node was **v16.18.0**. That fallback is historical; system Node is now **v26.13.0**. Original dependency installation/clean reproduction added 18 packages, audited 19 and reported 0 vulnerabilities. Current dependencies/lockfile also include the app; use `npm.cmd ci` to restore that current lockfile only when app/test database processes are stopped (Windows locks their binary DLLs).

`db:start` initializes or reopens `.local/postgres`, stays in the foreground, and prints:

```text
DATABASE_URL=postgresql://postgres:local-dev-only@127.0.0.1:55432/postgres
Local development only. Press Enter or Ctrl+C to stop gracefully.
```

Set that `DATABASE_URL` in the app process. The database name is `postgres`; the database launcher itself does not provision the app schema (app startup applies the initial migration). In another terminal, a direct connection check is:

```powershell
node --input-type=module -e "import pg from 'pg'; const c=new pg.Client({connectionString:'postgresql://postgres:local-dev-only@127.0.0.1:55432/postgres'}); await c.connect(); console.log((await c.query('SELECT 42 AS answer')).rows); await c.end();"
```

Press Enter or Ctrl+C in the database terminal to stop; data stays on disk. Close app clients first. Do not start a second owner of the same cluster. If the terminal is forcibly killed, recover with the bundled control tool:

```powershell
& '.\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe' status -D 'D:\her rules\.local\postgres'
& '.\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe' stop -D 'D:\her rules\.local\postgres' -m fast -w -t 30
```

Only run recovery stop if status reports this cluster running. Logs are in `.local/postgres/server.log`. Never delete the directory as a routine startup repair. `.local/`, `node_modules/`, and local environment files are ignored by Git.

## Historical Node 24 gate evidence

Final command: `& $node $npm ci`, followed on success by `& $node $npm run db:test`; both exited successfully. Actual output:

```text
PostgreSQL 18.6 on x86_64-windows, compiled by msvc-19.44.35228, 64-bit
PASS: schema/table creation and UTF-8 persistence visible to second connection
PASS: transaction isolation and rollback
PASS: overlapping queries on two distinct PostgreSQL backends
PASS: graceful shutdown, no postmaster.pid, connection refused
PASS: restart reuses cluster and retains committed data
PASS: isolated test cluster removed
```

The assert-based test creates a unique temporary cluster, uses port 55433, creates `setup_gate.probe` with a primary key and nonnull text, commits Hebrew text, and reads it through a second client. An uncommitted insert is visible only to its transaction; rollback removes it. Concurrent `pg_sleep` queries use different backend PIDs. After shutdown, the server log confirms `database system is shut down`, the PID file is absent, and a new connection fails with `ECONNREFUSED`. Restart verifies committed data survives. The successful test removes its own cluster, never `.local/postgres`.

The foreground `db:start` entry point was also exercised using this exact command; it connected, returned 42, accepted Enter, and printed `PostgreSQL stopped; data retained.`:

```powershell
node --input-type=module -e "import {spawn} from 'node:child_process'; import pg from 'pg'; const child=spawn(process.execPath,['scripts/db/start.mjs'],{stdio:['pipe','pipe','inherit']}); let output=''; let checked=false; child.stdout.on('data',async data=>{process.stdout.write(data); output+=data; if(!checked && output.includes('Press Enter')){checked=true; const c=new pg.Client({connectionString:'postgresql://postgres:local-dev-only@127.0.0.1:55432/postgres'}); try {await c.connect(); console.log('PASS: db:start accepts a real SQL connection:',(await c.query('SELECT 42 AS answer')).rows[0].answer);} finally {await c.end(); child.stdin.end('\n');}}}); child.on('exit',code=>{if(code!==0 || !checked) process.exitCode=1;});"
```

## Discovery commands and resolved failures

```powershell
Get-Command node,npm,docker,psql,pg_ctl -ErrorAction SilentlyContinue | Format-List Name,Source
Test-Path -LiteralPath 'C:\Program Files\PostgreSQL'
docker context ls
docker --context default info
docker --context desktop-linux info
& 'C:\Program Files\nodejs\node.exe' --version
& $node $npm view embedded-postgres version engines optionalDependencies --json
& $node $npm view embedded-postgres readme
```

No PostgreSQL commands were found on PATH; the standard PostgreSQL directory returned False. Both Docker contexts failed because their named engine pipes were absent. No exhaustive drive search was needed after the npm runtime worked.

`& $node scripts/db/test.mjs` initially failed because the runtime module did not exist yet. The first implemented run timed out: `execFile` waited on inherited Windows pipe handles even though PostgreSQL's log showed it ready. Diagnosis used `Get-CimInstance Win32_Process -Filter "name = 'postgres.exe'" | Format-List ProcessId,ParentProcessId,CommandLine` and the cluster's `server.log`. The aborted run subsequently logged child-process/shared-memory errors. Its cluster was explicitly stopped successfully:

```powershell
& '.\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe' stop -D 'C:\Users\ovadia\AppData\Local\Temp\her-rules-pg-gate-WYkB42' -m fast -w -t 15
```

Startup now uses `spawn` with ignored stdio and waits for the control process's exit. The next run passed SQL checks and stopped, but failed its inspection because this binary distribution omits `pg_controldata.exe`. Verification now uses shutdown logs, PID-file absence and a refused connection. Failed-run temporary directories may remain for diagnosis; successful runs remove theirs.

## Limits

Windows x64 only; ports 55432 (development) and 55433 (test) must be free. The known local-only superuser password is for disposable development, with SCRAM authentication and listening restricted to IPv4 loopback. Do not use it for production or real user data. A failed startup preserves diagnostics rather than deleting data; inspect the log/status before retrying. Ctrl+C is wired for graceful stop; the automated entry-point check exercised Enter. App authorization, app migrations, race semantics, builds and browser behavior remain outside this gate.
