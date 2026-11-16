export const TROPHY_LIMIT = 30;
export type TrophyKind = 'mission' | 'completion' | 'reflection';
export type TrophyPin = { id: string; kind: TrophyKind; ref: string; at: number };
export type TrophyEntry = { id?: string; kind: TrophyKind; at: number; title?: string; text?: string; author?: 'wife' | 'husband'; hidden?: true; missing?: true };
export type TrophySource = {
  mission: (id: string) => { title: string; text: string; completion?: string } | 'hidden' | undefined;
  reflection: (id: string) => { appreciation: string; repeat: string } | undefined;
};

// Pins resolve per viewer. A mission the viewer may not see becomes a placeholder with no id, title or text.
export function trophyEntries(pins: TrophyPin[] | undefined, viewer: { id: string; role: 'wife' | 'husband' }, source: TrophySource): TrophyEntry[] {
  return [...(pins ?? [])].reverse().map(pin => resolvePin(pin, viewer, source)).sort((a, b) => b.at - a.at);
}
function resolvePin(pin: TrophyPin, viewer: { id: string; role: 'wife' | 'husband' }, source: TrophySource): TrophyEntry {
  const { id, kind, at } = pin;
  if (kind === 'reflection') {
    const reflection = source.reflection(pin.ref);
    if (!reflection) return { id, kind, at, missing: true };
    const author = pin.ref === viewer.id ? viewer.role : viewer.role === 'wife' ? 'husband' : 'wife';
    return { id, kind, at, author, text: [reflection.appreciation, reflection.repeat].filter(Boolean).join('\n') };
  }
  const mission = source.mission(pin.ref);
  if (mission === undefined) return { id, kind, at, missing: true };
  if (mission === 'hidden') return { kind, at, hidden: true };
  if (kind === 'mission') return { id, kind, at, author: 'wife', title: mission.title, text: mission.text };
  return { id, kind, at, author: 'husband', text: mission.completion ?? '' };
}
