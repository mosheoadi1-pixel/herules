import { useState } from 'react';
import type { Session } from '../../server/app';
import { type Action, type Run, type Translate } from '../app-shared';
import { Button } from './Button';

export function WhisperBox({ s, ended, t, run, action }: { s: Session; ended: boolean; t: Translate; run: Run; action: Action }) {
  const [text, setText] = useState('');
  const trimmed = text.trim(), sent = s.whisperSent ?? 0;
  return <details className="panel whisper"><summary><h2>{t('לחש לה','Whisper to her')}</h2></summary>
    <p className="small">{t('לחש הוא הצעה קצרה ופרטית. רק היא רואה את התוכן. לחש אינו הסכמה ואינו משנה את המשחק.','A whisper is a short private suggestion. Only she can read its content. A whisper is not agreement and changes nothing in the game.')}</p>
    <form onSubmit={e=>{e.preventDefault();if(!trimmed||ended)return;void run(async()=>{await action('whisper',{text:trimmed});setText('');});}}>
      <label>{t('לחש חדש','New whisper')}<textarea name="text" maxLength={400} value={text} disabled={ended} onChange={e=>setText(e.target.value)}/></label>
      <p className="small">{text.length}/400</p>
      <Button className="primary" disabled={!trimmed||ended}>{t('שליחת לחש','Send whisper')}</Button>
    </form>
    <p className="small" aria-live="polite">{sent===1?t('שלחת לחש אחד. התוכן גלוי רק לה.','You have sent one whisper. Only she can read it.'):t(`שלחת ${sent} לחשים. התוכן גלוי רק לה.`,`You have sent ${sent} whispers. Only she can read them.`)}</p>
  </details>;
}

export function WhisperInbox({ s, ended, t, date, run, action, draftWhisper }: { s: Session; ended: boolean; t: Translate; date: (at: number) => string; run: Run; action: Action; draftWhisper: (text: string) => void }) {
  const whispers = s.whispers ?? [];
  return <details className="panel whispers"><summary><h2>{t('לחשים מהשותף/ה','Whispers from my partner')}</h2></summary>
    <p className="small">{t('לחשים גלויים רק לך. הפיכה לטיוטה פותחת את העורך בלבד; דבר לא נשלח לו.','Whispers are visible only to you. Turning one into a draft only opens the composer; nothing is sent to him.')}</p>
    {!whispers.length&&<p className="empty">{t('אין לחשים כרגע','No whispers right now')}</p>}
    {[...whispers].reverse().map(item=><article key={item.id}><p className="preserve">{item.text}</p><div className="row between"><span className="small">{date(item.at)}</span><div className="row"><Button disabled={ended} onClick={()=>draftWhisper(item.text)}>{t('הפיכה לטיוטה','Turn into a draft')}</Button><Button disabled={ended} onClick={()=>void run(()=>action('whisper-delete',{whisper:item.id}))}>{t('מחיקה','Delete')}</Button></div></div></article>)}
  </details>;
}
