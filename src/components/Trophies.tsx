import type { Session } from '../../server/app';
import type { Action, Run, Translate } from '../app-shared';
import type { TrophyKind } from '../trophies';
import { Button } from './Button';

const kindLabel = (kind: TrophyKind, t: Translate) => kind === 'mission' ? t('הזמנה','Invitation') : kind === 'completion' ? t('דיווח','Report') : t('שיתוף','Reflection');

export function PinButton({ s, kind, target, t, run, action }: { s: Session; kind: TrophyKind; target: string; t: Translate; run: Run; action: Action }) {
  const pin = s.pins?.find(item => item.kind === kind && item.ref === target);
  return <Button type="button" className={pin ? 'primary' : 'quiet'} aria-pressed={!!pin} onClick={() => void run(() => pin ? action('unpin', { pin: pin.id }) : action('pin', { kind, ref: target }))}>{pin ? t(`הסרת ${kindLabel(kind, t)} מארון הגביעים`, `Remove ${kindLabel(kind, t)} from the trophy case`) : t(`שמירת ${kindLabel(kind, t)} בארון הגביעים`, `Keep ${kindLabel(kind, t)} in the trophy case`)}</Button>;
}

export function TrophyCase({ s, wife, open, t, date, run, action }: { s: Session; wife: boolean; open: boolean; t: Translate; date: (at: number) => string; run: Run; action: Action }) {
  const trophies = s.trophies ?? [];
  return <details className="panel trophy-case" open={open || undefined}>
    <summary><h2>{t('ארון הגביעים','Trophy case')}</h2></summary>
    <p>{t('רגעים שנשמרו מהמשחק.','Moments kept from the game.')} <span className="small">{trophies.length}/30</span></p>
    {!trophies.length && <p className="empty soft">{t('ארון הגביעים ריק עדיין.','The trophy case is empty for now.')}</p>}
    <ol className="trophy-list">{trophies.map((entry, index) => <li key={entry.id ?? `hidden-${index}`}>
      <p className="small"><strong>{kindLabel(entry.kind, t)}</strong>{entry.author && ` · ${entry.author === 'wife' ? t('שלה','hers') : t('שלו','his')}`} · <time>{date(entry.at)}</time></p>
      {entry.hidden ? <p className="small">{t('הפריט שמור למי ששלח אותו.','This item is kept for its author.')}</p> : entry.missing ? <p className="small">{t('הפריט אינו זמין עוד.','This item is no longer available.')}</p> : <>{entry.title && <h3>{entry.title}</h3>}{entry.text && <p className="preserve">{entry.text}</p>}</>}
      {wife && entry.id && <Button type="button" className="quiet" onClick={() => void run(() => action('unpin', { pin: entry.id }))}>{t('הסרה','Remove')}</Button>}
    </li>)}</ol>
  </details>;
}
