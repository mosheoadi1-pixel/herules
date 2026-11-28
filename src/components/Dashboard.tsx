import { useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Mission, Session, User } from '../../server/app';
import { progressStats, weeklyRecap, milestones, favouriteMood, streakStats, type Mood, type Rating } from '../progress';
import type { QueenLevel } from '../queen';
import type { Digest } from '../digest';
import { SPARK_REROLLS, type Spark } from '../spark';
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
import { SeasonPanel } from './Seasons';

// One-word decree labels and season-pack names for her Chamberlain panel
const moodNameHe: Record<string,string> = { worship:'סגידה', tease:'הקנטה', discipline:'אימון', service:'שירות', rest:'מנוחה' };
const moodNameEn: Record<string,string> = { worship:'Worship', tease:'Teasing', discipline:'Training', service:'Service', rest:'Rest' };
const packNameHe: Record<string,string> = { contract:'החוזה', tease:'הקנטה', rest:'מנוחה' };
const packNameEn: Record<string,string> = { contract:'The Contract', tease:'The Tease', rest:'Rest' };

type DashboardTabProps = {
  s: Session; u: User; wife: boolean; ended: boolean; held: boolean; play: boolean; now: number; lang: 'he' | 'en';
  t: Translate; date: (at: number) => string; label: (key: string) => string;
  run: Run; action: Action;
  nudgeDue: boolean; dismissNudge: () => void;
  progress: ReturnType<typeof progressStats>; weekly: ReturnType<typeof weeklyRecap>; badges: ReturnType<typeof milestones>;
  streaks: { devotion: ReturnType<typeof streakStats>; mission: ReturnType<typeof streakStats> }; queen?: QueenLevel; digest?: Digest; adorationTally?: { loved: number; liked: number; ok: number }; spark?: Spark;
  ratingLabel: (rating: Rating) => string; moodLabel: (mood: Mood) => string;
  favourite: ReturnType<typeof favouriteMood>; nextScheduled: Mission | undefined;
  notes: NonNullable<Session['notes']>; notesFull: boolean;
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
  deck: DeckItem[]; skipDeck: (id: string) => void; gardenTotal: number; useIdea: (idea: { id: string; category: string; he: string; en: string }) => void;
  askSeason: (packId: string) => void;
  askStopSeason: (packId: string) => void;
};

