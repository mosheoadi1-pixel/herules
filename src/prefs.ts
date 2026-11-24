import { quickPresets, type QuickPreset } from './quick';

const usageKey='hr-quick-usage';

const prefKey=(key:string,scope?:string)=>scope?`${key}:${scope}`:key;
export function quickUsage(scope?:string):Record<string,number>{
  try{const value=JSON.parse(localStorage.getItem(prefKey(usageKey,scope))||'null');return value&&typeof value==='object'?value:{};}
  catch{return {};}
}

export function recordQuickUse(id:string,scope?:string){
  const usage=quickUsage(scope);
  usage[id]=(typeof usage[id]==='number'?usage[id]:0)+1;
  try{localStorage.setItem(prefKey(usageKey,scope),JSON.stringify(usage));}catch{/* Ranking is optional when browser storage is unavailable. */}
}

export function topQuickPresets(count:number,scope?:string):QuickPreset[]{
  const usage=quickUsage(scope);
  const used=quickPresets
    .map((preset,index)=>({preset,index,uses:typeof usage[preset.id]==='number'?usage[preset.id]:0}))
    .filter(entry=>entry.uses>0)
    .sort((a,b)=>b.uses-a.uses||a.index-b.index)
    .map(entry=>entry.preset);
  return [...used,...quickPresets.filter(preset=>!used.includes(preset))].slice(0,count);
}

const deckSkipKey='hr-deck-skips';
export type DeckSkips=Record<string,number>;

export function deckSkips(scope?:string):DeckSkips{
  try{const value=JSON.parse(localStorage.getItem(prefKey(deckSkipKey,scope))||'null');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
  catch{return {};}
}

export function saveDeckSkips(value:DeckSkips,scope?:string){
  try{localStorage.setItem(prefKey(deckSkipKey,scope),JSON.stringify(value));}catch{/* Preferences are optional when browser storage is unavailable. */}
}
