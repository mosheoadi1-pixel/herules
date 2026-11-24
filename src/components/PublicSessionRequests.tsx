import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';

type State = 'requested' | 'countered' | 'accepted' | 'declined' | 'withdrawn' | 'cancelled';
type SessionRequest = { id: string; title: string; details: string; startsAt: string; counterStartsAt: string | null; state: State };
type Verb = 'accept' | 'decline' | 'counter' | 'withdraw' | 'cancel';
const stateKeys: Record<State, string> = { requested: 'sessionRequested', countered: 'sessionCountered', accepted: 'sessionAccepted', declined: 'sessionDeclined', withdrawn: 'sessionWithdrawn', cancelled: 'sessionCancelled' };

export function PublicSessionRequests({ conversationId, role, version, t, lang, errorText }: {
  conversationId: string; role: 'dom' | 'sub'; version: number; t: (key: string) => string;
  lang: 'he' | 'en'; errorText: (error: any) => string;
}) {
  const [requests, setRequests] = useState<SessionRequest[] | null>(null);
  const [title, setTitle] = useState(''), [details, setDetails] = useState(''), [start, setStart] = useState('');
  const [counter, setCounter] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [revision, refresh] = useState(0);
  const retry = useRef({ payload: '', key: '' });
  const path = `/public/conversations/${conversationId}/session-requests`;

  useEffect(() => {
    let active = true;
    api(path).then(data => { if (active) setRequests(data.sessionRequests); }).catch(e => {
      if (active) { setRequests(null); setError(errorText(e)); }
    });
    return () => { active = false; };
  }, [path, version, revision]);

  const run = async (url: string, payload: object, onSuccess: () => void = () => {}) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await api(url, payload); onSuccess(); }
    catch (e) { setError(errorText(e)); }
    finally { refresh(value => value + 1); setBusy(false); }
  };
  const localIso = (value: string) => {
    const date = new Date(value);
    const now = Date.now();
    if (!(date.getTime() > now && date.getTime() <= now + 90 * 86400000)) {
      setError(t('errSessionTime'));
      return null;
    }
    return date.toISOString();
  };
  const propose = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startsAt = localIso(start);
    if (!startsAt) return;
    const payload = { title: title.trim(), details: details.trim(), startsAt };
    const signature = JSON.stringify(payload);
    if (retry.current.payload !== signature) retry.current = { payload: signature, key: crypto.randomUUID() };
    void run(path, { ...payload, idempotencyKey: retry.current.key }, () => {
      setTitle(''); setDetails(''); setStart('');
      retry.current = { payload: '', key: '' };
    });
  };
  const action = (id: string, verb: Verb, payload: object = {}) => void run(`/public/session-requests/${id}/${verb}`, payload, () => setCounter(''));
  const pending = requests?.some(r => r.state === 'requested' || r.state === 'countered');
  const time = (value: string) => <time dateTime={value}><bdi>{new Date(value).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</bdi></time>;

  return <section aria-label={t('sessionRequests')}>
    <h4>{t('sessionRequests')}</h4>
    {error && <p className="error" role="alert">{error}</p>}
    {requests?.length === 0 && <p className="empty">{t('sessionNone')}</p>}
    {requests && <ul className="room-list">{requests.map(request => {
      const answer = (request.state === 'requested' && role === 'sub') || (request.state === 'countered' && role === 'dom');
      const withdraw = role === 'dom' && (request.state === 'requested' || request.state === 'countered');
      return <li key={request.id}><article>
        <p><strong><bdi>{request.title}</bdi></strong> · {t(stateKeys[request.state])}</p>
        <p className="preserve" dir="auto">{request.details}</p>
        <p>{t(request.state === 'accepted' && !request.counterStartsAt ? 'sessionAgreedTime' : 'sessionOriginalTime')}: {time(request.startsAt)}</p>
        {request.counterStartsAt && <p>{t(request.state === 'accepted' ? 'sessionAgreedTime' : 'sessionCounterTime')}: {time(request.counterStartsAt)}</p>}
        {(answer || withdraw || request.state === 'accepted') && <div className="row">
          {answer && <>
            <button type="button" className="primary" disabled={busy} onClick={() => action(request.id, 'accept')}>{t('convAccept')}</button>
            <button type="button" disabled={busy} onClick={() => action(request.id, 'decline')}>{t('convDecline')}</button>
          </>}
          {withdraw && <button type="button" disabled={busy} onClick={() => action(request.id, 'withdraw')}>{t('sessionWithdraw')}</button>}
          {request.state === 'accepted' && <button type="button" className="danger" disabled={busy} onClick={() => {
            if (confirm(t('sessionConfirmCancel'))) action(request.id, 'cancel');
          }}>{t('sessionCancel')}</button>}
        </div>}
        {request.state === 'requested' && role === 'sub' && <form className="room-compose" onSubmit={event => {
          event.preventDefault();
          const startsAt = localIso(counter);
          if (startsAt) action(request.id, 'counter', { startsAt });
        }}>
          <fieldset disabled={busy}>
            <label>{t('sessionCounterInput')}<input type="datetime-local" required value={counter} onChange={e => setCounter(e.target.value)} /></label>
            <button>{t('sessionCounter')}</button>
          </fieldset>
        </form>}
      </article></li>;
    })}</ul>}
    {role === 'dom' && requests && !pending && <form className="room-compose" onSubmit={propose}>
      <fieldset disabled={busy}>
        <label>{t('sessionTitle')}<input dir="auto" required maxLength={240} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>{t('sessionDetails')}<textarea dir="auto" required maxLength={2000} value={details} onChange={e => setDetails(e.target.value)} /></label>
        <label>{t('sessionStartInput')}<input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /></label>
        <button className="primary" disabled={!title.trim() || [...title.trim()].length > 120 || !details.trim() || [...details.trim()].length > 1000}>{t('sessionPropose')}</button>
      </fieldset>
    </form>}
  </section>;
}
