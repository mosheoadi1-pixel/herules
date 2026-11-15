import type { Session } from '../../server/app';
import { seasonPacks } from '../seasons';
import type { Action, Run, Translate } from '../app-shared';
import { Button } from './Button';

type SeasonPanelProps = {
  s: Session; play: boolean; ended: boolean; t: Translate; label: (key: string) => string;
  run: Run; action: Action; askSeason: (packId: string) => void;
};

export function SeasonPanel({ s, play, ended, t, label, run, action, askSeason }: SeasonPanelProps) {
  const progress = s.seasonProgress;
  const runningPack = progress?.running ? seasonPacks.find(pack => pack.id === progress.id) : undefined;
  return <details className="panel seasons"><summary><h2>{label('season-ui-title')}</h2></summary>
    <p>{label('season-ui-intro')}</p>
    {runningPack&&progress?<section className="notice" aria-live="polite">
      <p><strong>{label('season-ui-running')}</strong>: {t(runningPack.title.he,runningPack.title.en)} · {label('season-ui-progress')} {progress.done}/{progress.total}</p>
      <Button disabled={ended} onClick={()=>{if(confirm(label('season-ui-stop-confirm')))void run(()=>action('season-stop',{pack:runningPack.id}));}}>{label('season-ui-stop')}</Button>
    </section>:<p className="small">{label('season-ui-idle')}</p>}
    {seasonPacks.map(pack=><article key={pack.id}>
      <h3>{t(pack.title.he,pack.title.en)}</h3>
      <p>{t(pack.description.he,pack.description.en)}</p>
      <p className="small">{pack.days} {label('season-ui-days')}</p>
      <Button className="primary" disabled={!play||ended||!!runningPack} onClick={()=>askSeason(pack.id)}>{label('season-ui-start')}</Button>
    </article>)}
  </details>;
}
