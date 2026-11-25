# Private-mode UX sweep

Private mode now shares the public entrance’s oxblood, ember and cream palette, local serif typography and dotted artwork. The role picker, existing 18+ participation confirmation and Enter button are the main path. No public account, verification or provider controls are shown. Only the artwork moves; it stays static on narrow screens, with reduced motion, or without IntersectionObserver.

The signed-in workspace uses flatter panels, a compact identity and status area, and wrapping navigation that keeps all destinations visible. Preferences still include notifications and high contrast. The Next step panel can open and focus the draft composer or the current invitation, without sending or acknowledging it. Pause and permanent stop remain independently available.

## Verification

- After `npm run build`, run `npm run test:private-ux` for a fixture game in Chromium. It checks desktop and 375px Hebrew/English entry, above-fold Enter, representative contrast, keyboard focus, bounded motion and fallbacks, guest pairing, explicit invitation acknowledgement, pause, completion, review/points and sign-out. Set `HR_REVIEW_SCREENSHOTS` to an existing directory outside the repo to capture review images.
- Run `npm run test:public-browser` for public entrance and paired-play regression coverage. The private styles are scoped to the private root.
- The historical `npm run test:browser` still stops at line 110. `d606a49` removed the private agreement screen and made its old API actions compatibility no-ops. Several later checks still require the removed agreement and the old session selector; replacing the first locator alone cannot restore that suite. The historical test is unchanged. The private smoke verifies the current contract: role pairing starts the game without a separate session agreement, but an invitation still requires explicit acknowledgement before completion.

This is not a full accessibility audit. Public legal review remains open; no policy, age-assurance, retention, or server configuration changes are included.
