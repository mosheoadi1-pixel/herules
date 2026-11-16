import { useState } from 'react';
import type { Session } from '../../server/app';
import { form, type Action, type Run, type Translate } from '../app-shared';
import { Button } from './Button';
import { wishSuggestions } from '../quick';

type WishesTabProps = {
  s: Session; play: boolean; wife: boolean; busy: boolean; unreconciled: boolean;
  lang: 'he' | 'en'; t: Translate; run: Run; action: Action;
};

export function WishesTab({ s, play, wife, busy, unreconciled, lang, t, run, action }: WishesTabProps) {
  const [draftTitle,setDraftTitle]=useState('');
  return <section className="panel"><h2>{t('המשאלות שלה','Her wishes')}</h2><p>{wife?t('הנקודות שלו לשימוש במשאלות','His points to spend on wishes'):t('הנקודות שלך','Your points')}: {s.points}</p>
    <h3>{t('רשימת משאלות','Wishlist')}</h3>
    <p className="small">{t('הבעל קובע את המחיר, והיא מבקשת. אישור מתעד החלטה במשחק בלבד.','The husband sets the price and she requests. Approval records an in-game decision only.')}</p>
    {wife&&<div className="quick-grid">{wishSuggestions.map(w=><button key={w.he} disabled={!play||busy||unreconciled} onClick={()=>setDraftTitle(lang==='he'?w.he:w.en)}>{lang==='he'?w.he:w.en}</button>)}</div>}
    {wife&&<form onSubmit={e=>{const el=e.currentTarget,b=form(e);void run(async()=>{await action('wish-add',{title:draftTitle,description:b.description,link:b.link||undefined});el.reset();setDraftTitle('');});}}><fieldset disabled={busy||unreconciled}><legend>{t('משאלה חדשה','New wish')}</legend><label>{t('שם','Title')}<input name="title" required maxLength={160} value={draftTitle} onChange={e=>setDraftTitle(e.target.value)}/></label><label>{t('תיאור (לא חובה)','Description (optional)')}<textarea name="description" maxLength={4000}/></label><label>{t('קישור (לא חובה)','Link (optional)')}<input name="link" type="url" maxLength={2000}/></label><Button disabled={!play}>{t('הוספה לרשימה','Add to wishlist')}</Button></fieldset></form>}
    {!s.wishes?.length&&<p className="empty">{t('עדיין אין משאלות.','No wishes yet.')}</p>}
    {(s.wishes??[]).map(w=>{const pending=(s.wishRequests??[]).find(r=>r.wish===w.id&&r.status==='pending');return <article key={w.id}><h4>{w.title}</h4>{w.description&&<p className="preserve">{w.description}</p>}{w.link&&<p><a href={w.link} target="_blank" rel="noreferrer">{t('לקישור','Open link')}</a></p>}
      <p>{w.cost===undefined?t('ממתינה לתמחור','Awaiting price'):`${w.cost} ${t('נקודות','points')}`}{pending&&` · ${t('ממתינה להחלטה','Awaiting decision')}`}</p>
      {!wife&&<form onSubmit={e=>{const el=e.currentTarget,b=form(e);void run(()=>action('wish-price',{wish:w.id,cost:Number(b.cost)}));}}><label>{t('מחיר בנקודות','Price in points')}<input name="cost" type="number" inputMode="numeric" min={0} step={1} required defaultValue={w.cost??''} disabled={!!pending}/></label><Button disabled={!play||!!pending}>{t('קביעת מחיר','Set price')}</Button></form>}
      <div className="row">{wife&&w.cost!==undefined&&!pending&&<Button disabled={!play} onClick={()=>void run(()=>action('wish-request',{wish:w.id}))}>{t('בקשה למשאלה','Request wish')}</Button>}{wife&&!pending&&<Button disabled={!play} onClick={()=>void run(()=>action('wish-remove',{wish:w.id}))}>{t('הסרה מהרשימה','Remove from list')}</Button>}</div>
    </article>;})}
    <h3>{t('בקשות משאלות','Wish requests')}</h3>{!s.wishRequests?.length&&<p className="empty">{t('עדיין אין בקשות למשאלות.','No wish requests yet.')}</p>}{(s.wishRequests??[]).map(r=><article key={r.id}><h4>{r.title}</h4><p>{r.cost} {t('נקודות','points')} · {r.status==='pending'?t('ממתינה','Pending'):r.status==='approved'?t('אושרה','Approved'):t('נדחתה','Declined')}</p>{!wife&&r.status==='pending'&&<div className="row"><Button disabled={!play} onClick={()=>void run(()=>action('wish-decision',{request:r.id,approve:true}))}>{t('אישור משאלה','Approve wish')}</Button><Button disabled={!play} onClick={()=>void run(()=>action('wish-decision',{request:r.id,approve:false}))}>{t('דחיית משאלה','Decline wish')}</Button></div>}</article>)}
  </section>;
}
