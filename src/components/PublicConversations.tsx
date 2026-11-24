import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';

type Conversation = { id: string; state: 'requested' | 'accepted' | 'declined' | 'closed'; role: 'dom' | 'sub'; otherNickname: string; createdAt: string; decidedAt: string | null; closedAt: string | null; cooldownUntil: string | null; lastMessageAt: string | null; canMessage: boolean; canAnswer: boolean; canClose: boolean };
type Message = { id: string; seq: number; conversationId: string; nickname: string; mine: boolean; body: string | null; removed: boolean; createdAt: string };
type Detail = { conversation: Conversation; messages: Message[] };
type Action = { kind: 'report' | 'remove'; id: string } | null;

const stateKeys: Record<Conversation['state'], string> = { requested: 'convStateRequested', accepted: 'convStateAccepted', declined: 'convStateDeclined', closed: 'convStateClosed' };

// Lists the caller's private conversations and opens one at a time. Refreshes whenever the room reports a conversation event (version changes).
export function PublicConversations({ t, lang, errorText, isAdmin, version }: { t: (key: string) => string; lang: 'he' | 'en'; errorText: (e: any) => string; isAdmin: boolean; version: number }) {
  const [list, setList] = useState<Conversation[]>([]), [loaded, setLoaded] = useState(false), [openId, setOpenId] = useState(''), [detail, setDetail] = useState<Detail | null>(null);
  const [body, setBody] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [action, setAction] = useState<Action>(null), [reason, setReason] = useState('');
  const sendKey = useRef({ payload: '', key: '' });
  const dateText = (value: string) => new Date(value).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB');

  const loadList = () => api('/public/conversations').then(data => { setList(data.conversations); setLoaded(true); }).catch(e => setError(errorText(e)));
  const loadDetail = (id: string) => api(`/public/conversations/${id}`).then(data => setDetail(data)).catch(e => { setError(errorText(e)); setDetail(null); setOpenId(''); });

  useEffect(() => { void loadList(); }, [version]);
  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    void loadDetail(openId);
  }, [openId, version]);

  const open = (id: string) => {
    setOpenId(id);
    setBody('');
    setAction(null);
    setReason('');
    setError('');
    setNotice('');
  };
  const run = (request: Promise<unknown>, done?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    request
      .then(() => { if (done) setNotice(done); return Promise.all([loadList(), openId ? loadDetail(openId) : undefined]); })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };
  const answer = (verb: 'accept' | 'decline') => run(api(`/public/conversations/${openId}/${verb}`, {}));
  const close = () => {
    if (!confirm(t('convConfirmClose'))) return;
    run(api(`/public/conversations/${openId}/close`, {}));
  };
  // A retry of the same text reuses its key, so a repeated tap cannot send twice.
  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = body.trim();
    const payload = JSON.stringify([openId, text]);
    if (sendKey.current.payload !== payload) sendKey.current = { payload, key: crypto.randomUUID() };
    setBusy(true);
    setError('');
    setNotice('');
    api(`/public/conversations/${openId}/messages`, { body: text, idempotencyKey: sendKey.current.key })
      .then(() => { setBody(''); sendKey.current = { payload: '', key: '' }; return Promise.all([loadList(), loadDetail(openId)]); })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };
  const confirmAction = () => {
    if (!action) return;
    const request = action.kind === 'report'
      ? api(`/public/conversations/messages/${action.id}/report`, { reason: reason.trim() }).then(() => setNotice(t('roomReported')))
      : api(`/public/admin/conversations/messages/${action.id}/remove`, { reason: reason.trim() }).then(() => setNotice(t('roomRemovedDone')));
    setBusy(true);
    setError('');
    request
      .then(() => { setAction(null); setReason(''); return loadDetail(openId); })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };
  const blockOther = () => {
    if (!detail || !confirm(t('roomConfirmBlock'))) return;
    setBusy(true);
    setError('');
    api('/public/room/blocks', { nickname: detail.conversation.otherNickname })
      .then(() => { setNotice(t('roomBlocked')); setOpenId(''); return loadList(); })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };

  const current = detail?.conversation;
  return <section className="panel room" aria-label={t('convTitle')}>
    <h2>{t('convTitle')}</h2>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!openId && <>
      {loaded && list.length === 0 && <p className="empty">{t('convEmpty')}</p>}
      <ul className="room-list">{list.map(item => <li key={item.id}>
        <article>
          <p><span>{t('convWith')} </span><bdi>{item.otherNickname}</bdi> · <span>{t('convStatus')}: {t(stateKeys[item.state])}</span></p>
          {item.lastMessageAt && <time dateTime={item.lastMessageAt}>{t('convLast')}: {dateText(item.lastMessageAt)}</time>}
          <button type="button" disabled={busy} onClick={() => open(item.id)}>{t('convOpen')}</button>
        </article>
      </li>)}</ul>
    </>}
    {openId && current && detail && <section aria-label={t('convTitle')}>
      <button type="button" className="quiet" disabled={busy} onClick={() => setOpenId('')}>{t('convBack')}</button>
      <h3><span>{t('convWith')} </span><bdi>{current.otherNickname}</bdi> · {t('convStatus')}: {t(stateKeys[current.state])}</h3>
      {current.canAnswer && <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={() => answer('accept')}>{t('convAccept')}</button>
        <button type="button" className="danger" disabled={busy} onClick={() => answer('decline')}>{t('convDecline')}</button>
      </div>}
      {current.state === 'requested' && !current.canAnswer && <p>{t('convWaiting')}</p>}
      {(current.state === 'closed' || current.state === 'declined') && <p>{t('convClosedNote')}</p>}
      {current.cooldownUntil && (current.state === 'closed' || current.state === 'declined') && <p className="small">{t('convCooldownNote')}</p>}
      {current.canClose && <button type="button" className="quiet" disabled={busy} onClick={close}>{t('convClose')}</button>}
      <button type="button" disabled={busy} onClick={blockOther}>{t('roomBlock')}</button>
      {detail.messages.length === 0 && <p className="empty">{t('convNone')}</p>}
      <ol className="room-list">{detail.messages.map(message => <li key={message.id}>
        <article>
          <p className="small"><bdi>{message.nickname}</bdi> · <time dateTime={message.createdAt}>{dateText(message.createdAt)}</time></p>
          {message.removed ? <p className="small">{t('roomRemoved')}</p> : <p className="preserve">{message.body}</p>}
          {!message.removed && !message.mine && <div className="row">
            <button type="button" disabled={busy} onClick={() => { setAction({ kind: 'report', id: message.id }); setReason(''); }}>{t('roomReport')}</button>
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
      {current.canMessage && <form className="room-compose" onSubmit={send}>
        <fieldset disabled={busy}>
          <label>{t('convCompose')}<textarea value={body} required maxLength={1000} onChange={e => setBody(e.target.value)}/></label>
          <button className="primary" disabled={!body.trim()}>{t('convSend')}</button>
        </fieldset>
      </form>}
      {!current.canMessage && current.state === 'requested' && <p className="small">{t('convNoWriting')}</p>}
    </section>}
  </section>;
}
