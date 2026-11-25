import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { PublicRoom } from './PublicRoom';
import { PublicConversations, stateKeys, type Conversation, type ConversationDetail } from './PublicConversations';
import { PublicPlay } from './PublicPlay';
import { useChatRead, type ChatCopy, type Room } from './PublicChatParts';
import './public-messaging.css';

type Selection = { kind: 'room' | 'private' | 'person'; id: string };
type SearchResult = { nickname: string; conversationId: string | null; canInvite: boolean };
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
  const [selected, setSelected] = useState<Selection | null>(() =>
    window.matchMedia('(max-width: 680px)').matches ? null : { kind: 'room', id: 'main' });
  // undefined = messaging, null = play inbox, string = a play session.
  const playFromHistory = () => window.history.state?.pairedPlayer === me ? window.history.state.play as string | null : undefined;
  const [play, setPlay] = useState<string | null | undefined>(playFromHistory);
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const heading = useRef<HTMLHeadingElement>(null), navigation = useRef<HTMLHeadingElement>(null);
  const playHeading = useRef<HTMLHeadingElement>(null), playOpener = useRef<HTMLElement | null>(null);
  const playTraversal = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const moveFocus = useRef(false);
  const { updates, polling, invalidate, refreshRoom, refreshPrivate } = useMessagingFeed(onAuthLost);
  const visibility = updates.visibility;
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const rooms = useChatRead<Room[]>('/public/rooms', 'rooms', updates.permissions, visibility);
  const searching = search.trim() !== '';
  const people = useChatRead<SearchResult[]>(searching && search.trim() === query ? `/public/directory?chat=1&q=${encodeURIComponent(query)}` : null,
    'people', updates.private, visibility);
  const threads = useChatRead<Conversation[]>('/public/conversations', 'conversations', updates.private, visibility);
  const detail = useChatRead<ConversationDetail>(selected?.kind === 'private' ? `/public/conversations/${selected.id}` : null,
    null, updates.private, visibility);
  const room = selected?.kind === 'room' ? rooms?.value?.find(entry => entry.id === selected.id) : undefined;
  const thread = selected?.kind === 'private' ? threads?.value?.find(entry => entry.id === selected.id) : undefined;
  const selectedPerson = useChatRead<SearchResult[]>(selected?.kind === 'person' ? `/public/directory?chat=1&q=${encodeURIComponent(selected.id)}&limit=1` : null,
    'people', updates.private, visibility);
  const person = selectedPerson?.value?.find(entry => entry.nickname === selected?.id);
  const title = room?.title[lang === 'he' ? 0 : 1] ?? detail?.value?.conversation.otherNickname ?? thread?.otherNickname ?? person?.nickname;
  const closePlay = () => {
    if (playTraversal.current) return;
    moveFocus.current = true;
    const state = window.history.state;
    if (state?.pairedPlayer === me) {
      if (state.playDepth > 0) {
        // Return to the chat entry instead of leaving the play inbox behind
        // the chat, where the next browser Back would reopen it.
        playTraversal.current = true;
        window.history.go(-state.playDepth);
        return;
      }
      const { pairedPlayer, play, playDepth, playParent, ...rest } = state;
      window.history.replaceState(rest, '');
    }
    setPlay(undefined);
  };
  const choose = (value: Selection | null) => { playOpener.current = null; closePlay(); setSelected(value); };
  const openPlay = (id: string | null, opener?: HTMLElement) => {
    if (playTraversal.current) return;
    if (opener) playOpener.current = opener;
    if (play === id) return;
    const state = window.history.state;
    const depth = state?.pairedPlayer === me ? state.playDepth ?? 0 : 0;
    if (id === null && depth > 1 && state.playParent === null) {
      playTraversal.current = true;
      window.history.back();
      return;
    }
    window.history.pushState({ ...state, pairedPlayer: me, play: id, playDepth: depth + 1, playParent: play }, '');
    setPlay(id);
  };
  useEffect(()=>{
    const onBack=()=>{playTraversal.current=false;moveFocus.current=true;setPlay(playFromHistory());};
    window.addEventListener('popstate',onBack);
    return ()=>window.removeEventListener('popstate',onBack);
  },[me]);
  useLayoutEffect(() => {
    if (play !== undefined) playHeading.current?.focus();
  }, [play]);
  useLayoutEffect(() => {
    if (play !== undefined || !moveFocus.current) return;
    moveFocus.current = false;
    const opener = playOpener.current;
    playOpener.current = null;
    (opener?.isConnected && opener.getClientRects().length ? opener : (selected ? heading : searching ? searchInput : navigation).current)?.focus();
  }, [selected, play]);
  const current = (kind: Selection['kind'], id: string) => selected?.kind === kind && selected.id === id ? 'true' as const : undefined;
  const resultStatus = !people ? 'msgSearching' : people.value?.length === 0 ? 'msgNoPeople' : '';
  const orderedThreads = threads?.value && [...threads.value].sort((a, b) => Number(b.canAnswer) - Number(a.canAnswer));
  return <section className={`public-messaging${selected || play !== undefined ? ' has-selection' : ''}${play!==undefined?' playing':''}`} aria-label={t('msgTitle')}>
    <aside className="msg-sidebar" aria-labelledby="msg-navigation">
      <div className="msg-sidebar-head">
        <h2 id="msg-navigation" tabIndex={-1} ref={navigation}>{t('msgTitle')}</h2>
        {polling && <p className="small" role="status">{t('roomPolling')}</p>}
      </div>
      <div className="msg-inbox-controls">
        <button type="button" aria-current={play !== undefined ? 'true' : undefined} onClick={event => openPlay(null, event.currentTarget)}>{t('playInbox')}</button>
        <div>
          <label htmlFor="msg-room-picker">{t('msgRooms')}</label>
          <select id="msg-room-picker" value={room?.id ?? ''} disabled={!rooms?.value} onChange={event => choose({ kind: 'room', id: event.target.value })}>
            <option value="" disabled>{t('msgChooseRoom')}</option>
            {rooms?.value?.map(item => <option key={item.id} value={item.id}>{item.title[lang === 'he' ? 0 : 1]}</option>)}
          </select>
        </div>
        {rooms?.error && <p className="error" role="alert">{errorText(rooms.error)}</p>}
        <label>{t('msgSearch')}
          <input ref={searchInput} type="search" dir="auto" maxLength={20} value={search} onChange={event => setSearch(event.target.value)} />
        </label>
      </div>
      <nav aria-label={t(searching ? 'msgPeople' : 'convTitle')}>
        <p className="small" role="status">{searching ? (resultStatus ? t(resultStatus) : '') : !threads ? t('msgInboxLoading') : orderedThreads?.length === 0 ? t('convEmpty') : ''}</p>
        {(searching ? people?.error : threads?.error) && <p className="error" role="alert">{errorText(searching ? people?.error : threads?.error)}</p>}
        <ul>{searching ? people?.value?.map(result => <li key={result.nickname}>
          {result.conversationId || result.canInvite ? <button type="button"
            aria-current={result.conversationId ? current('private', result.conversationId) : current('person', result.nickname)}
            onClick={() => choose(result.conversationId ? { kind: 'private', id: result.conversationId } : { kind: 'person', id: result.nickname })}>
            <bdi>{result.nickname}</bdi><small>{t(result.conversationId ? 'msgOpenChat' : 'msgInviteChat')}</small>
          </button> : <div className="msg-result-unavailable"><bdi>{result.nickname}</bdi><small>{t('msgChatUnavailable')}</small></div>}
        </li>) : orderedThreads?.map(item => <li key={item.id}>
          <button type="button" aria-current={current('private', item.id)} onClick={() => choose({ kind: 'private', id: item.id })}>
            <bdi>{item.otherNickname}</bdi><small>{t(item.canAnswer ? 'convIncoming' : stateKeys[item.state])}</small>
          </button>
        </li>)}</ul>
      </nav>
    </aside>
    <section className="msg-pane" aria-labelledby={play === undefined ? 'msg-heading' : 'msg-play-heading'}>
      <div className="msg-chat-view" hidden={play !== undefined}>
      <div className="msg-head">
        <button type="button" className="quiet msg-back" onClick={() => choose(null)}>{t('msgBack')}</button>
        <h2 id="msg-heading" tabIndex={-1} ref={heading}>{title ? <bdi>{title}</bdi> : t(selected?.kind === 'person' ? 'msgInviteChat' : selected ? 'msgConversation' : 'msgChoose')}</h2>
      </div>
      {!selected && <p className="msg-empty">{t('msgChooseHint')}</p>}
      {selected?.kind === 'room' && <PublicRoom key={selected.id} {...copy} id={selected.id} room={room} me={me} role={role} isAdmin={isAdmin}
        revision={updates.rooms[selected.id] ?? 0} visibility={visibility} onChanged={() => refreshRoom(selected.id)} onVisibilityChanged={invalidate} />}
      {selected?.kind === 'private' && <PublicConversations key={selected.id} {...copy} id={selected.id} isAdmin={isAdmin}
        snapshot={detail} revision={updates.private} visibility={visibility} onChanged={refreshPrivate}
        onOpenPlay={openPlay} onDecision={() => heading.current?.focus({ preventScroll: true })} onBlocked={() => { invalidate(); choose(null); }} />}
      {selected?.kind === 'person' && (person?.canInvite ? <PrivateRequest key={person.nickname} {...copy} nickname={person.nickname}
        focusOpening={() => document.activeElement === heading.current}
        onCancel={() => choose(null)} onSent={id => { refreshPrivate(); choose({ kind: 'private', id }); }} /> :
        <div className="msg-empty">
          {selectedPerson?.error ? <p className="error" role="alert">{errorText(selectedPerson.error)}</p> :
            person?.conversationId ? <button type="button" onClick={() => choose({ kind: 'private', id: person.conversationId! })}>{t('msgOpenChat')}</button> :
              <p role="status">{t(selectedPerson?.value ? 'msgPersonUnavailable' : 'msgLoading')}</p>}
        </div>)}
      </div>
      {play !== undefined && <>
        <div className="msg-head">
          <button type="button" className="quiet" onClick={closePlay}>{t(selected ? 'playBackChat' : 'msgBack')}</button>
          <h2 id="msg-play-heading" ref={playHeading} tabIndex={-1}>{t(play ? 'playSession' : 'playInbox')}</h2>
        </div>
        <PublicPlay {...copy} id={play} onPick={openPlay} revision={updates.private} visibility={visibility} />
      </>}
    </section>
  </section>;
}

