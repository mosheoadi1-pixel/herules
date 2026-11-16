import type { Mission } from '../server/app';
import { library, type Idea } from './library';
import { streakStats } from './progress';

const DAY=86400000;
export const DIGEST_DAYS=7;
export type DigestRole='wife'|'husband';
export type Digest={
  days:number;
  approved:number;
  delivered:number;
  husbandPoints:number;
  herPoints:number;
  devotionStreak:{current:number;longest:number};
  missionStreak:{current:number;longest:number};
  topCategories:{category:string;count:number}[];
  scheduled?:number;
  topRated?:{id:string;title:string;rating:'love'|'like'};
  suggestion?:{id:string;category:string;he:string;en:string;minutes:number;intensity:number};
};

// The husband counts only what he can see: sealed, undelivered and unrevealed surprise items are withheld entirely.
function countable(missions:Mission[],role:DigestRole){
  if(role==='wife')return missions;
  return missions.filter(m=>!m.sealed&&!(m.surprise&&!m.revealedAt)&&!(m.secret&&!m.deliveredAt));
}

// One idea per UTC day, cycling through the library in order; nothing is stored and nothing changes on refresh.
export function pickSuggestion(ideas:Idea[],now:number){
  const pool=ideas.filter(i=>!['rewards','consequences','secret'].includes(i.category));
  if(!pool.length)return undefined;
  const idea=pool[Math.floor(now/DAY)%pool.length]!;
  return {id:idea.id,category:idea.category,he:idea.he,en:idea.en,minutes:idea.minutes,intensity:idea.intensity};
}

export function weeklyDigest(missions:Mission[],role:DigestRole,now:number,ideas:Idea[]=library):Digest{
  const since=now-DIGEST_DAYS*DAY;
  const counted=countable(missions,role);
  const inWeek=(at?:number)=>at!==undefined&&at>=since;
  const approved=counted.filter(m=>m.status==='approved'&&inWeek(m.approvedAt));
  const points=approved.reduce((sum,m)=>sum+m.points,0);
  const delivered=counted.filter(m=>inWeek(m.deliveredAt));
  const categories=new Map<string,number>();
  for(const m of delivered)if(m.category)categories.set(m.category,(categories.get(m.category)??0)+1);
  const topCategories=[...categories].map(([category,count])=>({category,count})).sort((a,b)=>b.count-a.count||a.category.localeCompare(b.category)).slice(0,3);
  const devotion=streakStats(counted.filter(m=>m.status==='approved').map(m=>m.approvedAt??0),now);
  const mission=streakStats(counted.map(m=>m.deliveredAt??0),now);
  const digest:Digest={
    days:DIGEST_DAYS,
    approved:approved.length,
    delivered:delivered.length,
    // Each approval credits the shared points and her points by the same amount, so both totals match by construction.
    husbandPoints:points,
    herPoints:points,
    devotionStreak:{current:devotion.current,longest:devotion.longest},
    missionStreak:{current:mission.current,longest:mission.longest},
    topCategories,
  };
  if(role==='wife'){
    digest.scheduled=counted.filter(m=>m.status==='queued').length;
    const rated=approved.filter(m=>m.rating==='love'||m.rating==='like').sort((a,b)=>(a.rating==='love'?0:1)-(b.rating==='love'?0:1)||(b.ratedAt??0)-(a.ratedAt??0))[0];
    if(rated)digest.topRated={id:rated.id,title:rated.title,rating:rated.rating as 'love'|'like'};
    digest.suggestion=pickSuggestion(ideas,now);
  }
  return digest;
}
