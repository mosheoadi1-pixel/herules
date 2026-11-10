import React, { useEffect, useRef, useState } from 'react';
import type { Idea } from './library';
import { spinAngle } from './wheelMath';

export function Roulette({ideas,lang,onChoose}:{ideas:Idea[];lang:'he'|'en';onChoose:(idea:Idea)=>void}) {
 const [angle,setAngle]=useState(0),[spinning,setSpinning]=useState(false),[result,setResult]=useState<Idea|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),pending=useRef<Idea|null>(null),dialog=useRef<HTMLDialogElement>(null),spinButton=useRef<HTMLButtonElement>(null);
 const t=(he:string,en:string)=>lang==='he'?he:en;
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const change=()=>{if(media.matches&&pending.current){if(timer.current)clearTimeout(timer.current);timer.current=null;setResult(pending.current);pending.current=null;setSpinning(false);}};media.addEventListener('change',change);return()=>{media.removeEventListener('change',change);if(timer.current)clearTimeout(timer.current);};},[]);
 useEffect(()=>{if(result&&!dialog.current?.open)dialog.current?.showModal();},[result]);
 function close(){dialog.current?.close();setResult(null);spinButton.current?.focus();}
 function spin(){
  if(!ideas.length||spinning)return;
  const index=Math.floor(Math.random()*ideas.length),idea=ideas[index];
  setResult(null);setAngle(value=>spinAngle(value,index%8,8));
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setResult(idea);return;}
  pending.current=idea;setSpinning(true);timer.current=setTimeout(()=>{setResult(idea);pending.current=null;setSpinning(false);timer.current=null;},4000);
 }
 const colors=['#78364d','#b36b73','#694154','#c18c77','#514057','#9a5262'];
 return <div className="roulette">
  <h3>{t('גלגל רעיונות לבחירה','Optional idea wheel')}</h3>
  <p>{t('הגרלה מכל רעיונות העונשים, ללא קשר למסננים. הבחירה להשתתף חופשית.','Draw from all punishment ideas, regardless of filters. Participation is optional.')}</p>
  <div className="roulette-stage" aria-hidden="true"><div className="roulette-pointer"/><svg className="roulette-wheel" viewBox="-100 -100 200 200" style={{transform:`rotate(${angle}deg)`}}>
   {Array.from({length:8},(_,index)=>{const start=index*Math.PI/4-Math.PI/2,end=(index+1)*Math.PI/4-Math.PI/2;return <path key={index} d={`M 0 0 L ${100*Math.cos(start)} ${100*Math.sin(start)} A 100 100 0 0 1 ${100*Math.cos(end)} ${100*Math.sin(end)} Z`} fill={colors[index%colors.length]} stroke="#f4dfcc" strokeWidth=".6"/>;})}<circle r="8" fill="#f4dfcc"/>
  </svg></div>
  {!ideas.length&&<p role="status">{t('אין רעיונות זמינים.','No ideas are available.')}</p>}
  <button ref={spinButton} type="button" className="gold" disabled={!ideas.length||spinning} onClick={spin}>{spinning?t('הגלגל מסתובב…','Spinning…'):t('סובבו את גלגל הרעיונות','Spin the idea wheel')}</button>
  <dialog ref={dialog} className="roulette-dialog" aria-labelledby="roulette-result-title" onCancel={e=>{e.preventDefault();close();}}>
   <h3 id="roulette-result-title">{t('הרעיון שהוגרל','Selected idea')}</h3><p className="preserve" dir="auto">{result&&(lang==='he'?result.he:result.en)}</p>
   <div className="row"><button type="button" className="primary" onClick={()=>{if(result){const chosen=result;dialog.current?.close();setResult(null);onChoose(chosen);}}}>{t('בחירה ועריכה','Choose and edit')}</button><button type="button" onClick={()=>{close();spin();}}>{t('סיבוב נוסף','Spin again')}</button><button type="button" onClick={close}>{t('סגירה','Close')}</button></div>
  </dialog>
 </div>;
}