function PrivateRequest({ nickname, onSent, onCancel, focusOpening, t, errorText }: ChatCopy & {
  nickname: string; onSent: (id: string) => void; onCancel: () => void; focusOpening: () => boolean;
}) {
  const [body, setBody] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const retry = useRef({ body: '', key: '' }), alive = useRef(false), writing = useRef(false);
  const opening = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (focusOpening()) opening.current?.focus(); }, []);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (writing.current || !text || [...text].length > 1000) return;
    if (retry.current.body !== text) retry.current = { body: text, key: crypto.randomUUID() };
    writing.current = true; setBusy(true); setError('');
    try {
      const { conversation } = await api('/public/conversations/request', { targetNickname: nickname, body: text, idempotencyKey: retry.current.key });
      if (alive.current) onSent(conversation.id);
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  };
  return <form className="msg-card msg-invite" onSubmit={send}>
    <p id="msg-invite-note">{t('convNoWriting')}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <label>{t('msgOpening')}<textarea ref={opening} aria-describedby="msg-invite-note" rows={3} dir="auto" value={body} required readOnly={busy} maxLength={2000} onChange={event => setBody(event.target.value)} /></label>
    <div className="row">
      <button className="primary" disabled={busy || !body.trim() || [...body.trim()].length > 1000}>{t('msgRequest')}</button>
      <button type="button" className="quiet" disabled={busy} onClick={onCancel}>{t('adminCancel')}</button>
    </div>
  </form>;
}
