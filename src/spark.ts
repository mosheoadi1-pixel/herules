import type { Idea } from './library';

export type SparkCheckIn = { energy: 'low' | 'medium' | 'high'; mood: 'connection' | 'playful' | 'quiet' };
export type SparkPick = Pick<Idea, 'id' | 'category' | 'he' | 'en' | 'minutes' | 'intensity' | 'tags'>;
export const sparkExcludedCategories: string[] = ['consequences', 'rewards'];
export const sparkRerollCap = 10;
export const sparkDismissedCap = 30;
const sparkPoolSize = 8;
const energyTags: Record<SparkCheckIn['energy'], string[]> = {
  low: ['care', 'rest', 'touch-light', 'touch', 'conversation'],
  medium: [],
  high: ['training', 'worship', 'dare', 'playful', 'performance'],
};
const moodTags: Record<SparkCheckIn['mood'], string[]> = {
  connection: ['care', 'romance', 'devotion', 'touch', 'flirtation'],
  playful: ['game', 'dance', 'play', 'teasing', 'music', 'random'],
  quiet: ['conversation', 'silence', 'reading', 'writing'],
};

export function sparkDay(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

export function sparkRerollsUsed(field: { day: string; count: number } | undefined, day: string) {
  return field?.day === day ? field.count : 0;
}

export function sparkHash(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function sparkScore(idea: Idea, checkIn?: SparkCheckIn) {
  if (!checkIn) return 0;
  const tags = new Set(idea.tags);
  let points = 0;
  if (energyTags[checkIn.energy].some(tag => tags.has(tag))) points++;
  if (moodTags[checkIn.mood].some(tag => tags.has(tag))) points++;
  return points;
}

export function pickSpark(ideas: Idea[], input: { sessionId: string; day: string; reroll: number; dismissed?: string[]; checkIn?: SparkCheckIn }): SparkPick | null {
  const dismissed = new Set(input.dismissed ?? []);
  const ranked = ideas
    .filter(idea => !sparkExcludedCategories.includes(idea.category) && !dismissed.has(idea.id))
    .map(idea => ({ idea, points: sparkScore(idea, input.checkIn), order: sparkHash(`${input.sessionId}|${input.day}|${idea.id}`) }))
    .sort((a, b) => b.points - a.points || a.order - b.order || a.idea.id.localeCompare(b.idea.id));
  if (!ranked.length) return null;
  const best = ranked.filter(entry => entry.points === ranked[0].points);
  const top = (best.length >= 3 ? best : ranked).slice(0, sparkPoolSize);
  const start = sparkHash(`${input.sessionId}|${input.day}`) % top.length;
  const { idea } = top[(start + input.reroll) % top.length];
  return { id: idea.id, category: idea.category, he: idea.he, en: idea.en, minutes: idea.minutes, intensity: idea.intensity, tags: idea.tags };
}

export function sparkTone(checkIn?: SparkCheckIn): 'soft' | 'bold' | 'playful' | 'quiet' | 'close' | null {
  if (!checkIn) return null;
  if (checkIn.energy === 'low') return 'soft';
  if (checkIn.energy === 'high') return 'bold';
  if (checkIn.mood === 'playful') return 'playful';
  if (checkIn.mood === 'quiet') return 'quiet';
  return 'close';
}
