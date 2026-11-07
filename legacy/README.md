# HER RULES — Legacy MVP 0.1 (local demo only)

This is a browser-based, local-first UI prototype for the approved HER RULES concept.

## Run it
- Open `index.html` directly for a local demo. Some PWA features require HTTPS or localhost.
- For PWA testing, serve this folder from a local static web server, then open it in a modern browser.
- On iPhone, install-to-home-screen requires hosting over HTTPS and using Safari's Share → Add to Home Screen.

## Included in this prototype
- Dark luxury responsive interface.
- Session creation with hour/day/weekend/custom/open-ended duration options.
- Wife's command center view.
- Editable mission suggestions and mission board.
- Approve/send, acknowledge, completion and review workflow.
- Session extension, pause, break and end controls.
- Shared boundaries, safe words and mutual approval for boundary changes.
- Local activity log and browser-local persistence.
- Basic PWA manifest and offline app-shell cache.

## Not implemented yet (requires a real backend / production work)
- Real accounts, authentication and secure invitation links.
- Remote two-device synchronization and server-authoritative session timers.
- Delivery of offline missions across devices.
- Push notifications, audio recording/upload and live voice.
- Production security, encrypted media storage, backups and account recovery.
- Real multi-user consent confirmations. The two checkboxes in this prototype are demo-only and must not be treated as remote verification.

## Critical architecture notes
1. Use a server-authoritative `created_at`, `ends_at`, `paused_at`, and accumulated pause duration. Never rely on a browser interval for multi-day timekeeping.
2. Queue missions in the backend with recipient, status, expiry, and idempotency key. Deliver only after reconnect; require acknowledgement before treating a mission as accepted.
3. Require both authenticated users to approve boundary revisions. A gameplay role must never be able to override a boundary or either player's pause/stop control.
4. Store invite tokens hashed, single-use or revocable, with expiry and rate limits. Do not put sensitive rules or mission text in invite URLs.
5. Keep photos and voice optional, consent-gated, private, encrypted in transit and at rest, with explicit retention/deletion controls.
6. iOS web push is subject to platform/browser requirements and generally requires an installed web app; provide in-app inbox as a reliable fallback.

## QA notes
- Manual code-level review performed for the prototype.
- This is not a deployed remote game and has not undergone external security review or multi-device integration testing.
