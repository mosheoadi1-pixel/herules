import type { Dispatch, SetStateAction } from 'react';
import type { Mission, Session, User } from '../../server/app';
import { progressStats, weeklyRecap, milestones, favouriteMood, WISH_COOLDOWN_MS, type Mood, type Rating } from '../progress';
import { wishSuggestions } from '../quick';
import { save, form, type Action, type Night, type Run, type SavedEvening, type SayDraft, type Translate } from '../app-shared';
import type { DeckItem } from '../foryou';
import type { Idea } from '../library';
import { topQuickPresets } from '../prefs';
import { Button } from './Button';
import { NightCard } from './NightCard';
import { CommandPanel } from './CommandPanel';
import { ForYou } from './ForYou';
import { Garden } from './Garden';
import { Proposals } from './Proposals';

type DashboardTabProps = {
  s: Session; u: User; wife: boolean; ended: boolean; held: boolean; play: boolean; now: number; lang: 'he' | 'en';
  t: Translate; date: (at: number) => string; label: (key: string) => string;
  run: Run; action: Action;
  nudgeDue: boolean; dismissNudge: () => void;
  progress: ReturnType<typeof progressStats>; weekly: ReturnType<typeof weeklyRecap>; badges: ReturnType<typeof milestones>;
  ratingLabel: (rating: Rating) => string; moodLabel: (mood: Mood) => string;
  favourite: ReturnType<typeof favouriteMood>; nextScheduled: Mission | undefined;
  notes: NonNullable<Session['notes']>; notesFull: boolean; cheapestWish: { cost: number } | undefined;
  awaitingReview: Mission[]; pendingRewards: NonNullable<Session['rewardRequests']>; recentApproved: Mission[]; needsCare: boolean;
  keysHintSeen: boolean; setKeysHintSeen: Dispatch<SetStateAction<boolean>>;
  moodOrder: Mood[]; nightMood: Mood | ''; lastMood: Mood | ''; chooseMood: (mood: Mood) => void;
  sendSteps: (mood: Mood) => { he: string; en: string; points: number; minutesFromNow: number }[];
  nightBlock: string | null; askNight: (mood: Mood) => void; saveOpen: boolean; setSaveOpen: Dispatch<SetStateAction<boolean>>;
  eveningName: string; setEveningName: Dispatch<SetStateAction<string>>; savedFull: boolean; saveEvening: () => void;
  savedList: SavedEvening[]; sendBlock: string | null; cap: number; usedNow: number; limitMessage: string;
  askRun: (evening: SavedEvening) => void; lastNight: Night | undefined; nightApproved: number; nightMissions: Mission[];
  choosePace: (pace: 1 | 2 | 3) => void; finishOnboarding: (pace: 1 | 2 | 3) => void; closedNow: boolean; windowHours: number; reopenHours: number; askClose: () => void;
  quickBlock: string | null; barPresets: ReturnType<typeof topQuickPresets>; askPreset: (p: { id: string; he: string; en: string; points: number }) => void;
  quickAt: string; setQuickAt: Dispatch<SetStateAction<string>>;
  askQuick: (title: string, text: string, points: number, body: Record<string, unknown>, preset?: string, done?: () => void) => void;
  sayOpen: boolean; setSayOpen: Dispatch<SetStateAction<boolean>>; sayText: string; setSayText: Dispatch<SetStateAction<string>>;
  sayDraft: SayDraft | null; setSayDraft: Dispatch<SetStateAction<SayDraft | null>>; sayReady: boolean;
  deck: DeckItem[]; skipDeck: (id: string) => void; gardenTotal: number; useIdea: (idea: Idea) => void;
};