export function DashboardTab({ s, u, wife, ended, held, play, now, lang, t, date, label, run, action, nudgeDue, dismissNudge, progress, weekly, badges, streaks, queen, digest, adorationTally, spark, ratingLabel, moodLabel, favourite, nextScheduled, notes, notesFull, awaitingReview, pendingRewards, recentApproved, needsCare, keysHintSeen, askStopSeason, setKeysHintSeen, moodOrder, nightMood, lastMood, chooseMood, sendSteps, nightBlock, askNight, saveOpen, setSaveOpen, eveningName, setEveningName, savedFull, saveEvening, savedList, sendBlock, cap, usedNow, limitMessage, askRun, lastNight, nightApproved, nightMissions, choosePace, finishOnboarding, closedNow, windowHours, reopenHours, askClose, quickBlock, barPresets, askPreset, quickAt, setQuickAt, askQuick, sayOpen, setSayOpen, sayText, setSayText, sayDraft, setSayDraft, sayReady, deck, skipDeck, gardenTotal, useIdea, askSeason }: DashboardTabProps) {
  const StatsBox=wife?'details':'section';
   const statsPanel=<StatsBox id="dashboard-progress" className="panel stats" aria-label={t('התקדמות המשחק','Game progress')}>{wife?<summary><h2>{t('איך המשחק מתקדם','How the game is going')}</h2></summary>:<h2>{t('איך המשחק מתקדם','How the game is going')}</h2>}
      <div className="stat-grid">
        <div><strong>{progress.thisWeek}</strong><span>{progress.thisWeek===1?t('משימה שאושרה השבוע','Task approved this week'):t('משימות שאושרו השבוע','Tasks approved this week')}</span></div>
        <div><strong>{progress.streak}</strong><span>{t('ימים רצופים עם משימה שאושרה','Day streak with an approved task')}</span></div>
        <div><strong>{progress.total}</strong><span>{progress.total===1?t('משימה שאושרה בסך הכול','Task approved in total'):t('משימות שאושרו בסך הכול','Tasks approved in total')}</span></div>
        <div><strong>{progress.ackRate===null?'—':`${progress.ackRate}%`}</strong><span>{t('הזמנות שאושרו בקבלה מפורשת','Invitations explicitly acknowledged')}</span></div>
      </div>
      <p className="small">{t('השבוע','This week')}: {weekly.herPointsThisWeek} {t('נקודות שלה','her points')}{weekly.topRating&&<> · {t('דירוג מוביל','Top rating')}: {ratingLabel(weekly.topRating)}</>}</p>
      {progress.graceUsed&&<p className="small">{t('יום חסד נוצל כדי לשמור על הרצף','A grace day kept your streak')}</p>}
      <p className="small"><span className="sr-only">{t('רצפים','Streaks')}.</span>{t('רצף מסירות (ימים UTC)','Devotion streak (UTC days)')}: <strong>{streaks.devotion.current}</strong> · {t('הרצף הארוך','Longest')}: {streaks.devotion.longest} · {t('רצף משימות שנשלחו','Mission streak sent')}: <strong>{streaks.mission.current}</strong> · {t('הרצף הארוך','Longest')}: {streaks.mission.longest}{streaks.mission.todayDone&&<> · {t('נשלחה משימה היום','Sent a mission today')}</>}</p>
      <div className="row"><span className="sr-only">{t('אבני דרך','Milestones')}</span>{badges.map(b=><span key={b.at} className="badge">{b.at} {t('משימות','tasks')} · {b.reached?t('הושג','Reached'):t(`עוד ${b.at-progress.total}`,`${b.at-progress.total} to go`)}</span>)}</div>
    </StatsBox>;
   const digestPanel=digest&&<details className="panel digest" aria-label={t('הסיכום השבועי','Weekly digest')}><summary><h2>{t('הסיכום השבועי','Weekly digest')}</h2></summary>
     {new Date(now).getDay()===0&&<p className="digest-sunday" role="status">{t('יום ראשון: זמן טוב להביט לאחור על השבוע יחד.','Sunday: a good time to look back on the week together.')}</p>}
     {digest.approved===0&&digest.delivered===0?<p className="empty">{t('שבוע שקט עד כה. גם שבוע רגוע הוא חלק מהמשחק.','A quiet week so far. A calm week is part of the game too.')}</p>:<>
       <div className="stat-grid">
         <div><strong>{digest.approved}</strong><span>{t('משימות שאושרו ב-7 הימים האחרונים','Tasks approved in the last 7 days')}</span></div>
         <div><strong>{digest.husbandPoints}</strong><span>{t('נקודות שנצברו השבוע','Points earned this week')}</span></div>
         <div><strong>{digest.herPoints}</strong><span>{t('הזוהר שלה השבוע','Her points this week')}</span></div>
         <div><strong>{digest.devotionStreak.current}</strong><span>{t('רצף מסירות נוכחי','Current devotion streak')}</span></div>
         <div><strong>{digest.missionStreak.current}</strong><span>{t('רצף משימות נוכחי','Current mission streak')}</span></div>
       </div>
       {digest.topCategories.length>0&&<p className="small">{t('קטגוריות מובילות','Top categories')}: {digest.topCategories.map(c=>`${label(c.category)} (${c.count})`).join(' · ')}</p>}
     </>}
     {wife&&digest.topRated&&<p className="small">{t('המדורג הגבוה ביותר אצלך','Your top-rated idea')}: {digest.topRated.title} · {ratingLabel(digest.topRated.rating)}</p>}
     {wife&&digest.suggestion&&<p className="small">{t('הצעה להמשך','Suggested next idea')}: {lang==='he'?digest.suggestion.he:digest.suggestion.en}</p>}
   </details>;
   const paceAndEnd=<div className="evening-controls" id="evening-settings" role="group" aria-label={t('הגדרות הערב','Evening settings')}>
     <section className="panel pace"><h2>{t('קצב הערב','Evening pace')}</h2>
       <p>{t('כמה פקודות מהירות אפשר לשלוח בערב אחד.','How many quick commands can be sent in one evening.')}</p>
       <div className="row" role="group" aria-label={t('פקודות לערב','Commands per evening')}>{[1,2,3].map(n=><Button key={n} aria-pressed={cap===n} className={cap===n?'primary':undefined} disabled={ended} onClick={()=>choosePace(n as 1|2|3)}>{[t('פקודה אחת','One command'),t('שתיים','Two'),t('שלוש','Three')][n-1]}</Button>)}</div>
       <p className="small" aria-live="polite">{t('שימוש הערב','Used this evening')}: <strong>{usedNow}</strong> {t('מתוך','of')} {cap}</p>
       <p className="small">{t(`הספירה מתעדכנת לפי ${windowHours} השעות האחרונות.`,`The count covers the last ${windowHours} hours.`)}</p>
     </section>
     <section className="panel evening-end"><h2>{t('סוף הערב','The end of the evening')}</h2>
       {closedNow?<p className="notice" role="status" aria-live="polite">{reopenHours<=1?t('הערב נסגר. ייפתח מחדש אוטומטית בעוד פחות משעה.','The evening is closed. It reopens automatically in less than an hour.'):t(`הערב נסגר. ייפתח מחדש אוטומטית ${reopenHours===2?'בעוד שעתיים':`בעוד ${reopenHours} שעות`}.`,`The evening is closed. It reopens automatically in ${reopenHours} hours.`)}</p>
       :<><p>{t('כשהערב נגמר, אפשר לסגור אותו. הזמנות חד-פעמיות מתוזמנות יבוטלו; פרקים ימשיכו להימסר בבוקר. לא ניתן יהיה לשלוח דבר חדש עד שייפתח מחדש.','When the evening is over, you can close it. Scheduled one-off invitations are cancelled; chapters still arrive in the morning. Nothing new can be sent until it reopens.')}</p><Button disabled={!s||ended} onClick={askClose}>{t('סיום הערב','Finish tonight')}</Button></>}
     </section>
   </div>;
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
   const quickDialog=useRef<HTMLDialogElement>(null);
   const quickActions=<div className="section-links dashboard-tools">
     <Button onClick={()=>quickDialog.current?.showModal()}>{t('פעולות מהירות','Quick actions')}</Button>
     <a href="#evening-settings">{t('הגדרות הערב','Evening settings')}</a>
      <a href="#dashboard-progress" onClick={()=>{
        const progress=document.getElementById('dashboard-progress');
        if(progress instanceof HTMLDetailsElement)progress.open=true;
      }}>{t('התקדמות','Progress')}</a>
     <dialog ref={quickDialog} className="sheet" aria-labelledby="quick-actions-title">
       <h2 id="quick-actions-title">{t('פעולות מהירות','Quick actions')}</h2>
       {quickBlock&&<p role="status">{quickBlock}</p>}
       <div className="quick-actions-list">{barPresets.map(p=><Button key={p.id} disabled={!!quickBlock} onClick={()=>{quickDialog.current?.close();askPreset(p);}}>{lang==='he'?p.he:p.en}</Button>)}</div>
       <button type="button" className="quiet" onClick={()=>quickDialog.current?.close()}>{t('סגירה','Close')}</button>
     </dialog>
   </div>;
   const keyHint=keysHintSeen?null:<div className="keys-hint notice"><p>{t('קיצורים: 1–3 לבחירת מצב רוח · N להקלדת משפט · Esc לסגירת חלון.','Shortcuts: 1–3 choose a mood · N to say it · Esc closes a window.')}</p><Button className="quiet" onClick={()=>{save('hr-keys-hint',true);setKeysHintSeen(true);}}>{t('הבנתי','Got it')}</Button></div>;
  const [tributeSent,setTributeSent]=useState(false);
  const cliffhanger=s.chapterState?.cliffhanger;
  const revealed=s.adoration?.last;
  const waiting=s.adoration?.waiting;
  const ready=s.adoration?.ready;
  const sippedFor=s.adoration?.sippedFor;
  const canGrant=!!sippedFor&&s.adoration?.grantedFor!==sippedFor;
  const chapterOpen=s.missions.filter(m=>m.chapter&&!['approved','refused','cancelled'].includes(m.status)).length;
  const reviewWaiting=awaitingReview.length+pendingRewards.length;
  const reviewDesk= <section className="panel review-desk"><h2>{t('שולחן הבדיקה שלך','Your review desk')}{awaitingReview.length+pendingRewards.length>0&&<span className="badge"> {awaitingReview.length+pendingRewards.length} {t('ממתינים','waiting')}</span>}</h2> {!awaitingReview.length&&!pendingRewards.length&&<p className="empty">✓ {t('הכול מסודר. אין פריטים שממתינים לך.','All clear. Nothing is waiting for you.')}</p>} {awaitingReview.map(m=><article key={m.id}><h3>{m.title}</h3><p className="preserve">{m.completion}</p><div className="row"><Button className="primary" disabled={!play} onClick={()=>void run(()=>action('review',{mission:m.id,approve:true,submissionVersion:m.submissionVersion??0}))}>{t('אישור ונקודות פעם אחת','Approve and award once')}</Button><Button disabled={!play} onClick={()=>void run(()=>action('review',{mission:m.id,approve:false,submissionVersion:m.submissionVersion??0}))}>{t('החזרה לתיקון','Return for revision')}</Button></div></article>)} {pendingRewards.map(r=><article key={r.id}><h3>{r.title}</h3><p>{r.cost} {t('נקודות','points')}</p><div className="row"><Button className="primary" disabled={!play} onClick={()=>void run(()=>action('reward-decision',{request:r.id,approve:true}))}>{t('אישור פרס','Approve reward')}</Button><Button disabled={!play} onClick={()=>void run(()=>action('reward-decision',{request:r.id,approve:false}))}>{t('דחיית פרס','Decline reward')}</Button></div></article>)} <details className="subtle"><summary>{t('משימות שאושרו לאחרונה','Recently approved tasks')}</summary> {!recentApproved.length&&<p className="empty">{t('עדיין אין משימות שאושרו.','No approved tasks yet.')}</p>} {recentApproved.map(m=><article key={m.id}><h4>{m.title}</h4><div className="row">{(['love','like','skip'] as const).map(rating=><Button key={rating} aria-pressed={m.rating===rating} className={m.rating===rating?'primary':undefined} onClick={()=>void run(()=>action('rate',{mission:m.id,rating}))}>{ratingLabel(rating)}</Button>)}</div>{m.rating&&<p className="small">{t('הדירוג שנשמר','Saved rating')}: {ratingLabel(m.rating)}</p>}</article>)}</details> </section>
  return <>
    {wife&&reviewWaiting>0&&<div className="dashboard-attention">
      <p>{t('ממתין לטיפול','Needs attention')}</p>
      {reviewDesk}
    </div>}
    {wife&&s&&!ended&&s.pace===undefined&&onboardingPanel}
    {wife&&quickActions}
    {wife&&spark&&<section className="panel spark" aria-label={t('ניצוץ יומי','Daily spark')}>
      <p className="eyebrow">{t('ניצוץ יומי','Daily spark')}</p>
      <h2>{t('רעיון אחד להיום','One idea for today')}</h2>
      <p className="preserve">{lang==='he'?spark.idea.he:spark.idea.en}</p>
      <p className="small">{label(spark.idea.category)} · {spark.idea.minutes} {t('דקות','minutes')}</p>
      <div className="row">
        <Button className="primary" disabled={!play} onClick={()=>useIdea(spark.idea)}>{t('שליחה כמשימה','Send as mission')}</Button>
        <Button disabled={ended||spark.rerolls>=SPARK_REROLLS} onClick={()=>void run(()=>action('spark-reroll',{}))}>{t(`ניצוץ אחר (${SPARK_REROLLS-spark.rerolls})`,`Another spark (${SPARK_REROLLS-spark.rerolls})`)}</Button>
        <Button className="quiet" disabled={ended} onClick={()=>void run(()=>action('spark-dismiss',{idea:spark.idea.id}))}>{t('לא מתאים היום','Not today')}</Button>
      </div>
      <p className="small dim">{t('ניצוץ אחד ליום, לפי הצ׳ק־אין שלך. אפשר להחליף עד עשר פעמים.','One spark a day, shaped by your check-in. You can swap it up to ten times.')}</p>
    </section>}
    {wife&&<section className="panel hub adoration" aria-label={t('האדורציה שלה','Her Adoration')}>
      <p className="eyebrow">{t('האדורציה שלה','Her Adoration')}</p>
      <h2>{t('קבלת ההערצה','Receiving Adoration')}</h2>
      <p>{t('מחווה אחת מגיעה לך. גלי אותה, לגמי את תחושותיו, העניקי לה, או חתמי את הפרק.','One devotion is due you. Reveal it, sip his longing, grant the earned moment, or seal the chapter.')}</p>
      {typeof waiting==='number'&&waiting>0&&<p className="small" role="status">{waiting===1?t('מחווה אחת ממתינה לגילוי שלך.','One devotion is waiting for your reveal.'):t(`${waiting} מחוות ממתינות לגילוי שלך.`,`${waiting} devotions are waiting for your reveal.`)}</p>}
      {revealed
        ? <blockquote className="adoration-words preserve"><p className="eyebrow">{t('המילים שלו','His words')}</p>{revealed.text}</blockquote>
        : <p className="small">{t('עוד לא גילית מחווה. פתיחה מביאה לך את מה שהוא כתב.','You have not revealed a devotion yet. Reveal brings you what he wrote.')}</p>}
      <div className="adoration-actions" role="group" aria-label={t('פעולות ההערצה','Adoration actions')}>
        <Button className="primary" disabled={!play||waiting===0} onClick={()=>void run(()=>action('tribute-reveal'))}>{t('פותחת','Reveal')}</Button>
        <Button disabled={!play||ready===0} onClick={()=>void run(()=>action('sip'))}>{t('לוגמת','Sip')}</Button>
        <Button disabled={!play||!canGrant} onClick={()=>void run(()=>action('grant'))}>{t('מעניקה','Grant')}</Button>
        <Button disabled={!play} onClick={()=>void run(()=>action('seal'))}>{t('חותמת','Seal')}</Button>
      </div>
      <p className="small" role="status">{(() => { const steps: string[] = []; if (waiting) steps.push(t('פותחת','Reveal')); if (ready) steps.push(t('לוגמת','Sip')); if (canGrant) steps.push(t('מעניקה','Grant')); steps.push(t('חותמת','Seal')); return steps.length ? t('זמין עכשיו: ','Available now: ')+steps.join(' · ') : ''; })()}</p>
      {s.adoration?.sealedAt&&<p className="small">{t('הפרק נחתם. אפשר לפתוח פרק חדש.','The chapter is sealed. A new one can begin.')}</p>}
    </section>}

    {!wife&&<section className="panel hub" aria-label={t('המחווה היומית','The Daily Tribute')}>
      <p className="eyebrow">{t('המחווה היומית','The Daily Tribute')}</p>
      <h2>{t('תן לה הערצה','Give Her Devotion')}</h2>
      <p>{t('מילה אחת או יותר שמגיעה אליה. היא מחליטה מתי לגלות, ללגום, להעניק או לחתום.','One or more words that reach her. She decides when to reveal, sip, grant, or seal.')}</p>
      <form onSubmit={e=>{const el=e.currentTarget,b=form(e);if(!String(b.text||'').trim())return;setTributeSent(false);void run(async()=>{await action('tribute-queue',{kind:'note',text:String(b.text).trim()});el.reset();setTributeSent(true);});}}>
        <label>{t('המחווה שלך','Your tribute')}<input name="text" required maxLength={4000}/></label>
        <Button disabled={!play}>{t('שליחת מחווה','Send devotion')}</Button>
      </form>
      {tributeSent&&<p className="small" role="status">{t('המחווה נשלחה. היא תגלה אותה כשתרצה.','Sent. She will reveal it when she chooses.')}</p>}
    </section>}
    {wife&&<section className="panel chamberlain" aria-label={t('המשרת האישי','The Chamberlain')}><p className="eyebrow">{t('המשרת האישי','The Chamberlain')}</p><h3>{t('תחילת פרק חדש','Start a New Chapter')}</h3><p>{t('בחרי מילה אחת. המשרת האישי ירכיב פרק בן מספר משימות שיופיע בתור שלך מיד.','Choose one word. The Chamberlain composes a multi-mission chapter that lands in your queue immediately.')}</p>{chapterOpen>0&&<p className="small">{t(`בפרק הפתוח: ${chapterOpen} משימות שעוד לא הוכרעו.`,`Open chapter: ${chapterOpen} missions still undecided.`)}</p>}<div className="chamberlain-controls" role="group">
  {/* Mood buttons - decree types */}
  {[ 'worship', 'tease', 'discipline', 'service', 'rest' ].map(mood=>(
    <Button key={mood} disabled={!play} onClick={()=>void run(()=>action('chamberlain-decree',{mood}))}>
      {t(moodNameHe[mood]||mood,moodNameEn[mood]||mood)}
    </Button>
  ))}
  {/* Season pack selector */}
  {[ 'contract', 'tease', 'rest' ].map(pack=>(
    <Button key={pack} disabled={!play} onClick={()=>void run(()=>action('chamberlain-decree',{mood:'worship',season:pack}))}>
      {t(packNameHe[pack]||pack,packNameEn[pack]||pack)}
    </Button>
  ))}
</div><p className="small dim">{t('אלה ערכות עונה — אפשר להתחיל אותן גם מהפאנל ערכות העונה.','These are season packs — you can also start them from the Season packs panel.')}</p><p className="small dim">{t('הפרק ייכנס לתור שלך מיד. אפשר למסור אותו מיד או לתת לו לחכות לבוקר.','The chapter lands in your queue immediately. Deliver it right away or let it wait until morning.')}</p>{cliffhanger&&<p className="small dim">{t('המכתב למחר','The letter for tomorrow')}: {t(cliffhanger.he,cliffhanger.en)}</p>}</section>}
    {!wife&&(s.wishRequests??[]).some(r=>r.status==='pending')&&<section className="panel"><h2>{t('בקשות משאלות','Wish requests')}</h2>
      {(s.wishRequests??[]).filter(r=>r.status==='pending').map(r=><article key={r.id}><h3>{r.title}</h3><p>{r.cost} {t('נקודות','points')}</p><div className="row"><Button className="primary" disabled={!play} onClick={()=>void run(()=>action('wish-decision',{request:r.id,approve:true}))}>{t('אישור משאלה','Approve wish')}</Button><Button disabled={!play} onClick={()=>void run(()=>action('wish-decision',{request:r.id,approve:false}))}>{t('דחיית משאלה','Decline wish')}</Button></div></article>)}
    </section>}
    {nudgeDue&&!held&&<section className="panel"><p>{t('עבר זמן מאז שהייתם כאן יחד. אפשר לחזור בצעד קטן: הודעה אחת או צ׳ק־אין קצר.','It has been a while since you were together here. You can ease back in with one small step: a message or a short check-in.')}</p><Button onClick={dismissNudge}>{t('לא עכשיו','Not now')}</Button></section>}
    {wife&&<ForYou deck={deck} lang={lang} t={t} play={play} useIdea={useIdea} onSkip={skipDeck}/>}
    {wife&&<NightCard t={t} date={date} label={label} moodLabel={moodLabel} moodOrder={moodOrder} nightMood={nightMood} lastMood={lastMood} chooseMood={chooseMood} sendSteps={sendSteps} play={play} ended={ended} nightBlock={nightBlock} askNight={askNight} saveOpen={saveOpen} setSaveOpen={setSaveOpen} eveningName={eveningName} setEveningName={setEveningName} savedFull={savedFull} saveEvening={saveEvening} savedList={savedList} sendBlock={sendBlock} cap={cap} usedNow={usedNow} limitMessage={limitMessage} askRun={askRun} run={run} action={action} favourite={favourite} nextScheduled={nextScheduled} lastNight={lastNight} nightApproved={nightApproved} nightMissions={nightMissions}/>}
    {wife&&<SeasonPanel s={s} play={play} ended={ended} t={t} run={run} action={action} askSeason={askSeason} askStopSeason={askStopSeason}/>}
    {wife?<>
      {reviewWaiting===0&&reviewDesk}
       <CommandPanel s={s} play={play} t={t} lang={lang} quickAt={quickAt} setQuickAt={setQuickAt} quickBlock={quickBlock} askPreset={askPreset} askQuick={askQuick} run={run} action={action} sayOpen={sayOpen} setSayOpen={setSayOpen} sayText={sayText} setSayText={setSayText} sayDraft={sayDraft} setSayDraft={setSayDraft} sayReady={sayReady}/>
       {paceAndEnd}
      <section className="panel"><h2>{t('הזוהר שלך','Your Glow')}</h2><p className="big-number"><strong>{s?.herPoints??0}</strong> {t('זוהר','Glow')}</p><p className="small">{t('כל הערצה שאת מקבלת מוסיפה זוהר. הזוהר מגיע מהחסד שלך, לא מעבודה שלך.','Every devotion you receive adds Glow. Glow comes from your grace, not from your labor.')}</p>
        <p className="small">{t('המשאלות מנוהלות בלשונית פרסים ומשאלות.','Wishes are managed in the Rewards & wishes tab.')}</p>
      </section>
    {wife&&queen&&<section className="panel queen-level" aria-label={t('התואר שלך','Your title')}>
      <p className="eyebrow">{t('התואר שלך','Your title')}</p>
      <h2>{t(queen.name.he,queen.name.en)}</h2>
      <div className="queen-bar" role="progressbar" aria-label={t('התקדמות לתואר הבא','Progress to the next title')} aria-valuemin={queen.floor} aria-valuemax={queen.next?.at??queen.progress} aria-valuenow={queen.progress}><span style={{width:`${queen.next?Math.min(100,Math.round((queen.progress-queen.floor)/(queen.next.at-queen.floor)*100)):100}%`}}/></div>
      <p className="small">{queen.next?t(`עוד ${queen.toNext} משימות שאושרו עד ${queen.next.name.he}`,`${queen.toNext} more approved tasks to ${queen.next.name.en}`):t('הגעת לתואר הגבוה ביותר.','You have reached the highest title.')}</p>
      {adorationTally&&<p className="small" aria-label={t('הערצה מהבעל','Adoration from him')}>{t('הערצה שלו','His adoration')}: {t(`אהוב ${adorationTally.loved} · אהב ${adorationTally.liked} · בסדר ${adorationTally.ok}`,`loved ${adorationTally.loved} · liked ${adorationTally.liked} · ok ${adorationTally.ok}`)}</p>}
      <p className="small dim">{t('קוסמטי בלבד לעת עתה.','Cosmetic for now.')}</p>
    </section>}
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
     <section className="dashboard-collection" aria-labelledby="dashboard-collection-title">
       <h2 id="dashboard-collection-title">{t('התקדמות משותפת','Shared progress')}</h2>
       {statsPanel}{digestPanel}
       <Garden total={gardenTotal} t={t}/>
     </section>
  </>;
}
