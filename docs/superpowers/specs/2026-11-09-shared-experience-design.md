# Shared experience design

Approved scope: five cycles improving communication, connection, and shared play. No new explicit sexual content or arousal-focused mechanics.

## Constraints
- Preserve wife-led mission direction, independent agreement approvals, free refusal, owner-only pause release, permanent stop, and one-time point awards.
- Hebrew/RTL default and English/LTR must both work. No dependencies added.
- Preserve current startup reset behavior; explain that new session data resets too. Do not restart the user's live application.
- Work on branch improve-shared-experience in the existing checkout. No commits, merges, or deployment requested.
- Each cycle gets implementation, meaningful tests, independent subagent review, and fixes before proceeding.

## Cycle 1: invitation adjustments
Husband may request a softer version or an adjustment on a pending/acknowledged/revision invitation. Optional note, no reason required for decline. A request moves the mission to an adjustment state, retaining delivered terms. Wife may author a replacement draft linked to the original; the original is cancelled only when replacement is created. Replacement must be sent and freshly acknowledged before completion. Do not edit delivered terms in place. Ordinary messages remain available during pause/agreement review, but not after terminal stop/expiry. Messages never release pauses or resume gameplay.

## Cycle 2: check-ins
Store per-user session check-ins (available minutes, low/medium/high energy, connection/playful/quiet mood) with validated values. Each user changes only their own entry. Both can see responses; no inferred consent or automatic agreement. Check-ins may be updated during holds but not terminal sessions. Optional, not a gate to play.

## Cycle 3: guided session
Add a focused current invitation and next-action guidance for each role, plus a short optional session sequence of at most three wife-selected existing missions. Use existing mission order where possible; no autonomous delivery/acceptance or automatic escalation. Completed/archive cards remain reachable. Reduce repeated hero and composer prominence after entry. Clearly show when action is waiting on a partner or agreement, and provide direct navigation.

## Cycle 4: completion and appreciation
Mission completion style: simple or written, selected by wife before delivery. New missions default simple; old missions without a style remain written. Simple allows completion without a compulsory text report; written keeps existing submission/version/review invariants. Optional session appreciation/reflection from either participant, available during holds and after session end; must not resume play or affect points. Store with idempotent keys or use per-user replaceable reflection to prevent duplicate retries. Points remain unchanged and are not payment for affection.

## Cycle 5: polish and verification
Review Hebrew/English copy, mobile layout, keyboard accessibility, empty and waiting states. Cover actual browser flows for adjustment and replacement acceptance, held chat, independent check-ins, focused next action, simple and written completion, appreciation after ending. Run build, application tests, browser suite and production smoke as supported by existing setup. Independent final review includes cross-cycle behavior.
