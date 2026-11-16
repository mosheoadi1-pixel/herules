import assert from 'node:assert/strict';
import { AUCTION_LIMITS, highestBid, settleAuction, type AuctionBid } from '../src/auctions.ts';

const bid = (amount: number, at = 0): AuctionBid => ({ amount, at });

assert.deepEqual(AUCTION_LIMITS, { open: 5, stored: 50, maxAheadMs: 7 * 86400000, maxBid: 100000 });
assert.equal(highestBid([]), undefined);
assert.equal(highestBid([bid(5)]), 5);
assert.equal(highestBid([bid(5), bid(9), bid(7)]), 9);
assert.equal(highestBid([bid(9), bid(5)]), 9, 'order does not matter');
assert.equal(highestBid([bid(4), bid(4)]), 4, 'equal bids keep the amount');

// Charged: the top bid is charged once and nothing is credited.
assert.deepEqual(settleAuction({ bids: [bid(5), bid(9), bid(7)], points: 20, terminal: false, held: false }), { outcome: 'charged', charge: 9 });
assert.deepEqual(settleAuction({ bids: [bid(9)], points: 9, terminal: false, held: false }), { outcome: 'charged', charge: 9 }, 'an exact balance still covers the bid');

// No bids means nothing to charge.
assert.deepEqual(settleAuction({ bids: [], points: 50, terminal: false, held: false }), { outcome: 'no-bids', charge: 0 });

// An insufficient balance voids the lot instead of going negative.
assert.deepEqual(settleAuction({ bids: [bid(10)], points: 9, terminal: false, held: false }), { outcome: 'void', charge: 0 });
assert.deepEqual(settleAuction({ bids: [bid(10)], points: 0, terminal: false, held: false }), { outcome: 'void', charge: 0 });

// A held session voids a due lot even when the balance would cover it.
assert.deepEqual(settleAuction({ bids: [bid(10)], points: 100, terminal: false, held: true }), { outcome: 'void', charge: 0 });

// A terminal session always voids, bids or not.
assert.deepEqual(settleAuction({ bids: [bid(10)], points: 100, terminal: true, held: false }), { outcome: 'void', charge: 0 });
assert.deepEqual(settleAuction({ bids: [], points: 100, terminal: true, held: false }), { outcome: 'void', charge: 0 });

// A charge never exceeds the balance: settle only ever returns a covered amount.
for (const points of [0, 3, 9, 10, 1000]) {
  const { outcome, charge } = settleAuction({ bids: [bid(10)], points, terminal: false, held: false });
  assert.ok(outcome !== 'charged' || charge <= points);
}

console.log('PASS auctions: limits, highest bid, charged once, no-bids, insufficient balance, held and terminal voids');
