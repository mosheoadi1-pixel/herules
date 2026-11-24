import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { ChatFeedback, useChatAction, useChatRead, type ChatCopy } from './PublicChatParts';

type State = 'requested' | 'countered' | 'accepted' | 'declined' | 'withdrawn' | 'cancelled';
type SessionRequest = { id: string; title: string; details: string; startsAt: string; counterStartsAt: string | null; state: State };
type Verb = 'accept' | 'decline' | 'counter' | 'withdraw' | 'cancel';
const stateKeys: Record<State, string> = { requested: 'sessionRequested', countered: 'sessionCountered', accepted: 'sessionAccepted', declined: 'sessionDeclined', withdrawn: 'sessionWithdrawn', cancelled: 'sessionCancelled' };

export function PublicSessionRequests({ conversationId, role, version, editor, onEditor, ...copy }: ChatCopy & {
  conversationId: string; role: 'dom' | 'sub'; version: number; editor: string | null; onEditor: (editor: string | null) => void;
}) {
  const { t, lang, errorText } = copy;
  const [title, setTitle] = useState(''), [details, setDetails] = useState(''), [start, setStart] = useState('');
  const [counter, setCounter] = useState(''), [invalidTime, setInvalidTime] = useState(false);
  const [revision, refresh] = useState(0);
  const retry = useRef({ payload: '', key: '' });
  const area = useRef<HTMLElement>(null), firstField = useRef<HTMLInputElement>(null), opener = useRef<HTMLButtonElement | null>(null);
  const focusAfter = useRef<'opener' | 'area' | null>(null);
  const path = `/public/conversations/${conversationId}/session-requests`;
  const snapshot = useChatRead<SessionRequest[]>(path, 'sessionRequests', version + revision, 0);
  // Show the confirmed write immediately, then defer to the next read.
  const [write, setWrite] = useState<{ base?: SessionRequest[]; request: SessionRequest }>();
  const requests = write && write.base === snapshot?.value
    ? [write.request, ...(write.base ?? []).filter(request => request.id !== write.request.id)]
    : snapshot?.value;
  const pending = requests?.find(r => r.state === 'requested' || r.state === 'countered');
  const canPropose = role === 'dom' && !!requests && !pending;
  const canCounter = role === 'sub' && pending?.state === 'requested';
  const { busy, error, notice, run } = useChatAction(copy, () => refresh(value => value + 1));

  useEffect(() => {
    if (editor && (editor === 'new' ? !canPropose : !canCounter || pending?.id !== editor)) onEditor(null);
  }, [editor, canPropose, canCounter, pending?.id, onEditor]);
  useLayoutEffect(() => {
    if (editor) firstField.current?.focus();
    else if (focusAfter.current) {
      const target = focusAfter.current === 'opener' && opener.current?.isConnected ? opener.current : area.current;
      target?.focus();
      focusAfter.current = null;
    }
  }, [editor]);

  const close = (restore: 'opener' | 'area') => {
    focusAfter.current = restore;
    setInvalidTime(false);
    onEditor(null);
  };
  const localIso = (value: string) => {
    const date = new Date(value);
    const now = Date.now();
    const valid = date.getTime() > now && date.getTime() <= now + 90 * 86400000;
    setInvalidTime(!valid);
    if (!valid) return null;
    return date.toISOString();
  };
  const propose = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startsAt = localIso(start);
    if (!canPropose || !startsAt || !title.trim() || !details.trim()) return;
    const payload = { title: title.trim(), details: details.trim(), startsAt };
    const signature = JSON.stringify(payload);
    if (retry.current.payload !== signature) retry.current = { payload: signature, key: crypto.randomUUID() };
    void run(() => api(path, { ...payload, idempotencyKey: retry.current.key }), ({ sessionRequest }) => {
      setWrite({ base: snapshot?.value, request: sessionRequest });
      setTitle(''); setDetails(''); setStart('');
      retry.current = { payload: '', key: '' };
      close('area');
    }, 'sessionSent');
  };
  const action = (id: string, verb: Verb, payload: object = {}) =>
    void run(() => api(`/public/session-requests/${id}/${verb}`, payload), ({ sessionRequest }) => {
      setWrite({ base: snapshot?.value, request: sessionRequest });
      setCounter('');
      if (editor) close('area');
      else area.current?.focus({ preventScroll: true });
    });
  const time = (value: string) => <time dateTime={value}><bdi>{new Date(value).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</bdi></time>;
  const featured = pending ?? requests?.find(request => request.state === 'accepted');
  const history = requests?.filter(request => request.id !== featured?.id);
  const dateError = invalidTime ? <p className="error" role="alert">{t('errSessionTime')}</p> : null;
  const renderRequest = (request: SessionRequest) => {
    const answer = (request.state === 'requested' && role === 'sub') || (request.state === 'countered' && role === 'dom');
    const withdraw = role === 'dom' && (request.state === 'requested' || request.state === 'countered');
    const counterOpen = editor === request.id;
    return <article key={request.id} className="msg-card msg-session-card">
        <h3><bdi>{request.title}</bdi></h3>
        <p className="small" role="status">{t(stateKeys[request.state])}</p>
        <p className="preserve" dir="auto">{request.details}</p>
        <p>{t(request.state === 'accepted' && !request.counterStartsAt ? 'sessionAgreedTime' : 'sessionOriginalTime')}: {time(request.startsAt)}</p>
        {request.counterStartsAt && <p>{t(request.state === 'accepted' ? 'sessionAgreedTime' : 'sessionCounterTime')}: {time(request.counterStartsAt)}</p>}
        {!editor && (answer || withdraw || request.state === 'accepted') && <div className="row">
          {answer && <>
            <button type="button" className="primary" disabled={busy} onClick={() => action(request.id, 'accept')}>{t('convAccept')}</button>
            <button type="button" disabled={busy} onClick={() => action(request.id, 'decline')}>{t('convDecline')}</button>
          </>}
          {canCounter && pending?.id === request.id && <button type="button" ref={opener} disabled={busy} onClick={() => {
            setCounter(''); onEditor(request.id);
          }}>{t('sessionCounter')}</button>}
          {withdraw && <button type="button" disabled={busy} onClick={() => action(request.id, 'withdraw')}>{t('sessionWithdraw')}</button>}
          {request.state === 'accepted' && <button type="button" className="danger" disabled={busy} onClick={() => {
            if (confirm(t('sessionConfirmCancel'))) action(request.id, 'cancel');
          }}>{t('sessionCancel')}</button>}
        </div>}
        {counterOpen && <form className="msg-fields" onSubmit={event => {
          event.preventDefault();
          const startsAt = localIso(counter);
          if (startsAt) action(request.id, 'counter', { startsAt });
        }}>
          <fieldset disabled={busy}>
            <label>{t('sessionCounterInput')}<input ref={firstField} type="datetime-local" required value={counter} onChange={e => { setCounter(e.target.value); setInvalidTime(false); }} /></label>
            {dateError}
            <div className="row">
              <button className="primary">{t('sessionSendCounter')}</button>
              <button type="button" className="quiet" onClick={() => close('opener')}>{t('adminCancel')}</button>
            </div>
          </fieldset>
        </form>}
      </article>;
  };
  if (!canPropose && !requests?.length && !snapshot?.error && !notice && !error) return null;
  return <section className="msg-session" aria-label={t('sessionRequests')} tabIndex={-1} ref={area}>
    <ChatFeedback error={error || (snapshot?.error && errorText(snapshot.error))} notice={notice} />
    {canPropose && !editor && <button type="button" ref={opener} className="primary" disabled={busy} onClick={() => onEditor('new')}>{t('sessionInvite')}</button>}
    {canPropose && editor === 'new' && <form className="msg-fields msg-card" aria-label={t('sessionInvite')} onSubmit={propose}>
      <fieldset disabled={busy}>
        <label>{t('sessionTitle')}<input ref={firstField} dir="auto" required maxLength={240} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>{t('sessionStartInput')}<input type="datetime-local" required value={start} onChange={e => { setStart(e.target.value); setInvalidTime(false); }} /></label>
        {dateError}
        <label>{t('sessionDetails')}<textarea dir="auto" rows={2} required maxLength={2000} value={details} onChange={e => setDetails(e.target.value)} /></label>
        <div className="row">
          <button className="primary" disabled={!title.trim() || [...title.trim()].length > 120 || !details.trim() || [...details.trim()].length > 1000}>{t('sessionSend')}</button>
          <button type="button" className="quiet" onClick={() => close('opener')}>{t('adminCancel')}</button>
        </div>
      </fieldset>
    </form>}
    {featured && (!editor || editor === featured.id) && renderRequest(featured)}
    {!!history?.length && !editor && <details className="msg-history">
      <summary>{t('sessionHistory')}</summary>
      {history.map(renderRequest)}
    </details>}
  </section>;
}
