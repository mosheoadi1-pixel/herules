import type { Session } from '../server/app';
import type { Idea } from './library';

const DAY=86400000;
// Ideas she approved in the last ten days do not return to the deck, and skips age out after two weeks.
const RECENT_MS=10*DAY,SKIP_MS=14*DAY;
const LOVE_SCORE=4,LIKE_SCORE=2,SKIP_PENALTY=3;
const LOW_ENERGY_TAGS=new Set(['care','aftercare','relax','rest','touch']);
const DECK_SIZE=6;

export type DeckItem = { idea: Idea; score: number; matched: boolean };
type Skips = Record<string, number>;

// FNV-1a: deterministic, order-independent, no dependencies.
function hash(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) { value ^= seed.charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

/**
 * Builds her personalized invitation menu from what already exists: ratings on approved missions,
 * the tags/categories of ideas she loved, her own check-in energy, recent usage and local skips.
 * No server state is added; an empty game still yields a fresh daily menu (cold start).
 */
export function foryouDeck(ideas: Idea[], s: Session, opts: { lang: 'he' | 'en'; now: number; skips: Skips; energy?: 'low' | 'medium' | 'high'; recent?: string[] }): DeckItem[] {
  const { lang, now, skips, energy, recent = [] } = opts;
  const textOf = (idea: Idea) => (lang === 'he' ? idea.he : idea.en).trim();
  const byTitle = new Map<string, Idea>();
  for (const idea of ideas) { byTitle.set(idea.he.trim(), idea); byTitle.set(idea.en.trim(), idea); }
  const ratingByTitle = new Map<string, 'love' | 'like' | 'skip'>();
  for (const m of s.missions) { if (m.rating && byTitle.has(m.title.trim())) ratingByTitle.set(m.title.trim(), m.rating); }
  const usedTitles = new Set(s.missions.filter(m => now - (m.createdAt ?? 0) < RECENT_MS).map(m => m.title.trim()));
  const tagAffinity = new Map<string, number>();
  for (const [title, rating] of ratingByTitle) {
    if (rating === 'skip') continue;
    const weight = rating === 'love' ? 2 : 1;
    for (const tag of byTitle.get(title)!.tags) tagAffinity.set(tag, (tagAffinity.get(tag) ?? 0) + weight);
  }
  const day = Math.floor(now / DAY);
  const recentIds = new Set(recent);
  return ideas
    .filter(idea => !['rewards', 'consequences'].includes(idea.category))
    .filter(idea => !(skips[idea.id] && now - skips[idea.id] < SKIP_MS))
    .filter(idea => !usedTitles.has(textOf(idea)))
    .filter(idea => !recentIds.has(idea.id))
    .filter(idea => ratingByTitle.get(textOf(idea)) !== 'skip')
    .filter(idea => energy !== 'low' || idea.intensity <= 2 || idea.minutes <= 15 || idea.tags.some(tag => LOW_ENERGY_TAGS.has(tag)))
    .map(idea => {
      const rating = ratingByTitle.get(textOf(idea));
      let score = rating === 'love' ? LOVE_SCORE : rating === 'like' ? LIKE_SCORE : 0;
      let matched = rating !== undefined;
      for (const tag of idea.tags) if (tagAffinity.has(tag)) { score += tagAffinity.get(tag)!; matched = true; }
      // Daily novelty: the same taste yields a slightly different menu each day. The +1 floor
      // guarantees every eligible idea can appear even before she rates anything.
      score += 1 + (hash(idea.id + day) % 100) / 100;
      return { idea, score, matched };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.idea.id.localeCompare(b.idea.id))
    .slice(0, DECK_SIZE);
}
