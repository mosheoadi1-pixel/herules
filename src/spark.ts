const DAY = 86400000;
export const SPARK_REROLLS = 10;
export const SPARK_DISMISSED = 30;
const GENTLE = new Set(['care', 'aftercare', 'relax', 'rest', 'touch']);
const CALM = new Set(['home', 'reading', 'care', 'relax', 'rest', 'quiet', 'conversation']);
const PLAYFUL = new Set(['playful', 'tease', 'fun', 'game', 'dice', 'music']);
const CONNECTION = new Set(['connection', 'conversation', 'together', 'romance', 'devotion', 'worship']);

export type SparkIdea = { id: string; category: string; he: string; en: string; minutes: number; intensity: number; tags: string[] };
export type Spark = { day: number; rerolls: number; idea: SparkIdea };

// FNV-1a: deterministic and dependency-free.
function hash(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) { value ^= seed.charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

/** Eligible pool: never rewards or consequences, never an idea she dismissed. */
export function sparkPool(ideas: SparkIdea[], dismissed: string[] = []): SparkIdea[] {
  const skip = new Set(dismissed);
  return ideas.filter(idea => !['rewards', 'consequences'].includes(idea.category) && !skip.has(idea.id));
}

/** Gentle ideas first on a low-energy day; calm, playful or connecting tags float on a matching mood. */
export function rankSpark(pool: SparkIdea[], energy?: 'low' | 'medium' | 'high', mood?: 'connection' | 'playful' | 'quiet'): SparkIdea[] {
  const score = (idea: SparkIdea) => {
    let value = 0;
    if (energy === 'low' && (idea.intensity <= 2 || idea.minutes <= 15 || idea.tags.some(tag => GENTLE.has(tag)))) value += 3;
    if (mood === 'quiet' && idea.tags.some(tag => CALM.has(tag))) value += 2;
    if (mood === 'playful' && idea.tags.some(tag => PLAYFUL.has(tag))) value += 2;
    if (mood === 'connection' && idea.tags.some(tag => CONNECTION.has(tag))) value += 2;
    return value;
  };
  return pool
    .map((idea, index) => ({ idea, index, value: score(idea) }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map(entry => entry.idea);
}

/** One UTC-day spark; a reroll advances the walk without repeating the same idea when the pool allows it. */
export function pickSpark(pool: SparkIdea[], now: number, rerolls = 0): SparkIdea | undefined {
  if (!pool.length) return undefined;
  const day = Math.floor(now / DAY);
  const index = (hash(String(day)) + Math.max(0, rerolls)) % pool.length;
  return pool[index];
}

/** The day's single spark. Nothing is stored: the caller keeps only the day's reroll count and dismissals. */
export function dailySpark(ideas: SparkIdea[], opts: { now: number; rerolls?: number; dismissed?: string[]; energy?: 'low' | 'medium' | 'high'; mood?: 'connection' | 'playful' | 'quiet' }): Spark | undefined {
  const day = Math.floor(opts.now / DAY);
  const pool = rankSpark(sparkPool(ideas, opts.dismissed ?? []), opts.energy, opts.mood);
  const idea = pickSpark(pool, opts.now, opts.rerolls ?? 0);
  return idea ? { day, rerolls: opts.rerolls ?? 0, idea } : undefined;
}
