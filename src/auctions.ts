export const AUCTION_LIMITS = { open: 5, stored: 50, maxAheadMs: 7 * 86400000, maxBid: 100000 } as const;
export type AuctionBid = { amount: number; at: number };
export type AuctionOutcome = 'charged' | 'void' | 'no-bids';

export function highestBid(bids: AuctionBid[]): number | undefined {
  return bids.reduce<number | undefined>((top, bid) => (top === undefined || bid.amount > top ? bid.amount : top), undefined);
}

// Burn rule: a charged amount leaves the economy; nobody is credited. Losing bids are never charged.
// A held or terminal session voids a due lot without charging, so no points move while play is paused.
export function settleAuction({ bids, points, terminal, held }: { bids: AuctionBid[]; points: number; terminal: boolean; held: boolean }): { outcome: AuctionOutcome; charge: number } {
  if (terminal) return { outcome: 'void', charge: 0 };
  const top = highestBid(bids);
  if (top === undefined) return { outcome: 'no-bids', charge: 0 };
  if (held || points < top) return { outcome: 'void', charge: 0 };
  return { outcome: 'charged', charge: top };
}
