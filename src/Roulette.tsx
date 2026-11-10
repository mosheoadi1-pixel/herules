import React, { useEffect, useRef, useState } from 'react';
import type { Idea } from './library';
import { spinAngle } from './wheelMath';

export function Roulette({ideas:allIdeas,lang,onChoose}:{ideas:Idea[];lang:'he'|'en';onChoose:(idea:Idea)=>void}) {
 const [page,setPage]=useState(0);
 const ideas=allIdeas.slice(page*8,page*8+8);
 const [angle,setAngle]=useState(0),[spinning,setSpinning]=useState(false),[result,setResult]=useState<Idea|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const pending=useRef<Idea|null>(null);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const change=()=>{if(media.matches&&pending.current){if(timer.current)clearTimeout(timer.current);timer.current=null;setResult(pending.current);pending.current=null;setSpinning(false);}};media.addEventListener('change',change);return()=>{media.removeEventListener('change',change);if(timer.current)clearTimeout(timer.current);};},[]);
 const t=(he:string,en:string)=>lang==='he'?he:en;
 function spin(){
  if(!ideas.length||spinning)return;
  const index=Math.floor(Math.random()*ideas.length),idea=ideas[index];
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setResult(null);setAngle(value=>spinAngle(value,index,ideas.length));
  if(reduced){setResult(idea);return;}
  pending.current=idea;setSpinning(true);timer.current=setTimeout(()=>{setResult(idea);pending.current=null;setSpinning(false);timer.current=null;},4000);
 }
 const colors=['#78364d','#b36b73','#694154','#c18c77','#514057','#9a5262'];
 return <div className="roulette">
  <h3>{t('גלגל רעיונות לבחירה','Optional idea wheel')}</h3>
  <p>{t('הסיבוב חושף רעיון בלבד. קראו את התוצאה המלאה ובחרו בחופשיות אם להמשיך; סירוב אינו גורר קנס.','A spin only reveals an idea. Read the full result and freely choose whether to continue; declining carries no penalty.')}</p>
  {ideas.length>0?<div className="roulette-stage" aria-hidden="true"><div className="roulette-pointer"/><svg key={page} className="roulette-wheel" viewBox="-100 -100 200 200" style={{transform:`rotate(${angle}deg)`}}>
   {ideas.map((idea,index)=>{const start=index*2*Math.PI/ideas.length-Math.PI/2,end=(index+1)*2*Math.PI/ideas.length-Math.PI/2,mid=(index+.5)*360/ideas.length;const path=ideas.length===1?'M 0 -100 A 100 100 0 1 1 0 100 A 100 100 0 1 1 0 -100':`M 0 0 L ${100*Math.cos(start)} ${100*Math.sin(start)} A 100 100 0 0 1 ${100*Math.cos(end)} ${100*Math.sin(end)} Z`;return <g key={idea.id}><path d={path} fill={colors[index%colors.length]} stroke="#f4dfcc" strokeWidth=".6"/><text transform={`rotate(${mid}) translate(0 -68)`} textAnchor="middle" direction="ltr">{index+1}</text></g>;})}
   <circle r="8" fill="#f4dfcc"/>
  </svg></div>:<p>{t('אין רעיונות במסננים הנוכחיים.','No ideas match the current filters.')}</p>}
  {ideas.length>0&&<><ol className="roulette-legend">{ideas.map(idea=><li key={idea.id}><span dir="auto">{lang==='he'?idea.he:idea.en}</span></li>)}</ol>{allIdeas.length>8&&<div className="row"><button type="button" disabled={page===0||spinning} onClick={()=>{setPage(page-1);setResult(null);setAngle(0);}}>{t('הקודמים','Previous ideas')}</button><span>{page+1} / {Math.ceil(allIdeas.length/8)}</span><button type="button" disabled={(page+1)*8>=allIdeas.length||spinning} onClick={()=>{setPage(page+1);setResult(null);setAngle(0);}}>{t('הבאים','Next ideas')}</button></div>}</>}
  <button type="button" className="gold" disabled={!ideas.length||spinning} onClick={spin}>{spinning?t('הגלגל מסתובב…','Spinning…'):t('סובבו את גלגל הרעיונות','Spin the idea wheel')}</button>
  <div role="status" aria-live="polite">{result&&<p className="preserve"><strong>{t('הרעיון שהוגרל: ','Selected idea: ')}</strong>{lang==='he'?result.he:result.en}</p>}</div>
  {result&&<button type="button" onClick={()=>onChoose(result)}>{t('בחירה ועריכת הרעיון','Choose and edit this idea')}</button>}
 </div>;
}
