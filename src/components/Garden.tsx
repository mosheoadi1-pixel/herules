import type { Translate } from '../app-shared';

type GardenProps = { total: number; t: Translate };
type Feature = { at: 5 | 10 | 25; he: string; en: string };

const FEATURES: Feature[] = [
  { at: 5, he: 'עץ', en: 'a tree' },
  { at: 10, he: 'מזרקה', en: 'a fountain' },
  { at: 25, he: 'גזיבו', en: 'a gazebo' },
];

// FNV-1a over the flower index: stable positions without storing layout state.
function hash(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) { value ^= seed.charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

const COLORS = ['#d4a53f', '#b3476b', '#5e8c61', '#c96f9f'];
const SHOWN_MAX = 24;

function Flower({ index }: { index: number }) {
  const x = 14 + hash(`x${index}`) % 192, y = 52 + hash(`y${index}`) % 60;
  const size = 3 + hash(`r${index}`) % 3, color = COLORS[hash(`c${index}`) % COLORS.length];
  const petals = [0, 1, 2, 3, 4].map(side => {
    const angle = (side * 2 * Math.PI) / 5 - Math.PI / 2;
    return <circle key={side} cx={x + Math.cos(angle) * size} cy={y + Math.sin(angle) * size} r={size} fill={color} />;
  });
  return <g>{petals}<circle cx={x} cy={y} r={size * 0.7} fill={color} /><line x1={x} y1={y + size} x2={x} y2={124} stroke="#5e8c61" strokeWidth={1} /></g>;
}

/** A garden that only grows while the two of you play: every approved invitation plants a flower. */
export function Garden({ total, t }: GardenProps) {
  const shown = Math.min(total, SHOWN_MAX), extra = total - shown;
  return <section className="panel" aria-label={t('הגינה שלנו','Our garden')}>
    <h2>{t('הגינה שלנו','Our garden')}</h2>
    <p>{t('כל הזמנה שאושרה שותלת פרח. הגינה גדלה על פני כל המפגשים ונשארת שלכם.','Every approved invitation plants a flower. The garden grows across all sessions and stays yours.')}</p>
    <svg className="garden-svg" viewBox="0 0 220 140" role="img" aria-label={t(`הגינה שלנו: ${total} פרחים`,`Our garden: ${total} flowers`)}>
      <ellipse cx="110" cy="126" rx="102" ry="11" fill="#2b1e26" />
      {total >= 5 && <g aria-hidden="true"><rect x="36" y="82" width="4" height="38" fill="#4a3526" /><circle cx="38" cy="74" r="13" fill="#5e8c61" /><circle cx="30" cy="80" r="9" fill="#4f7a52" /><circle cx="47" cy="81" r="9" fill="#6d9c70" /></g>}
      {total >= 10 && <g aria-hidden="true"><ellipse cx="110" cy="112" rx="26" ry="7" fill="#7f8ea3" /><ellipse cx="110" cy="104" rx="14" ry="5" fill="#9fb0c4" /><ellipse cx="110" cy="96" rx="6" ry="3" fill="#c4d2e2" /></g>}
      {total >= 25 && <g aria-hidden="true"><polygon points="168,60 196,60 182,48" fill="#d4a53f" /><line x1="170" y1="60" x2="170" y2="118" stroke="#4a3526" strokeWidth="3" /><line x1="194" y1="60" x2="194" y2="118" stroke="#4a3526" strokeWidth="3" /><line x1="164" y1="118" x2="200" y2="118" stroke="#4a3526" strokeWidth="4" /></g>}
      {Array.from({ length: shown }, (_, index) => <Flower key={index} index={index} />)}
    </svg>
    {extra > 0 && <p className="small">{t(`ועוד ${extra} פרחים שכבר פורחים.`,`…and ${extra} more flowers already blooming.`)}</p>}
    <div className="row"><span className="sr-only">{t('מאפייני הגינה','Garden features')}</span>
      {FEATURES.map(feature => <span key={feature.at} className="badge">{total >= feature.at ? t(feature.he, feature.en) : t(`עוד ${feature.at - total} משימות`,`${feature.at - total} tasks to go`)}</span>)}
    </div>
  </section>;
}
