import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';

type RoomMessage = { id: string; seq: number; authorId: string; nickname: string; targetId: string | null; targetNickname: string | null; body: string | null; removed: boolean; createdAt: string };
type Action = { kind: 'report' | 'remove'; id: string } | null;

// Shown only to verified users; the server enforces it on every request. Live updates come from EventSource.
// If the stream errors, the room polls /api/public/room instead and retries the stream after 30 seconds.
// Conversation events arrive on the same stream; the room hands them to the conversations panel through onConversationEvent.
export function PublicRoom({ t, lang, errorText, me, role, isAdmin, onConversationEvent }: { t: (key: string) => string; lang: 'he' | 'en'; errorText: (e: any) => string; me: string; role: string; isAdmin: boolean; onConversationEvent: () => void }) {
  const [messages, setMessages] = useState<RoomMessage[]>([]), [loaded, setLoaded] = useState(false), [polling, setPolling] = useState(false), [attempt, setAttempt] = useState(0);
  const [body, setBody] = useState(''), [target, setTarget] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [action, setAction] = useState<Action>(null), [reason, setReason] = useState('');
  const cursor = useRef(0), sendKey = useRef({ payload: '', key: '' });
  const dateText = (value: string) => new Date(value).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB');

  const merge = (incoming: RoomMessage[], next?: number) => {
    setMessages(current => {
      const byId = new Map(current.map(message => [message.id, message]));
      for (const message of incoming) byId.set(message.id, message);
      return [...byId.values()].sort((a, b) => a.seq - b.seq);
    });
    for (const message of incoming) cursor.current = Math.max(cursor.current, message.seq);
    if (next !== undefined) cursor.current = Math.max(cursor.current, next);
  };
  // Blocks and reports change what is visible, so the latest view is reloaded whole rather than merged.
  const loadLatest = () => api('/public/room').then(page => { setMessages(page.messages); cursor.current = page.cursor; setLoaded(true); }).catch(e => setError(errorText(e)));
  const poll = () => api(`/public/room?after=${cursor.current}&limit=50`).then(page => { merge(page.messages, page.cursor); if (page.events.length) onConversationEvent(); setLoaded(true); }).catch(e => setError(errorText(e)));

  useEffect(() => { void loadLatest(); }, []);
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => void poll(), 3000);
    return () => clearInterval(timer);
  }, [polling]);
  useEffect(() => {
    if (typeof EventSource === 'undefined') { setPolling(true); return; }
    const events = new EventSource('/api/public/events');
    let retry: ReturnType<typeof setTimeout> | undefined;
    events.addEventListener('room', event => merge([JSON.parse((event as MessageEvent).data)]));
    for (const name of ['conversation_requested', 'conversation_updated', 'conversation_message']) events.addEventListener(name, () => onConversationEvent());
    // A fresh connection may have missed events while it was down; the poll closes that gap.
    events.onopen = () => { setPolling(false); void poll(); };
    events.onerror = () => { events.close(); setPolling(true); retry = setTimeout(() => setAttempt(value => value + 1), 30000); };
    return () => { events.close(); clearTimeout(retry); };
  }, [attempt]);

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = body.trim(), nickname = target.trim() || undefined;
    // A retry of the same text and target reuses its key, so a repeated tap cannot post twice.
    const payload = JSON.stringify([text, nickname]);
    if (sendKey.current.payload !== payload) sendKey.current = { payload, key: crypto.randomUUID() };
    setBusy(true);
    setError('');
    setNotice('');
    api('/public/room/messages', { body: text, targetNickname: nickname, idempotencyKey: sendKey.current.key })
      .then(data => {
        // An addressed post is a conversation request, so the room shows only that a request was sent.
        if (data.message) merge([data.message]);
        else setNotice(t('convRequestSent'));
        setBody('');
        setTarget('');
        sendKey.current = { payload: '', key: '' };
      })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };
  const confirmAction = () => {
    if (!action) return;
    setBusy(true);
    setError('');
    setNotice('');
    const request = action.kind === 'report'
      ? api(`/public/room/messages/${action.id}/report`, { reason: reason.trim() }).then(() => setNotice(t('roomReported')))
      : api(`/public/admin/room/messages/${action.id}/remove`, { reason: reason.trim() }).then(data => { merge([data.message]); setNotice(t('roomRemovedDone')); });
    request.then(() => { setAction(null); setReason(''); }).catch(e => setError(errorText(e))).finally(() => setBusy(false));
  };
  const blockAuthor = (message: RoomMessage) => {
    if (!confirm(t('roomConfirmBlock'))) return;
    setBusy(true);
    setError('');
    setNotice('');
    api('/public/room/blocks', { userId: message.authorId })
      .then(() => { setNotice(t('roomBlocked')); return loadLatest(); })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };

  return <section className="panel room" aria-label={t('roomTitle')}>
    <h2>{t('roomTitle')}</h2>
    <p className="small" role="status">{polling ? t('roomPolling') : t('roomLive')}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loaded && messages.length === 0 && <p className="empty">{t('roomEmpty')}</p>}
    <ol className="room-list">{messages.map(message => <li key={message.id}>
      <article>
        <p className="small"><bdi>{message.nickname}</bdi>{message.targetNickname && <> {'→'} <bdi>{message.targetNickname}</bdi></>} · <time dateTime={message.createdAt}>{dateText(message.createdAt)}</time></p>
        {message.removed ? <p className="small">{t('roomRemoved')}</p> : <p className="preserve">{message.body}</p>}
        {!message.removed && message.authorId !== me && <div className="row">
          <button type="button" disabled={busy} onClick={() => { setAction({ kind: 'report', id: message.id }); setReason(''); }}>{t('roomReport')}</button>
          <button type="button" disabled={busy} onClick={() => blockAuthor(message)}>{t('roomBlock')}</button>
        </div>}
        {!message.removed && isAdmin && <button type="button" className="danger" disabled={busy} onClick={() => { setAction({ kind: 'remove', id: message.id }); setReason(''); }}>{t('roomRemove')}</button>}
        {action?.id === message.id && <form onSubmit={event => { event.preventDefault(); confirmAction(); }}>
          <p>{t(action.kind === 'report' ? 'roomConfirmReport' : 'roomConfirmRemove')}</p>
          <label>{t('roomReasonLabel')}<input value={reason} maxLength={300} required onChange={e => setReason(e.target.value)}/></label>
          <div className="row">
            <button type="button" disabled={busy} onClick={() => setAction(null)}>{t('adminCancel')}</button>
            <button className={action.kind === 'remove' ? 'danger' : 'primary'} disabled={busy || !reason.trim()}>{t(action.kind === 'report' ? 'roomReport' : 'roomRemove')}</button>
          </div>
        </form>}
      </article>
    </li>)}</ol>
    {role === 'dom' && <form className="room-compose" onSubmit={send}>
      <fieldset disabled={busy}>
        <label>{t('roomCompose')}<textarea value={body} required onChange={e => setBody(e.target.value)}/></label>
        <label>{t('roomTarget')}<input value={target} maxLength={20} onChange={e => setTarget(e.target.value)}/></label>
        <button className="primary" disabled={!body.trim()}>{t('roomSend')}</button>
      </fieldset>
    </form>}
  </section>;
}
