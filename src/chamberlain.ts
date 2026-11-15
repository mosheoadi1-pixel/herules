import { randomUUID } from 'node:crypto';
import type { Mission, Session } from '../server/app';

// Season pack specification
interface MissionSpec {
  titleHe: string;
  titleEn: string;
  textHe: string;
  textEn: string;
  points: number;
  secret?: boolean;
  surprise?: boolean;
  completionStyle?: 'simple' | 'written';
  category?: string;
}

interface SeasonPack {
  id: string;
  nameHe: string;
  nameEn: string;
  decreeWord: string;
  missions: MissionSpec[];
}

// Map decree moods to season pack IDs
const decreeToPack: Record<string, string> = {
  worship: 'contract',
  tease: 'tease',
  discipline: 'contract',
  service: 'contract',
  rest: 'rest',
};

// One-word decrees she can speak, as [he, en] tuples
export const moodLabels: Record<string, [string, string]> = {
  worship: ['סגידה', 'Worship'],
  tease: ['הקנטה', 'Teasing'],
  discipline: ['אימון', 'Training'],
  service: ['שירות', 'Service'],
  rest: ['מנוחה', 'Rest'],
};

// Built-in season packs (minimum viable set)
// These are pre-authored narrative arcs she can select from
const builtInPacks: SeasonPack[] = [
  // "The Contract" - 7 nights of gradual power exchange
  {
    id: 'contract',
    nameHe: 'החוזה',
    nameEn: 'The Contract',
    decreeWord: 'worship',
    missions: [
      { titleHe: 'ההצעה', titleEn: 'The Offer', textHe: 'את כותבת את הכללים הראשונים', textEn: 'You write the first rules', points: 10, category: 'ceremony' },
      { titleHe: 'החתימה', titleEn: 'The Signing', textHe: 'הוא חותם על החוזה בליבו', textEn: 'He signs the contract in his heart', points: 15, category: 'ceremony' },
      { titleHe: 'הסגידה', titleEn: 'Worship', textHe: 'הוא משתחוה ומפאר', textEn: 'He worships and praises', points: 15, category: 'worship' },
      { titleHe: 'המשימה', titleEn: 'The Task', textHe: 'משימה אישית שרק שלו', textEn: 'A personal task for him only', points: 20, category: 'timed' },
      { titleHe: 'האדג׳', titleEn: 'Edge', textHe: 'קרבה ללא סיפוק', textEn: 'Closeness without release', points: 20, category: 'edging' },
      { titleHe: 'התביעה', titleEn: 'The Claim', textHe: 'את שלו, לנצח', textEn: 'Yours forever', points: 25, category: 'denial' },
      { titleHe: 'הסיום', titleEn: 'The Finale', textHe: 'טקס סיום והבטחה', textEn: 'Closing ceremony and promise', points: 30, category: 'ceremony' },
    ],
  },
  // "The Tease" - anticipation and yearning
  {
    id: 'tease',
    nameHe: 'הקנטה',
    nameEn: 'The Tease',
    decreeWord: 'tease',
    missions: [
      { titleHe: 'הבוקר', titleEn: 'Morning', textHe: 'פתקית בוקר mystery', textEn: 'Morning mystery note', points: 5, surprise: true, category: 'anticipation' },
      { titleHe: 'הארון', titleEn: 'The Closet', textHe: 'ללבוש משהו מסוים', textEn: 'Wear something specific', points: 10, category: 'anticipation' },
      { titleHe: 'הציפייה', titleEn: 'The Wait', textHe: 'להמתין לה בבית', textEn: 'Wait for her at home', points: 15, category: 'anticipation' },
      { titleHe: 'הגילוי', titleEn: 'The Reveal', textHe: 'מה שהכנתי לך', textEn: 'What I prepared for you', points: 20, surprise: true, category: 'anticipation' },
    ],
  },
  // "Rest" - pause and renewal
  {
    id: 'rest',
    nameHe: 'מנוחה',
    nameEn: 'Rest',
    decreeWord: 'rest',
    missions: [
      { titleHe: 'הציווי', titleEn: 'The Decree', textHe: 'לנוח היום', textEn: 'Rest today', points: 5, category: 'rest' },
      { titleHe: 'המסאז', titleEn: 'The Massage', textHe: 'למסאז׳ לה', textEn: 'Her massage', points: 10, category: 'massage' },
      { titleHe: 'ההבטחה', titleEn: 'The Promise', textHe: 'לילה שקט', textEn: 'Quiet night', points: 10, category: 'rest' },
    ],
  },
];

