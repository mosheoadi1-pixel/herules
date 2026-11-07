# Remote Foundation Implementation Plan

> **For agentic workers:** Use subagent-driven-development with independent approval before implementation and review after implementation.

**Goal:** Replace the browser-only experience with a tested Hebrew-first remote couples game foundation.
**Architecture:** React/TypeScript client and same-origin TypeScript API, PostgreSQL authoritative state, server-sent events for refresh and persisted inbox.
**Tech Stack:** React, TypeScript, Vite, Express, PostgreSQL, schema validation, browser integration testing.
**Spec:** docs/superpowers/specs/2026-11-07-remote-foundation-design.md

## Global Constraints
- Hebrew is the default; full RTL and optional English.
- No silence-as-consent; refusal, pause and stop have no penalty.
- Both players authenticate separately and approve exact agreement revisions.
- Server enforces roles, ownership, mission transitions, deadlines and terminal stop.
- Preserve the original prototype explicitly as a local demo.
- No commits, push or deployment unless requested.

## Task 1: Approved implementation contract and runtime preflight
- Review spec independently for correctness and missing security invariants before writing code.
- Check Node and PostgreSQL availability; use a supported installed Node executable if system Node is old.
- Record review verdict and setup commands in docs/IMPLEMENTATION-LEDGER.md.

## Task 2: Remote vertical slice
Files: package.json, tsconfig*.json, vite.config.ts, server/*, src/*, db/*, tests/*, public/*, legacy/*.
- Preserve existing HTML/service worker/manifest under legacy; production root becomes React entry point.
- Write failing integration tests for wrong-account access, stale agreement approval, acknowledgement requirement, own-pause release, stop terminality and one-time point review.
- Implement PostgreSQL migrations and transactional API, authentication/pairing, sessions/agreements, mission lifecycle/scheduling, inbox/history/text and SSE reconnect refresh.
- Implement bilingual Hebrew-first responsive UI consuming the actual API, not local simulated state.
- Implement at least 160 curated bilingual ideas and library filtering/favorites/recent-use avoidance; test count, uniqueness, categories and required metadata.
- Configure PWA shell only, never API caching; add icons and accessibility labels/status announcements.
- Run integration tests against actual PostgreSQL, typecheck/build and two-browser end-to-end flow. Record exact results, failures and limitations.

## Task 3: Independent acceptance review and corrections
- Fresh reviewer inspects implementation against spec, focusing on cross-account access, concurrent approvals/reviews, secret content leakage, stopped sessions and browser test evidence.
- Fix important findings and rerun covering tests before scoped rereview.
- Update README.md, QA-REVIEW.md and docs/ARCHITECTURE.md with verified functionality, configuration, reproduction steps and remaining work.

## Controller preflight
Task 1 produces an approved contract consumed by task 2. Task 2 produces actual code/test evidence consumed by task 3. Task 3 may amend task 2 files only after implementation has finished. No concurrent writers share files. Existing untracked source must be preserved, not overwritten without a legacy copy. Environment-dependent integration results must not be reported as passing without running them.
