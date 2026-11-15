import assert from 'node:assert/strict';
import { AUCTION_LIMITS, highestBid, settleAuction } from '../src/auctions.ts';

assert.deepEqual(AUCTION_LIMITS, { open: 5, stored: 50, maxAheadMs: 7 * 86400000, maxBid: 100000 });
assert.equal(highestBid([]), undefined);
assert.equal(highestBid([{ amount: 3, at: 1 }, { amount: 9, at: 2 }, { amount: 5, at: 3 }]), 9);

const live = { terminal: false, held: false };
assert.deepEqual(settleAuction({ bids: [], points: 50, ...live }), { outcome: 'no-bids', charge: 0 });
assert.deepEqual(settleAuction({ bids: [{ amount: 7, at: 1 }], points: 7, ...live }), { outcome: 'charged', charge: 7 }, 'an exact balance covers the bid');
assert.deepEqual(settleAuction({ bids: [{ amount: 5, at: 1 }, { amount: 8, at: 2 }], points: 7, ...live }), { outcome: 'void', charge: 0 }, 'the highest bid decides, and an uncovered bid voids');
assert.deepEqual(settleAuction({ bids: [{ amount: 2, at: 1 }], points: 50, terminal: false, held: true }), { outcome: 'void', charge: 0 }, 'held sessions void without charge');
assert.deepEqual(settleAuction({ bids: [], points: 50, terminal: false, held: true }), { outcome: 'no-bids', charge: 0 });
assert.deepEqual(settleAuction({ bids: [{ amount: 2, at: 1 }], points: 50, terminal: true, held: false }), { outcome: 'void', charge: 0 }, 'terminal sessions void every lot');
assert.deepEqual(settleAuction({ bids: [], points: 50, terminal: true, held: false }), { outcome: 'void', charge: 0 });

console.log('PASS auctions: limits, highest bid, charge only when the balance covers the top bid, held and terminal sessions void without charge');
