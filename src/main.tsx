import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import { save, stored } from './app-shared';
import { GameApp } from './GameApp';
import './style.css';
import { PublicEntry, type PublicProviders } from './components/PublicEntry';
import { publicCopy } from './i18n';
import './components/public-entrance.css';

function App(){
  const [mode,setMode]=useState<'private'|'public'|null>(null);
  const [providers,setProviders]=useState<PublicProviders>({});
  const [lang,setLang]=useState<'he'|'en'>(()=>stored('hr-language','he'));
  const [configError,setConfigError]=useState(false);
  const t=(key:string)=>publicCopy[key][lang==='he'?0:1];
  const loadMode=()=>{setConfigError(false);void api('/public/config?include=providers').then(data=>{
    setProviders(data.providers ?? {});setMode(data.mode);
  }).catch(error=>{
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
  return <div className={mode==='public'?'public-shell':undefined}>
    <header className={mode==='public'?'public-header':undefined}>
      <a className="brand" href="/" aria-label={t('entranceHome')}><bdi lang="en">HER RULES</bdi></a>
      <button type="button" className="quiet" lang={lang==='he'?'en':'he'} onClick={()=>setLang(lang==='he'?'en':'he')}>{lang==='he'?'English':'עברית'}</button>
    </header>
    <main className={mode==='public'?'public-main':undefined}>
      {mode==='public'?<PublicEntry lang={lang} providers={providers}/>:configError?<div role="alert" className="notice"><p>{t('entranceConnectionError')}</p><button type="button" onClick={loadMode}>{t('entryRetry')}</button></div>:<p role="status">{t('entranceConnecting')}</p>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{/* Server-backed play still works without installation. */});
