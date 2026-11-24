import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';

export type ChatCopy = { t: (key: string) => string; lang: 'he' | 'en'; errorText: (error: any) => string };
export type Room = { id: string; kind: 'group' | 'channel'; title: [string, string]; canPost: boolean };
export type Person = { nickname: string };

// Keep a same-chat snapshot during ordinary arrivals, never across a visibility
// invalidation. Cleanup ignores responses for superseded scopes or searches.
export function useChatRead<T>(path: string | null, field: string | null, revision: number, visibility: number) {
  const [snapshot, setSnapshot] = useState<{ path: string; visibility: number; value?: T; error?: any }>();
  useEffect(() => {
    if (!path) return;
    let active = true;
    api(path).then(data => {
      if (active) setSnapshot({ path, visibility, value: field ? data[field] : data });
    }).catch(error => {
      if (active) setSnapshot({ path, visibility, error });
    });
    return () => { active = false; };
  }, [path, field, revision, visibility]);
  return snapshot?.path === path && snapshot?.visibility === visibility ? snapshot : undefined;
}

export function useChatAction(copy: ChatCopy, changed: () => void) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const alive = useRef(false), writing = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = async (request: () => Promise<unknown>, complete?: () => void, noticeKey?: string) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true); setNotice(''); setError('');
    try {
      await request();
      if (alive.current) {
        complete?.();
        if (noticeKey) setNotice(copy.t(noticeKey));
      }
    } catch (error) { if (alive.current) setError(copy.errorText(error)); }
    finally {
      writing.current = false;
      if (alive.current) { changed(); setBusy(false); }
    }
  };
  return { busy, error, notice, run };
}

export function ChatFeedback({ error, notice }: { error?: string; notice?: string }) {
  return <>
    {error && <p className="error msg-feedback" role="alert">{error}</p>}
    {notice && <p className="msg-feedback" role="status">{notice}</p>}
  </>;
}

export function ChatComposer({ t, value, onInput, busy, onSubmit, privateChat = false }: Pick<ChatCopy, 't'> & {
  value: string; onInput: (value: string) => void; busy: boolean; onSubmit: (event: FormEvent) => void; privateChat?: boolean;
}) {
  return <form className="msg-compose" onSubmit={onSubmit}>
    <label>{t(privateChat ? 'convCompose' : 'roomCompose')}<textarea dir="auto" rows={2} value={value} onChange={event => onInput(event.target.value)} required readOnly={busy} /></label>
    <button className="primary" disabled={busy || !value.trim() || [...value.trim()].length > 1000}>{t('roomSend')}</button>
  </form>;
}

type Bubble = { id: string; nickname: string; targetNickname?: string | null; mine: boolean; body: string | null; removed: boolean; createdAt: string; authorId?: string };
type MessageAction = { kind: 'report' | 'remove'; id: string };

export function ChatTranscript({ messages, isAdmin, busy, empty, onAction, onBlock, t, lang }: ChatCopy & {
  messages?: Bubble[]; isAdmin: boolean; busy: boolean; empty: string;
  onAction: (action: MessageAction, reason: string, complete: () => void) => void;
  onBlock?: (authorId: string) => void;
}) {
  const [action, setAction] = useState<MessageAction | null>(null), [reason, setReason] = useState('');
  const view = useRef<HTMLDivElement>(null), follow = useRef(true), reasonInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (messages && view.current && follow.current) view.current.scrollTop = view.current.scrollHeight;
  }, [messages]);
  useEffect(() => { if (action) reasonInput.current?.focus(); }, [action]);
  return <div className="msg-transcript" tabIndex={0} role="region" aria-label={t('msgTranscript')} ref={view} onScroll={event => {
    const el = event.currentTarget;
    follow.current = el.scrollHeight - el.clientHeight - el.scrollTop < 80;
  }}>
    {!messages ? <p className="small" role="status">{t('msgLoading')}</p> : messages.length === 0 ? <p className="empty">{empty}</p> :
      <ol className="msg-bubbles" aria-label={t('msgTranscript')}>{messages.map(message => <li key={message.id} className={message.mine ? 'msg-mine' : undefined}>
        <article>
          <p className="msg-byline"><bdi>{message.nickname}</bdi>{message.targetNickname && <> {'→'} <bdi>{message.targetNickname}</bdi></>}
            {' · '}<time dateTime={message.createdAt}><bdi>{new Date(message.createdAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}</bdi></time></p>
          {message.removed ? <p className="small">{t('roomRemoved')}</p> : <p className="preserve msg-body" dir="auto">{message.body}</p>}
          {!message.removed && (!message.mine || isAdmin) && <details className="msg-actions">
            <summary>{t('msgActions')}</summary>
            <div className="row">
              {!message.mine && <button type="button" disabled={busy} onClick={() => { setReason(''); setAction({ kind: 'report', id: message.id }); }}>{t('roomReport')}</button>}
              {!message.mine && message.authorId && onBlock && <button type="button" disabled={busy} onClick={() => onBlock(message.authorId!)}>{t('roomBlock')}</button>}
              {isAdmin && <button type="button" className="danger" disabled={busy} onClick={() => { setReason(''); setAction({ kind: 'remove', id: message.id }); }}>{t('roomRemove')}</button>}
            </div>
            {action?.id === message.id && <form onSubmit={event => { event.preventDefault(); if (reason.trim()) onAction(action, reason.trim(), () => setAction(null)); }}>
              <p>{t(action.kind === 'report' ? 'roomConfirmReport' : 'roomConfirmRemove')}</p>
              <label>{t('roomReasonLabel')}<input ref={reasonInput} dir="auto" value={reason} maxLength={300} required onChange={event => setReason(event.target.value)} /></label>
              <div className="row">
                <button type="button" disabled={busy} onClick={() => setAction(null)}>{t('adminCancel')}</button>
                <button className={action.kind === 'remove' ? 'danger' : 'primary'} disabled={busy || !reason.trim()}>{t(action.kind === 'report' ? 'roomReport' : 'roomRemove')}</button>
              </div>
            </form>}
          </details>}
        </article>
      </li>)}</ol>}
  </div>;
}
