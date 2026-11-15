import type { Dispatch, SetStateAction } from 'react';
import type { Session } from '../../server/app';
import { form, type Action, type Run, type Translate } from '../app-shared';
import { Button } from './Button';
import { AuctionsPanel } from './Auctions';

type RewardsTabProps = {
  s: Session; play: boolean; ended: boolean; now: number; wife: boolean; busy: boolean; unreconciled: boolean;
  rewardDraft: { title: string; description: string; cost: string }; setRewardDraft: Dispatch<SetStateAction<{ title: string; description: string; cost: string }>>;
  setTab: Dispatch<SetStateAction<string>>; setComposerOpen: Dispatch<SetStateAction<boolean>>;
  t: Translate; run: Run; action: Action;
};

export function RewardsTab({ s, play, ended, now, wife, busy, unreconciled, rewardDraft, setRewardDraft, setTab, setComposerOpen, t, run, action }: RewardsTabProps) {
  return <section className="panel"><h2>{t('חנות הפרסים','Reward shop')}</h2><p>{s.points} {t('נקודות זמינות','points available')}</p>
    <p>{t('משימות ייחודיות שאושרו','Unique approved missions')}: {Math.min(5,new Set(s.missions.filter(m=>m.status==='approved').map(m=>m.id)).size)}/5</p>
    {new Set(s.missions.filter(m=>m.status==='approved').map(m=>m.id)).size>=5&&<div className="notice"><p>{t('אבן דרך הושגה! אפשר לבחור ליצור הזמנת בונוס רגילה; דבר לא נשלח אוטומטית.','Milestone reached! You may choose to draft a normal bonus invitation; nothing is sent automatically.')}</p>{wife&&<Button disabled={!play} onClick={()=>{setTab('missions');setComposerOpen(true);}}>{t('יצירת טיוטת בונוס','Draft a bonus invitation')}</Button>}</div>}
    {wife&&<form onSubmit={e=>{const el=e.currentTarget,b=form(e);void run(async()=>{await action('reward',{title:b.title,description:b.description,cost:Number(b.cost)});el.reset();setRewardDraft({title:'',description:'',cost:''});});}}><fieldset disabled={busy||unreconciled}><legend>{t('פרס חדש','New reward')}</legend><label>{t('שם הפרס','Reward title')}<input id="reward-title" name="title" required maxLength={160} value={rewardDraft.title} onChange={e=>setRewardDraft({...rewardDraft,title:e.target.value})}/></label><label>{t('תיאור הפרס','Reward description')}<textarea name="description" required maxLength={4000} value={rewardDraft.description} onChange={e=>setRewardDraft({...rewardDraft,description:e.target.value})}/></label><label>{t('מחיר הפרס','Reward cost')}<input name="cost" type="number" required min={0} step={1} value={rewardDraft.cost} onChange={e=>setRewardDraft({...rewardDraft,cost:e.target.value})}/></label><Button disabled={!play}>{t('יצירת פרס','Create reward')}</Button></fieldset></form>}
    <h3>{t('פרסים','Rewards')}</h3>{!s.rewards?.length&&<p className="empty">{t('עדיין אין פרסים.','No rewards yet.')}</p>}{(s.rewards??[]).map(r=><article key={r.id}><h4>{r.title}</h4><p className="preserve">{r.description}</p><p>{r.cost} {t('נקודות','points')}</p>{!wife&&<Button disabled={!play} onClick={()=>void run(()=>action('reward-request',{reward:r.id}))}>{t('בקשת פרס','Request reward')}</Button>}</article>)}
    <h3>{t('בקשות פרס','Reward requests')}</h3><p>{t('אישור מתעד החלטה במשחק בלבד ואינו מחייב פעילות במציאות.','Approval records an in-game decision only and does not obligate real-world activity.')}</p>{!s.rewardRequests?.length&&<p className="empty">{t('עדיין אין בקשות לפרסים.','No reward requests yet.')}</p>}{(s.rewardRequests??[]).map(r=><article key={r.id}><h4>{r.title}</h4><p className="preserve">{r.description}</p><p>{r.cost} {t('נקודות','points')} · {r.status==='pending'?t('ממתינה','Pending'):r.status==='approved'?t('אושרה','Approved'):t('נדחתה','Declined')}</p>{wife&&r.status==='pending'&&<div className="row"><Button disabled={!play} onClick={()=>void run(()=>action('reward-decision',{request:r.id,approve:true}))}>{t('אישור פרס','Approve reward')}</Button><Button disabled={!play} onClick={()=>void run(()=>action('reward-decision',{request:r.id,approve:false}))}>{t('דחיית פרס','Decline reward')}</Button></div>}</article>)}
    <AuctionsPanel s={s} wife={wife} play={play} ended={ended} busy={busy} unreconciled={unreconciled} now={now} t={t} run={run} action={action}/>
  </section>;
}