export function DashboardTab({ s, u, wife, ended, held, play, now, lang, t, date, label, run, action, nudgeDue, dismissNudge, progress, weekly, badges, ratingLabel, moodLabel, favourite, nextScheduled, notes, notesFull, cheapestWish, awaitingReview, pendingRewards, recentApproved, needsCare, keysHintSeen, setKeysHintSeen, moodOrder, nightMood, lastMood, chooseMood, sendSteps, nightBlock, askNight, saveOpen, setSaveOpen, eveningName, setEveningName, savedFull, saveEvening, savedList, sendBlock, cap, usedNow, limitMessage, askRun, lastNight, nightApproved, nightMissions, choosePace, finishOnboarding, closedNow, windowHours, reopenHours, askClose, quickBlock, barPresets, askPreset, quickAt, setQuickAt, askQuick, sayOpen, setSayOpen, sayText, setSayText, sayDraft, setSayDraft, sayReady, deck, skipDeck, gardenTotal, useIdea }: DashboardTabProps) {
  const StatsBox=wife?'details':'section';
   const statsPanel=<StatsBox className="panel stats" aria-label={t('התקדמות המשחק','Game progress')}>{wife?<summary><h2>{t('איך המשחק מתקדם','How the game is going')}</h2></summary>:<h2>{t('איך המשחק מתקדם','How the game is going')}</h2>}
      <div className="stat-grid">
        <div><strong>{progress.thisWeek}</strong><span>{progress.thisWeek===1?t('משימה שאושרה השבוע','Task approved this week'):t('משימות שאושרו השבוע','Tasks approved this week')}</span></div>
        <div><strong>{progress.streak}</strong><span>{t('ימים רצופים עם משימה שאושרה','Day streak with an approved task')}</span></div>
        <div><strong>{progress.total}</strong><span>{progress.total===1?t('משימה שאושרה בסך הכול','Task approved in total'):t('משימות שאושרו בסך הכול','Tasks approved in total')}</span></div>
        <div><strong>{progress.ackRate===null?'—':`${progress.ackRate}%`}</strong><span>{t('הזמנות שאושרו בקבלה מפורשת','Invitations explicitly acknowledged')}</span></div>
      </div>
      <p className="small">{t('השבוע','This week')}: {weekly.herPointsThisWeek} {t('נקודות שלה','her points')}{weekly.topRating&&<> · {t('דירוג מוביל','Top rating')}: {ratingLabel(weekly.topRating)}</>}</p>
      {progress.graceUsed&&<p className="small">{t('יום חסד נוצל כדי לשמור על הרצף','A grace day kept your streak')}</p>}
      <div className="row" aria-label={t('אבני דרך','Milestones')}>{badges.map(b=><span key={b.at} className="badge">{b.at} {t('משימות','tasks')} · {b.reached?t('הושג','Reached'):t(`עוד ${b.at-progress.total}`,`${b.at-progress.total} to go`)}</span>)}</div>
    </StatsBox>;
   const paceAndEnd=<>
     <section className="panel pace"><h2>{t('קצב הערב','Evening pace')}</h2>
       <p>{t('כמה פקודות מהירות אפשר לשלוח בערב אחד.','How many quick commands can be sent in one evening.')}</p>
       <div className="row" role="group" aria-label={t('פקודות לערב','Commands per evening')}>{[1,2,3].map(n=><Button key={n} aria-pressed={cap===n} className={cap===n?'primary':undefined} disabled={ended} onClick={()=>choosePace(n as 1|2|3)}>{[t('פקודה אחת','One command'),t('שתיים','Two'),t('שלוש','Three')][n-1]}</Button>)}</div>
       <p className="small" aria-live="polite">{t('שימוש הערב','Used this evening')}: <strong>{usedNow}</strong> {t('מתוך','of')} {cap}</p>
       <p className="small">{t(`הספירה מתעדכנת לפי ${windowHours} השעות האחרונות.`,`The count covers the last ${windowHours} hours.`)}</p>
     </section>
     <section className="panel evening-end"><h2>{t('סוף הערב','The end of the evening')}</h2>
       {closedNow?<p className="notice" role="status" aria-live="polite">{reopenHours<=1?t('הערב נסגר. ייפתח מחדש אוטומטית בעוד פחות משעה.','The evening is closed. It reopens automatically in less than an hour.'):t(`הערב נסגר. ייפתח מחדש אוטומטית ${reopenHours===2?'בעוד שעתיים':`בעוד ${reopenHours} שעות`}.`,`The evening is closed. It reopens automatically in ${reopenHours} hours.`)}</p>
       :<><p>{t('כשהערב נגמר, אפשר לסגור אותו. ההזמנות המתוזמנות יבוטלו, ולא ניתן יהיה לשלוח עד שייפתח מחדש.','When the evening is over, you can close it. Scheduled invitations are cancelled, and nothing can be sent until it reopens.')}</p><Button disabled={!s||ended} onClick={askClose}>{t('סיום הערב','Done for tonight')}</Button></>}
     </section>
   </>;
   const onboardingPanel=<section className="panel onboard" aria-labelledby="onboard-title"><h2 id="onboard-title">{t('איך תרצי להתחיל?','How would you like to start?')}</h2>
     <p>{t('בחרי קצב. אפשר לשנות אותו בכל רגע.','Choose a pace. You can change it at any time.')}</p>
     <div className="onboard-choices">
       <Button onClick={()=>finishOnboarding(1)}>{t('שקט ונעים','Soft and calm')}<span>{t('פקודה אחת לערב','One command an evening')}</span></Button>
       <Button onClick={()=>finishOnboarding(2)}>{t('משחקי','Playful')}<span>{t('עד שתי פקודות לערב','Up to two commands an evening')}</span></Button>
       <Button onClick={()=>finishOnboarding(3)}>{t('מלא','Full')}<span>{t('עד שלוש פקודות לערב','Up to three commands an evening')}</span></Button>
     </div>
     <p className="small">{t('דילוג יגדיר קצב מלא.','Skipping sets the full pace.')}</p>
     <Button className="quiet" onClick={()=>finishOnboarding(3)}>{t('דילוג','Skip')}</Button>
   </section>;
   const quickBar=<div className="quick-bar" role="group" aria-label={t('פקודות מהירות לשליחה','Quick commands to send')}>{quickBlock&&<p role="status">{quickBlock}</p>}{barPresets.map(p=><button key={p.id} disabled={!!quickBlock} onClick={()=>askPreset(p)}>{lang==='he'?p.he:p.en}</button>)}</div>;
   const keyHint=keysHintSeen?null:<div className="keys-hint notice"><p>{t('קיצורים: 1–3 לבחירת מצב רוח · N להקלדת משפט · Esc לסגירת חלון.','Shortcuts: 1–3 choose a mood · N to say it · Esc closes a window.')}</p><Button className="quiet" onClick={()=>{save('hr-keys-hint',true);setKeysHintSeen(true);}}>{t('הבנתי','Got it')}</Button></div>;
  return <>
    {wife&&s&&!ended&&s.pace===undefined&&onboardingPanel}
    {wife&&s&&quickBar}
    {wife&&<section className="panel hub"><p className="eyebrow">{t('חדר השליטה','CONTROL ROOM')}</p><h2>{t('מה תרצי לעשות הערב?','What would you like to do tonight?')}</h2><p>{t('בחרי מצב רוח, שלחי פקודה מוכנה, או בדקי מה ממתין לך. הכול נשאר בשליטתך.','Pick a mood, send a ready-made command, or check what is waiting for you. You stay in control of everything.')}</p></section>}
    {wife&&paceAndEnd}
    {!wife&&statsPanel}
    {nudgeDue&&!held&&<section className="panel"><p>{t('עבר זמן מאז שהייתם כאן יחד. אפשר לחזור בצעד קטן: הודעה אחת או צ׳ק־אין קצר.','It has been a while since you were together here. You can ease back in with one small step: a message or a short check-in.')}</p><Button onClick={dismissNudge}>{t('לא עכשיו','Not now')}</Button></section>}
    {wife&&<ForYou deck={deck} lang={lang} t={t} play={play} useIdea={useIdea} onSkip={skipDeck}/>}
    <Garden total={gardenTotal} t={t}/>
    {wife&&<NightCard t={t} date={date} label={label} moodLabel={moodLabel} moodOrder={moodOrder} nightMood={nightMood} lastMood={lastMood} chooseMood={chooseMood} sendSteps={sendSteps} play={play} ended={ended} nightBlock={nightBlock} askNight={askNight} saveOpen={saveOpen} setSaveOpen={setSaveOpen} eveningName={eveningName} setEveningName={setEveningName} savedFull={savedFull} saveEvening={saveEvening} savedList={savedList} sendBlock={sendBlock} cap={cap} usedNow={usedNow} limitMessage={limitMessage} askRun={askRun} run={run} action={action} favourite={favourite} nextScheduled={nextScheduled} lastNight={lastNight} nightApproved={nightApproved} nightMissions={nightMissions}/>}
    {wife?<>
      <section className="panel"><h2>{t('שולחן הבדיקה שלך','Your review desk')}</h2>
        {!awaitingReview.length&&!pendingRewards.length&&<p className="empty">✓ {t('הכול מסודר. אין פריטים שממתינים לך.','All clear. Nothing is waiting for you.')}</p>}
        {awaitingReview.map(m=><article key={m.id}><h3>{m.title}</h3><p className="preserve">{m.completion}</p><div className="row"><Button className="primary" disabled={!play} onClick={()=>void run(()=>action('review',{mission:m.id,approve:true,submissionVersion:m.submissionVersion??0}))}>{t('אישור בלחיצה אחת','Approve in one tap')}</Button><Button disabled={!play} onClick={()=>void run(()=>action('review',{mission:m.id,approve:false,submissionVersion:m.submissionVersion??0}))}>{t('החזרה לתיקון','Return for revision')}</Button></div></article>)}
        {pendingRewards.map(r=><article key={r.id}><h3>{r.title}</h3><p>{r.cost} {t('נקודות','points')}</p><div className="row"><Button className="primary" disabled={!play} onClick={()=>void run(()=>action('reward-decision',{request:r.id,approve:true}))}>{t('אישור פרס','Approve reward')}</Button><Button disabled={!play} onClick={()=>void run(()=>action('reward-decision',{request:r.id,approve:false}))}>{t('דחיית פרס','Decline reward')}</Button></div></article>)}
        <details className="subtle"><summary>{t('משימות שאושרו לאחרונה','Recently approved tasks')}</summary>
        {!recentApproved.length&&<p className="empty">{t('עדיין אין משימות שאושרו.','No approved tasks yet.')}</p>}
        {recentApproved.map(m=><article key={m.id}><h4>{m.title}</h4><div className="row">{(['love','like','skip'] as const).map(rating=><Button key={rating} aria-pressed={m.rating===rating} className={m.rating===rating?'primary':undefined} onClick={()=>void run(()=>action('rate',{mission:m.id,rating}))}>{ratingLabel(rating)}</Button>)}</div>{m.rating&&<p className="small">{t('הדירוג שנשמר','Saved rating')}: {ratingLabel(m.rating)}</p>}</article>)}</details>
      </section>
      <CommandPanel s={s} play={play} t={t} lang={lang} quickAt={quickAt} setQuickAt={setQuickAt} quickBlock={quickBlock} askPreset={askPreset} askQuick={askQuick} run={run} action={action} sayOpen={sayOpen} setSayOpen={setSayOpen} sayText={sayText} setSayText={setSayText} sayDraft={sayDraft} setSayDraft={setSayDraft} sayReady={sayReady}/>
      <section className="panel"><h2>{t('הנקודות שלך','Your points')}</h2><p className="big-number"><strong>{s?.herPoints??0}</strong> {t('נקודות לעצמך','points for yourself')}</p><p className="small">{t('כל משימה שאושרה מוסיפה לך נקודות באותו ערך. מממשים אותן על מה שרוצים.','Every approved task adds the same points to you. Spend them on what you want.')}</p>
        {cheapestWish&&<div>
          <progress className="points-bar" max={Math.max(cheapestWish.cost,1)} value={Math.min(s?.herPoints??0,Math.max(cheapestWish.cost,1))} aria-label={t('התקדמות למשאלה הזולה ביותר','Progress toward the cheapest wish')}/>
          <p className="small">{(s?.herPoints??0)>=cheapestWish.cost?t('יש מספיק נקודות למשאלה הזולה.','There are enough points for the cheapest wish.'):t(`עוד ${cheapestWish.cost-(s?.herPoints??0)} נקודות למשאלה הזולה.`,`${cheapestWish.cost-(s?.herPoints??0)} more points to the cheapest wish.`)}</p>
        </div>}
        {!s?.herWishes?.length&&<p className="empty">{t('עדיין אין משאלות.','No wishes yet.')}</p>}
        {(s?.herWishes??[]).map(w=>{const unlockAt=(w.createdAt??0)+WISH_COOLDOWN_MS,cooling=now<unlockAt;return <article key={w.id}><h4>{w.title}</h4><p>{w.cost} {t('נקודות','points')}</p><Button className="primary" disabled={!play||cooling||(s?.herPoints??0)<w.cost} onClick={()=>void run(()=>action('herwish-redeem',{wish:w.id}))}>{t('מימוש המשאלה','Redeem wish')}</Button>{cooling&&<p className="small">{t('אפשר לממש אחרי','Available after')} {date(unlockAt)}</p>}</article>;})}
        <h3>{t('הוספת משאלה','Add a wish')}</h3>
        <div className="quick-grid">{wishSuggestions.map(w=><button key={w.he} disabled={!play} onClick={()=>void run(()=>action('herwish',{title:lang==='he'?w.he:w.en,cost:w.cost}))}>{lang==='he'?w.he:w.en} · {w.cost}</button>)}</div>
        <details className="subtle"><summary>{t('משאלה משלך','Your own wish')}</summary>
        <form onSubmit={e=>{const el=e.currentTarget,b=form(e);void run(async()=>{await action('herwish',{title:b.title,cost:Number(b.cost)});el.reset();});}}>
          <label>{t('משאלה','Wish')}<input name="title" required maxLength={160}/></label>
          <label>{t('עלות בנקודות','Cost in points')}<input name="cost" type="number" min={0} max={100000} defaultValue={30} required/></label>
          <Button disabled={!play}>{t('הוספת משאלה','Add wish')}</Button>
        </form></details>
      </section>
    {statsPanel}
    <details className="panel"><summary><h2>{t('הפתקים שלי','My notes')}</h2></summary>
      <p className="small">{t('הפתקים נשמרים רק אצלך ולא מוצגים לבעל.','Notes are kept only for you and are never shown to the husband.')}</p>
      {notesFull?<p className="notice">{t('הרשימה מלאה (50 פתקים). מחקו פתק כדי להוסיף.','The list is full (50 notes). Delete a note to add another.')}</p>:<form onSubmit={e=>{const el=e.currentTarget,b=form(e);if(!String(b.text).trim())return;void run(async()=>{await action('note-save',{text:String(b.text).trim()});el.reset();});}}>
        <label>{t('פתק חדש','New note')}<textarea name="text" required maxLength={1000}/></label>
        <Button>{t('שמירת פתק','Save note')}</Button>
      </form>}
      <p className="small">{notes.length}/50</p>
      {!notes.length&&<p className="empty">{t('עדיין אין פתקים.','No notes yet.')}</p>}
      {[...notes].reverse().map(n=><article key={n.id}><p className="preserve">{n.text}</p><div className="row between"><span className="small">{date(n.at)}</span><Button onClick={()=>void run(()=>action('note-delete',{note:n.id}))}>{t('מחיקה','Delete')}</Button></div></article>)}
    </details>
    {keyHint}
    </>:<section className="panel"><h2>{t('טיפול אחריה','Looking after her')}</h2>
      {needsCare?<><p>{t('אחרי משימה שאושרה, דאג/י לה: מים, שמיכה, חיבוק או שיחה רכה. זה לא תלוי במשחק.','After an approved task, look after her: water, a blanket, a hug, or a gentle talk. This does not depend on the game.')}</p><Button className="primary" onClick={()=>void run(()=>action('aftercare',{}))}>{t('סימנתי: טיפלתי בה','Done: I looked after her')}</Button></>:<p className="empty">{t('אין כרגע משימה שממתינה לטיפול אחריה.','No task is waiting for aftercare right now.')}</p>}
    </section>}
    <Proposals s={s} u={u} wife={wife} play={play} ended={ended} t={t} run={run} action={action}/>
  </>;
}
