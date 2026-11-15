import type { Idea } from '../library';
import type { Translate } from '../app-shared';
import { Button } from './Button';

type ForYouProps = {
  deck: { idea: Idea; score: number; matched: boolean }[];
  lang: 'he' | 'en'; t: Translate; play: boolean;
  useIdea: (idea: Idea) => void; onSkip: (id: string) => void;
};

/** Her personalized menu: a no-effort entry point built from her own ratings and check-in. */
export function ForYou({ deck, lang, t, play, useIdea, onSkip }: ForYouProps) {
  return <section className="panel" aria-label={t('התפריט שלך היום','Your menu today')}>
    <h2>{t('בשבילך היום','For you today')}</h2>
    <p>{t('התפריט נבנה ממה שדירגת, מה עשית לאחרונה ומה אנרגיה שלך עכשיו. כל בחירה נשארת שלך: אפשר לערוך לפני שליחה.','The menu is built from your ratings, what you did recently, and your current energy. Every choice stays yours: you can edit before sending.')}</p>
    {!deck.length&&<p className="empty">{t('עוד אין מספיק רמזים להתאמה. דרגי משימות שאושרו והתפריט ילמד אותך.','Not enough signals yet. Rate approved tasks and the menu will learn your taste.')}</p>}
    <div className="quick-grid">{deck.map(({ idea, matched }) => {
      const text = lang === 'he' ? idea.he : idea.en;
      return <article key={idea.id}>
        <p className="preserve">{text}</p>
        <p className="small">{idea.minutes} {t('דקות','min')}{matched ? ` · ${t('מתאים לטעמך','based on your taste')}` : ` · ${t('ניסיון חדש','something new')}`}</p>
        <div className="row">
          <Button className="primary" disabled={!play} onClick={() => useIdea(idea)}>{t('הוספה לטיוטה','Add to draft')}</Button>
          <Button className="quiet" disabled={!play} onClick={() => onSkip(idea.id)}>{t('לא בסטייל שלי','Not my style')}</Button>
        </div>
      </article>;
    })}</div>
  </section>;
}
