import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { PublicRoom } from './PublicRoom';
import { PublicConversations, stateKeys, type Conversation } from './PublicConversations';
import { useChatRead, type ChatCopy, type Room, type Person } from './PublicChatParts';
import './public-messaging.css';

type Selection = { kind: 'room' | 'private' | 'person'; id: string };
type Updates = { rooms: Record<string, number>; private: number; visibility: number; permissions: number };

function useMessagingFeed(onAuthLost: () => void) {
  const [updates, update] = useState<Updates>({ rooms: {}, private: 0, visibility: 0, permissions: 0 });
  const [polling, setPolling] = useState(false);
  const authLost = useRef(onAuthLost);
  authLost.current = onAuthLost;
  const invalidate = () => update(old => ({ ...old, visibility: old.visibility + 1 }));
  const refreshRoom = (id: string) => update(old => ({ ...old, rooms: { ...old.rooms, [id]: (old.rooms[id] ?? 0) + 1 } }));
  const refreshPrivate = () => update(old => ({ ...old, private: old.private + 1 }));
  useEffect(() => {
    let stopped = false, source: EventSource | undefined;
    let pollTimer: ReturnType<typeof setTimeout>, retry: ReturnType<typeof setTimeout>, batch: ReturnType<typeof setTimeout> | undefined;
    let cursor: number | undefined, fallback = false, dirtyPrivate = false, nextPermissionCheck = 0;
    const dirtyRooms = new Set<string>();
    const flush = () => {
      const roomIds = [...dirtyRooms], privateChanged = dirtyPrivate;
      dirtyRooms.clear(); dirtyPrivate = false; batch = undefined;
      update(old => {
        const rooms = { ...old.rooms };
        for (const id of roomIds) rooms[id] = (rooms[id] ?? 0) + 1;
        return { ...old, rooms, private: old.private + Number(privateChanged) };
      });
    };
    const receive = (event: string, data: { roomId?: string }) => {
      if (event === 'messaging_refresh') { invalidate(); return; }
      if (event === 'room' && data.roomId) dirtyRooms.add(data.roomId);
      if (event !== 'room') dirtyPrivate = true;
      batch ??= setTimeout(flush, 60);
    };
    const poll = async () => {
      if (stopped || !fallback) return;
      try {
        if (cursor === undefined) {
          const page = await api('/public/room?limit=1');
          if (stopped || !fallback) return;
          cursor = page.cursor as number;
          invalidate();
        }
        const page = await api(`/public/room?after=${cursor}&allRooms=1&limit=100`);
        if (stopped || !fallback) return;
        cursor = page.cursor;
        for (const message of page.messages) receive('room', message);
        for (const event of page.events) receive(event.event, event.data);
        // Operator verification changes can affect canPost without a feed row.
        // Ordinary grants and blocks already invalidate snapshots immediately.
        if (Date.now() >= nextPermissionCheck) {
          nextPermissionCheck = Date.now() + 20000;
          update(old => ({ ...old, permissions: old.permissions + 1 }));
        }
        pollTimer = setTimeout(poll, page.hasMore ? 150 : 4000);
      } catch (error: any) {
        if (stopped || !fallback) return;
        if (error.status === 401 || error.status === 403) { invalidate(); authLost.current(); return; }
        pollTimer = setTimeout(poll, 5000);
      }
    };
    const startPolling = () => {
      if (fallback) return;
      fallback = true;
      setPolling(true);
      void poll();
    };
    const connect = () => {
      if (stopped) return;
      if (typeof EventSource === 'undefined') { startPolling(); return; }
      const events = new EventSource('/api/public/events?allRooms=1');
      source = events;
      for (const kind of ['room', 'conversation_requested', 'conversation_updated', 'conversation_message', 'session_request_updated', 'messaging_refresh']) {
        events.addEventListener(kind, event => {
          const message = event as MessageEvent;
          if (message.lastEventId) cursor = Math.max(cursor ?? 0, Number(message.lastEventId));
          receive(kind, JSON.parse(message.data));
        });
      }
      events.onopen = () => {
        fallback = false;
        clearTimeout(pollTimer);
        setPolling(false);
        // The SSE connection is already listening while these snapshots load.
        // This closes the initial/reconnect gap without a second live stream.
        invalidate();
      };
      events.onerror = () => {
        events.close();
        if (stopped) return;
        invalidate();
        startPolling();
        retry = setTimeout(connect, 30000);
      };
    };
    const onFocus = () => { if (document.visibilityState === 'visible') invalidate(); };
    document.addEventListener('visibilitychange', onFocus);
    connect();
    return () => {
      stopped = true;
      source?.close();
      clearTimeout(pollTimer); clearTimeout(retry); clearTimeout(batch);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);
  return { updates, polling, invalidate, refreshRoom, refreshPrivate };
}

export function PublicMessaging({ me, role, isAdmin, onAuthLost, ...copy }: ChatCopy & {
  me: string; role: string; isAdmin: boolean; onAuthLost: () => void;
}) {
  const { t, lang, errorText } = copy;
  const [selected, setSelected] = useState<Selection | null>({ kind: 'room', id: 'main' });
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const heading = useRef<HTMLHeadingElement>(null), navigation = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  const { updates, polling, invalidate, refreshRoom, refreshPrivate } = useMessagingFeed(onAuthLost);
  const visibility = updates.visibility;
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const rooms = useChatRead<Room[]>('/public/rooms', 'rooms', updates.permissions, visibility);
  const people = useChatRead<Person[]>(`/public/directory?q=${encodeURIComponent(query)}`, 'people', 0, visibility);
  const threads = useChatRead<Conversation[]>('/public/conversations', 'conversations', updates.private, visibility);
  const room = selected?.kind === 'room' ? rooms?.value?.find(entry => entry.id === selected.id) : undefined;
  const thread = selected?.kind === 'private' ? threads?.value?.find(entry => entry.id === selected.id) : undefined;
  const selectedPerson = useChatRead<Person[]>(selected?.kind === 'person' ? `/public/directory?q=${encodeURIComponent(selected.id)}&limit=1` : null, 'people', 0, visibility);
  const nickname = selected?.kind === 'person' && selectedPerson?.value?.[0]?.nickname === selected.id ? selected.id : undefined;
  const title = room?.title[lang === 'he' ? 0 : 1] ?? thread?.otherNickname ?? nickname;
  const choose = (value: Selection | null) => { moveFocus.current = true; setSelected(value); };
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (selected ? heading : navigation).current?.focus();
  }, [selected]);
  const current = (kind: Selection['kind'], id: string) => selected?.kind === kind && selected.id === id ? 'true' as const : undefined;
  const existingThread = (nickname: string) => threads?.value?.find(item => item.otherNickname === nickname && item.canClose);
  const selectPerson = (nickname: string) => {
    const thread = existingThread(nickname);
    choose(thread ? { kind: 'private', id: thread.id } : { kind: 'person', id: nickname });
  };
  return <section className={`public-messaging${selected ? ' has-selection' : ''}`} aria-label={t('msgTitle')}>
    <aside className="msg-sidebar" aria-labelledby="msg-navigation">
      <div className="msg-sidebar-head">
        <h2 id="msg-navigation" tabIndex={-1} ref={navigation}>{t('msgTitle')}</h2>
        <p className="small" role="status">{polling ? t('roomPolling') : t('roomLive')}</p>
      </div>
      <nav aria-label={t('msgRooms')}>
        <h3>{t('msgRooms')}</h3>
        {rooms?.error && <p className="error" role="alert">{errorText(rooms.error)}</p>}
        <ul>{rooms?.value?.map(item => <li key={item.id}>
          <button type="button" aria-current={current('room', item.id)} onClick={() => choose({ kind: 'room', id: item.id })}>
            <span>{item.title[lang === 'he' ? 0 : 1]}</span><small>{t(item.kind === 'channel' ? 'msgChannel' : 'msgGroup')}</small>
          </button>
        </li>)}</ul>
      </nav>
      <nav aria-label={t('convTitle')}>
        <h3>{t('convTitle')}</h3>
        {threads?.error && <p className="error" role="alert">{errorText(threads.error)}</p>}
        {threads?.value?.length === 0 && <p className="small">{t('convEmpty')}</p>}
        <ul>{threads?.value?.map(item => <li key={item.id}>
          <button type="button" aria-current={current('private', item.id)} onClick={() => choose({ kind: 'private', id: item.id })}>
            <bdi>{item.otherNickname}</bdi><small>{t(stateKeys[item.state])}</small>
          </button>
        </li>)}</ul>
      </nav>
      <nav aria-label={t('msgPeople')}>
        <h3>{t('msgPeople')}</h3>
        <label>{t('msgSearch')}<input type="search" dir="auto" maxLength={20} value={search} onChange={event => setSearch(event.target.value)} /></label>
        {people?.error && <p className="error" role="alert">{errorText(people.error)}</p>}
        {people?.value?.length === 0 && search.trim() === query && <p className="small">{t('msgNoPeople')}</p>}
        {search.trim() === query && <ul>{people?.value?.map(person => <li key={person.nickname}>
          <button type="button" aria-current={current('person', person.nickname)} onClick={() => selectPerson(person.nickname)}><bdi>{person.nickname}</bdi></button>
        </li>)}</ul>}
      </nav>
    </aside>
    <section className="msg-pane" aria-labelledby="msg-heading">
      <div className="msg-head">
        <button type="button" className="quiet msg-back" onClick={() => choose(null)}>{t('msgBack')}</button>
        <h2 id="msg-heading" tabIndex={-1} ref={heading}>{title ? <bdi>{title}</bdi> : t('msgTitle')}</h2>
        {room && <p className="small">{t(room.kind === 'channel' ? 'msgChannel' : 'msgGroup')}</p>}
      </div>
      {!selected && <p className="msg-empty">{t('msgChoose')}</p>}
      {selected?.kind === 'room' && <PublicRoom key={selected.id} {...copy} id={selected.id} room={room} me={me} role={role} isAdmin={isAdmin}
        revision={updates.rooms[selected.id] ?? 0} visibility={visibility} onChanged={() => refreshRoom(selected.id)} onVisibilityChanged={invalidate} />}
      {selected?.kind === 'private' && <PublicConversations key={selected.id} {...copy} id={selected.id} isAdmin={isAdmin}
        revision={updates.private} visibility={visibility} onChanged={refreshPrivate} onBlocked={() => { invalidate(); choose(null); }} />}
      {selected?.kind === 'person' && (nickname ? <PrivateRequest key={`${nickname}:${visibility}`} {...copy} nickname={nickname} role={role}
        onSent={id => { refreshPrivate(); choose({ kind: 'private', id }); }} /> :
        <p className="msg-empty" role="status">{selectedPerson?.error ? errorText(selectedPerson.error) : t(selectedPerson?.value ? 'msgPersonUnavailable' : 'msgLoading')}</p>)}
    </section>
  </section>;
}

function PrivateRequest({ nickname, role, onSent, t, errorText }: ChatCopy & { nickname: string; role: string; onSent: (id: string) => void }) {
  const [body, setBody] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const retry = useRef({ body: '', key: '' }), alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (busy || !text) return;
    if (retry.current.body !== text) retry.current = { body: text, key: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      const { conversation } = await api('/public/conversations/request', { targetNickname: nickname, body: text, idempotencyKey: retry.current.key });
      if (alive.current) onSent(conversation.id);
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { if (alive.current) setBusy(false); }
  };
  return <div className="msg-empty">
    <p>{t(role === 'dom' ? 'msgRequestHint' : 'msgSubRequest')}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {role === 'dom' && <form className="msg-compose" onSubmit={send}>
      <label>{t('msgOpening')}<textarea rows={3} dir="auto" value={body} required disabled={busy} onChange={event => setBody(event.target.value)} /></label>
      <button className="primary" disabled={busy || !body.trim() || [...body.trim()].length > 1000}>{t('msgRequest')}</button>
    </form>}
  </div>;
}
