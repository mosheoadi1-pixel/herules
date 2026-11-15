import type { Mission } from '../server/app';
import { devotionStreak, missionStreak, weeklyRecap, type StreakStats } from './progress';
import { pickSpark, sparkDay, type SparkCheckIn, type SparkPick } from './spark';
import type { Idea } from './library';

const DAY = 86400000;
export const DIGEST_WINDOW_MS = 7 * DAY;
const herSpendEvents = ['herwish-redeem', 'wheel-spin'];
const adorationWeight: Record<string, number> = { loved: 2, liked: 1 };

export type DigestHistory = { at: number; event: string; by?: string; outcome?: string; rewardRequestId?: string; points?: number };
export type DigestAuction = { outcome?: string; winningBid?: number; closesAt: number };
export type DigestInput = {
  viewer: 'wife' | 'husband';
  now: number;
  missions: Mission[];
  history: DigestHistory[];
  rewardRequests?: { id: string; cost: number }[];
  auctions?: DigestAuction[];
  ideas?: Idea[];
  spark?: { sessionId: string; reroll: number; dismissed?: string[]; checkIn?: SparkCheckIn };
};
export type WeeklyDigest = {
  period: { fromDay: string; toDay: string };
  empty: boolean;
  approved: number;
  pointsEarnedHusband: number;
  pointsSpentHusband: number;
  pointsHerEarned: number;
  pointsHerSpent: number;
  streaks: { devotion: StreakStats; mission: StreakStats };
  topTags: string[];
  mostLovedIdea?: { title: string; category?: string; adoration: 'loved' | 'liked' };
  suggestion?: SparkPick;
};

// Derived at response time from the viewer's visible data. Nothing is stored and nothing is notified.
// Secret and surprise missions count toward approvals and points but never toward categories or the loved idea.
export function weeklyDigest(input: DigestInput): WeeklyDigest {
  const { now, missions, history } = input;
  const weekAgo = now - DIGEST_WINDOW_MS;
  const recap = weeklyRecap(missions, now);
  const approvedWeek = missions.filter(m => m.status === 'approved' && (m.approvedAt ?? 0) >= weekAgo);
  const requests = new Map((input.rewardRequests ?? []).map(request => [request.id, request]));
  const rewardDecisions = history.filter(h => h.event === 'reward-decision' && h.outcome === 'approved' && h.at >= weekAgo && h.rewardRequestId !== undefined);
  const rewardSpend = rewardDecisions.reduce((sum, h) => sum + (requests.get(h.rewardRequestId!)?.cost ?? 0), 0);
  const charges = (input.auctions ?? []).filter(lot => lot.outcome === 'charged' && lot.winningBid !== undefined && lot.closesAt >= weekAgo);
  const auctionSpend = charges.reduce((sum, lot) => sum + (lot.winningBid ?? 0), 0);
  const herSpends = history.filter(h => herSpendEvents.includes(h.event) && h.at >= weekAgo);
  const herSpent = herSpends.reduce((sum, h) => sum + (h.points ?? 0), 0);
  const deliveredWeek = missions.filter(m => m.deliveredAt !== undefined && m.deliveredAt >= weekAgo).length;
  const empty = recap.approvedThisWeek + deliveredWeek + rewardDecisions.length + charges.length + herSpends.length === 0;

  const counts = new Map<string, number>();
  for (const m of approvedWeek) if (!m.secret && !m.surprise && m.category) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  const topTags = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([category]) => category);

  const weight = (m: Mission) => adorationWeight[m.adoration ?? ''] ?? 0;
  const loved = input.viewer === 'wife'
    ? approvedWeek
      .filter(m => !m.secret && !m.surprise && !!m.title && weight(m) > 0)
      .sort((a, b) => weight(b) - weight(a) || (b.approvedAt ?? 0) - (a.approvedAt ?? 0) || a.id.localeCompare(b.id))[0]
    : undefined;

  const suggestion = input.viewer === 'wife' && input.ideas && input.spark
    ? pickSpark(input.ideas, { sessionId: input.spark.sessionId, day: sparkDay(now), reroll: input.spark.reroll + 1, dismissed: input.spark.dismissed, checkIn: input.spark.checkIn })
    : null;

  return {
    period: { fromDay: sparkDay(weekAgo), toDay: sparkDay(now) },
    empty,
    approved: recap.approvedThisWeek,
    pointsEarnedHusband: recap.herPointsThisWeek,
    pointsSpentHusband: rewardSpend + auctionSpend,
    pointsHerEarned: recap.herPointsThisWeek,
    pointsHerSpent: herSpent,
    streaks: { devotion: devotionStreak(missions, now), mission: missionStreak(missions, now) },
    topTags,
    ...(loved ? { mostLovedIdea: { title: loved.title, ...(loved.category ? { category: loved.category } : {}), adoration: loved.adoration as 'loved' | 'liked' } } : {}),
    ...(suggestion ? { suggestion } : {}),
  };
}
