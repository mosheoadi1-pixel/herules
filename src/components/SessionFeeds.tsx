import type { Session, User } from '../../server/app';
import { form, type Action, type Run, type Translate } from '../app-shared';
import { Button } from './Button';

export function MessagesTab({ s, u, ended, t, date, displayName, run, action }: { s: Session; u: User; ended: boolean; t: Translate; date: (at: number) => string; displayName: (id: string) => string; run: Run; action: Action }) {  return <section className="panel"><h2>{t('שיחה פרטית','Private text')}</h2><p>{t('אפשר לשוחח גם בהשהיה ובבדיקת הסכמות. הודעה אינה הסכמה ואינה משחררת השהיה או מחדשת משחק. לאחר עצירה או סיום הזמן לא ניתן לשלוח.','Chat remains available during pauses and agreement review. A message is not approval and never releases a pause or resumes play. Sending ends at stop or expiry.')}</p><div className="messages">{!s.messages.length&&<p className="empty">{t('עדיין אין הודעות.','No messages yet.')}</p>}{s.messages.map(m=><article className={m.by===u.id?'mine':''} key={m.id}><p className="small">{displayName(m.by)} · {date(m.at)}</p><p className="preserve">{m.text}</p></article>)}</div><form onSubmit={e=>{const el=e.currentTarget,b=form(e),key=crypto.randomUUID();void run(async()=>{await action('message',{key,text:b.text});el.reset();});}}><label>{t('הודעה חדשה','New message')}<textarea name="text" maxLength={4000} required/></label><Button className="primary" disabled={ended}>{t('שליחת הודעה','Send message')}</Button></form></section>;
}

export function WhisperBox({ s, wife, ended, t, date, run, action, useWhisper }: { s: Session; wife: boolean; ended: boolean; t: Translate; date: (at: number) => string; run: Run; action: Action; useWhisper: (text: string) => void }) {
  return <section className="panel whisper-box"><h2>{t('קופסת לחישות','Whisper box')}</h2>
    {wife?<>
      <p className="small">{t('רק את רואה אותן. אפשר להפוך לחישה לטיוטה או למחוק אותה.','Only you can see these. Turn one into a draft or delete it.')}</p>
      {!(s.whispers??[]).length?<p className="empty">{t('אין לחישות עדיין.','No whispers yet.')}</p>:<ul>{(s.whispers??[]).map(item=><li key={item.id}><p className="preserve">{item.text}</p><p className="small">{date(item.at)}</p><div className="row"><Button onClick={()=>useWhisper(item.text)}>{t('כטיוטה','Use as draft')}</Button><Button className="quiet" onClick={()=>void run(()=>action('whisper-delete',{whisper:item.id}))}>{t('מחיקה','Delete')}</Button></div></li>)}</ul>}
    </>:<>
      <p className="small">{t('אפשר להשאיר לה משפט קצר שהיא תראה לבדה.','Leave her a short line only she will see.')}</p>
      <p className="small" role="status">{t(`נשלחו ${s.whisperSent??0} מתוך 20`,`${s.whisperSent??0} of 20 sent`)}</p>
      {!ended&&<form onSubmit={e=>{const el=e.currentTarget,b=form(e);void run(async()=>{await action('whisper',{key:crypto.randomUUID(),text:b.text});el.reset();});}}><label>{t('לחישה','Whisper')}<textarea name="text" maxLength={400} required/></label><Button disabled={ended}>{t('שליחת לחישה','Send whisper')}</Button></form>}
    </>}
  </section>;
}

export function InboxTab({ s, u, t, label, date, run, action }: { s: Session; u: User; t: Translate; label: (key: string) => string; date: (at: number) => string; run: Run; action: Action }) {
  return <section className="panel"><div className="row between"><h2>{t('עדכונים שמורים','Persisted inbox')}</h2><Button onClick={()=>void run(()=>action('read',{ids:s.inbox.filter(n=>!n.readBy.includes(u.id)).slice(0,500).map(n=>n.id)}))}>{t('סימון כנקרא','Mark read')}</Button></div><p className="small">{t('עדכונים כלליים בלבד; טיוטות סודיות אינן נחשפות כאן.','Generic updates only; secret drafts are never revealed here.')}</p>{!s.inbox.length&&<p className="empty">{t('עדיין אין עדכונים.','No updates yet.')}</p>}{[...s.inbox].reverse().map(n=><article key={n.id} className={n.readBy.includes(u.id)?'read':'unread'}>{label(n.event)} <time>{date(n.at)}</time></article>)}</section>;
}

export function HistoryTab({ s, t, label, date, displayName }: { s: Session; t: Translate; label: (key: string) => string; date: (at: number) => string; displayName: (id: string) => string }) {
  return <section className="panel"><h2>{t('היסטוריית המפגש','Session history')}</h2><p>{t('ניקוד שכבר אושר נשמר גם לאחר עצירה. אין קנסות על גבולות.','Previously awarded points remain after stopping. Boundaries carry no penalties.')}</p>{!s.history.length&&<p className="empty">{t('עדיין אין אירועים בהיסטוריה.','No history yet.')}</p>}{[...s.history].reverse().map((n,i)=>{const reward=['reward-request','reward-decision'].includes(n.event)?s.rewardRequests?.find(r=>r.id===n.rewardRequestId):undefined;return <article key={i}>{label(n.event)} · {displayName(n.by)}{reward&&<div><strong>{reward.title}</strong><p className="preserve">{reward.description}</p><span>{reward.cost} {t('נקודות','points')}</span></div>}{n.event==='reward-decision'&&n.outcome&&<span> · {n.outcome==='approved'?t('אושרה','Approved'):t('נדחתה','Declined')}</span>}<time>{date(n.at)}</time></article>;})}</section>;
}
