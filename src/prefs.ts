import { quickPresets, type QuickPreset } from './quick';

const usageKey='hr-quick-usage';

export function quickUsage():Record<string,number>{
  try{const value=JSON.parse(localStorage.getItem(usageKey)||'null');return value&&typeof value==='object'?value:{};}
  catch{return {};}
}

export function recordQuickUse(id:string){
  const usage=quickUsage();
  usage[id]=(typeof usage[id]==='number'?usage[id]:0)+1;
  try{localStorage.setItem(usageKey,JSON.stringify(usage));}catch{/* Ranking is optional when browser storage is unavailable. */}
}

export function topQuickPresets(count:number):QuickPreset[]{
  const usage=quickUsage();
  const used=quickPresets
    .map((preset,index)=>({preset,index,uses:typeof usage[preset.id]==='number'?usage[preset.id]:0}))
    .filter(entry=>entry.uses>0)
    .sort((a,b)=>b.uses-a.uses||a.index-b.index)
    .map(entry=>entry.preset);
  return [...used,...quickPresets.filter(preset=>!used.includes(preset))].slice(0,count);
}
