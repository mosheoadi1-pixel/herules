import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { ChatComposer, ChatFeedback, ChatTranscript, useChatAction, useChatRead, type ChatCopy, type Person, type Room } from './PublicChatParts';

type RoomMessage = { id: string; authorId: string; nickname: string; targetNickname: string | null; body: string | null; removed: boolean; createdAt: string };

export function PublicRoom({ id, room, me, role, isAdmin, revision, visibility, onChanged, onVisibilityChanged, ...copy }: ChatCopy & {
  id: string; room?: Room; me: string; role: string; isAdmin: boolean; revision: number; visibility: number;
  onChanged: () => void; onVisibilityChanged: () => void;
}) {
  const { t, errorText } = copy, path = `/public/rooms/${id}`;
  const snapshot = useChatRead<RoomMessage[]>(path, 'messages', revision, visibility);
  const [body, setBody] = useState(''), [address, setAddress] = useState(''), [target, setTarget] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false), [grantRevision, refreshGrants] = useState(0);
  const targetInput = useRef<HTMLInputElement>(null);
  const canAddress = room !== undefined && role === 'dom';
  const canManage = role === 'dom' || isAdmin;
  const grants = useChatRead<Person[]>(room && canManage && toolsOpen ? `${path}/grants` : null, 'grants', grantRevision, visibility);
  const { busy, error, notice, run } = useChatAction(copy, onChanged);
  const retry = useRef<{ post?: { signature: string; key: string }; address?: { signature: string; key: string } }>({});
  useEffect(() => { if (toolsOpen) targetInput.current?.focus(); }, [toolsOpen]);

  const send = (event: FormEvent, addressed: boolean) => {
    event.preventDefault();
    const text = (addressed ? address : body).trim(), nickname = addressed ? target.trim() : undefined;
    const kind = addressed ? 'address' : 'post';
    if (!text || [...text].length > 1000 || (addressed ? !canAddress || !nickname : !room?.canPost)) return;
    const signature = JSON.stringify([text, nickname]);
    if (retry.current[kind]?.signature !== signature) retry.current[kind] = { signature, key: crypto.randomUUID() };
    const idempotencyKey = retry.current[kind]!.key;
    void run(() => api(`${path}/${addressed ? 'address' : 'messages'}`, { body: text, targetNickname: nickname, idempotencyKey }), () => {
      delete retry.current[kind];
      if (addressed) { setAddress(''); setTarget(''); refreshGrants(value => value + 1); }
      else setBody('');
    }, addressed ? 'msgApproved' : undefined);
  };
  const revoke = (nickname: string) => {
    void run(() => api(`${path}/revoke`, { targetNickname: nickname }), () => {
      refreshGrants(value => value + 1);
      onVisibilityChanged();
    }, 'msgRevoked');
  };
  const block = (userId: string) => {
    if (confirm(t('roomConfirmBlock'))) void run(() => api('/public/room/blocks', { userId }), onVisibilityChanged, 'roomBlocked');
  };
  return <>
    <ChatFeedback error={error || (snapshot?.error && errorText(snapshot.error))} notice={notice} />
    {!snapshot?.error && <ChatTranscript key={visibility} {...copy} messages={snapshot?.value?.map(message => ({ ...message, mine: message.authorId === me }))}
      empty={t('roomEmpty')} isAdmin={isAdmin} busy={busy} onBlock={block} onAction={(action, reason, complete) => {
        const url = action.kind === 'report' ? `/public/room/messages/${action.id}/report` : `/public/admin/room/messages/${action.id}/remove`;
        void run(() => api(url, { reason }), complete, action.kind === 'report' ? 'roomReported' : 'roomRemovedDone');
      }} />}
    {room && !room.canPost && <p className="msg-readonly" role="status">{t('msgReadOnly')}</p>}
    {room?.canPost && !(toolsOpen && canAddress) && <ChatComposer t={t} value={body} onInput={setBody} busy={busy} onSubmit={event => send(event, false)} />}
    {canManage && <details className="msg-room-tools" onToggle={event => setToolsOpen(event.currentTarget.open)}>
      <summary>{t('msgGrants')}</summary>
      {role === 'dom' && <form className="msg-address" onSubmit={event => send(event, true)}>
        <p className="small">{t('msgAddressHint')}</p>
        <label>{t('msgSubNickname')}<input ref={targetInput} dir="auto" value={target} maxLength={20} onChange={event => setTarget(event.target.value)} required readOnly={busy} /></label>
        <label>{t('roomCompose')}<textarea dir="auto" rows={2} value={address} onChange={event => setAddress(event.target.value)} required readOnly={busy} /></label>
        <button className="primary" disabled={!canAddress || busy || !target.trim() || !address.trim() || [...address.trim()].length > 1000}>{t('msgAddress')}</button>
      </form>}
      {grants?.error && <p className="error" role="alert">{errorText(grants.error)}</p>}
      {grants?.value?.length === 0 && <p className="small">{t('msgNoGrants')}</p>}
      {grants?.value && grants.value.length > 0 && <ul className="msg-grants">{grants.value.map(person => <li key={person.nickname}>
        <bdi>{person.nickname}</bdi> <button type="button" disabled={busy} aria-label={`${t('msgRevoke')}: ${person.nickname}`} onClick={() => revoke(person.nickname)}>{t('msgRevoke')}</button>
      </li>)}</ul>}
    </details>}
  </>;
}
