import { useEffect, useRef, useState } from 'react';
import { GameApp } from '../GameApp';
import type { State } from '../app-shared';
import { ChatFeedback, useChatRead, type ChatCopy } from './PublicChatParts';

type PlaySession = NonNullable<State['play']>;
type Cursor = { before: string; tie: string };
type Inbox = { sessions: PlaySession[]; points: string; next: Cursor | null };
const sessionStates = { open: 'playOpen', stopped: 'playStopped', cancelled: 'sessionCancelled', closed: 'playClosed', expired: 'playExpired' } as const;
const availabilityStates = { waiting:'playConsentNeeded', paused:'playPaused', active:'playActive' } as const;

export function PublicPlay({ id, onPick, visibility, revision, ...copy }: ChatCopy & {
  id: string | null; onPick: (id: string | null) => void; visibility: number; revision: number;
}) {
  const { t, lang, errorText } = copy;
  const [tick, poll] = useState(0);
  const [pages, setPages] = useState<Cursor[]>([]);
  const cursor = pages.at(-1);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') poll(n => n + 1); }, 5000);
    return () => clearInterval(timer);
  }, []);
  const inbox = useChatRead<Inbox>('/public/play' + (!id && cursor ? `?${new URLSearchParams(cursor)}` : ''), null, tick + revision, visibility);
  const formatTime = (date: string) => <time dateTime={date}><bdi>{new Date(date).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</bdi></time>;
  const listStart = useRef<HTMLParagraphElement>(null);
  return <section className="msg-play" aria-label={t('playInbox')}>
    {id && <button type="button" className="quiet" onClick={() => onPick(null)}>{t('playAll')}</button>}
    <p className="msg-play-total" tabIndex={-1} ref={listStart}>{t('playTotal')}: {inbox?.value ? <bdi>{BigInt(inbox.value.points).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB')}</bdi> : '—'}</p>
    {inbox?.error && <><ChatFeedback error={errorText(inbox.error)} /><button type="button" onClick={() => poll(n => n + 1)}>{lang==='he'?'ניסיון חוזר':'Retry'}</button></>}
    {id ? <GameApp key={`${id}:${visibility}`} paired={{id,lang,revision,refreshInbox:()=>poll(n=>n+1)}}/> : <>
      {!inbox && <p role="status">{t('msgLoading')}</p>}
      {inbox?.value?.sessions.length === 0 && <p>{t('playEmpty')}</p>}
      <ul className="msg-play-list">{inbox?.value?.sessions.map(session => <li key={session.id}>
        <button type="button" onClick={() => onPick(session.id)}>
          <bdi>{session.title}</bdi>
          <span><bdi>{session.partner}</bdi> · {session.role === 'dom' ? (lang==='he'?'דום':'Dom') : (lang==='he'?'סאב':'Sub')} · {t(session.state==='open'&&session.availability?availabilityStates[session.availability]:sessionStates[session.state])} · {formatTime(session.scheduledAt)}</span>
        </button>
      </li>)}</ul>
      {(!!pages.length || !!inbox?.value?.next) && <div className="row">
        {pages.length > 0 && <button type="button" onClick={() => { listStart.current?.focus(); setPages(pages.slice(0, -1)); }}>{t('playNewer')}</button>}
        {inbox?.value?.next && <button type="button" onClick={() => { listStart.current?.focus(); setPages([...pages, inbox.value!.next!]); }}>{t('playOlder')}</button>}
      </div>}
    </>}
  </section>;
}
