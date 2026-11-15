import type { Session, User } from '../../server/app';
import { form, type Action, type Run, type Translate } from '../app-shared';
import { Button } from './Button';

type Proposal = NonNullable<Session['proposals']>[number];
type ProposalsProps = { s: Session; u: User; wife: boolean; play: boolean; ended: boolean; t: Translate; run: Run; action: Action };

const statusText = (proposal: Proposal, t: Translate) =>
  proposal.status === 'pending' ? t('ממתינה להחלטתה','Waiting for her decision')
  : proposal.status === 'adopted' ? t('אומצה לטיוטה שלה','Adopted into her drafts')
  : t('נדחתה','Declined');

/** He can offer an invitation; she always decides whether it ever becomes a draft, and delivery stays hers. */
export function Proposals({ s, u, wife, play, ended, t, run, action }: ProposalsProps) {
  const proposals = s.proposals ?? [];
  const pending = proposals.filter(p => p.status === 'pending');
  const decided = [...proposals].filter(p => p.status !== 'pending').reverse().slice(0, 5);
  return <section className="panel" aria-label={t('הצעות הזמנה','Invitation proposals')}>
    <h2>{t('הצעות ממנו','Proposals from him')}</h2>
    <p>{t('הוא יכול להציע הזמנה בכל עת. היא בוחרת אם לאמץ אותה לטיוטה משלה, לערוך אותה, לשלוח אותה או לסרב; שום דבר אינו נשלח אוטומטית.','He can offer an invitation at any time. She chooses whether to adopt it into her own draft, edit it, send it, or decline; nothing is ever sent automatically.')}</p>
    {!wife&&<details><summary>{t('הצעת הזמנה חדשה','Propose a new invitation')}</summary>
      <form onSubmit={e => { const el = e.currentTarget, b = form(e); const category = String(b.category ?? '').trim(); void run(async () => { await action('propose', { title: b.title, text: b.text, points: Number(b.points), ...(category ? { category } : {}) }); el.reset(); }); }}>
        <label>{t('כותרת','Title')}<input name="title" required maxLength={160} /></label>
        <label>{t('ההזמנה שאתה מציע','The invitation you are proposing')}<textarea name="text" required maxLength={4000} /></label>
        <label>{t('נקודות מוצעות לאישור ביצוע','Proposed points on approved completion')}<input name="points" type="number" min={0} max={100} defaultValue={5} required /></label>
        <label>{t('קטגוריה להצגה (לא חובה)','Category to display (optional)')}<input name="category" maxLength={80} /></label>
        <Button disabled={ended}>{t('שליחת ההצעה','Send proposal')}</Button>
        <p className="small">{t('ההצעה אינה מפעילה דבר מעצמה. היא נשמרת כהצעה עד שהיא תחליט.','A proposal does nothing by itself. It stays a proposal until she decides.')}</p>
      </form>
    </details>}
    {!pending.length && <p className="empty">{wife ? t('אין הצעות ממתינות להחלטתך.','No proposals are waiting for your decision.') : t('אין הצעות ממתינות כרגע. אפשר להגיש אחת למטה.','No proposals pending right now. You can send one below.')}</p>}
    {pending.map(proposal => <article key={proposal.id}>
      <h3>{proposal.title}</h3>
      <p className="preserve">{proposal.text}</p>
      <p className="small">{proposal.points} {t('נק׳','pts')}{proposal.category ? ` · ${proposal.category}` : ''}</p>
      {wife ? <div className="row">
        <Button className="primary" disabled={!play} onClick={() => void run(() => action('proposal-decide', { proposal: proposal.id, adopt: true }))}>{t('אימוץ לטיוטה שלי','Adopt into my drafts')}</Button>
        <Button disabled={!play} onClick={() => void run(() => action('proposal-decide', { proposal: proposal.id, adopt: false }))}>{t('דחייה','Decline')}</Button>
      </div> : <p className="small">{statusText(proposal, t)}</p>}
    </article>)}
    {!!decided.length && <details className="subtle"><summary>{t('הצעות שהוכרעו','Decided proposals')}</summary>
      {decided.map(proposal => <article key={proposal.id}><h4>{proposal.title}</h4><p className="small">{statusText(proposal, t)} · {u.id === proposal.by ? t('שלך','yours') : t('של השותף/ה',"partner's")}</p></article>)}
    </details>}
  </section>;
}
