import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { form } from '../app-shared';
import { publicCopy } from '../i18n';
import { VERIFICATION_CONSENT_VERSION } from '../verification-consent';
import { AdminReviews } from './PublicAdmin';

type PublicUser = { id: string; nickname: string; role: string; gender: string; status: string };
const errorKeys: Record<string,string> = {'provider not configured':'errProvider','Sign-in expired; start again':'errExpired','Already exists':'errTaken','Invalid or missing input':'errInvalid','verification not configured':'errVerifyNotConfigured','Consent required':'errConsent','Unsupported image type':'errMedia','Image too large':'errMedia','Too many verification attempts; try again tomorrow':'errAttempts','Reviewer role required':'errNotAdmin','Review unavailable':'errReviewGone','Only items awaiting review can be decided':'errReviewGone','Only items awaiting review have media to review':'errReviewGone','Media has been deleted':'errMediaGone','Media unavailable':'errMediaGone'};
type Verification = { status: string; consented: boolean; verification: { status: string } | null };
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
  const [state, setState] = useState<Verification | null>(null), [method, setMethod] = useState<'id_document' | 'camera_age'>('id_document'), [files, setFiles] = useState<File[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = () => api('/public/verification').then(setState).catch(e => setError(errorText(e)));
  useEffect(() => { void load(); }, []);
  const consent = () => {
    setBusy(true);
    setError('');
    void api('/public/consent', { kind: 'verification', textVersion: VERIFICATION_CONSENT_VERSION }).then(load).catch(e => setError(errorText(e))).finally(() => setBusy(false));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    void Promise.all(files.map(readImage))
      .then(media => api('/public/verification', { method, media }))
      .then(data => { setState({ status: data.status, consented: true, verification: data.verification }); if (data.status === 'verified') onVerified(); })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };
  if (!state) return error ? <p className="error" role="alert">{error}</p> : null;
  if (!state.consented) return <section>
    <h3>{t('consentTitle')}</h3>
    <p>{t('consentText')}</p>
    <button type="button" className="primary" disabled={busy} onClick={consent}>{t('consentAccept')}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
  const status = state.verification?.status;
  const message = status === 'failed' ? t('verifyFailed') : status === 'review' ? t('verifyReview') : status === 'purged' ? t('verifyPurged') : status === 'pending' ? t('verifyPending') : '';
  return <section>
    <h3>{t('verifyTitle')}</h3>
    <p>{t('verifyIntro')}</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy || status === 'review'}>
        <label>{t('methodLabel')}<select value={method} onChange={e => setMethod(e.target.value as 'id_document' | 'camera_age')}><option value="id_document">{t('methodId')}</option><option value="camera_age">{t('methodCamera')}</option></select></label>
        <label>{t('filesLabel')}<input type="file" accept="image/jpeg,image/png" multiple capture={method === 'camera_age' ? 'user' : undefined} onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 3))}/></label>
        <button className="primary" disabled={!files.length}>{t('verifySubmit')}</button>
      </fieldset>
    </form>
    {message && <p role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

export function PublicEntry({ lang }: { lang: 'he' | 'en' }) {
  const t = (key: string) => publicCopy[key]?.[lang === 'he' ? 0 : 1] || key;
  const [user, setUser] = useState<PublicUser | null>(null), [isAdmin, setIsAdmin] = useState(false), [adminOpen, setAdminOpen] = useState(false), [pending, setPending] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const errorText = (e: any) => (errorKeys[e.message] ? t(errorKeys[e.message]) : e.message);
  // The server decides admin status; the browser only shows what /api/public/me reports.
  const loadMe = () => api('/public/me').then(data => { setUser(data.user); setIsAdmin(data.isAdmin === true); }).catch(() => { setUser(null); setIsAdmin(false); });
  useEffect(() => {
    const match = /^#public-pending=([A-Za-z0-9_-]{20,128})$/.exec(location.hash);
    if (match) {
      setPending(match[1]);
      history.replaceState(null, '', '/');
    }
    void loadMe();
  }, []);
  const start = (provider: 'google' | 'apple') => {
    setBusy(true);
    setError('');
    void api(`/public/auth/${provider}/start`).then(data => { location.href = data.url; }).catch(e => { setError(errorText(e)); setBusy(false); });
  };
  const register = (event: FormEvent<HTMLFormElement>) => {
    const b = form(event);
    setBusy(true);
    setError('');
    void api('/public/register', { pendingToken: pending, nickname: b.nickname, role: b.role, gender: b.gender })
      .then(data => { setPending(''); setUser(data.user); void loadMe(); })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };
  const signOut = () => {
    setBusy(true);
    void api('/public/logout', {}).finally(() => { setUser(null); setIsAdmin(false); setAdminOpen(false); setBusy(false); });
  };
  if (user) return <>
  <section className="panel auth">
    <h2>{t('signedIn')}</h2>
    <p><bdi>{user.nickname}</bdi> · {t(user.status)}</p>
    {user.status === 'pending_verification' && <VerificationPanel t={t} errorText={errorText} onVerified={() => setUser(current => current ? { ...current, status: 'verified' } : current)}/>}
    {isAdmin && <button type="button" aria-pressed={adminOpen} disabled={busy} onClick={() => setAdminOpen(open => !open)}>{t('adminOpen')}</button>}
    <button type="button" className="quiet" disabled={busy} onClick={signOut}>{t('signOut')}</button>
  </section>
  {isAdmin && adminOpen && <AdminReviews t={t} lang={lang} errorText={errorText}/>}
  </>;
  if (pending) return <section className="panel auth">
    <h2>{t('finish')}</h2>
    <p>{t('pendingIntro')}</p>
    <form onSubmit={register}>
      <label>{t('nickname')}<input name="nickname" required minLength={2} maxLength={20}/></label>
      <label>{t('role')}<select name="role">{['sub','dom'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label>{t('gender')}<select name="gender">{['woman','man','non_binary','other'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label>
      {error&&<p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{t('finish')}</button>
    </form>
  </section>;
  return <section className="panel auth">
    <h2>{t('title')}</h2>
    <p>{t('intro')}</p>
    <div className="row">
      <button type="button" className="primary" disabled={busy} onClick={()=>start('google')}>{t('google')}</button>
      <button type="button" disabled={busy} onClick={()=>start('apple')}>{t('apple')}</button>
    </div>
    {error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
