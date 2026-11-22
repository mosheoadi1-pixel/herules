import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { form } from '../app-shared';
import { publicCopy } from '../i18n';

type PublicUser = { id: string; nickname: string; role: string; gender: string; status: string };
const errorKeys: Record<string,string> = {'provider not configured':'errProvider','Sign-in expired; start again':'errExpired','Already exists':'errTaken','Invalid or missing input':'errInvalid'};

export function PublicEntry({ lang }: { lang: 'he' | 'en' }) {
  const t = (key: string) => publicCopy[key]?.[lang === 'he' ? 0 : 1] || key;
  const [user, setUser] = useState<PublicUser | null>(null), [pending, setPending] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const errorText = (e: any) => (errorKeys[e.message] ? t(errorKeys[e.message]) : e.message);
  useEffect(() => {
    const match = /^#public-pending=([A-Za-z0-9_-]{20,128})$/.exec(location.hash);
    if (match) {
      setPending(match[1]);
      history.replaceState(null, '', '/');
    }
    void api('/public/me').then(data => setUser(data.user)).catch(() => setUser(null));
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
      .then(data => { setPending(''); setUser(data.user); })
      .catch(e => setError(errorText(e)))
      .finally(() => setBusy(false));
  };
  const signOut = () => {
    setBusy(true);
    void api('/public/logout', {}).finally(() => { setUser(null); setBusy(false); });
  };
  if (user) return <section className="panel auth">
    <h2>{t('signedIn')}</h2>
    <p><bdi>{user.nickname}</bdi> · {t(user.status)}</p>
    <button type="button" className="quiet" disabled={busy} onClick={signOut}>{t('signOut')}</button>
  </section>;
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
