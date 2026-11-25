import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api } from '../api';
import { form } from '../app-shared';
import { publicCopy } from '../i18n';
import { CAMERA_CONSENT_VERSION, VERIFICATION_CONSENT_VERSION } from '../verification-consent';
import { AdminReviews } from './PublicAdmin';
import { PublicMessaging } from './PublicMessaging';
import { CameraCheck, type CameraLiveness } from './CameraCheck';
import { PublicEntrance } from './PublicEntrance';

type PublicUser = { id: string; nickname: string; role: string; gender: string; status: string };
export type PublicProviders = Partial<Record<'google' | 'apple', boolean>>;
const errorKeys: Record<string,string> = {'provider not configured':'errProvider','Sign-in expired; start again':'errExpired','Already exists':'errTaken','Invalid or missing input':'errInvalid','verification not configured':'errVerifyNotConfigured','Consent required':'errConsent','Unsupported image type':'errMedia','Image too large':'errMedia','Too many verification attempts; try again tomorrow':'errAttempts','Reviewer role required':'errNotAdmin','Review unavailable':'errReviewGone','Only items awaiting review can be decided':'errReviewGone','Only items awaiting review have media to review':'errReviewGone','Media has been deleted':'errMediaGone','Media unavailable':'errMediaGone','Verification required':'errVerification','camera consent not available yet':'errCameraUnavailable','Camera check needs a front photo, a live selfie and liveness frames':'errCameraInput','Only doms can post in the room':'errOnlyDoms','Recipient unavailable':'errRecipient','Too many posts; try again in ten minutes':'errPosts','Message unavailable':'errRoomMessage','You cannot report your own message':'errOwnReport','Message already removed':'errRemoved','Idempotency key was used for a different message':'errKey','You cannot block yourself':'errSelf','Conversation unavailable':'errConversation','A conversation with this sub is already open':'errConversationOpen','Wait 30 days after a declined or closed conversation before asking again':'errCooldown','Only the sub can answer a request':'errOnlySub','The conversation is not waiting for an answer':'errNotRequested','Messages open after the request is accepted':'errNotAccepted','This conversation is closed':'errClosed','Too many messages; try again in ten minutes':'errConvPosts'};
Object.assign(errorKeys, {
  'Room unavailable': 'errRoomUnavailable',
  'Room grant unavailable': 'errRoomGrant',
  'Room posting requires dom approval': 'msgReadOnly',
  'Please sign in': 'msgSignInAgain',
  'Too many attempts; retry in ten minutes': 'msgRate',
  'Failed to fetch': 'msgNetwork',
  'Request timed out; the server may have committed. Refresh state before retrying.': 'msgTimeout',
  'Session start must be in the next 90 days': 'errSessionTime',
  'Play session unavailable': 'errPlayUnavailable',
  'Play session is read-only': 'errPlayReadOnly',
  'Idempotency key was used for a different play action': 'errPlayKey',
  'You cannot take this mission action': 'errPlayRole',
  'Finish or decline the current mission first': 'errPlayCurrent',
  'This session has reached its mission limit': 'errPlayLimit',
  'Mission unavailable': 'errPlayMission',
  'This mission changed; refresh and try again': 'errPlayChanged',
  'Choose a different time for the counteroffer': 'errSessionSameTime',
  'Session requests require an accepted conversation': 'errSessionConversation',
  'Only the dom can propose a session': 'errSessionDom',
  'Idempotency key was used for a different session request': 'errSessionKey',
  'A session request is already open': 'errSessionOpen',
  'You cannot take this session action': 'errSessionRole',
  'This session action is not available': 'errSessionAction',
  'Too many session actions; try again in ten minutes': 'errSessionBudget',
});
type Verification = { status: string; consented: boolean; cameraConsented?: boolean; cameraEnabled?: boolean; verification: { status: string } | null };
const maxImageBytes = 5 * 1024 * 1024;
const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  if (!['image/jpeg', 'image/png'].includes(file.type)) return reject(new Error('Unsupported image type'));
  if (file.size > maxImageBytes) return reject(new Error('Image too large'));
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Unsupported image type'));
  reader.readAsDataURL(file);
});
function VerificationPanel({ t, errorText, onVerified }: { t: (key: string) => string; errorText: (e: any) => string; onVerified: () => void }) {
  const [state, setState] = useState<Verification | null>(null), [method, setMethod] = useState<'id_document' | 'camera_age'>('id_document'), [files, setFiles] = useState<File[]>([]), [front, setFront] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const frontSelection = useRef(0);
  const load = () => api('/public/verification').then((data: Verification) => {
    setState(data);
    if (data.status === 'verified') onVerified();
  }).catch(e => setError(errorText(e)));
  const check = () => { setBusy(true); setError(''); void load().finally(() => setBusy(false)); };
  useEffect(() => { void load(); }, []);
  const guided = method === 'camera_age' && state?.cameraEnabled === true;
  const consent = () => {
    setBusy(true);
    setError('');
    void api('/public/consent', { kind: 'verification', textVersion: guided ? CAMERA_CONSENT_VERSION : VERIFICATION_CONSENT_VERSION }).then(load).catch(e => setError(errorText(e))).finally(() => setBusy(false));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    void Promise.all(files.map(readImage))
      .then(media => api('/public/verification', { method, media }))
      .then(data => { setState(current => current ? { ...current, status: data.status, consented: true, verification: data.verification } : current); if (data.status === 'verified') onVerified(); })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };
  const pickFront = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const selection = ++frontSelection.current;
    setError('');
    setFront('');
    if (!file) return;
    void readImage(file).then(image => { if (selection === frontSelection.current) setFront(image); })
      .catch(e => { if (selection === frontSelection.current) setError(errorText(e)); });
  };
  const sendCamera = (media: string[], liveness: CameraLiveness) => {
    setBusy(true);
    setError('');
    void api('/public/verification', { method: 'camera_age', media, liveness }, 120000)
      .then(data => { setState(current => current ? { ...current, status: data.status, consented: true, verification: data.verification } : current); if (data.status === 'verified') onVerified(); })
      .catch(e => setError(errorText(e)))
      .finally(() => { setFront(''); setBusy(false); });
  };
  if (!state) return error ? <><p className="error" role="alert">{error}</p><button type="button" disabled={busy} onClick={check}>{t('entryRetry')}</button></> : <p role="status">{t('msgLoading')}</p>;
  const status = state.verification?.status;
  const message = status === 'failed' ? t('verifyFailed') : status === 'review' ? t('verifyReview') : status === 'purged' ? t('verifyPurged') : status === 'pending' ? t('verifyPending') : '';
  const consentPending = guided ? state.cameraConsented !== true : !state.consented;
  return <section className="public-verification">
    <h3>{t('verifyTitle')}</h3>
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {(status === 'review' || status === 'pending') && <button type="button" disabled={busy} onClick={check}>{t('entryCheckStatus')}</button>}
    {status !== 'review' && <>
    <p>{t('verifyIntro')}</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <label htmlFor="public-verification-method">{t('methodLabel')}</label>
        <select id="public-verification-method" value={method} onChange={e => { frontSelection.current++; setMethod(e.target.value as typeof method); setFiles([]); setFront(''); setError(''); }}><option value="id_document">{t('methodId')}</option><option value="camera_age">{t('methodCamera')}</option></select>
        {!consentPending && !guided && <>
          <label>{t('filesLabel')}<input key={method} type="file" accept="image/jpeg,image/png" multiple capture={method === 'camera_age' ? 'user' : undefined} onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 3))}/></label>
          <button className="primary" disabled={!files.length}>{t('verifySubmit')}</button>
        </>}
      </fieldset>
    </form>
    {consentPending && <section>
      <h4>{t('consentTitle')}</h4>
      <p>{t(guided ? 'cameraConsentText' : 'consentText')}</p>
      <button type="button" className="primary" disabled={busy} onClick={consent}>{t('consentAccept')}</button>
    </section>}
    {!consentPending && guided && <fieldset disabled={busy}>
      <label>{t('camFrontLabel')}<span>{t('camFrontHint')}</span><input type="file" accept="image/jpeg,image/png" capture="environment" onChange={pickFront}/></label>
      {front && <CameraCheck t={t} busy={busy} front={front} onSend={sendCamera}/>}
    </fieldset>}
    </>}
    {busy && <p role="status">{t('entryVerificationWorking')}</p>}
  </section>;
}

