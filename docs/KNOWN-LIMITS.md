# Known limits

These are deliberate or current limits of the app. Read them before relying on the app for anything important.

## Notifications
- Notifications are not guaranteed while the app is closed. Updates are checked when the app is open or when it reconnects.
- The "reconnect" nudge is shown only inside the app. It does not send a push message.
- Notification permission and browser support vary; some browsers block them entirely.

## Her Night and saved evenings
- Her Night uses three fixed step templates per mood (soft, playful, strict). She can choose the mood and confirm the steps, but she cannot edit the template text.
- Saved evenings store exactly the steps she saved. She can rename and re-run them, but not edit their steps.
- Her Night steps and quick commands share a per-evening limit (pace: 1 to 3). The limit counts commands created in the last 12 hours that are not cancelled or refused.
- "Done for tonight" cancels every queued invitation and blocks sending for 12 hours. There is no undo for the cancellation.

## Data and sessions
- Startup does not reset gameplay unless `HR_RESET_GAME_ON_START=1` is set. Do not set it on a server with real data.
- Guest access is tied to the browser and address. Self-service role recovery is not implemented.
- Ratings and private notes are visible only to the wife; the server hides them from the husband's view.
- The onboarding screen appears only when no pace has been set on the session, so it is shared across devices.

## Testing scope
- Automated tests cover the server rules and the main gameplay paths (`npm test`).
- The interface was checked in a browser on desktop and phone-width screens for the wife, and on desktop for the husband.
- No automated accessibility scan has been run yet. Screen-reader behaviour has not been tested on real devices.
