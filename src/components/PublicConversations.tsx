import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { PublicSessionRequests } from './PublicSessionRequests';
import { ChatComposer, ChatFeedback, ChatTranscript, useChatAction, type ChatCopy } from './PublicChatParts';

export type Conversation = {
  id: string; state: 'requested' | 'accepted' | 'declined' | 'closed'; role: 'dom' | 'sub';
  otherNickname: string; cooldownUntil: string | null; canMessage: boolean; canAnswer: boolean; canClose: boolean;
};
type Message = { id: string; nickname: string; mine: boolean; body: string | null; removed: boolean; createdAt: string };
export type ConversationDetail = { conversation: Conversation; messages: Message[] };

export const stateKeys: Record<Conversation['state'], string> = { requested: 'convStateRequested', accepted: 'convStateAccepted', declined: 'convStateDeclined', closed: 'convStateClosed' };

export function PublicConversations({ id, isAdmin, snapshot, revision, visibility, onChanged, onBlocked, onDecision, ...copy }: ChatCopy & {
  id: string; isAdmin: boolean; revision: number; visibility: number; onChanged: () => void; onBlocked: () => void;
  snapshot?: { value?: ConversationDetail; error?: any }; onDecision: () => void;
}) {
  const { t, errorText } = copy, path = `/public/conversations/${id}`;
  const current = snapshot?.value?.conversation;
  const [body, setBody] = useState('');
  const [sessionEditor, setSessionEditor] = useState<string | null>(null);
  const retry = useRef({ body: '', key: '' });
  const { busy, error, notice, run } = useChatAction(copy, onChanged);
  const change = (verb: 'accept' | 'decline' | 'close') => void run(() => api(`${path}/${verb}`, {}), onDecision,
    verb === 'accept' ? 'convStateAccepted' : undefined);
  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!current?.canMessage || !text || [...text].length > 1000) return;
    if (retry.current.body !== text) retry.current = { body: text, key: crypto.randomUUID() };
    void run(() => api(`${path}/messages`, { body: text, idempotencyKey: retry.current.key }), () => {
      setBody(''); retry.current = { body: '', key: '' };
    });
  };
  const transcript = <ChatTranscript key={visibility} {...copy} messages={snapshot?.value?.messages}
    empty={t('convNone')} isAdmin={isAdmin} busy={busy} onAction={(action, reason, complete) => {
      const url = action.kind === 'report' ? `/public/conversations/messages/${action.id}/report` : `/public/admin/conversations/messages/${action.id}/remove`;
      void run(() => api(url, { reason }), complete, action.kind === 'report' ? 'roomReported' : 'roomRemovedDone');
    }} />;
  return <>
    {current?.state === 'accepted' && <PublicSessionRequests conversationId={id} role={current.role}
      version={revision} editor={sessionEditor} onEditor={setSessionEditor} {...copy} />}
    <ChatFeedback error={error || (snapshot?.error && errorText(snapshot.error))} notice={notice} />
    {current?.canAnswer ? <section className="msg-card msg-consent" aria-labelledby="msg-consent-heading">
      <h3 id="msg-consent-heading">{t('convIncoming')}</h3>
      {transcript}
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={() => change('accept')}>{t('convAccept')}</button>
        <button type="button" disabled={busy} onClick={() => change('decline')}>{t('convDecline')}</button>
      </div>
    </section> : !snapshot?.error && <>
      {current?.state === 'requested' && <p className="msg-readonly" role="status">{t('convWaiting')}</p>}
      {(current?.state === 'closed' || current?.state === 'declined') && <p className="msg-readonly" role="status">
        {t(current.state === 'closed' ? 'convClosedNote' : 'convDeclinedNote')}{' '}
        {current.cooldownUntil && Date.parse(current.cooldownUntil) > Date.now() && t('convCooldownNote')}
      </p>}
      {transcript}
    </>}
    {current?.canMessage && !sessionEditor && <ChatComposer t={t} value={body} onInput={setBody} busy={busy} onSubmit={send} privateChat />}
    {current && <details className="msg-room-tools">
      <summary>{t('convActions')}</summary>
      <div className="row msg-tool-body">
        {current.canClose && <button type="button" className="quiet" disabled={busy} onClick={() => {
          if (confirm(t('convConfirmClose'))) change('close');
        }}>{t('convClose')}</button>}
        <button type="button" disabled={busy} onClick={() => {
          if (confirm(t('roomConfirmBlock'))) void run(() => api('/public/room/blocks', { nickname: current.otherNickname }), onBlocked);
        }}>{t('roomBlock')}</button>
      </div>
    </details>}
  </>;
}
