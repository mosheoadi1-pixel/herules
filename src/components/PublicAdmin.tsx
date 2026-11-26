import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

type Review = { id: string; method: string; status: string; reason: string | null; createdAt: string; decidedAt: string | null };
type Decision = 'approve' | 'reject';
const mediaMessages: Record<number, string> = { 403: 'Reviewer role required', 404: 'Media unavailable', 409: 'Only items awaiting review have media to review', 410: 'Media has been deleted' };

// Shown only when the server reports isAdmin. The server still checks every request.
export function AdminReviews({ t, lang, errorText }: { t: (key: string) => string; lang: 'he' | 'en'; errorText: (e: any) => string }) {
  const [reviews, setReviews] = useState<Review[]>([]), [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(''), [index, setIndex] = useState(0), [more, setMore] = useState(false);
  const [imageUrl, setImageUrl] = useState(''), [imageReady, setImageReady] = useState(false);
  const [reason, setReason] = useState(''), [pending, setPending] = useState<Decision | ''>('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const urlRef = useRef(''), seqRef = useRef(0);
  const reasonOk = reason.trim().length >= 1 && reason.trim().length <= 300;
  const dateText = (value: string) => new Date(value).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB');
  const statusText = (status: string) => (status === 'review' ? t('adminStatusReview') : status === 'failed' ? t('adminStatusFailed') : status);

  const replaceImage = (url: string) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    setImageUrl(url);
    setImageReady(false);
  };
  const load = () => api('/public/admin/reviews').then(data => { setReviews(data.reviews); setLoaded(true); }).catch(e => setError(errorText(e)));
  useEffect(() => {
    void load();
    return () => {
      seqRef.current++;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = '';
    };
  }, []);

  const show = async (id: string, at: number) => {
    const seq = ++seqRef.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/public/admin/reviews/${id}/media?index=${at}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw Object.assign(new Error(mediaMessages[response.status] ?? 'Media unavailable'), { status: response.status });
      const url = URL.createObjectURL(await response.blob());
      if (seq !== seqRef.current) { URL.revokeObjectURL(url); return; }
      replaceImage(url);
      setIndex(at);
      setMore(at < 2);
    } catch (e: any) {
      if (seq !== seqRef.current) return;
      if (e.status === 404 && at > 0) { setMore(false); setNotice(t('adminNoMore')); }
      else if (at === 0 && (e.status === 404 || e.status === 410)) setError(t('adminMissingMedia'));
      else setError(errorText(e));
    } finally {
      if (seq === seqRef.current) setBusy(false);
    }
  };
  const open = (id: string) => {
    setSelected(id);
    replaceImage('');
    setReason('');
    setPending('');
    setIndex(0);
    setMore(false);
    void show(id, 0);
  };
  const close = () => {
    seqRef.current++;
    setSelected('');
    setPending('');
    setReason('');
    setIndex(0);
    setMore(false);
    replaceImage('');
  };
  const decide = (decision: Decision) => {
    if (decision === 'approve' && !imageReady) return;
    setBusy(true);
    setError('');
    setNotice('');
    api(`/public/admin/reviews/${selected}/decision`, { decision, reason: reason.trim() })
      .then(() => { close(); setNotice(t('adminDecided')); return load(); })
      .catch(e => { setError(errorText(e)); return load(); })
      .finally(() => { setBusy(false); setPending(''); });
  };

  return <section className="panel admin" aria-label={t('adminTitle')}>
    <h2>{t('adminTitle')}</h2>
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loaded && reviews.length === 0 && <p className="empty">{t('adminEmpty')}</p>}
    <ul className="admin-list">{reviews.map(item => <li key={item.id}>
      <article>
        <p className="small">{t('adminCaseId')}: <bdi>{item.id}</bdi></p>
        <p>{t('adminStatus')}: {statusText(item.status)}</p>
        {item.reason && <p className="preserve">{t('adminReason')}: {item.reason}</p>}
        <time dateTime={item.createdAt}>{t('adminCreated')}: {dateText(item.createdAt)}</time>
        <button type="button" aria-pressed={selected === item.id} disabled={busy} onClick={() => open(item.id)}>{t('adminOpenCase')}</button>
      </article>
    </li>)}</ul>
    {selected && <section className="admin-case" aria-label={t('adminCase')}>
      <h3>{t('adminCase')}</h3>
      {imageUrl && <img key={imageUrl} className="admin-media" src={imageUrl} alt={t('adminImageAlt')}
        onLoad={() => { if (urlRef.current === imageUrl) setImageReady(true); }}
        onError={() => { if (urlRef.current === imageUrl) { setImageReady(false); setError(t('adminImageError')); } }}/>}
      {more && <button type="button" disabled={busy} onClick={() => void show(selected, index + 1)}>{t('adminNext')}</button>}
      <label>{t('adminReasonLabel')}<textarea maxLength={300} required value={reason} onChange={e => setReason(e.target.value)}/></label>
      {pending ? <div className="notice">
        <p>{t(pending === 'approve' ? 'adminConfirmApprove' : 'adminConfirmReject')}</p>
        <div className="row">
          <button type="button" disabled={busy} onClick={() => setPending('')}>{t('adminCancel')}</button>
          <button type="button" className={pending === 'approve' ? 'primary' : 'danger'} disabled={busy || !reasonOk || (pending === 'approve' && !imageReady)} onClick={() => decide(pending)}>{t('adminConfirm')}</button>
        </div>
      </div> : <div className="row">
        <button type="button" className="primary" disabled={busy || !reasonOk || !imageReady} onClick={() => setPending('approve')}>{t('adminApprove')}</button>
        <button type="button" className="danger" disabled={busy || !reasonOk} onClick={() => setPending('reject')}>{t('adminReject')}</button>
      </div>}
    </section>}
  </section>;
}
