import type { Dispatch, SetStateAction } from 'react';
import type { Mission } from '../../server/app';
import { nightTemplates } from '../quick';
import type { Mood } from '../progress';
import type { Action, Night, Run, SavedEvening, Translate } from '../app-shared';
import { Button } from './Button';

type NightCardProps = {
  t: Translate; date: (at: number) => string; label: (key: string) => string; moodLabel: (mood: Mood) => string;
  moodOrder: Mood[]; nightMood: Mood | ''; lastMood: Mood | ''; chooseMood: (mood: Mood) => void;
  sendSteps: (mood: Mood) => { he: string; en: string; points: number; minutesFromNow: number }[];
  play: boolean; ended: boolean; nightBlock: string | null; askNight: (mood: Mood) => void;
  saveOpen: boolean; setSaveOpen: Dispatch<SetStateAction<boolean>>;
  eveningName: string; setEveningName: Dispatch<SetStateAction<string>>; savedFull: boolean; saveEvening: () => void;
  savedList: SavedEvening[]; sendBlock: string | null; cap: number; usedNow: number; limitMessage: string;
  askRun: (evening: SavedEvening) => void; run: Run; action: Action;
  favourite: Mood | null; nextScheduled: Mission | undefined; lastNight: Night | undefined;
  nightApproved: number; nightMissions: Mission[];
};

export function NightCard({ t, date, label, moodLabel, moodOrder, nightMood, lastMood, chooseMood, sendSteps, play, ended, nightBlock, askNight, saveOpen, setSaveOpen, eveningName, setEveningName, savedFull, saveEvening, savedList, sendBlock, cap, usedNow, limitMessage, askRun, run, action, favourite, nextScheduled, lastNight, nightApproved, nightMissions }: NightCardProps) {
  return <section className="panel"><h2>{t('ערב מוכן','Ready-made evening')}</h2>
      <p>{t('בחרו מצב רוח. רואים את הצעדים לפני השליחה, ושום דבר לא נשלח בלי אישור.','Pick a mood. You see the steps before anything is sent, and nothing goes out without confirmation.')}</p>
      {favourite&&<p className="small">{t('הערב הכי אהוב','Favourite')}: {moodLabel(favourite)}</p>}
      {nextScheduled&&<p className="small">{t('ההזמנה הבאה בתזמון','Next scheduled invitation')}: {date(nextScheduled.scheduledAt!)}</p>}
      <div className="quick-grid">{!play&&<p id="night-paused-reason" className="small" role="status">{t('המשחק מושהה או הסתיים; השליחה חוזרת כשהוא פעיל.','Play is paused or ended; sending resumes when it is active.')}</p>}{moodOrder.map(mood=><Button key={mood} className="mood-tile" disabled={!play} aria-describedby={!play?'night-paused-reason':undefined} aria-pressed={nightMood===mood} onClick={()=>chooseMood(mood)}>{moodLabel(mood)}{mood===lastMood&&<span className="badge">{t('נבחר לאחרונה','Last used')}</span>}</Button>)}</div>
      {nightMood&&<article aria-live="polite">
        <h3>{moodLabel(nightMood)}</h3>
        <ol>{sendSteps(nightMood).map((step,index)=><li key={index}><strong>{index===0?t('מיד','Now'):t(`+${index*30} דקות`,`+${index*30} min`)}</strong> · {t(step.he,step.en)} · {step.points} {t('נק׳','pts')}</li>)}</ol>
        {sendSteps(nightMood).length<nightTemplates[nightMood].length&&<p className="small">{t(`בקצב הנוכחי נשלחים ${sendSteps(nightMood).length} צעדים מתוך ${nightTemplates[nightMood].length}.`,`At the current pace, ${sendSteps(nightMood).length} of ${nightTemplates[nightMood].length} steps are sent.`)}</p>}
        {nightBlock&&<p className="notice" role="status">{nightBlock}</p>}
        <div className="row"><Button className="primary" disabled={!!nightBlock} onClick={()=>askNight(nightMood)}>{t('שליחה','Send')}</Button><Button onClick={()=>chooseMood(nightMood)}>{t('ביטול','Cancel')}</Button></div>
        {saveOpen?<form className="save-evening" onSubmit={e=>{e.preventDefault();saveEvening();}}>
          <label>{t('שם לערב השמור (עד 80 תווים)','Name for this saved evening (up to 80 characters)')}<input value={eveningName} maxLength={80} required onChange={e=>setEveningName(e.target.value)}/></label>
          <div className="row"><Button className="primary" disabled={!eveningName.trim()||savedFull||ended}>{t('שמירה','Save')}</Button><Button onClick={()=>setSaveOpen(false)}>{t('ביטול','Cancel')}</Button></div>
        </form>:<Button disabled={savedFull||ended} onClick={()=>setSaveOpen(true)}>{t('שמירת הערב הנוכחי כערב שמור','Save this evening')}</Button>}
      </article>}
      <details className="subtle"><summary>{t(`ערבים שמורים (${savedList.length}/20)`,`Saved evenings (${savedList.length}/20)`)}</summary>
        {savedFull&&<p className="notice">{t('הרשימה מלאה (20 ערבים שמורים). מחקו ערב כדי לשמור ערב אחר.','The list is full (20 saved evenings). Delete one to save another.')}</p>}
        {!savedList.length&&<p className="empty">{t('עדיין אין ערבים שמורים.','No saved evenings yet.')}</p>}
        {savedList.map(evening=>{const runBlock=sendBlock??(evening.steps.length>cap?t(`לערב הזה ${evening.steps.length} צעדים, והקצב הנוכחי מאפשר ${cap}. שני את הקצב כדי להפעיל אותו.`,`This evening has ${evening.steps.length} steps; the current pace allows ${cap}. Change the pace to run it.`):usedNow+evening.steps.length>cap?limitMessage:null);return <article key={evening.id}><h4>{evening.name}</h4><p className="small">{moodLabel(evening.mood)} · {t(`${evening.steps.length} צעדים`,`${evening.steps.length} steps`)}</p>{runBlock&&<p className="small">{runBlock}</p>}<div className="row"><Button className="primary" disabled={!!runBlock} aria-label={t('הפעלה','Run')+': '+evening.name} onClick={()=>askRun(evening)}>{t('הפעלה','Run')}</Button><Button disabled={ended} onClick={()=>void run(()=>action('evening-delete',{evening:evening.id}))}>{t('מחיקה','Delete')}</Button></div></article>;})}
      </details>
      {lastNight&&<article>
        <h3>{t('הערב האחרון','Last night')} · {moodLabel(lastNight.mood)}</h3>
        <p className="small">{date(lastNight.at)}</p>
        <p>{t(`אושרו ${nightApproved} מתוך ${nightMissions.length} משימות`,`${nightApproved} of ${nightMissions.length} tasks approved`)}</p>
        {nightMissions.map(m=><p key={m.id}>{m.title} <span className="badge">{label(m.status)}</span></p>)}
      </article>}
    </section>;
}
