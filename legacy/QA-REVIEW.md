# Historical QA notes — HER RULES legacy MVP 0.1

- [PASS] all primary views exist
- [PASS] session creation control exists
- [PASS] mission approval, player acknowledgement, completion submission and review workflow exist
- [PASS] mutual boundary approval enforced
- [PASS] session extension control exists
- [PASS] stop control exists
- [PASS] browser-local persistence exists
- [PASS] PWA service worker registration guarded
- [PASS] production limitations documented

## Findings / blockers
- Remote sessions are not implemented: no backend, authentication, invitation-token service, or real-time transport.
- The invitation code is demonstrative only and is not secure.
- The two agreement checkboxes are a single-browser simulation, not independent authenticated consent.
- Offline mission queue is represented in the UI workflow only; cross-device delivery requires backend storage and synchronization.
- Timer is a local display approximation; multi-day correctness requires server-authoritative timestamps.
- Audio, notifications and live voice are described but not implemented.
- PWA offline shell is basic; production iOS behavior needs HTTPS and device testing.

- Local pause and break now shift the demo end timestamp when resumed; production still requires server-authoritative time.
