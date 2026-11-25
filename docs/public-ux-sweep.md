# Public-mode UX sweep

## Direction and sources

- Opened [Superdesign](https://superdesign.dev/) in standalone Playwright Chromium (HTTP 200). Inspected the public home page's rendered white, Inter-based hero, single primary prompt action, and prompt-gallery layout. The gallery tiles were placeholders in the capture; no individual design or animation preset was inspected. The in-app browser was disconnected.
- The reference informed the hierarchy and the move from a focused hero to a visual feature gallery, not the palette, text, markup, or motion implementation. The oxblood, ember, cream, local/system serif stacks and line artwork are original to this pass. No reference assets, runtime embeds, trackers or packages were added.
- Consulted UI UX Pro Max's `social entertainment editorial dark cinematic` design-system search and focused `accessible authentication` / `reduced motion animation` UX searches; used the showcase hierarchy, stable controls and motion opt-out rather than its suggested palette and animation dependency.

## Findings and fixes

| Finding | Change |
| --- | --- |
| Public entrance reused private-game copy and offered unavailable providers. | Public-only editorial entrance, an above-fold 18+ sign-in card, and clearly fictional previews for discovery, chat and paired play. The UI offers only configured adapters. The opt-in config response contains only boolean availability; the ordinary response and auth enforcement are unchanged. |
| Signup preselected role and gender; the registration screen had no exit after an expired token. | Explicit selections, nickname guidance and validation, progress feedback, and a return to sign-in. Keyboard focus follows the signup, verification and sign-out transitions. |
| Verification loading was blank; manual review exposed disabled controls but no way to check status without reloading. Changing method could keep stale uploads selected. | Added loading, retry, review and status refresh; reset selected files when methods change, ignoring obsolete file reads. Existing consent text, versions, verification methods, retention, biometric processing and server decisions were not changed. |
| Logout cleared the interface even when the server request failed. | Preserve the signed-in view and show the error until logout succeeds. |
| Signed-in messaging and paired play lacked a shared public visual language, and the conversations list gave no initial loading guidance. | Reused the public palette, touch targets and visible focus; added loading and empty guidance. Consent, moderation, permissions, scores and the private game remain unchanged. |
| In-app Back from a session opened via the play inbox replaced the current entry, leaving obsolete play history behind. | Return to the chat entry through browser history; “All sessions” returns to the existing inbox when applicable. Regression coverage verifies browser Back/Forward, chat draft preservation and keyboard focus on return. |

## Verification

- `npm run build` and `npm run test:public-browser` passed. Public Chromium coverage includes keyboard focus, desktop English and 375px Hebrew RTL, bounded scroll movement, reduced-motion and no-IntersectionObserver fallbacks, an unconfigured provider and an OAuth error, fixture signup, review status refresh and logout recovery.
- All 27 `npm test` suites and `npm run test:production` passed. `npm run test:browser` (private) timed out at `tests/browser.ts:110` waiting for “Review agreement” in “Next step”; the same timeout reproduced at the same line on an exported, unmodified `6480b8d` baseline. The private failure remains out of scope.
- Verified fixture Dom and Sub flows included searching, chat invitations and acceptance, talking, proposing/countering/accepting sessions, paired-play entry and return, agreement, pause, mission completion, scoring, moderation and bilateral blocking. Test screenshots are outside the repository.
- The browser suite uses a fake provider and fixture accounts. It does not exercise a live OAuth login, a real verification vendor or camera, or Safari/Firefox/screen readers. This is not an accessibility or legal certification.
