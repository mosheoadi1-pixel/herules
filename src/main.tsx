import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { save, stored } from './app-shared';
import { GameApp } from './GameApp';
import { PublicEntry } from './components/PublicEntry';
import './style.css';

function App(){
  const [mode,setMode]=useState<'private'|'public'|null>(null);
  const [lang,setLang]=useState<'he'|'en'>(()=>stored('hr-language','he'));
  const [configError,setConfigError]=useState(false);
  const t=(he:string,en:string)=>lang==='he'?he:en;
  const loadMode=()=>{setConfigError(false);void api('/public/config').then(data=>setMode(data.mode)).catch(error=>{
    if(error.status===404)setMode('private');else setConfigError(true);
  });};
  useEffect(loadMode,[]);
  useEffect(()=>{
    if(mode==='private')return;
    document.documentElement.lang=lang;
    document.documentElement.dir=lang==='he'?'rtl':'ltr';
    save('hr-language',lang);
  },[lang,mode]);
  if(mode==='private')return <GameApp/>;
  return <>
    <header><a className="brand" href="/" aria-label="HER RULES home">HER RULES<span>{t('מרחב פרטי. בחירה משותפת.','PRIVATE SPACE. SHARED CHOICE.')}</span></a>
      <button type="button" className="quiet" onClick={()=>setLang(lang==='he'?'en':'he')}>{lang==='he'?'English':'עברית'}</button></header>
    <main><section className="hero"><p className="eyebrow">THE ART OF CHOOSING TOGETHER</p>
      <h1>{t('הכללים שלה. הקצב שלכם.','Her rules. Your shared pace.')}</h1>
      <p>{t('משחק זוגי למבוגרים, בקצב שלכם. כל משימה היא הזמנה.','A private game for adults, at your pace. Every mission is an invitation.')}</p>
    </section>{mode==='public'?<PublicEntry lang={lang}/>:configError?<div role="alert" className="notice"><p>{t('לא הצלחנו להתחבר למשחק.','We couldn’t connect to the game.')}</p><button type="button" onClick={loadMode}>{t('ניסיון חוזר','Retry')}</button></div>:<p role="status">{t('מתחברים…','Connecting…')}</p>}</main>
  </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{/* Server-backed play still works without installation. */});
