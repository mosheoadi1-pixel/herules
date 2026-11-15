import type { Category, Idea } from './library';

export type WheelId = 'worship' | 'tease' | 'service' | 'dare';
export type WheelDefinition = { id: WheelId; name: { he: string; en: string }; description: { he: string; en: string }; categories: Category[]; tags: string[] };
export type MoodInput = { energy: 'low' | 'medium' | 'high'; mood: 'connection' | 'playful' | 'quiet' };

export const WHEEL_COST_MAX = 20;

// Each wheel is a pool rule over categories (required allowlist) and tags (any-of; an empty list means no tag filter).
// consequences and rewards are in no list, so they stay out of every wheel unless a definition lists them.
export const wheelDefinitions: WheelDefinition[] = [
 { id: 'worship', name: { he: 'הערצה', en: 'Worship' }, description: { he: 'מחוות הערצה ותשומת לב, בקצב שלה.', en: 'Gestures of devotion and attention, at her pace.' }, categories: ['worship', 'devotion'], tags: ['care', 'touch', 'memories', 'conversation'] },
 { id: 'tease', name: { he: 'שובבות', en: 'Tease' }, description: { he: 'רמזים והמתנה, עם בחירה חופשית בכל רגע.', en: 'Hints and anticipation, with a free choice at any moment.' }, categories: ['teasing', 'anticipation', 'roleplay', 'random'], tags: ['flirtation', 'anticipation', 'conversation', 'performance', 'teasing'] },
 { id: 'service', name: { he: 'שירות', en: 'Service' }, description: { he: 'משימות בית ומטבח שאפשר לתאם מראש.', en: 'Household and kitchen tasks to agree in advance.' }, categories: ['cleaning', 'cooking', 'training', 'dresscode'], tags: [] },
 { id: 'dare', name: { he: 'אתגר', en: 'Dare' }, description: { he: 'אתגרים ומשימות זמן קצרות, שאפשר לדחות בלי קנס.', en: 'Short challenges and timed tasks, which can be declined without penalty.' }, categories: ['challenges', 'timed'], tags: [] },
];

export function wheelPool(def: WheelDefinition, ideas: Idea[]): Idea[] {
 const allowed = new Set<Category>(def.categories);
 return ideas.filter(idea => allowed.has(idea.category) && (!def.tags.length || idea.tags.some(tag => def.tags.includes(tag))));
}

export function offeredWheels(ideas: Idea[]) {
 return wheelDefinitions.map(def => ({ def, pool: wheelPool(def, ideas) })).filter(wheel => wheel.pool.length > 0);
}

const tagsByMood: Record<MoodInput['mood'], string[]> = {
 connection: ['conversation', 'care', 'memories', 'touch', 'flirtation'],
 playful: ['performance', 'music', 'game', 'teasing', 'puzzle'],
 quiet: ['home', 'memories', 'writing', 'anticipation', 'planning'],
};
const tagsByEnergy: Record<MoodInput['energy'], string[]> = {
 low: ['home', 'memories', 'writing'],
 medium: [],
 high: ['outdoors', 'performance', 'music'],
};

export function moodTags(checkIn?: MoodInput): string[] {
 if (!checkIn) return [];
 return [...new Set([...tagsByMood[checkIn.mood], ...tagsByEnergy[checkIn.energy]])];
}

// Weight 2 when an idea shares a tag with her current mood, otherwise 1. Without a check-in or with weighting off, every idea weighs 1.
export function wheelWeights(pool: Idea[], checkIn: MoodInput | undefined, weighted: boolean): number[] {
 const tags = weighted ? moodTags(checkIn) : [];
 return pool.map(idea => (tags.length && idea.tags.some(tag => tags.includes(tag)) ? 2 : 1));
}

export function seededRandom(seed: number) {
 let state = seed >>> 0;
 return () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let value = state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
 };
}

// Returns the chosen index, or -1 for an empty list. A seed makes the choice reproducible; without one, Math.random is used.
export function pickWheelIndex(weights: number[], seed?: number): number {
 if (!weights.length) return -1;
 const random = seed === undefined ? Math.random : seededRandom(seed);
 let target = random() * weights.reduce((sum, weight) => sum + weight, 0);
 for (let index = 0; index < weights.length; index++) {
  target -= weights[index];
  if (target < 0) return index;
 }
 return weights.length - 1;
}
