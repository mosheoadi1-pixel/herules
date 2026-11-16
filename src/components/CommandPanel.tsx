import type { Dispatch, SetStateAction } from 'react';
import type { Session } from '../../server/app';
import { quickPresets } from '../quick';
import { form, type Action, type Run, type SayDraft, type Translate } from '../app-shared';
import { Button } from './Button';

type CommandPanelProps = {
  s: Session; play: boolean; t: Translate; lang: 'he' | 'en';
  quickAt: string; setQuickAt: Dispatch<SetStateAction<string>>; quickBlock: string | null;
  askPreset: (p: { id: string; he: string; en: string; points: number }) => void;
  askQuick: (title: string, text: string, points: number, body: Record<string, unknown>, preset?: string, done?: () => void) => void;
  run: Run; action: Action;
  sayOpen: boolean; setSayOpen: Dispatch<SetStateAction<boolean>>; sayText: string; setSayText: Dispatch<SetStateAction<string>>;
  sayDraft: SayDraft | null; setSayDraft: Dispatch<SetStateAction<SayDraft | null>>; sayReady: boolean;
};

export function CommandPanel({ s, play, t, lang, quickAt, setQuickAt, quickBlock, askPreset, askQuick, run, action, sayOpen, setSayOpen, sayText, setSayText, sayDraft, setSayDraft, sayReady }: CommandPanelProps) {
  return <section className="panel"><h2>{t('פקודות מהירות','Quick commands')}</h2><p>{t('בחרי פקודה ותראי תצוגה מקדימה לפני השליחה.','Pick a command and see a preview before it is sent.')}</p><p className="small">{t('לפני השליחה תוצג תצוגה מקדימה. רק אישור שולח.','A preview appears before sending. Only confirming sends.')}</p>
        <label>{t('תזמון (לא חובה)','Schedule (optional)')}<input type="datetime-local" value={quickAt} onChange={e=>setQuickAt(e.target.value)}/></label>
        {quickBlock&&<p className="notice" role="status">{quickBlock}</p>}
        <div className="quick-grid">{quickPresets.map(p=><button key={p.id} disabled={!!quickBlock} onClick={()=>askPreset(p)}>{lang==='he'?p.he:p.en}</button>)}</div>
        <h3>{t('הפקודות השמורות שלי','My saved commands')}</h3>
        {!s?.commands?.length&&<p className="empty">{t('עדיין אין פקודות שמורות.','No saved commands yet.')}</p>}
        {(s?.commands??[]).map(c=><article key={c.id}><h4>{c.title}</h4><p className="preserve">{c.text}</p><div className="row"><Button disabled={!!quickBlock} onClick={()=>askQuick(c.title,c.text,c.points,{title:c.title,text:c.text,points:c.points})}>{t('שליחה','Send')}</Button><Button disabled={!play} onClick={()=>void run(()=>action('command-delete',{command:c.id}))}>{t('מחיקה','Delete')}</Button></div></article>)}
        <details className="subtle" open={sayOpen} onToggle={e=>setSayOpen(e.currentTarget.open)}><summary>{t('הגידי את זה במילים שלך','Say it in your own words')}</summary>
          <label>{t('משפט קצר (עד 160 תווים)','A short phrase (up to 160 characters)')}<input id="say-it-input" value={sayText} maxLength={160} onChange={e=>setSayText(e.target.value)}/></label>
          <Button disabled={!sayText.trim()} onClick={()=>setSayDraft({title:sayText.trim(),text:sayText.trim(),points:2})}>{t('הפיכה לפקודה','Turn into a command')}</Button>
          {sayDraft&&<article className="say-preview" aria-label={t('תצוגה מקדימה לפני שליחה','Preview before sending')}>
            <h4>{t('תצוגה מקדימה','Preview')}</h4>
            <label>{t('כותרת','Title')}<input value={sayDraft.title} maxLength={160} onChange={e=>setSayDraft({...sayDraft,title:e.target.value})}/></label>
            <label>{t('טקסט הפקודה','Command text')}<textarea value={sayDraft.text} maxLength={160} onChange={e=>setSayDraft({...sayDraft,text:e.target.value})}/></label>
            <label>{t('נקודות לאישור ביצוע','Points on approval')}<input type="number" inputMode="numeric" min={0} max={100} value={sayDraft.points} onChange={e=>setSayDraft({...sayDraft,points:Number(e.target.value)})}/></label>
            <p className="small">{t('הפקודה לא נשלחת עד שתאשרי.','Nothing is sent until you confirm.')}</p>
            <div className="row"><Button className="primary" disabled={!sayReady||!!quickBlock} onClick={()=>askQuick(sayDraft.title.trim(),sayDraft.text.trim(),sayDraft.points,{title:sayDraft.title.trim(),text:sayDraft.text.trim(),points:sayDraft.points},undefined,()=>{setSayText('');setSayDraft(null);})}>{t('שליחה','Send')}</Button></div>
          </article>}
        </details>
        <details className="subtle"><summary>{t('כתיבת פקודה חדשה','Write a new command')}</summary>
        <form onSubmit={e=>{const el=e.currentTarget,b=form(e);void run(async()=>{await action('command-save',{title:b.title,text:b.text,points:Number(b.points)});el.reset();});}}>
          <label>{t('כותרת','Title')}<input name="title" required maxLength={160}/></label>
          <label>{t('הוראה מלאה','Full instruction')}<textarea name="text" required maxLength={4000}/></label>
          <label>{t('נקודות לאישור ביצוע','Points on approval')}<input name="points" type="number" inputMode="numeric" min={0} max={100} defaultValue={2} required/></label>
          <Button disabled={!play}>{t('שמירת פקודה','Save command')}</Button>
        </form></details>
      </section>;
}
