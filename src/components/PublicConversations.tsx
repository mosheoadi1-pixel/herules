import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { PublicSessionRequests } from './PublicSessionRequests';
import { ChatComposer, ChatFeedback, ChatTranscript, useChatAction, useChatRead, type ChatCopy } from './PublicChatParts';

export type Conversation = {
  id: string; state: 'requested' | 'accepted' | 'declined' | 'closed'; role: 'dom' | 'sub';
  otherNickname: string; cooldownUntil: string | null; canMessage: boolean; canAnswer: boolean; canClose: boolean;
};
type Message = { id: string; nickname: string; mine: boolean; body: string | null; removed: boolean; createdAt: string };
type Detail = { conversation: Conversation; messages: Message[] };

export const stateKeys: Record<Conversation['state'], string> = { requested: 'convStateRequested', accepted: 'convStateAccepted', declined: 'convStateDeclined', closed: 'convStateClosed' };

export function PublicConversations({ id, isAdmin, revision, visibility, onChanged, onBlocked, ...copy }: ChatCopy & {
  id: string; isAdmin: boolean; revision: number; visibility: number; onChanged: () => void; onBlocked: () => void;
}) {
  const { t, errorText } = copy, path = `/public/conversations/${id}`;
  const snapshot = useChatRead<Detail>(path, null, revision, visibility);
  const current = snapshot?.value?.conversation;
  const [body, setBody] = useState('');
  const retry = useRef({ body: '', key: '' });
  const { busy, error, notice, run } = useChatAction(copy, onChanged);
  const change = (verb: 'accept' | 'decline' | 'close') => void run(() => api(`${path}/${verb}`, {}));
  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!current?.canMessage || !text || [...text].length > 1000) return;
    if (retry.current.body !== text) retry.current = { body: text, key: crypto.randomUUID() };
    void run(() => api(`${path}/messages`, { body: text, idempotencyKey: retry.current.key }), () => {
      setBody(''); retry.current = { body: '', key: '' };
    });
  };
  return <>
    {current && <div className="msg-thread-meta">
      <p className="small">{t('convStatus')}: {t(stateKeys[current.state])}</p>
      {current.state === 'requested' && !current.canAnswer && <p>{t('convWaiting')}</p>}
      {(current.state === 'closed' || current.state === 'declined') && <p>{t('convClosedNote')}</p>}
      {current.cooldownUntil && <p className="small">{t('convCooldownNote')}</p>}
      <div className="row">
        {current.canAnswer && <>
          <button type="button" className="primary" disabled={busy} onClick={() => change('accept')}>{t('convAccept')}</button>
          <button type="button" disabled={busy} onClick={() => change('decline')}>{t('convDecline')}</button>
        </>}
        {current.canClose && <button type="button" className="quiet" disabled={busy} onClick={() => {
          if (confirm(t('convConfirmClose'))) change('close');
        }}>{t('convClose')}</button>}
        <button type="button" disabled={busy} onClick={() => {
          if (confirm(t('roomConfirmBlock'))) void run(() => api('/public/room/blocks', { nickname: current.otherNickname }), onBlocked);
        }}>{t('roomBlock')}</button>
      </div>
    </div>}
    {current?.state === 'accepted' && <details className="msg-room-tools">
      <summary>{t('sessionRequests')}</summary>
      <PublicSessionRequests conversationId={id} role={current.role} version={revision} {...copy} />
    </details>}
    <ChatFeedback error={error || (snapshot?.error && errorText(snapshot.error))} notice={notice} />
    {!snapshot?.error && <ChatTranscript key={visibility} {...copy} messages={snapshot?.value?.messages}
      empty={t('convNone')} isAdmin={isAdmin} busy={busy} onAction={(action, reason, complete) => {
        const url = action.kind === 'report' ? `/public/conversations/messages/${action.id}/report` : `/public/admin/conversations/messages/${action.id}/remove`;
        void run(() => api(url, { reason }), complete, action.kind === 'report' ? 'roomReported' : 'roomRemovedDone');
      }} />}
    {current?.canMessage && <ChatComposer t={t} value={body} onInput={setBody} busy={busy} onSubmit={send} privateChat />}
  </>;
}
