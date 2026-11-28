import type { Session } from '../../server/app';
import { seasonPacks } from '../seasons';
import type { Action, Run, Translate } from '../app-shared';
import { Button } from './Button';

export function SeasonPanel({ s, play, ended, t, run, action, askSeason, askStopSeason }: {
  s: Session; play: boolean; ended: boolean; t: Translate;
  run: Run; action: Action; askSeason: (packId: string) => void; askStopSeason: (packId: string) => void;
}) {
  const progress = s.seasonProgress;
  const running = progress?.running ? seasonPacks.find(pack => pack.id === progress.id) : undefined;
  return <details className="panel seasons"><summary><h2>{t('ערכות עונה','Season packs')}</h2></summary>
    <p>{t('ערכה מוכנה של משימה אחת ביום, בקצב שקט. אפשר לעצור בכל רגע וכל המשימות הממתינות יבוטלו.','A ready-made pack of one task a day, at a calm pace. You can stop at any moment and every waiting task is cancelled.')}</p>
    {running && progress ? <section className="notice" aria-live="polite">
      <p><strong>{t('עונה פעילה','Season running')}</strong>: {t(running.title.he, running.title.en)} · {t('התקדמות','Progress')} {progress.done}/{progress.total}</p>
      <Button disabled={ended} onClick={() => askStopSeason(running.id)}>{t('עצירת העונה','Stop season')}</Button>
    </section> : <p className="small">{t('אין עונה פעילה.','No season is running.')}</p>}
    {seasonPacks.map(pack => <article key={pack.id}>
      <h3>{t(pack.title.he, pack.title.en)}</h3>
      <p>{t(pack.description.he, pack.description.en)}</p>
      <p className="small">{pack.days} {t('ימים','days')}</p>
      <Button className="primary" disabled={!play || ended || !!running} onClick={() => askSeason(pack.id)}>{t('התחלת עונה','Start season')}</Button>
    </article>)}
  </details>;
}