export function PublicEntry({ lang, providers }: { lang: 'he' | 'en'; providers: PublicProviders }) {
  const t = (key: string) => publicCopy[key]?.[lang === 'he' ? 0 : 1] || key;
  const [user, setUser] = useState<PublicUser | null>(null), [isAdmin, setIsAdmin] = useState(false), [adminOpen, setAdminOpen] = useState(false), [pending, setPending] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [session, setSession] = useState<'loading' | 'ready' | 'error'>('loading');
  const [expired, setExpired] = useState(false);
  const [opening, setOpening] = useState(false);
  const moveFocus = useRef(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const signIn = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (session === 'loading' || !moveFocus.current) return;
    moveFocus.current = false;
    (stepHeading.current ?? signIn.current)?.focus();
  }, [pending, session, user?.status, user?.id]);
  const errorText = (e: any) => (errorKeys[e?.message] ? t(errorKeys[e.message]) : e?.message || t('entranceConnectionError'));
  // The server decides admin status; the browser only shows what /api/public/me reports.
  const loadMe = () => api('/public/me').then(data => { setUser(data.user); setIsAdmin(data.isAdmin === true); setSession('ready'); }).catch(e => {
    if (e.status === 401) { setUser(null); setIsAdmin(false); setAdminOpen(false); setSession('ready'); }
    else setSession('error');
  });
  useEffect(() => {
    const match = /^#public-pending=([A-Za-z0-9_-]{20,128})$/.exec(location.hash);
    if (match) {
      moveFocus.current = true;
      setPending(match[1]);
      history.replaceState(history.state, '', location.pathname + location.search);
    }
    void loadMe();
    const onRestore = (event: PageTransitionEvent) => { if (event.persisted) setOpening(false); };
    window.addEventListener('pageshow', onRestore);
    return () => window.removeEventListener('pageshow', onRestore);
  }, []);
  const start = (provider: 'google' | 'apple') => {
    if (opening) return;
    setOpening(true);
    setError('');
    void api(`/public/auth/${provider}/start`).then(data => { location.href = data.url; }).catch(e => { setError(errorText(e)); setOpening(false); });
  };
  const register = (event: FormEvent<HTMLFormElement>) => {
    const b = form(event);
    setBusy(true);
    setError('');
    void api('/public/register', { pendingToken: pending, nickname: b.nickname, role: b.role, gender: b.gender })
      .then(data => { moveFocus.current = true; setPending(''); setUser(data.user); void loadMe(); })
      .catch(e => { setExpired(e.message === 'Sign-in expired; start again'); setError(errorText(e)); })
      .finally(() => setBusy(false));
  };
  const signOut = () => {
    setBusy(true);
    setError('');
    void api('/public/logout', {}).then(() => { moveFocus.current = true; setPending(''); setUser(null); setIsAdmin(false); setAdminOpen(false); })
      .catch(e => setError(errorText(e))).finally(() => setBusy(false));
  };
  if (session === 'error') return <section className="public-auth-card public-step">
    <h1 tabIndex={-1} ref={stepHeading}>{t('title')}</h1>
    <p role="alert">{t('entranceConnectionError')}</p>
    <button type="button" onClick={() => { moveFocus.current = true; setSession('loading'); void loadMe(); }}>{t('entryRetry')}</button>
  </section>;
  if (session === 'loading') return <p className="public-entry-loading" role="status">{t('entranceConnecting')}</p>;
  if (user) return <>
  <section className={user.status === 'verified' ? 'public-account' : 'public-auth-card public-step'}>
    {user.status !== 'verified' && <p className="entrance-kicker">{t('entryStepVerification')}</p>}
    <h1 ref={stepHeading} tabIndex={-1}>{t('signedIn')}</h1>
    <p><bdi>{user.nickname}</bdi> · {t(user.status)}</p>
    {user.status === 'pending_verification' && <VerificationPanel t={t} errorText={errorText} onVerified={() => { moveFocus.current = true; setUser(current => current ? { ...current, status: 'verified' } : current); }}/>}
    {isAdmin && <button type="button" aria-pressed={adminOpen} disabled={busy} onClick={() => setAdminOpen(open => !open)}>{t('adminOpen')}</button>}
    <button type="button" className="quiet" disabled={busy} onClick={signOut}>{t('signOut')}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </section>
  {isAdmin && adminOpen && <AdminReviews t={t} lang={lang} errorText={errorText}/>}
  {user.status === 'verified' && <PublicMessaging key={user.id} t={t} lang={lang} errorText={errorText} me={user.id} role={user.role} isAdmin={isAdmin} onAuthLost={loadMe}/>}
  </>;
  if (pending) return <section className="public-auth-card public-step">
    <p className="entrance-kicker">{t('entryStepProfile')}</p>
    <h1 ref={stepHeading} tabIndex={-1}>{t('finish')}</h1>
    <p>{t('pendingIntro')}</p>
    <form onSubmit={register}>
      <fieldset disabled={busy || expired}>
      <label>{t('nickname')}<input name="nickname" dir="auto" autoComplete="nickname" aria-describedby="public-nickname-hint" required minLength={2} maxLength={20} pattern={' *[\\p{L}\\p{N}_][\\p{L}\\p{N}_ ]{0,18}[\\p{L}\\p{N}_] *'}/></label>
      <p id="public-nickname-hint" className="small">{t('entryNicknameHint')}</p>
      <label htmlFor="public-role">{t('role')}</label>
      <select id="public-role" name="role" defaultValue="" required><option value="" disabled>{t('entryChoose')}</option>{['sub','dom'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select>
      <label htmlFor="public-gender">{t('gender')}</label>
      <select id="public-gender" name="gender" defaultValue="" required><option value="" disabled>{t('entryChoose')}</option>{['woman','man','non_binary','other'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select>
      <button className="primary">{t('finish')}</button>
      </fieldset>
      {error&&<p className="error" role="alert">{error}</p>}
      {busy && <p role="status">{t('entrySaving')}</p>}
    </form>
    <button type="button" className="quiet" disabled={busy} onClick={() => { moveFocus.current = true; setPending(''); setError(''); setExpired(false); }}>{t('entryRestart')}</button>
  </section>;
  return <PublicEntrance t={t}>
    <section id="public-sign-in" className="public-auth-card entrance-sign-in" ref={signIn} tabIndex={-1} aria-labelledby="public-sign-in-title">
      <div className="entrance-sign-in-head"><h2 id="public-sign-in-title">{t('title')}</h2><span>{t('entranceAdults')}</span></div>
      <p>{t('entranceSignInNote')}</p>
      {!providers.google && !providers.apple ? <p role="status" className="notice">{t('entranceUnavailable')}</p> :
        <div className="entrance-providers">
          {providers.google && <button type="button" className="primary" aria-disabled={opening} onClick={()=>start('google')}>{t('google')} <span aria-hidden="true" className="entrance-arrow">→</span></button>}
          {providers.apple && <button type="button" className={providers.google ? undefined : 'primary'} aria-disabled={opening} onClick={()=>start('apple')}>{t('apple')} <span aria-hidden="true" className="entrance-arrow">→</span></button>}
        </div>}
      {opening && <p role="status">{t('entranceOpening')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </PublicEntrance>;
}
