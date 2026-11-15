import type { Mission, Session } from './server/app';
import type { Translate } from './app-shared';
import { z } from 'zod';

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

// Map decree words to season pack IDs
const decreeToPack: Record<string, string> = {
  worship: 'contract',
  tease: 'tease',
  discipline: 'training',
  service: 'service',
  rest: 'rest',
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
      { titleHe: 'המסאז', titleEn: 'The Massage', textHe: 'למסאז' לה', textEn: 'Her massage', points: 10, category: 'massage' },
      { titleHe: 'ההבטחה', titleEn: 'The Promise', textHe: 'לילה שקט', textEn: 'Quiet night', points: 10, category: 'rest' },
    ],
  },
];

// Chamberlin composition: given a decree word, produce a MissionSpec[] chapter
export function chamberlainCompose(
  decree: { mood: string; season?: string },
  moodNames: Record<string, [string, string]>,
  session: Session,
  t: Translate
): MissionSpec[] {
  // Determine which season pack to use based on decree mood
  const packId = decreeToPack[decree.mood] || 'rest';
  const pack = builtInPacks.find(p => p.id === packId) || builtInPacks[builtInPacks.length - 1];

  // Build missions from the pack, adapting text to session context
  const missions: MissionSpec[] = [];
  const persona = session.data?.persona || 'playful';
  const isStrict = persona === 'strict';

  for (const spec of pack.missions) {
    // Adapt mission text based on persona and mood
    const adapted = adaptMissionText(spec.textHe, spec.textEn, persona, isStrict, decree.mood, t);

    missions.push({
      titleHe: spec.titleHe,
      titleEn: spec.titleEn,
      textHe: adapted.textHe,
      textEn: adapted.textEn,
      points: spec.points,
      secret: spec.secret,
      surprise: spec.surprise,
      completionStyle: spec.completionStyle,
      category: spec.category || decree.mood,
    });
  }

  return missions;
}

// Adapt mission text based on persona, mood, and translation function
function adaptMissionText(
  he: string,
  en: string,
  persona: string,
  isStrict: boolean,
  mood: string,
  t: Translate
): { textHe: string; textEn: string } {
  // Use the translate function for consistent i18n
  const moodHe = moodNames[decreeToPack[mood as keyof Record<string, string>] as keyof ReturnType<typeof moodNames>]?.[0] || mood;
  const moodEn = moodNames[decreeToPack[mood as keyof Record<string, string>] as keyof ReturnType<typeof moodNames>]?.[1] || mood;

  // Build context-aware text using translate for key phrases
  const keyPhrasesHe = {
    worship: t('סגידה','Worship'),
    tease: t('הקנטה','Teasing'),
    discipline: t('אימון','Training'),
    service: t('שירות','Service'),
    rest: t('מנוחה','Rest'),
  };

  const keyPhrasesEn = {
    worship: t('Worship','Worship'),
    tease: t('Teasing','Teasing'),
    discipline: t('Training','Training'),
    service: t('Service','Service'),
    rest: t('Rest','Rest'),
  };

  const hePrefix = isStrict || mood === 'discipline' ? 'בחומרה ' : (keyPhrasesHe[mood as keyof typeof keyPhrasesHe] || '');
  const enPrefix = keyPhrasesEn[mood as keyof typeof keyPhrasesEn] || '';

  return {
    textHe: `${hePrefix}${he}`,
    textEn: `${enPrefix}${en}`,
  };
}

// Persist the composed chapter into the session
// This is called from the server ops after chamberlainCompose
// Merges the new missions into the session's existing missions array
// Ensures each mission has the required Mission type fields (status, etc.)
export async function chamberlainPersistComposition(
  c: any, // pg PoolClient from the transaction
  sessionId: string,
  missions: MissionSpec[]
): Promise<{ missionIds: string[]; cliffhanger: { he: string; en: string } }> {
  // Read current session data
  const sQuery = await c.query('SELECT data FROM sessions WHERE id=$1', [sessionId]);
  if (sQuery.rowCount === 0) throw new Error('Session not found');
  const currentData = sQuery.rows[0].data;
  const currentMissions = (currentData?.missions as Mission[]) || [];

  // Generate mission IDs and initialize each mission with required fields
  const missionIds: string[] = [];
  const initializedMissions: Mission[] = missions.map(m => ({
    id: randomUUID(),
    revision: 0,
    title: m.titleHe,
    text: m.textHe,
    points: m.points,
    secret: m.secret ?? false,
    surprise: m.surprise ?? false,
    completionStyle: m.completionStyle ?? 'simple',
    category: m.category || 'unknown',
    status: 'draft', // New missions start as draft
    scheduledAt: undefined,
    completion: undefined,
    submissionVersion: undefined,
    deliveredAt: undefined,
    acknowledgedAt: undefined,
    adjustment: undefined,
    replaces: undefined,
    replacementId: undefined,
    approvedAt: undefined,
    rating: undefined,
    ratedAt: undefined,
    createdAt: Date.now(),
  } as Mission));

  // Merge new missions with existing ones (new missions come first)
  const allMissions = [...initializedMissions, ...currentMissions];

  // Update session data with merged missions
  await c.query(
    `UPDATE sessions SET data=$1 WHERE id=$2`,
    [JSON.stringify({ ...currentData, missions: allMissions }), sessionId]

  // Update session data with merged missions
  await c.query(
    `UPDATE sessions SET data=$1 WHERE id=$2`,
    [JSON.stringify({ ...currentData, missions: allMissions }), sessionId]
  );

  // The cliffhanger is a single line she'll receive tomorrow at her adoration hour
  const cliffhanger = {
    he: 'מחר תבין למה ביקשתי את זה',
    en: 'Tomorrow you will understand why I asked',
  };

  return { missionIds, cliffhanger };
}

// Helper: random UUID (matches the app's randomUUID pattern)
function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/c =>
    (Math.random() > 0.5 ? Math.random() : Math.random() * 0x3) % 8 + 'x'
  ).replace(/y/g, (c) => (Math.random() > 0.5 ? Math.random() : Math.random() * 0x3) % 4 + 'x')
}