import React, { useEffect, useRef, useState } from 'react';
import type { Idea } from './library';
import { labels } from './i18n';
import { spinAngle } from './wheelMath';
import { WHEEL_COST_MAX, offeredWheels, pickWheelIndex, wheelWeights, type MoodInput, type WheelId } from './wheels';

type RouletteProps = {ideas:Idea[];lang:'he'|'en';onChoose:(idea:Idea)=>void;mood?:MoodInput;herPoints:number;wheelCost:number;play:boolean;ended:boolean;spend:()=>Promise<boolean>;configure?:(cost:number)=>Promise<boolean>};

export function Roulette({ideas,lang,onChoose,mood,herPoints,wheelCost,play,ended,spend,configure}:RouletteProps) {
  const [angle,setAngle]=useState(0),[spinning,setSpinning]=useState(false),[paying,setPaying]=useState(false),[result,setResult]=useState<Idea|null>(null);
  const [selected,setSelected]=useState<WheelId|''>(''),[weighted,setWeighted]=useState(true),[costDraft,setCostDraft]=useState(String(wheelCost)),[costInvalid,setCostInvalid]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),pending=useRef<Idea|null>(null),dialog=useRef<HTMLDialogElement>(null),spinButton=useRef<HTMLButtonElement>(null);
  const t=(he:string,en:string)=>lang==='he'?he:en;
  const l=(key:string)=>labels[key]?.[lang==='he'?0:1]??key;
  const wheels=offeredWheels(ideas),wheel=wheels.find(w=>w.def.id===selected)??wheels[0];
  const pool=wheel?.pool??[],weights=wheelWeights(pool,mood,weighted);
  const costly=wheelCost>0,blocked=costly&&(!play||herPoints<wheelCost);
  useEffect(()=>{setCostDraft(String(wheelCost));},[wheelCost]);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const change=()=>{if(media.matches&&pending.current){if(timer.current)clearTimeout(timer.current);timer.current=null;setResult(pending.current);pending.current=null;setSpinning(false);}};media.addEventListener('change',change);return()=>{media.removeEventListener('change',change);if(timer.current)clearTimeout(timer.current);};},[]);
  useEffect(()=>{if(result&&!dialog.current?.open)dialog.current?.showModal();},[result]);
  function close(){dialog.current?.close();setResult(null);spinButton.current?.focus();}
  // A paid spin is confirmed by the server before the wheel moves; a refused payment leaves the wheel still.
  async function spin(){
    if(!wheel||spinning||paying||blocked)return;
    if(costly){setPaying(true);const paid=await spend();setPaying(false);if(!paid)return;}
    const index=pickWheelIndex(weights),idea=pool[index];
    if(idea===undefined)return;
    setResult(null);setAngle(value=>spinAngle(value,index%8,8));
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setResult(idea);return;}
    pending.current=idea;setSpinning(true);timer.current=setTimeout(()=>{setResult(idea);pending.current=null;setSpinning(false);timer.current=null;},4000);
  }
  async function saveCost(){
    const value=Number(costDraft);
    if(costDraft.trim()===''||!Number.isInteger(value)||value<0||value>WHEEL_COST_MAX){setCostInvalid(true);return;}
    setCostInvalid(false);await configure?.(value);
  }
  const colors=['#78364d','#b36b73','#694154','#c18c77','#514057','#9a5262'];
  return <div className="roulette">
    <h3>{t('גלגל רעיונות לבחירה','Optional idea wheel')}</h3>
    {wheel?<>
      <p>{lang==='he'?wheel.def.description.he:wheel.def.description.en}</p>
      <p className="small">{l('wheel-presentation')}</p>
      <div className="wheel-choice" role="group" aria-label={l('wheel-choose')}>{wheels.map(({def})=><button key={def.id} type="button" aria-pressed={def.id===wheel.def.id} onClick={()=>setSelected(def.id)}>{lang==='he'?def.name.he:def.name.en}</button>)}</div>
    </>:<p role="status">{t('אין רעיונות זמינים.','No ideas are available.')}</p>}
    <div className="wheel-choice" role="group" aria-label={l('wheel-mood-group')}>
      <button type="button" aria-pressed={weighted} onClick={()=>setWeighted(true)}>{l('wheel-by-mood')}</button>
      <button type="button" aria-pressed={!weighted} onClick={()=>setWeighted(false)}>{l('wheel-no-preference')}</button>
    </div>
    {weighted&&!mood&&<p className="small">{l('wheel-no-checkin')}</p>}
    <div className="roulette-stage" aria-hidden="true"><div className="roulette-pointer"/><svg className="roulette-wheel" viewBox="-100 -100 200 200" style={{transform:`rotate(${angle}deg)`}}>
      {Array.from({length:8},(_,index)=>{const start=index*Math.PI/4-Math.PI/2,end=(index+1)*Math.PI/4-Math.PI/2;return <path key={index} d={`M 0 0 L ${100*Math.cos(start)} ${100*Math.sin(start)} A 100 100 0 0 1 ${100*Math.cos(end)} ${100*Math.sin(end)} Z`} fill={colors[index%colors.length]} stroke="#f4dfcc" strokeWidth=".6"/>;})}<circle r="8" fill="#f4dfcc"/>
    </svg></div>
    <button ref={spinButton} type="button" className="gold" disabled={!wheel||spinning||paying||blocked} onClick={()=>void spin()}>{spinning?t('הגלגל מסתובב…','Spinning…'):paying?l('wheel-paying'):t('סובבו את גלגל הרעיונות','Spin the idea wheel')}{costly&&<> · {wheelCost} {l('wheel-points')}</>}</button>
     {costly&&!play&&<p className="small">{l('wheel-cost-note')}</p>}
     {costly&&play&&herPoints<wheelCost&&<p className="small">{l('wheel-short')}</p>}
     {configure&&<details className="library-options">
       <summary>{t('הגדרות הגלגל','Wheel settings')}</summary>
       <div className="row">
         <label>{l('wheel-cost')}<input type="number" min={0} max={WHEEL_COST_MAX} step={1} inputMode="numeric" value={costDraft} aria-invalid={costInvalid||undefined} aria-describedby={costInvalid?'wheel-cost-error':undefined} onChange={e=>setCostDraft(e.target.value)}/></label>
         <button type="button" disabled={ended} onClick={()=>void saveCost()}>{l('wheel-save-cost')}</button>
       </div>
       {costInvalid&&<p id="wheel-cost-error" className="error" role="alert">{l('wheel-cost-invalid')}</p>}
     </details>}
    <dialog ref={dialog} className="roulette-dialog" aria-labelledby="roulette-result-title" onCancel={e=>{e.preventDefault();close();}}>
      <h3 id="roulette-result-title">{t('הרעיון שהוגרל','Selected idea')}</h3><p className="preserve" dir="auto">{result&&(lang==='he'?result.he:result.en)}</p>
      <div className="row"><button type="button" className="primary" onClick={()=>{if(result){const chosen=result;dialog.current?.close();setResult(null);onChoose(chosen);}}}>{t('בחירה ועריכה','Choose and edit')}</button><button type="button" onClick={()=>{close();setTimeout(()=>void spin(),0);}}>{t('סיבוב נוסף','Spin again')}</button><button type="button" onClick={close}>{t('סגירה','Close')}</button></div>
    </dialog>
  </div>;
}
