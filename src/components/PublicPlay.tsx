import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { ChatFeedback, useChatAction, useChatRead, type ChatCopy } from './PublicChatParts';

type PlaySession = { id: string; title: string; partner: string; scheduledAt: string; role: 'dom' | 'sub'; state: 'open' | 'stopped' | 'cancelled' | 'closed' };
type Mission = {
  id: string; title: string; instructions: string; points: number; version: number; returnReason: string | null;
  state: 'assigned' | 'accepted' | 'submitted' | 'returned' | 'approved' | 'declined';
};
type Cursor = { before: string; tie: string };
type Inbox = { sessions: PlaySession[]; points: string; next: Cursor | null };
type PlayDetail = { session: PlaySession; missions: Mission[] };
type Action = 'accept' | 'complete' | 'decline' | 'approve' | 'return';
const sessionStates = { open: 'playOpen', stopped: 'playStopped', cancelled: 'sessionCancelled', closed: 'playClosed' };
const missionStates = { assigned: 'playAssigned', accepted: 'playAcknowledged', submitted: 'playSubmitted', returned: 'playReturned', approved: 'playApproved', declined: 'playDeclined' };
const terminal = (m: Mission) => m.state === 'approved' || m.state === 'declined';

export function PublicPlay({ id, onPick, visibility, revision, ...copy }: ChatCopy & {
  id: string | null; onPick: (id: string | null) => void; visibility: number; revision: number;
}) {
  const { t, lang, errorText } = copy;
  const [tick, poll] = useState(0);
  const [pages, setPages] = useState<Cursor[]>([]);
  const cursor = pages.at(-1);
  // Poll only while the play pane is open and the document is visible. No play
  // detail or award data goes through the shared room feed.
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') poll(n => n + 1); }, 5000);
    return () => clearInterval(timer);
  }, []);
  const inboxPath = '/public/play' + (!id && cursor ? `?${new URLSearchParams(cursor)}` : '');
  const inbox = useChatRead<Inbox>(inboxPath, null, tick + revision, visibility);
  const detail = useChatRead<PlayDetail>(id ? `/public/play/${id}` : null, null, tick + revision, visibility);
  const formatTime = (date: string) => <time dateTime={date}><bdi>{new Date(date).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</bdi></time>;
  const listStart = useRef<HTMLParagraphElement>(null);
  return <section className="msg-play" aria-label={t('playInbox')}>
    <p className="msg-play-total" tabIndex={-1} ref={listStart}>{t('playTotal')}: {inbox?.value ? <bdi>{BigInt(inbox.value.points).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB')}</bdi> : '—'}</p>
    {inbox?.error && <ChatFeedback error={errorText(inbox.error)} />}
    {id ? <>
      <button type="button" className="quiet" onClick={() => onPick(null)}>{t('playAll')}</button>
      {detail?.error ? <ChatFeedback error={errorText(detail.error)} /> : detail?.value ?
        <PlayActions key={id} {...copy} detail={detail.value} refresh={() => poll(n => n + 1)} time={formatTime(detail.value.session.scheduledAt)} /> :
        <p role="status">{t('msgLoading')}</p>}
    </> : <>
      {!inbox && <p role="status">{t('msgLoading')}</p>}
      {inbox?.value?.sessions.length === 0 && <p>{t('playEmpty')}</p>}
      <ul className="msg-play-list">{inbox?.value?.sessions.map(session => <li key={session.id}>
        <button type="button" onClick={() => onPick(session.id)}>
          <bdi>{session.title}</bdi>
          <span><bdi>{session.partner}</bdi> · {t(sessionStates[session.state])} · {formatTime(session.scheduledAt)}</span>
        </button>
      </li>)}</ul>
      {(!!pages.length || !!inbox?.value?.next) && <div className="row">
        {pages.length > 0 && <button type="button" onClick={() => { listStart.current?.focus(); setPages(pages.slice(0, -1)); }}>{t('playNewer')}</button>}
        {inbox?.value?.next && <button type="button" onClick={() => { listStart.current?.focus(); setPages([...pages, inbox.value!.next!]); }}>{t('playOlder')}</button>}
      </div>}
    </>}
  </section>;
}

function PlayActions({ detail, refresh, time, ...copy }: ChatCopy & { detail: PlayDetail; refresh: () => void; time: React.ReactNode }) {
  const { t } = copy, { session, missions } = detail;
  const active = missions.find(m => !terminal(m));
  const finished = missions.filter(terminal);
  const recent = !active ? finished[0] : undefined;
  const history = recent ? finished.slice(1) : finished;
  const open = session.state === 'open';
  const [reason, setReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [title, setTitle] = useState(''), [instructions, setInstructions] = useState(''), [points, setPoints] = useState('0');
  const [assigning, setAssigning] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const retry = useRef({ signature: '', key: '' });
  const { busy, error, run } = useChatAction(copy, refresh);
  const send = (input: object, done?: () => void) => {
    const signature = JSON.stringify(input);
    if (signature !== retry.current.signature) retry.current = { signature, key: crypto.randomUUID() };
    void run(() => api(`/public/play/${session.id}`, { ...input, idempotencyKey: retry.current.key }), () => {
      retry.current = { signature: '', key: '' };
      done?.();
      heading.current?.focus({ preventScroll: true });
    });
  };
  const action = (verb: Action, extra: object = {}) => {
    if (active) send({ action: verb, missionId: active.id, version: active.version, ...extra }, () => { setReturning(false); setReason(''); });
  };
  const assign = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !instructions.trim()) return;
    send({ action: 'assign', title: title.trim(), instructions: instructions.trim(), points: Number(points) }, () => {
      setAssigning(false); setTitle(''); setInstructions(''); setPoints('0');
    });
  };
  const missionBody = (m: Mission) => <>
    <h4><bdi>{m.title}</bdi></h4>
    <p className="preserve" dir="auto">{m.instructions}</p>
    <p>{t('playValue')}: <bdi>{m.points}</bdi> · {t(missionStates[m.state])}</p>
    {m.returnReason && <p>{t('playReason')}: <bdi>{m.returnReason}</bdi></p>}
  </>;
  return <article className="msg-card msg-play-detail">
    <h3 ref={heading} tabIndex={-1}><bdi>{session.title}</bdi></h3>
    <p><bdi>{session.partner}</bdi> · {t('sessionAgreedTime')}: {time}</p>
    <p role="status">{t(open ? 'playOpenNote' : session.state === 'cancelled' ? 'playCancelled' : sessionStates[session.state])}</p>
    <ChatFeedback error={error} />
    {active ? <section className="msg-play-mission" aria-label={t('playCurrent')}>
      {missionBody(active)}
      {open && session.role === 'sub' && <div className="row">
        {active.state === 'assigned' && <button className="primary" disabled={busy} onClick={() => action('accept')}>{t('playAccept')}</button>}
        {(active.state === 'accepted' || active.state === 'returned') &&
          <button className="primary" disabled={busy} onClick={() => action('complete')}>{t('playComplete')}</button>}
        <button disabled={busy} onClick={() => action('decline')}>{t('playDecline')}</button>
      </div>}
      {open && session.role === 'dom' && active.state === 'submitted' && (returning ?
        <form className="msg-fields" onSubmit={event => { event.preventDefault(); if (reason.trim()) action('return', { reason: reason.trim() }); }}>
          <fieldset disabled={busy}>
            <label>{t('playReason')}<textarea autoFocus required rows={2} dir="auto" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
            <div className="row">
              <button className="primary" disabled={!reason.trim()}>{t('playReturn')}</button>
              <button type="button" onClick={() => { setReturning(false); heading.current?.focus(); }}>{t('adminCancel')}</button>
            </div>
          </fieldset>
        </form> : <div className="row">
          <button className="primary" disabled={busy} onClick={() => action('approve')}>{t('playApprove')}</button>
          <button disabled={busy} onClick={() => setReturning(true)}>{t('playReturn')}</button>
        </div>)}
    </section> : <>
      {recent ? <section className="msg-play-mission" aria-label={t('playLast')}>{missionBody(recent)}</section> : <p>{t('playNoMission')}</p>}
      {open && session.role === 'dom' && (missions.length >= 100 ? <p>{t('errPlayLimit')}</p> : assigning ?
        <form className="msg-fields" onSubmit={assign}>
          <fieldset disabled={busy}>
            <label>{t('playTitle')}<input autoFocus required dir="auto" maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>
            <label>{t('playInstructions')}<textarea required dir="auto" maxLength={4000} rows={3} value={instructions} onChange={event => setInstructions(event.target.value)} /></label>
            <label>{t('playValue')}<input required type="number" min={0} max={100} step={1} value={points} onChange={event => setPoints(event.target.value)} /></label>
            <div className="row">
              <button className="primary" disabled={!title.trim() || !instructions.trim()}>{t('playAssign')}</button>
              <button type="button" onClick={() => { setAssigning(false); heading.current?.focus(); }}>{t('adminCancel')}</button>
            </div>
          </fieldset>
        </form> : <div><button className="primary" disabled={busy} onClick={() => setAssigning(true)}>{t('playAssign')}</button></div>)}
    </>}
    {!!history.length && <details className="msg-history">
      <summary>{t('playPastMissions')}</summary>
      {history.map(m => <article className="msg-play-mission" key={m.id}>{missionBody(m)}</article>)}
    </details>}
    {open && <div><button type="button" className="quiet" disabled={busy} onClick={() => {
      if (confirm(t('playConfirmStop'))) send({ action: 'stop' });
    }}>{t('playStop')}</button></div>}
  </article>;
}
