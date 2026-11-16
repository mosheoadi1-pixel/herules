import type { Mission } from '../server/app';

// Cosmetic titles derived from approved missions across the pair's sessions. Nothing is stored.
export const queenTiers=[
  {level:'duchess',at:0,name:{he:'דוכסית',en:'Duchess'}},
  {level:'queen',at:10,name:{he:'מלכה',en:'Queen'}},
  {level:'empress',at:25,name:{he:'קיסרית',en:'Empress'}},
] as const;
export type QueenTier=typeof queenTiers[number];
export type QueenLevel={level:QueenTier['level'];name:{he:string;en:string};progress:number;next:{level:QueenTier['level'];name:{he:string;en:string};at:number}|null;toNext:number;floor:number};

export function queenProgress(missions:Pick<Mission,'id'|'status'>[]){
  return new Set(missions.filter(m=>m.status==='approved').map(m=>m.id)).size;
}

export function queenLevel(progress:number):QueenLevel{
  const index=queenTiers.reduce((best,tier,i)=>progress>=tier.at?i:best,0);
  const tier=queenTiers[index]!,following=queenTiers[index+1];
  return {level:tier.level,name:tier.name,progress,floor:tier.at,next:following?{level:following.level,name:following.name,at:following.at}:null,toNext:following?following.at-progress:0};
}
