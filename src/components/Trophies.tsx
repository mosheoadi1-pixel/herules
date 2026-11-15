import type { Session } from '../../server/app';
import { type Action, type Run } from '../app-shared';
import type { TrophyKind } from '../trophies';
import { Button } from './Button';

export function PinButton({ s, kind, target, label, run, action }: { s: Session; kind: TrophyKind; target: string; label: string; run: Run; action: Action }) {
  const pin = s.pins?.find(item => item.kind === kind && item.ref === target);
  return <Button type="button" className={pin ? 'primary' : 'quiet'} aria-pressed={!!pin} onClick={() => void run(() => pin ? action('unpin', { pin: pin.id }) : action('pin', { kind, ref: target }))}>{label}</Button>;
}

export function TrophyCase({ s, wife, open, label, date, run, action }: { s: Session; wife: boolean; open: boolean; label: (key: string) => string; date: (at: number) => string; run: Run; action: Action }) {
  const trophies = s.trophies ?? [];
  return <details className="panel trophy-case" open={open || undefined} aria-label={label('trophy-title')}>
    <summary><h2>{label('trophy-title')}</h2></summary>
    <p>{label('trophy-intro')} <span className="small">{trophies.length} {label('trophy-count')}</span></p>
    {!trophies.length && <p className="empty">{label('trophy-empty')}</p>}
    <ol className="trophy-list">{trophies.map((entry, index) => <li key={entry.id ?? `hidden-${index}`}>
      <p className="small"><strong>{label(`trophy-kind-${entry.kind}`)}</strong>{entry.author && ` · ${label(`trophy-author-${entry.author}`)}`} · <time>{date(entry.at)}</time></p>
      {entry.hidden ? <p className="small">{label('trophy-hidden')}</p> : entry.missing ? <p className="small">{label('trophy-missing')}</p> : <>{entry.title && <h3>{entry.title}</h3>}{entry.text && <p className="preserve">{entry.text}</p>}</>}
      {wife && entry.id && <Button type="button" className="quiet" onClick={() => void run(() => action('unpin', { pin: entry.id }))}>{label('trophy-unpin')}</Button>}
    </li>)}</ol>
  </details>;
}
