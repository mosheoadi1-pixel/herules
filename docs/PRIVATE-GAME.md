# One private game, two players

Each server/database has one `private_game` row with one wife identity and one husband identity. New entry locks this row, reserves one vacant role, and automatically creates the shared pair when both roles are occupied. Role claim and new-user creation commit together. There are no invitation or redemption endpoints. Separate cookies still distinguish approvals and safety actions. More tabs with the same cookie are the same player, not additional role slots.

## Existing installations

- No existing pair: the first two opposite-role identities claim the private game. Existing unpaired accounts can sign in to claim a still-vacant role; merely sharing a nickname cannot recover an old identity.
- Exactly one existing pair: migration 003 adopts its original player IDs and pair ID. Existing sessions, points, messages, approvals, cookies and registered credentials are retained. No game data is deleted.
- More than one existing pair: startup refuses to choose. This prevents accidental disclosure or loss. An administrator must deliberately select the intended pair before restarting. Other pairs' data remains in the database and inaccessible through the selected private game.

### Explicit selection for an older multi-pair database

Stop the application and take a database backup. Use a trusted PostgreSQL administrative connection, inspect `SELECT id,wife,husband FROM pairs;`, and choose the correct pair with its two owners. Execute the following SQL after replacing `CHOSEN-PAIR-UUID` with that pair ID. It does not replace an already selected private game or delete any pair.

```sql
BEGIN;
SELECT pg_advisory_xact_lock(731903);
CREATE TABLE IF NOT EXISTS private_game (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 wife uuid UNIQUE REFERENCES users,
 husband uuid UNIQUE REFERENCES users,
 pair_id uuid UNIQUE REFERENCES pairs,
 CHECK(wife IS NULL OR husband IS NULL OR wife<>husband),
 CHECK((pair_id IS NULL) = (wife IS NULL OR husband IS NULL))
);
INSERT INTO private_game(singleton,wife,husband,pair_id)
 SELECT true,wife,husband,id FROM pairs WHERE id='CHOSEN-PAIR-UUID'::uuid
 ON CONFLICT DO NOTHING;
SELECT singleton,pair_id FROM private_game;
COMMIT;
```

Confirm the selected ID is correct, then restart. If no row was inserted, correct the ID before proceeding. Administrative selection is an access-control decision; do not automatically pick the first or newest pair. The explicit-selection procedure is documented; automated tests cover sole-pair adoption and ambiguous-selection rejection, not a live operator migration.

## Access lifecycle

The address must be privately reachable during initial setup: any visitor can claim an unoccupied role. Once claimed, another identity cannot take that role, even after logout or cookie expiration. Nicknames may coincide but are never credentials. Guest cookies expire after seven days with no automatic extension. Signing out asks for confirmation because guest access cannot currently be recovered. Use the same browser and address; changing hostnames creates a separate cookie context. Self-service role reset/recovery is not implemented, and deleting production data is not a recovery strategy.
