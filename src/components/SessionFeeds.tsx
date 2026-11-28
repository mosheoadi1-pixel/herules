import { useLayoutEffect, useRef } from 'react';
import type { Session, User } from '../../server/app';
import { form, type Action, type Run, type Translate } from '../app-shared';
import { Button } from './Button';

export function MessagesTab({ s, u, ended, t, date, displayName, run, action }: { s: Session; u: User; ended: boolean; t: Translate; date: (at: number) => string; displayName: (id: string) => string; run: Run; action: Action }) {
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const latestId = s.messages.at(-1)?.id;
  useLayoutEffect(()=>{
    const view = log.current;
    if(view&&follow.current)view.scrollTop = view.scrollHeight;
  },[s.id,latestId]);
  return <section className="panel chat-panel">
    <h2>{t('שיחה','Messages')}</h2>
    <p className="small">{ended?t('המפגש הסתיים. השיחה זמינה לקריאה.','The session ended. Messages are read-only.'):t('אפשר לשוחח גם בהשהיה. הודעה אינה הסכמה ואינה מחדשת משחק.','You can chat while paused; a message does not grant consent or resume play.')}</p>
    <div className="messages" ref={log} role="log" aria-label={t('הודעות במפגש','Session messages')} aria-live="polite" aria-relevant="additions" onScroll={e=>{
      const view = e.currentTarget;
      follow.current = view.scrollHeight-view.scrollTop-view.clientHeight<=32;
    }}>
      {!s.messages.length&&<p className="empty">{t('עדיין אין הודעות.','No messages yet.')}</p>}
      {s.messages.map(m=><article className={m.by===u.id?'mine':''} key={m.id}>
        <p className="small">{displayName(m.by)} · <bdi>{date(m.at)}</bdi></p>
        <p className="preserve"><bdi>{m.text}</bdi></p>
      </article>)}
    </div>
    {!ended&&<form onSubmit={e=>{const el=e.currentTarget,b=form(e),key=crypto.randomUUID();void run(async()=>{await action('message',{key,text:b.text});el.reset();});}}>
      <label>{t('הודעה חדשה','New message')}<textarea name="text" dir="auto" maxLength={4000} required/></label>
      <Button className="primary">{t('שליחת הודעה','Send message')}</Button>
    </form>}
  </section>;
}

export function WhisperBox({ s, wife, ended, t, date, run, action, useWhisper }: { s: Session; wife: boolean; ended: boolean; t: Translate; date: (at: number) => string; run: Run; action: Action; useWhisper: (text: string) => void }) {
  return <details className="panel whisper-box"><summary><h2>{t('לחישה פרטית','Private whisper')}</h2></summary>
    {wife?<>
      <p className="small">{t('רק את רואה אותן. אפשר להפוך לחישה לטיוטה או למחוק אותה.','Only you can see these. Turn one into a draft or delete it.')}</p>
      {!(s.whispers??[]).length?<p className="empty">{t('אין לחישות עדיין.','No whispers yet.')}</p>:<ul>{(s.whispers??[]).map(item=><li key={item.id}><p className="preserve">{item.text}</p><p className="small">{date(item.at)}</p><div className="row"><Button onClick={()=>useWhisper(item.text)}>{t('כטיוטה','Use as draft')}</Button><Button className="quiet" onClick={()=>void run(()=>action('whisper-delete',{whisper:item.id}))}>{t('מחיקה','Delete')}</Button></div></li>)}</ul>}
    </>:<>
      <p className="small">{t('רק היא תראה את הלחישה הזאת.','Only she can see this whisper.')}</p>
      <p className="small" role="status">{t(`נשלחו ${s.whisperSent??0} מתוך 20`,`${s.whisperSent??0} of 20 sent`)}</p>
      {!ended&&<form onSubmit={e=>{const el=e.currentTarget,b=form(e);void run(async()=>{await action('whisper',{key:crypto.randomUUID(),text:b.text});el.reset();});}}><label>{t('לחישה','Whisper')}<textarea name="text" dir="auto" maxLength={400} required/></label><Button>{t('שליחת לחישה','Send whisper')}</Button></form>}
    </>}
  </details>;
}

function groupEvents<T extends { at: number }>(items: readonly T[], lang: 'he' | 'en') {
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const groups = new Map<string, T[]>();
  for (const item of [...items].reverse()) {
    const day = date.format(item.at);
    const events = groups.get(day);
    if (events) events.push(item);
    else groups.set(day, [item]);
  }
  return { groups: [...groups], time };
}

type FeedProps = { s: Session; lang: 'he' | 'en'; t: Translate; label: (key: string) => string };

export function InboxTab({ s, u, lang, t, label, run, action }: FeedProps & { u: User; run: Run; action: Action }) {
  const unread = s.inbox.filter(n => !n.readBy.includes(u.id));
  const { groups, time } = groupEvents(s.inbox, lang);
  return <section className="panel activity-feed" id="session-updates">
    <div className="row between">
      <h2>{t('עדכונים','Updates')}</h2>
      <Button disabled={!unread.length} onClick={()=>void run(()=>action('read',{ids:unread.slice(0,500).map(n=>n.id)}))}>{t('סימון כנקרא','Mark read')}{unread.length>0&&<> (<bdi>{unread.length}</bdi>)</>}</Button>
    </div>
    {!groups.length&&<p className="empty">{t('עדיין אין עדכונים.','No updates yet.')}</p>}
    {groups.map(([day, items])=><section key={day}>
      <h3 className="activity-day">{day}</h3>
      {items.map(n=>{
        const isNew = !n.readBy.includes(u.id);
        return <article key={n.id} className={isNew?'unread':'read'}>
          <div>{label(n.event)} {isNew&&<span className="activity-new">{t('חדש','New')}</span>}</div>
          <time dateTime={new Date(n.at).toISOString()}>{time.format(n.at)}</time>
        </article>;
      })}
    </section>)}
  </section>;
}

export function HistoryTab({ s, lang, t, label, displayName }: FeedProps & { displayName: (id: string) => string }) {
  const { groups, time } = groupEvents(s.history, lang);
  return <section className="panel activity-feed" id="session-history">
    <h2>{t('היסטוריית המפגש','Session history')}</h2>
    <p className="small">{t('ניקוד שאושר נשמר גם לאחר עצירה. אין קנסות על גבולות.','Awarded points remain after stopping. Boundaries carry no penalties.')}</p>
    {!groups.length&&<p className="empty">{t('עדיין אין אירועים בהיסטוריה.','No history yet.')}</p>}
    {groups.map(([day, items])=><section key={day}>
      <h3 className="activity-day">{day}</h3>
      {items.map((n,i)=>{
        const reward=['reward-request','reward-decision'].includes(n.event)?s.rewardRequests?.find(r=>r.id===n.rewardRequestId):undefined;
        return <article key={i}>
          <div>{label(n.event)} · {displayName(n.by)}
            {n.event==='reward-decision'&&n.outcome&&<span> · {n.outcome==='approved'?t('אושרה','Approved'):t('נדחתה','Declined')}</span>}
            {reward&&<div><strong><bdi>{reward.title}</bdi></strong><p className="preserve"><bdi>{reward.description}</bdi></p><span>{reward.cost} {t('נקודות','points')}</span></div>}
          </div>
          <time dateTime={new Date(n.at).toISOString()}>{time.format(n.at)}</time>
        </article>;
      })}
    </section>)}
  </section>;
}
