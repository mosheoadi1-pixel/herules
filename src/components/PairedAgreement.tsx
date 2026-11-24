import { useState } from 'react';
import type { Session } from '../../server/app';
import type { Action, Run, Translate } from '../app-shared';
import { Button } from './Button';

export function PairedAgreement({session,viewer,dom,online,t,run,action,withdraw}:{
  session:Session;viewer:string;dom:boolean;online:boolean;t:Translate;run:Run;action:Action;withdraw:()=>void;
}) {
  const [editing,setEditing]=useState(false);
  const [terms,setTerms]=useState(session.terms);
  const [minutes,setMinutes]=useState(String(session.revisions.at(-1)?.minutes??''));
  const mine=session.approvals.includes(viewer), theirs=session.approvals.some(id=>id!==viewer);
  const remaining=Math.ceil(session.remaining/1000);
  const clock=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
  const focusStatus=()=>document.getElementById('paired-status')?.focus();
  return <details id="paired-agreement" className="panel paired-agreement" open={!session.started?true:undefined}>
    <summary>{t('הסכמת משחק','Play agreement')} · {session.unlimited?t('ללא מגבלת זמן','No time limit'):
      <>{t('זמן שנותר','Time remaining')}: <bdi>{clock}</bdi></>}</summary>
    <p className="preserve" dir="auto">{session.terms}</p>
    <p className="small">{t('גרסה','Revision')} {session.revision} · {session.unlimited?t('ללא מגבלת זמן','No time limit'):
      <>{t('זמן שנותר','Time remaining')}: <bdi>{clock}</bdi></>}</p>
    <p className="small">{mine?t('אישרת','You opted in'):t('טרם אישרת','You have not opted in')} · {theirs?t('הצד השני אישר','Partner opted in'):t('הצד השני טרם אישר','Partner has not opted in')}</p>
    <p>{t('אישור כאן אינו קבלת משימה. אפשר לבטל הסכמה בכל עת, ללא קנס.','Opting in here does not accept a mission. You can withdraw at any time without penalty.')}</p>
    <div className="row">
      {mine?<button type="button" className="quiet" onClick={withdraw}>{t('ביטול ההסכמה שלי','Withdraw my consent')}</button>:
        <Button className="primary" disabled={!online} onClick={()=>void run(()=>action('agreement-accept',{revision:session.revision})).then(ok=>{if(ok)focusStatus();})}>{t('קראתי ואני מסכימ/ה לשחק','I’ve read this and agree to play')}</Button>}
      {dom&&!editing&&<Button onClick={()=>{setTerms(session.terms);setMinutes(String(session.revisions.at(-1)?.minutes??''));setEditing(true);}}>{t('הצעת תנאים או זמן אחרים','Propose different terms or time')}</Button>}
    </div>
    {editing&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{
      await action('agreement-propose',{revision:session.revision,terms,minutes:minutes===''?null:Number(minutes)});
      setEditing(false);
    });}}>
      <p className="notice">{t('שינוי דורש הסכמה מחדש של שניכם ומבטל הזמנות ומכרזים פתוחים. טיוטות והיסטוריה נשמרות.','A change requires both participants to opt in again and cancels open invitations and auctions. Drafts and history are kept.')}</p>
      <label>{t('תנאים וגבולות','Terms and boundaries')}<textarea autoFocus required maxLength={4000} dir="auto" value={terms} onChange={e=>setTerms(e.target.value)}/></label>
      <label>{t('דקות (ריק = ללא מגבלה)','Minutes (blank = no time limit)')}<input type="number" min={1} max={525600} step={1} value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>
      <div className="row"><Button className="primary" disabled={!online||!terms.trim()}>{t('הצעת תנאים','Propose terms')}</Button><button type="button" onClick={()=>setEditing(false)}>{t('ביטול','Cancel')}</button></div>
    </form>}
  </details>;
}