// The next 8am in her local time (today if still before it, otherwise tomorrow),
// in epoch milliseconds. Composed chapters surface in the mission queue at morning mode.
export function nextMorning(from: number = Date.now()): number {
  const d = new Date(from);
  const eightToday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0, 0, 0).getTime();
  return eightToday > from ? eightToday : eightToday + 86400000;
}

// Chamberlain composition: given her decree, produce a MissionSpec[] chapter
export function chamberlainCompose(
  decree: { mood: string; season?: string },
  session: Session
): MissionSpec[] {
  const requested = decree.season && builtInPacks.some(p => p.id === decree.season)
    ? decree.season
    : undefined;
  const packId = requested || decreeToPack[decree.mood] || 'contract';
  const pack = builtInPacks.find(p => p.id === packId) ?? builtInPacks[0];

  const isStrict = session.persona === 'strict';
  // When she picks a story pack, its own word names the chapter.
  const labelMood = requested ? pack.decreeWord : decree.mood;

  return pack.missions.map(spec => {
    const adapted = adaptMissionText(spec.textHe, spec.textEn, isStrict, labelMood);
    return {
      titleHe: spec.titleHe,
      titleEn: spec.titleEn,
      textHe: adapted.textHe,
      textEn: adapted.textEn,
      points: spec.points,
      secret: spec.secret,
      surprise: spec.surprise,
      completionStyle: spec.completionStyle,
      category: spec.category || decree.mood,
    };
  });
}

// Adapt mission text to her persona and the mood she spoke.
// A strict persona adds severity; every decree prefixes its own mood word.
function adaptMissionText(
  he: string,
  en: string,
  isStrict: boolean,
  mood: string
): { textHe: string; textEn: string } {
  const label = moodLabels[mood] ?? [mood, mood];
  const hePrefix = isStrict ? 'בחומרה · ' : `${label[0]} · `;
  const enPrefix = isStrict ? 'Strictly · ' : `${label[1]} · `;
  return { textHe: `${hePrefix}${he}`, textEn: `${enPrefix}${en}` };
}

// Persist a composed chapter into the session aggregate.
// Missions start as `queued` so they are already in her queue and the existing
// advance() logic promotes them to `pending` at morning mode.
// Returns the new mission ids plus the cliffhanger line for the next morning.
export function chamberlainPersistComposition(
  session: Session,
  missions: MissionSpec[],
  morning: number = nextMorning()
): { missionIds: string[]; cliffhanger: { he: string; en: string } } {
  const missionIds: string[] = [];

  for (const spec of missions) {
    const id = randomUUID();
    missionIds.push(id);
    const mission: Mission = {
      id,
      revision: session.revision,
      title: spec.titleHe,
      text: spec.textHe,
      points: spec.points,
      secret: spec.secret ?? false,
      surprise: spec.surprise ?? false,
      chapter: true,
      completionStyle: spec.completionStyle ?? 'simple',
      category: spec.category || 'ceremony',
      status: 'queued',
      scheduledAt: morning,
      createdAt: Date.now(),
    };
    session.missions.push(mission);
  }

  // The cliffhanger is a single line she'll receive tomorrow at her adoration hour
  return {
    missionIds,
    cliffhanger: {
      he: 'מחר תבין למה ביקשתי את זה',
      en: 'Tomorrow you will understand why I asked',
    },
  };
}
