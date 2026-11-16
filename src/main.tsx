import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session, Mission, User, CheckIn } from '../server/app';
import { library as builtInLibrary, ideasForDestination, type Idea } from './library';
import { currentMission } from './guidance';
import { newPartnerUpdates } from './notifications';
import { nightTemplates, setupTags } from './quick';
import { progressStats, careDue, favouriteMood, milestones, reconnectNudgeDue, weeklyRecap, eveningClosed, eveningUsed, EVENING_WINDOW_MS, streakStats, type Mood, type Rating } from './progress';
import { recordQuickUse, topQuickPresets, deckSkips, saveDeckSkips } from './prefs';
import { foryouDeck, type DeckItem } from './foryou';
import { api } from './api';
import { labels, moodNames, ratingNames, serverMessages } from './i18n';
import { form, save, stored, type Draft, type Sheet, type SavedEvening, type State } from './app-shared';
import { BusyContext, Button } from './components/Button';
import { DashboardTab } from './components/Dashboard';
import { HistoryTab, InboxTab, MessagesTab, WhisperBox } from './components/SessionFeeds';
import { LibraryTab } from './components/Library';
import { MissionsTab } from './components/Missions';
import { RewardsTab } from './components/Rewards';
import { WishesTab } from './components/Wishes';
import './style.css';
function App(){
 const [importedIdeas,setImportedIdeas]=useState<Idea[]>([]);
 const library=[...builtInLibrary,...importedIdeas];
 const [lang,setLang]=useState<'he'|'en'>(()=>stored('hr-language','he'));
 const t=(he:string,en:string)=>lang==='he'?he:en;
 const label=(key:string)=>labels[key]?.[lang==='he'?0:1]||key;
 const [state,setState]=useState<State|null>(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[online,setOnline]=useState(true),[busy,setBusy]=useState(false),[unreconciled,setUnreconciled]=useState(false),[unknownOutcome,setUnknownOutcome]=useState(()=>{try{return sessionStorage.getItem('hr-unknown-outcome')==='1';}catch{return false;}});
  const [notificationPermission,setNotificationPermission]=useState(()=>typeof Notification==='undefined'?'unsupported':Notification.permission);
  const navRef=useRef<HTMLElement>(null);
 const knownNotices=useRef<Set<string>|null>(null),noticeUser=useRef('');
  const [tab,setTab]=useState('missions');
 const [now,setNow]=useState(Date.now());
 const [category,setCategory]=useState(''),[intensity,setIntensity]=useState(''),[tag,setTag]=useState(''),[query,setQuery]=useState(''),[onlyFavorites,setOnlyFavorites]=useState(false),[away,setAway]=useState(false);
 const [drawnFollowup,setDrawnFollowup]=useState('');
 const [noPrep,setNoPrep]=useState(false),[quickAt,setQuickAt]=useState('');
 const [favorites,setFavorites]=useState<string[]>(()=>stored('hr-favorites',[])),[recent,setRecent]=useState<string[]>([]);
  const [draft,setDraft]=useState<Draft>({title:'',text:'',points:5,secret:false,completionStyle:'simple'}),[editing,setEditing]=useState('');
  const [rewardDraft,setRewardDraft]=useState({title:'',description:'',cost:''});
  const [composerOpen,setComposerOpen]=useState(false),[sequence,setSequence]=useState<string[]>([]),[autoProgress,setAutoProgress]=useState(false);
  const loading=useRef<Promise<void>|null>(null),pendingRefresh=useRef<Promise<void>|null>(null),mounted=useRef(true),pendingKeys=useRef<Record<string,{payload:string;key:string}>>({}),generation=useRef(0),needsRefresh=useRef(false),unknownRef=useRef(unknownOutcome);
  const setUnknown=(value:boolean)=>{unknownRef.current=value;setUnknownOutcome(value);try{if(value)sessionStorage.setItem('hr-unknown-outcome','1');else sessionStorage.removeItem('hr-unknown-outcome');}catch{/* Storage is optional. */}};
 function retryKey(kind:string,payload:any){const value=JSON.stringify([s?.id,payload]);if(pendingKeys.current[kind]?.payload!==value)pendingKeys.current[kind]={payload:value,key:crypto.randomUUID()};return pendingKeys.current[kind].key;}
  const refresh=():Promise<void>=>{if(loading.current){if(!pendingRefresh.current)pendingRefresh.current=loading.current.then(()=>{pendingRefresh.current=null;return refresh();});return pendingRefresh.current;}const started=generation.current;const request=(async()=>{try{const next=await api('/state');if(mounted.current&&started===generation.current){setState(next);setOnline(true);needsRefresh.current=false;setUnreconciled(false);}}catch(e:any){if(started===generation.current){if(e.status===401){setState(null);needsRefresh.current=false;setUnreconciled(false);}else setOnline(false);}}finally{setReady(true);}})();loading.current=request;void request.finally(()=>{if(loading.current===request)loading.current=null;});return request;};
  const reconcile=()=>{generation.current++;needsRefresh.current=true;setUnreconciled(true);return refresh();};
 useEffect(()=>{mounted.current=true;void refresh();const poll=setInterval(()=>void refresh(),5000),clock=setInterval(()=>setNow(Date.now()),1000);return()=>{mounted.current=false;clearInterval(poll);clearInterval(clock);};},[]);
 useEffect(()=>{const update=()=>setNotificationPermission(typeof Notification==='undefined'?'unsupported':Notification.permission);const visible=()=>{if(document.visibilityState==='visible')update();};window.addEventListener('focus',update);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',visible);};},[]);
  useEffect(()=>{document.documentElement.lang=lang;document.documentElement.dir=lang==='he'?'rtl':'ltr';save('hr-language',lang);},[lang]);
  useEffect(()=>{if(!state?.user.id){setImportedIdeas([]);return;}let active=true;void api('/ideas').then(data=>{if(active)setImportedIdeas(data.ideas);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[state?.user.id,tab]);
  useEffect(()=>{if(!state?.user.pair_id)return;const events=new EventSource('/api/events');events.onmessage=()=>void refresh();events.onerror=()=>setOnline(false);return()=>events.close();},[state?.user.pair_id]);
  useEffect(()=>{
   if(!state){knownNotices.current=null;noticeUser.current='';return;}
   if(noticeUser.current!==state.user.id){noticeUser.current=state.user.id;knownNotices.current=null;}
   const {next,hasUpdate}=newPartnerUpdates(state.sessions,state.user.id,knownNotices.current);knownNotices.current=next;
   if(hasUpdate&&document.hidden&&typeof Notification!=='undefined'&&Notification.permission==='granted')try{new Notification('HER RULES',{body:lang==='he'?'יש עדכון חדש במשחק.':'There is a new game update.',tag:'her-rules-update'});}catch{/* Some browsers do not support window notifications. */}
  },[state,lang]);
   const errorMessage=(e:any,prefix:string)=>serverMessages[e.message]?t(...serverMessages[e.message]):e.message==='Insufficient points'?t('אין מספיק נקודות לאישור הפרס. הבקשה נשארה ממתינה.','Not enough points to approve this reward. The request remains pending.'):e.message?.startsWith('Role occupied')?t('התפקיד כבר תפוס במשחק הפרטי. חזרו לדפדפן ולכתובת שבהם נכנסתם לראשונה. הכינוי אינו משחזר גישה.','That role is already occupied in this private game. Return to the browser and address used for your first entry. A nickname cannot recover access.'):e.message==='Origin rejected'?t(`הבקשה הגיעה מכתובת שונה מכתובת המשחק. פתחו את המשחק מחדש באותה כתובת, או בכתובת הראשית: ${e.expectedOrigin||'הכתובת שהוגדרה בשרת'}.`,`The request came from a different address than the game. Reopen the game at the same address, or at the canonical address: ${e.expectedOrigin||'the configured server address'}.`):prefix+e.message;
  const run=async(fn:()=>Promise<any>):Promise<boolean>=>{if(busy||needsRefresh.current||unknownRef.current)return false;setBusy(true);setError('');let ok=false;try{await fn();ok=true;}catch(e:any){if(e.unknownOutcome)setUnknown(true);setError(errorMessage(e,t('הפעולה לא הושלמה. בדקו הרשאות, הסכמות ומצב מפגש. פרטי שרת: ','Action failed. Check permissions, agreement and session state. Server detail: ')));}finally{await reconcile();setBusy(false);}return ok;};
  const runSafety=async(op:'pause'|'resume'|'stop')=>{setError('');try{await action(op);}catch(e:any){if(e.unknownOutcome)setUnknown(true);setError(errorMessage(e,t('פעולת הבטיחות לא אושרה בשרת. נסו שוב: ','Safety action was not confirmed by the server. Retry: ')));}finally{await reconcile();}};
 const sessions=state?.sessions||[];
 const s=sessions.find(s=>!['stopped','expired'].includes(s.status))||[...sessions].sort((a,b)=>b.last-a.last)[0];
  const u=state?.user,wife=u?.role==='wife',ended=!!s&&['stopped','expired'].includes(s.status),held=!!s&&s.pauses.length>0,play=!!s&&!ended&&!held;
   const ownCheckIn=u?s?.checkIns?.[u.id]:undefined;
   const current=s&&u?currentMission(s,u.role):undefined;
   useEffect(()=>{const nav=navRef.current,button=nav?.querySelector<HTMLElement>('[aria-current="page"]');if(!nav||!button)return;const box=nav.getBoundingClientRect(),item=button.getBoundingClientRect(),left=box.left+nav.clientLeft,right=left+nav.clientWidth;const offset=item.left<left+4?item.left-left-4:item.right>right-4?item.right-right+4:0;if(offset)nav.scrollLeft+=offset;},[tab,lang,s?.id,u?.id]);
   const savedSequence=JSON.stringify(s?.sequence??[]);
   useEffect(()=>{setSequence(JSON.parse(savedSequence));setAutoProgress(s?.autoProgress===true);setComposerOpen(false);setEditing('');setDrawnFollowup('');},[s?.id]);
   useEffect(()=>{setCategory(s?.persona?{strict:'challenges',playful:'teasing',caring:''}[s.persona]:'');},[s?.id,s?.persona]);
   useEffect(()=>{setSequence(JSON.parse(savedSequence));},[savedSequence]);
   useEffect(()=>{setAutoProgress(s?.autoProgress===true);},[s?.autoProgress]);
  const [checkIn,setCheckIn]=useState<CheckIn>({minutes:15,energy:'medium',mood:'connection'});
  useEffect(()=>{setCheckIn(ownCheckIn??{minutes:15,energy:'medium',mood:'connection'});},[s?.id,u?.id,ownCheckIn?.minutes,ownCheckIn?.energy,ownCheckIn?.mood]);
  const ownReflection=u?s?.reflections?.[u.id]:undefined;
  const [reflection,setReflection]=useState({appreciation:'',repeat:''});
  useEffect(()=>{setReflection(ownReflection??{appreciation:'',repeat:''});},[s?.id,u?.id,ownReflection?.appreciation,ownReflection?.repeat]);
   const action=async(op:string,body:any={})=>{const keyed=['mission','message','complete','review','adjust','replace','reward','reward-request','reward-decision','wish-add','wish-request','wish-decision','quick','her-night','evening-close','evening-run','propose','tribute-queue','tribute-reveal','sip','grant','seal','chamberlain-decree','chamberlain-compose','repeat-stop','adore','whisper','whisper-delete','spark-reroll','spark-dismiss'].includes(op);const {key:ignored,...payload}=body;const slot=`${op}:${body.mission||body.reward||body.request||body.idea||''}`;const result=await api(`/sessions/${s!.id}/${op}`,keyed?{...payload,key:retryKey(slot,payload)}:body);if(keyed)delete pendingKeys.current[slot];return result;};
 const destination=tab==='rewards'?'rewards':tab==='punishments'?'consequences':'library';
 const destinationIdeas=ideasForDestination(library,destination,away);
 const filtered=destinationIdeas.filter(i=>(destination!=='library'||!category||i.category===category)&&(!intensity||i.intensity===Number(intensity))&&(!tag||i.tags.includes(tag))&&(!onlyFavorites||favorites.includes(i.id))&&(!noPrep||!i.tags.some(tag=>setupTags.has(tag)))&&`${i.he} ${i.en}`.toLowerCase().includes(query.toLowerCase()));
 function useIdea(i:{id:string;category:string;he:string;en:string}){const text=lang==='he'?i.he:i.en;if(i.category==='rewards'){setRewardDraft({title:text.slice(0,160),description:text,cost:''});document.getElementById('reward-title')?.focus();}else{setDraft({title:text.slice(0,150),text,points:5,secret:i.category==='secret',completionStyle:'simple'});setEditing('');setComposerOpen(true);setTab('missions');setTimeout(()=>document.querySelector<HTMLInputElement>('#mission-composer input')?.focus(),0);}setRecent(v=>[...v.filter(id=>id!==i.id),i.id].slice(-10));}
 const progress=progressStats(s?.missions??[],now),needsCare=careDue(s?.missions??[],s?.lastCareAt);
  const weekly=weeklyRecap(s?.missions??[],now),badges=milestones(progress.total),favourite=favouriteMood(s?.moodCounts);
  const visibleMissions=sessions.flatMap(session=>session.missions);
  const streaks={devotion:streakStats(visibleMissions.filter(m=>m.status==='approved').map(m=>m.approvedAt??0),now),mission:streakStats(visibleMissions.map(m=>m.deliveredAt??0),now)};
  const [deckSkipState,setDeckSkipState]=useState(()=>deckSkips());
  const skipDeck=(id:string)=>{const next={...deckSkipState,[id]:Date.now()};saveDeckSkips(next);setDeckSkipState(next);};
  const deck:DeckItem[]=wife&&s?foryouDeck(library,s,{lang,now,skips:deckSkipState,energy:ownCheckIn?.energy,recent}):[];
  const gardenTotal=sessions.reduce((sum,session)=>sum+session.missions.filter(m=>m.status==='approved').length,0);
  const [nightMood,setNightMood]=useState<Mood|''>(''),[nudgeDismissedAt,setNudgeDismissedAt]=useState<number>(()=>stored('hr-nudge-dismissed',0));
  const nudgeDue=reconnectNudgeDue(s,now,nudgeDismissedAt);
   const [lastMood,setLastMood]=useState<Mood|''>(()=>{const value=stored('hr-last-mood','');return value==='soft'||value==='playful'||value==='strict'?value:'';});
   const [contrast,setContrast]=useState(()=>stored('hr-contrast',false)===true),[keysHintSeen,setKeysHintSeen]=useState(()=>stored('hr-keys-hint',false)===true);
   const [sheet,setSheet]=useState<Sheet|null>(null),sheetRef=useRef<HTMLDialogElement>(null);
   const [sayOpen,setSayOpen]=useState(false),[sayText,setSayText]=useState(''),[sayDraft,setSayDraft]=useState<{title:string;text:string;points:number}|null>(null);
   const [eveningName,setEveningName]=useState(''),[saveOpen,setSaveOpen]=useState(false);
   const cap=s?.pace??3,usedNow=eveningUsed(s?.missions??[],now),closedNow=!!s&&eveningClosed(s,now),windowHours=EVENING_WINDOW_MS/3600000,reopenHours=Math.ceil(((s?.eveningClosedAt??now)+EVENING_WINDOW_MS-now)/3600000),savedList=s?.savedEvenings??[],savedFull=savedList.length>=20;
   const sendBlock=!s?t('אין מפגש פעיל.','No active session.'):ended?t('המפגש הסתיים.','The session has ended.'):held?t('המשחק מושהה. השליחה תחזור כשהמשחק פעיל.','The game is paused. Sending resumes when the game is active.'):closedNow?t('הערב נסגר. ייפתח מחדש אוטומטית.','The evening is closed. It reopens automatically.'):null;
   const limitMessage=t('הגעת למכסת הפקודות לערב. שני את הקצב כדי להמשיך.','Evening limit reached for the current pace. Change the pace to continue.'),pastMessage=t('אפשר לתזמן רק לשעה עתידית.','Choose a time in the future.');
    const quickAtMs=quickAt?new Date(quickAt).getTime():NaN,schedulePast=Number.isFinite(quickAtMs)&&quickAtMs<=Date.now();
    const quickBlock=sendBlock??(schedulePast?pastMessage:usedNow>=cap?t(`הגעת למכסת הפקודות לערב (${usedNow} מתוך ${cap}). הספירה מתעדכנת לפי ${windowHours} השעות האחרונות.`,`You have reached this evening's command limit (${usedNow} of ${cap}). The count covers the last ${windowHours} hours.`):null);
   const sayReady=!!sayDraft&&sayDraft.title.trim().length>0&&sayDraft.text.trim().length>0&&sayDraft.title.trim().length<=160&&sayDraft.text.trim().length<=160&&Number.isInteger(sayDraft.points)&&sayDraft.points>=0&&sayDraft.points<=100;
   const nightSteps=(mood:Mood)=>nightTemplates[mood].slice(0,cap).map((step,index)=>({he:step.he,en:step.en,points:step.points,minutesFromNow:index*30}));
    const eveningLeft=Math.max(0,cap-usedNow),sendSteps=(mood:Mood)=>nightSteps(mood).slice(0,eveningLeft);
    const nightBlock=sendBlock??(eveningLeft<=0?limitMessage:null);
   const offsetLabel=(minutes:number)=>minutes<=0?t('מיד','Now'):t(`+${minutes} דקות`,`+${minutes} min`);
   const moodOrder=(['soft','playful','strict'] as Mood[]).sort((a,b)=>(a===lastMood?-1:0)-(b===lastMood?-1:0));
   const barPresets=topQuickPresets(3);
   const toggleContrast=()=>{const next=!contrast;setContrast(next);save('hr-contrast',next);};
   const chooseMood=(mood:Mood)=>{if(nightMood===mood){setNightMood('');setSaveOpen(false);return;}setNightMood(mood);setLastMood(mood);save('hr-last-mood',mood);setSaveOpen(false);};
   const choosePace=(pace:1|2|3,done?:()=>void)=>void run(async()=>{await action('pace',{commandsPerEvening:pace});done?.();});
   const finishOnboarding=(pace:1|2|3)=>choosePace(pace);
   const askQuick=(title:string,text:string,points:number,body:Record<string,unknown>,preset?:string,done?:()=>void)=>{if(schedulePast)return;
     const at=quickAt?new Date(quickAt).getTime():NaN,scheduled=Number.isFinite(at);
     setSheet({title:t('לשלוח את הפקודה?','Send this command?'),intro:scheduled?t(`ההזמנה תישלח אוטומטית ב-${date(at)}. עד אז אפשר לבטלה בתור ההזמנות.`,`It will be sent automatically at ${date(at)}. Until then you can cancel it in the invitations.`):t('זו ההזמנה שהוא יראה, כולל הנקודות.','This is the invitation he will see, including points.'),steps:[{title,text,points,offset:scheduled?offsetLabel(Math.round((at-now)/60000)):offsetLabel(0)}],confirm:t('שליחה','Send'),onConfirm:()=>sendQuick(body,preset,done)});
   };
   const askPreset=(p:{id:string;he:string;en:string;points:number})=>{const text=lang==='he'?p.he:p.en;askQuick(text,text,p.points,{preset:p.id},p.id);};
   const askNight=(mood:Mood)=>{const steps=sendSteps(mood),full=nightTemplates[mood].length;setSheet({title:t('לשלוח את הערב?','Send this evening?'),intro:`${t('אלה הצעדים שהוא יראה, לפי הזמנים המוצגים.','These are the steps he will see, at the times shown.')}${steps.length<full?t(` בקצב הנוכחי נשלחים ${steps.length} מתוך ${full} צעדים.`,` At the current pace, ${steps.length} of ${full} steps are sent.`):''}`,steps:steps.map(step=>({title:t(step.he,step.en),points:step.points,offset:offsetLabel(step.minutesFromNow)})),confirm:t('שליחה','Send'),onConfirm:()=>void run(async()=>{await action('her-night',{mood,lang,steps});setNightMood('');})});};
   const askRun=(evening:SavedEvening)=>setSheet({title:t('להפעיל את הערב השמור?','Run this saved evening?'),intro:t('אלה הצעדים שהוא יראה, לפי הזמנים המוצגים.','These are the steps he will see, at the times shown.'),steps:evening.steps.map(step=>({title:t(step.he,step.en),points:step.points,offset:offsetLabel(step.minutesFromNow)})),confirm:t('הפעלה','Run'),onConfirm:()=>void run(()=>action('evening-run',{evening:evening.id,lang}))});
   const askClose=()=>{const queued=(s?.missions??[]).filter(m=>m.status==='queued').length;setSheet({title:t('לסיים את הערב?','Finish tonight?'),intro:`${queued===0?t('אין הזמנות מתוזמנות שיבוטלו.','No scheduled invitations will be cancelled.'):queued===1?t('תבוטל הזמנה מתוזמנת אחת.','One scheduled invitation will be cancelled.'):t(`יבוטלו ${queued} הזמנות מתוזמנות.`,`${queued} scheduled invitations will be cancelled.`)} ${t(`לא ניתן יהיה לשלוח הזמנות למשך ${windowHours} שעות.`,`Nothing can be sent for ${windowHours} hours.`)}`,confirm:t('סיום הערב','Finish tonight'),onConfirm:()=>void run(()=>action('evening-close',{}))});};
   const saveEvening=()=>{const name=eveningName.trim(),mood=nightMood;if(!name||!mood||savedFull)return;const steps=nightSteps(mood);void run(async()=>{await action('evening-save',{name,mood,steps});setEveningName('');setSaveOpen(false);});};
   useEffect(()=>{const el=sheetRef.current;if(!el)return;if(sheet&&!el.open)el.showModal();else if(!sheet&&el.open)el.close();},[sheet]);
   useEffect(()=>{
     if(!wife||tab!=='dashboard')return;
     const onKey=(event:KeyboardEvent)=>{
       if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey)return;
       const target=event.target as HTMLElement|null;
       if(target?.closest?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
       if(event.key==='n'||event.key==='N'){event.preventDefault();setSayOpen(true);setTimeout(()=>document.getElementById('say-it-input')?.focus(),0);}
       else if(['1','2','3'].includes(event.key)&&play){const mood=moodOrder[Number(event.key)-1];if(mood)chooseMood(mood);}
     };
     window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
   },[wife,tab,play,lastMood,nightMood]);
  const notes=s?.notes??[],notesFull=notes.length>=50;
  const lastNight=s?.nights?.[(s?.nights?.length??0)-1];
  const nightMissions=(lastNight?.missionIds??[]).map(id=>s?.missions.find(m=>m.id===id)).filter((m):m is Mission=>m!==undefined);
  const nightApproved=nightMissions.filter(m=>m.status==='approved').length;
  const recentApproved=[...(s?.missions??[])].filter(m=>m.status==='approved').sort((a,b)=>(b.approvedAt??0)-(a.approvedAt??0)).slice(0,5);
  const nextScheduled=(s?.missions??[]).filter(m=>m.status==='queued'&&m.scheduledAt).sort((a,b)=>(a.scheduledAt??0)-(b.scheduledAt??0))[0];
  const moodLabel=(mood:Mood)=>t(moodNames[mood][0],moodNames[mood][1]),ratingLabel=(rating:Rating)=>t(ratingNames[rating][0],ratingNames[rating][1]);
    const dismissNudge=()=>{const at=Date.now();save('hr-nudge-dismissed',at);setNudgeDismissedAt(at);};
  
 const awaitingReview=(s?.missions??[]).filter(m=>m.status==='submitted'),pendingRewards=(s?.rewardRequests??[]).filter(r=>r.status==='pending');
 const sendQuick=(body:Record<string,unknown>,preset?:string,done?:()=>void)=>{const at=quickAt?new Date(quickAt).getTime():NaN;if(Number.isFinite(at)&&at<=Date.now()){setError(pastMessage);return;}void run(()=>action('quick',{...body,lang,...(Number.isFinite(at)?{scheduledAt:at}:{})})).then(ok=>{if(ok){if(preset)recordQuickUse(preset);done?.();}});};
 const date=(at:number)=>new Date(at).toLocaleString(lang==='he'?'he-IL':'en-GB');
 const displayName=(id:string)=>id==='server'?t('השרת','Server'):id===u?.id?t('אני','Me'):t('השותף/ה','Partner');
  const Hero=u?'details':'section';
   const nextStep=ended?t('המפגש הסתיים. אפשר לשתף מה היה נעים ומה נרצה לחזור עליו; מפגש חדש נפתח אוטומטית. ההזמנות וההיסטוריה נשארות לעיון.','This session has ended. Reflect on what felt good and what to repeat; a new session opens automatically. Invitations and history remain available.'):
    held?(s?.pauses.includes(u?.id??'')?t('ההשהיה שלך פעילה. רק לך אפשרות לשחרר אותה בכפתור הבטיחות; השהיית השותף/ה נשארת עצמאית.','Your pause is active. Only you can release it using the safety control; your partner’s pause stays independent.'):t('ממתינים לשותף/ה ששומר/ת על ההשהיה. רק מי שהשהה יכול לשחרר אותה.','Waiting on your partner’s pause. Only its owner can release it.')):
    !current?(wife?t('בחרי הזמנה קטנה או פתחי את העורך ליצירת טיוטה.','Choose a small invitation or open the composer to draft one.'):t('ממתינים להזמנה מהאישה. אפשר בינתיים לשוחח או לשתף צ׳ק־אין.','Waiting for an invitation from your wife. You can chat or share a check-in.')):
    current.status==='draft'?(wife?t('בדקי את הטיוטה, ערכי או שלחי רק כשתבחרי.','Review the draft, edit or send only when you choose.'):t('ממתינים שהאישה תבחר לשלוח את הטיוטה.','Waiting for your wife to choose to send the draft.')):
    current.status==='queued'?t('ההזמנה מתוזמנת. ממתינים למועד המסירה; אין קבלה אוטומטית.','The invitation is scheduled. Waiting for delivery time; acknowledgement is never automatic.'):
    current.status==='pending'?(wife?t('ממתינים לבחירת הבעל: קבלה, התאמה או סירוב.','Waiting for your husband to acknowledge, request adjustment or decline.'):t('קרא את ההזמנה ובחר: קבלה, התאמה או סירוב חופשי.','Read the invitation and choose: acknowledge, request adjustment or freely decline.')):
    current.status==='adjustment'?(wife?t('התבקשה התאמה. נסחי טיוטה חלופית לבדיקה וקבלה חדשות.','An adjustment was requested. Author a replacement for fresh review and acknowledgement.'):t('ממתינים לטיוטה חלופית מהאישה. אין צורך לבצע את המקור.','Waiting for a replacement from your wife. You need not complete the original.')):
    current.status==='submitted'?(wife?t('קראי את הביצוע שנשלח ובחרי אישור או החזרה לתיקון.','Read the submitted completion and choose approval or return for revision.'):t('הביצוע נשלח. ממתינים לבדיקה של האישה.','Completion submitted. Waiting for your wife’s review.')):
    wife?t('ממתינים לביצוע מרצון של הבעל; אפשר תמיד להשהות.','Waiting for your husband’s voluntary completion; pausing remains available.'):current.completionStyle==='simple'?t('אם מתאים לך וסיימת, בחר סיימתי לבדיקה. אפשר גם לבקש התאמה או לסרב.','If it suits you and you are finished, choose Done for review. You can also request adjustment or decline.'):t('אם מתאים לך, שתף ביצוע כתוב. אפשר גם לבקש התאמה או לסרב.','If it suits you, share a written completion. You can also request adjustment or decline.');
   return <BusyContext.Provider value={busy||unreconciled||unknownOutcome}><><header><a className="brand" href="/" aria-label="HER RULES home">HER RULES<span>{t('מרחב פרטי. בחירה משותפת.','PRIVATE SPACE. SHARED CHOICE.')}</span></a><div className="row"><button className="quiet" onClick={()=>setLang(lang==='he'?'en':'he')}>{lang==='he'?'English':'עברית'}</button>{u&&<Button className="quiet" onClick={()=>{void run(async()=>{await api('/logout',{});setState(null);setDraft({title:'',text:'',points:5,secret:false});});}}>{t('יציאה','Sign out')}</Button>}</div></header>
  <main className={[u?(wife?'role-wife':'role-husband'):'',s?.persona?`persona-${s.persona}`:'',contrast?'hc':'',wife&&s&&tab==='dashboard'?'has-quick-bar':''].filter(Boolean).join(' ')||undefined}><Hero className={u?'hero compact':'hero'}>{u&&<summary>{t('הבחירה המשותפת שלנו','Our shared choice')}</summary>}<p className="eyebrow">THE ART OF CHOOSING TOGETHER</p><h1>{t('הכללים שלה. הקצב שלכם.','Her rules. Your shared pace.')}</h1><p>{t('משחק זוגי למבוגרים, בקצב שלכם. כל משימה היא הזמנה; סירוב, השהיה ועצירה תמיד חופשיים וללא קנס.','A private game for adults, at your pace. Every mission is an invitation; refusal, pause and stop are always free of penalty.')}</p></Hero>
 <div role="status" aria-live="polite">{unreconciled?<p className="notice">{t('ממתינים לעדכון חדש מהשרת לפני פעולות נוספות. ננסה שוב אוטומטית; פעולות הבטיחות זמינות.','Waiting for a fresh server update before further actions. Retrying automatically; safety controls remain available.')}</p>:!online&&<p className="notice">{t('החיבור אינו עדכני. הפעולות דורשות שרת; מתבצע ניסיון רענון כל חמש שניות.','Connection is stale. Actions require the server; refreshing every five seconds.')}</p>}</div>
 {unknownOutcome&&<div className="notice" role="alert"><p>{t('ייתכן שהפעולה שפג לה הזמן תושלם גם אחרי רענון. אי אפשר לקבוע אם הושלמה; ניסיון חוזר עלול ליצור כפילות. מפתחות ניסיון חוזר אינם נשמרים לאחר טעינה מחדש. בדקו בזהירות לפני המשך. פעולות בטיחות נשארות זמינות.','The timed-out action may still complete after a refresh. Its outcome is unknown; repeating it can duplicate the action. Retry keys are lost on reload. Review carefully before continuing. Safety controls remain available.')}</p><button disabled={busy||unreconciled} onClick={()=>setUnknown(false)}>{t('אני מבינ/ה את הסיכון; פתיחת פעולות','I understand the risk; unlock actions')}</button></div>}
 {error&&<p className="error" role="alert">{error}<button className="quiet" onClick={()=>setError('')}>{t('סגירה','Dismiss')}</button></p>}
  {!ready?<p>{t('מתחברים…','Connecting…')}</p>:!u?<section className="panel auth">
    <p className="eyebrow">YOUR PRIVATE ENTRANCE</p>
    <h2>{t('בחרו תפקיד והיכנסו','Choose a role and enter')}</h2>
    <p>{t('משחק פרטי אחד. שני תפקידים. נכנסים ומתחברים אוטומטית — בלי קוד הזמנה.','One private game. Two roles. Enter and join automatically — no invitation code.')}</p>
    <p className="notice">{t('כל כניסה לאותו תפקיד חוזרת לאותה זהות, מכל דפדפן. שמרו את כתובת המשחק פרטית.','Every entry to a role returns to the same identity, from any browser. Keep the game address private.')}</p>
    <form onSubmit={e=>{const b=form(e);void run(()=>api('/guest',{...b,adult:b.adult==='on'}));}}>
        <label>{t('תפקיד','Role')}<select name="role"><option value="wife">{t('האישה — ניהול משימות','Wife — directs missions')}</option><option value="husband">{t('הבעל — קבלת משימות','Husband — receives missions')}</option></select></label>
        <label className="check"><input name="adult" type="checkbox" required/>{t('אני בגיר/ה (18+) ומשתתפ/ת מרצוני. לכל משתתף דפדפן וזהות נפרדים.','I am an adult (18+) participating freely. Each participant uses a separate browser and identity.')}</label>
      <Button className="primary">{t('כניסה','Enter')}</Button>
    </form>
  </section>:<>
  <div className="account"><bdi>{u.nickname??u.email}</bdi><span>{wife?t('האישה · מנהלת המשחק','Wife · game director'):t('הבעל · משתתף','Husband · participant')}</span><span className={online?'badge':'badge warning'}>{online?t('מחובר · עדכון עד 5 שניות','Connected · refresh ≤5s'):t('ממתין לחיבור','Reconnecting')}</span><span role="status">{notificationPermission==='granted'?t('התראות מופעלות','Notifications enabled'):notificationPermission==='denied'?t('התראות חסומות. אפשר לשנות בהגדרות האתר בדפדפן.','Notifications blocked. Change this in your browser’s site settings.'):notificationPermission==='unsupported'?t('הדפדפן אינו תומך בהתראות.','Notifications are not supported in this browser.'):t('התראות אינן מופעלות עדיין.','Notifications are not enabled yet.')}</span>{notificationPermission==='default'&&<button type="button" className="quiet" onClick={()=>void Notification.requestPermission().then(setNotificationPermission).catch(()=>setNotificationPermission(Notification.permission))}>{t('הפעלת התראות','Enable notifications')}</button>}<button type="button" className="quiet" aria-pressed={contrast} onClick={toggleContrast}>{t('ניגודיות גבוהה','High contrast')}</button></div>
  {!u.pair_id?<section className="panel"><h2>{t('ממתינים לשחקן השני','Waiting for the second player')}</h2><p>{t('התפקיד שלך נשמר. השותף/ה פותח/ת את אותה כתובת ובוחר/ת בתפקיד השני; המשחק המשותף ייפתח אוטומטית. אין צורך בהזמנה או בקוד חיבור.','Your role is reserved. Your partner opens the same address and chooses the other role; the shared game opens automatically. No invitation or connection code is needed.')}</p></section>:<>
 {s&&<>
 <section className="panel next-step" aria-label={t('הצעד הבא','Next step')}><div className="row between"><h2>{t('הצעד הבא שלנו','Our next step')}</h2>{!ended&&<button type="button" className="quiet" aria-pressed={s.pauses.includes(u.id)} onClick={()=>void runSafety(s.pauses.includes(u.id)?'resume':'pause')}>{s.pauses.includes(u.id)?t('שחרור ההשהיה שלי','Release my pause'):t('השהיה אישית','Pause my play')}</button>}{!ended&&<button type="button" className="danger" onClick={()=>{if(confirm(t('לעצור את המפגש לצמיתות? לא ניתן לחדש אותו.','Stop this session permanently? It cannot be resumed.')))void runSafety('stop');}}>{t('עצירה לצמיתות','Stop permanently')}</button>}</div><p>{nextStep}</p>{ended&&<div className="row"><Button onClick={()=>document.getElementById('reflection-appreciation')?.focus()}>{t('לשיתוף על המפגש','Reflect on this session')}</Button></div>}{current&&tab!=='missions'&&<Button onClick={()=>{setTab('missions');setTimeout(()=>document.getElementById(`mission-${current.id}`)?.focus(),0);}}>{t('להזמנה הנוכחית','View current invitation')}</Button>}</section>
  <nav ref={navRef} aria-label={t('אזורי המפגש','Session areas')}>{[['missions','משימות','Missions'],['dashboard','לוח מעקב','Dashboard'],['rewards','פרסים','Rewards'],['wishes','משאלות','Her wishes'],...(wife?[['library','ספריית השראה','Idea library'],['punishments','השראת עונשים','Punishments inspiration']]:[]),['messages','שיחה','Messages'],['inbox','תיבת עדכונים','Inbox'],['history','היסטוריה','History']].map(([id,he,en])=><button key={id} aria-current={tab===id?'page':undefined} className={tab===id?'active':''} onClick={()=>{setTab(id);setIntensity('');setTag('');setQuery('');setOnlyFavorites(false);setNoPrep(false);}}>{t(he,en)}{id==='inbox'&&` (${s.inbox.filter(n=>!n.readBy.includes(u.id)).length})`}</button>)}</nav>
  {tab==='dashboard'&&<DashboardTab s={s} u={u} wife={wife} ended={ended} held={held} play={play} now={now} lang={lang} t={t} date={date} label={label} run={run} action={action} nudgeDue={nudgeDue} dismissNudge={dismissNudge} progress={progress} weekly={weekly} badges={badges} streaks={streaks} queen={state?.queenLevel} digest={state?.digest} adorationTally={state?.adorationTally} spark={state?.spark} ratingLabel={ratingLabel} moodLabel={moodLabel} favourite={favourite} nextScheduled={nextScheduled} notes={notes} notesFull={notesFull} awaitingReview={awaitingReview} pendingRewards={pendingRewards} recentApproved={recentApproved} needsCare={needsCare} keysHintSeen={keysHintSeen} setKeysHintSeen={setKeysHintSeen} moodOrder={moodOrder} nightMood={nightMood} lastMood={lastMood} chooseMood={chooseMood} sendSteps={sendSteps} nightBlock={nightBlock} askNight={askNight} saveOpen={saveOpen} setSaveOpen={setSaveOpen} eveningName={eveningName} setEveningName={setEveningName} savedFull={savedFull} saveEvening={saveEvening} savedList={savedList} sendBlock={sendBlock} cap={cap} usedNow={usedNow} limitMessage={limitMessage} askRun={askRun} lastNight={lastNight} nightApproved={nightApproved} nightMissions={nightMissions} choosePace={choosePace} finishOnboarding={finishOnboarding} closedNow={closedNow} windowHours={windowHours} reopenHours={reopenHours} askClose={askClose} quickBlock={quickBlock} barPresets={barPresets} askPreset={askPreset} quickAt={quickAt} setQuickAt={setQuickAt} askQuick={askQuick} sayOpen={sayOpen} setSayOpen={setSayOpen} sayText={sayText} setSayText={setSayText} sayDraft={sayDraft} setSayDraft={setSayDraft} sayReady={sayReady} deck={deck} skipDeck={skipDeck} gardenTotal={gardenTotal} useIdea={useIdea}/>}
  {tab==='wishes'&&<WishesTab s={s} play={play} wife={wife} busy={busy} unreconciled={unreconciled} lang={lang} t={t} run={run} action={action}/>}
  {tab==='rewards'&&<RewardsTab s={s} play={play} wife={wife} busy={busy} unreconciled={unreconciled} rewardDraft={rewardDraft} setRewardDraft={setRewardDraft} setTab={setTab} setComposerOpen={setComposerOpen} t={t} run={run} action={action}/>}

  {tab==='missions'&&<MissionsTab s={s} u={u} wife={wife} play={play} current={current} lang={lang} t={t} label={label} date={date} run={run} action={action} editing={editing} setEditing={setEditing} draft={draft} setDraft={setDraft} composerOpen={composerOpen} setComposerOpen={setComposerOpen} setTab={setTab} sequence={sequence} setSequence={setSequence} autoProgress={autoProgress} setAutoProgress={setAutoProgress} drawnFollowup={drawnFollowup} setDrawnFollowup={setDrawnFollowup}/>}
  {['library','rewards','punishments'].includes(tab)&&wife&&<LibraryTab tab={tab} s={s} t={t} lang={lang} label={label} library={library} destinationIdeas={destinationIdeas} filtered={filtered} category={category} setCategory={setCategory} intensity={intensity} setIntensity={setIntensity} tag={tag} setTag={setTag} query={query} setQuery={setQuery} noPrep={noPrep} setNoPrep={setNoPrep} away={away} setAway={setAway} onlyFavorites={onlyFavorites} setOnlyFavorites={setOnlyFavorites} favorites={favorites} setFavorites={setFavorites} recent={recent} useIdea={useIdea} setError={setError}/>}
  {tab==='messages'&&<><MessagesTab s={s} u={u} ended={ended} t={t} date={date} displayName={displayName} run={run} action={action}/><WhisperBox s={s} wife={wife} ended={ended} t={t} date={date} run={run} action={action} useWhisper={text=>{setDraft({title:text.slice(0,150),text,points:5,secret:false,completionStyle:'simple'});setEditing('');setComposerOpen(true);setTab('missions');setTimeout(()=>document.querySelector<HTMLInputElement>('#mission-composer input')?.focus(),0);}}/></>}
  {tab==='inbox'&&<InboxTab s={s} u={u} t={t} label={label} date={date} run={run} action={action}/>}
  {tab==='history'&&<HistoryTab s={s} t={t} label={label} date={date} displayName={displayName}/>}
  <details className="panel" aria-label={t('צ׳ק־אין משותף','Shared check-in')}><summary><h2>{t('איך אנחנו עכשיו?','How are we right now?')}</h2></summary><p>{t('לא חובה. שניכם רואים את התשובות; זו אינה הסכמה או תנאי למשחק. אפשר לעדכן גם בהשהיה.','Optional. Both see the answers; this is not consent or a requirement to play. Updates are welcome during holds.')}</p>
    <div className="row">{[u.id,...Object.keys(s.checkIns??{}).filter(id=>id!==u.id)].map(id=>{const entry=s.checkIns?.[id];return <p key={id}><strong>{displayName(id)}</strong>: {entry?`${entry.minutes} ${t('דקות','minutes')} · ${t('אנרגיה','Energy')}: ${label(entry.energy)} · ${t('מצב רוח','Mood')}: ${label(entry.mood)}`:t('עדיין לא שותף','Not shared yet')}</p>;})}{!Object.keys(s.checkIns??{}).some(id=>id!==u.id)&&<p><strong>{t('השותף/ה','Partner')}</strong>: {t('עדיין לא שותף','Not shared yet')}</p>}</div>
    <form onSubmit={e=>{e.preventDefault();void run(()=>action('checkin',checkIn));}}><fieldset disabled={busy||unreconciled||ended}><legend>{t('הצ׳ק־אין שלי','My check-in')}</legend><div className="row">
      <label>{t('דקות פנויות','Available minutes')}<input type="number" min={1} max={1440} step={1} required value={checkIn.minutes} onChange={e=>setCheckIn({...checkIn,minutes:Number(e.target.value)})}/></label>
      <label>{t('אנרגיה','Energy')}<select value={checkIn.energy} onChange={e=>setCheckIn({...checkIn,energy:e.target.value as CheckIn['energy']})}>{(['low','medium','high'] as const).map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>
      <label>{t('מצב רוח','Mood')}<select value={checkIn.mood} onChange={e=>setCheckIn({...checkIn,mood:e.target.value as CheckIn['mood']})}>{(['connection','playful','quiet'] as const).map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>
    </div><Button>{t('שמירת הצ׳ק־אין שלי','Save my check-in')}</Button></fieldset></form>
  </details>
  </>}
  {s&&<details className="panel reflection" open={ended||undefined} aria-label={t('שיתוף סיום אופציונלי','Optional closing reflection')}><summary><h2>{ended?t('המפגש הסתיים — רגע לסיום','Session ended — a moment to close'):t('רגע של הערכה (לא חובה)','A moment of appreciation (optional)')}</h2></summary><p>{t('אפשר לשתף עכשיו או לאחר הסיום..','Share now or after ending, or skip it. Appreciation is never required; sharing does not change time, missions or points.')}</p>{Object.entries(s.reflections??{}).map(([id,value])=><div key={id}><strong>{displayName(id)}</strong>{value.appreciation&&<p className="preserve">{t('הערכה','Appreciation')}: {value.appreciation}</p>}{value.repeat&&<p className="preserve">{t('לפעם הבאה','Next time')}: {value.repeat}</p>}</div>)}<form onSubmit={e=>{e.preventDefault();void run(()=>action('reflection',reflection));}}><fieldset disabled={busy||unreconciled}><legend>{t('השיתוף שלי','My reflection')}</legend><label htmlFor="reflection-appreciation">{t('הערכה (לא חובה)','Appreciation (optional)')}</label><textarea id="reflection-appreciation" maxLength={1000} value={reflection.appreciation} onChange={e=>setReflection({...reflection,appreciation:e.target.value})}/><label htmlFor="reflection-repeat">{t('מה נרצה לחזור עליו (לא חובה)','Repeat next time (optional)')}</label><textarea id="reflection-repeat" maxLength={1000} value={reflection.repeat} onChange={e=>setReflection({...reflection,repeat:e.target.value})}/><Button disabled={!reflection.appreciation.trim()&&!reflection.repeat.trim()}>{t('שמירת השיתוף שלי','Save my reflection')}</Button></fieldset></form></details>}
  </>}
  </>}
 <dialog ref={sheetRef} className="sheet" aria-labelledby="sheet-title" onClose={()=>setSheet(null)}>{sheet&&<>
    <h2 id="sheet-title">{sheet.title}</h2>
    {sheet.intro&&<p>{sheet.intro}</p>}
    {sheet.steps&&<ol className="sheet-steps">{sheet.steps.map((step,index)=><li key={index}><strong>{step.offset}</strong> · {step.title}{step.text&&step.text!==step.title&&<p className="preserve small">{step.text}</p>}<span className="small">{step.points} {t('נק׳','pts')}</span></li>)}</ol>}
    <div className="row"><button type="button" autoFocus onClick={()=>setSheet(null)}>{t('ביטול','Cancel')}</button><Button className="primary" onClick={()=>{const confirm=sheet.onConfirm;setSheet(null);confirm();}}>{sheet.confirm}</Button></div>
  </>}</dialog>
  <footer><span>HER RULES · {t('הבחירה נשארת בידיים שלכם','Your choice, always')}</span><p>{t('ללא העלאת מדיה, התראות דחיפה או משחק מסתעף. אין הבטחת התראה כשהאפליקציה סגורה.','No media uploads, push notifications or branching gameplay. Delivery alerts are not guaranteed while the app is closed.')}</p><a href="/legacy/">{t('','Legacy local demo — simulated identities and consent')}</a></footer></main></></BusyContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{/* Server-backed play still works without installation. */});
