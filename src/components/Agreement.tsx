import type { Session, User } from '../../server/app';
import { form, type Action, type Run, type Translate } from '../app-shared';
import { Button } from './Button';

type AgreementTabProps = {
  s: Session; u: User; ended: boolean; play: boolean; wife: boolean; t: Translate; run: Run; action: Action;
};

export function AgreementTab({ s, u, ended, play, wife, t, run, action }: AgreementTabProps) {
  return <section className="panel"><h2>{t('הסכמה מפורשת · גרסה','Explicit agreement · revision')} {s.revision}</h2><p className="preserve">{s.terms}</p><p>{s.approvals.length}/2 {t('אישורים לגרסה זו','approvals for this revision')}</p><Button className="primary" disabled={ended||s.approvals.includes(u.id)} onClick={()=>{if(confirm(t('קראתי ואני מאשר/ת מרצוני את הגרסה המוצגת.','I have read and freely approve the displayed revision.')))void run(()=>action('approve',{revision:s.revision}));}}>{s.approvals.includes(u.id)?t('אישרתי את הגרסה','I approved this revision'):t('קראתי ואני מסכימ/ה','I have read and agree')}</Button><details><summary>{t('הצעת שינוי תנאים','Propose changed terms')}</summary><p>{t('שינוי מבטל משימות לא גמורות ומצריך שני אישורים חדשים. ההשעיה האישית נשמרת.','Changes cancel unfinished missions and require two fresh approvals. Personal pauses remain.')}</p><form onSubmit={e=>{const b=form(e);void run(()=>action('revise',{terms:b.terms}));}}><label>{t('תנאים חדשים','New terms')}<textarea name="terms" required maxLength={4000} defaultValue={s.terms} key={s.revision}/></label><Button disabled={ended}>{t('הצעת גרסה חדשה','Propose new revision')}</Button></form></details><details><summary>{t('גרסאות קודמות','Previous revisions')}</summary>{s.revisions.map(r=><article key={r.revision}><h3>{r.revision}</h3><p className="preserve">{r.terms}</p></article>)}</details>{wife&&<form onSubmit={e=>{const b=form(e);void run(()=>action('extend',{minutes:Number(b.minutes)}));}}><label>{t('הארכה בדקות (לפני סיום בלבד)','Extension in minutes (before expiry only)')}<input name="minutes" type="number" min={1} max={525600} defaultValue={30}/></label><Button disabled={!play}>{t('הארכת מפגש','Extend session')}</Button></form>}</section>;
}
