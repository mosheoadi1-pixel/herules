# Shared Experience Implementation Plan

> For agentic workers: use subagent-driven-development. Each cycle has a fresh implementer and independent reviewer. No commits requested.

**Goal:** Build the approved five-cycle shared relationship experience.
**Architecture:** Extend the existing JSON session aggregate and operation endpoint with optional backward-compatible fields. Keep authorization and transitions on the server, and surface bilingual actions in the existing React app.
**Tech Stack:** React, TypeScript, Express, PostgreSQL, existing assert/Playwright tests.
**Spec:** docs/superpowers/specs/2026-11-09-shared-experience-design.md

## Global Constraints
- Preserve wife-led direction, independent approvals, pause/stop/refusal invariants, immutable delivered terms and one-time awards.
- Hebrew/RTL and English/LTR; no new dependencies or explicit content.
- Preserve startup resets and user live processes; no commits or deployments.
- Optional new aggregate fields must support old sessions. Each cycle needs tests and independent review.

## Task 1: Adjustable invitations and held communication
Files: server/app.ts, src/main.tsx, tests/integration.ts or a focused integration test wired into package.json, README.md.
- [ ] Add regression tests: messages work with no approvals and during both pauses; no message after terminal; only husband requests adjustment; completion blocked while adjustment awaits replacement; only wife creates linked replacement; fresh acceptance required.
- [ ] Run targeted tests and record the failing result.
- [ ] Implement validated adjustment and replacement operations in row-locked transactions. Replacement preserves original terms and creates a new draft; cannot repeat replacement. Retain role, pause, agreement, version and idempotency protections.
- [ ] Add Hebrew/English request/note and replacement forms. Enable chat during holds. Explain next steps.
- [ ] Run covering integration test and npm.cmd run build; independent review and corrections.

## Task 2: Shared check-ins
Files: server/app.ts, src/main.tsx, relevant focused integration test, README.md.
- [ ] Test validated per-user check-ins, both users visible, no writing partner entry, holds allowed, terminal rejected.
- [ ] Run failing test; add optional session checkIns map and checkin operation. Validate minutes integer 1–1440, energy low/medium/high, mood connection/playful/quiet. Derive user key from authenticated identity.
- [ ] Render brief bilingual check-in and partner summary without gating play.
- [ ] Run covering test/build, independent review, corrections.

## Task 3: Focused guided session
Files: src/main.tsx, src/style.css, server/app.ts if explicit sequence needed, browser tests.
- [x] Establish current behavior with focused browser assertions or pure view-model assertions.
- [x] Highlight one actionable invitation with role-specific next action; waiting agreement directs to Agreement. Wife may optionally choose/order up to three existing missions for a session sequence, validated server-side. Guidance does not deliver or accept on anyone's behalf.
- [x] Keep all mission cards reachable; collapse composer and hero after entry where appropriate; preserve editing flow.
- [ ] Test sequence validation and current-card derivation, build, independent review, corrections.

Cycle 3 tests/build/browser/local review PASS; independent cycle 3 review pending under current no-subagent execution instruction. Exact evidence/interfaces and the supplied cycle 2 independent PASS are in the progress ledger.

## Task 4: Completion and appreciation
Files: server/app.ts, src/main.tsx, focused integration tests, README.md.
- [ ] Test simple completion without text; missing-style legacy mission still requires text; written submission version/review retry protections hold; per-user reflection works while held and terminal without changing clock/points/play.
- [ ] Add completionStyle simple/written before delivery; default new missions simple, missing field written. Keep explicit acknowledgement and wife review. Add per-user replaceable reflection {appreciation,repeat} validated to 1000 chars each, at least one nonempty.
- [ ] Render bilingual style selection, simple completion and optional closing reflection; no compulsory appreciation.
- [ ] Run covering tests/build, independent review, corrections.

## Task 5: Polish and full verification
Files: src/main.tsx, src/style.css, tests/browser.ts, README.md, QA-REVIEW.md.
- [x] Add actual browser coverage for new cycles and both completion styles. Check mobile 320/390/768 RTL/LTR, focus, and visible next actions.
- [x] Fix copy/layout/integration issues and document current behavior, reset limits and exact evidence.
- [x] Run npm.cmd test, npm.cmd run build, npm.cmd run test:browser, npm.cmd run test:production.
- [ ] Independent whole-change review; fix confirmed issues; rerun covering checks and report limits.

Cycle5 controller checks PASS; independent final review follows this handoff. Fresh evidence, cycle4 supplied independent PASS, interfaces and limits are recorded in the progress ledger and at the top of QA-REVIEW.md.
