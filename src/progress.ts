import type { Mission } from '../server/app';
import { sparkDay } from './spark';

const DAY=86400000;
export const WISH_COOLDOWN_MS=DAY;
export const EVENING_WINDOW_MS=DAY/2;
const dayKey=(at:number)=>new Date(at).toDateString();
export type Mood='soft'|'playful'|'strict';
export type Rating='love'|'like'|'skip';
const moods:Mood[]=['soft','playful','strict'];
const ratings:Rating[]=['love','like','skip'];

export function progressStats(missions:Mission[],now:number){
  const approved=missions.filter(m=>m.status==='approved');
  const days=new Set(approved.filter(m=>m.approvedAt).map(m=>dayKey(m.approvedAt!)));
  let cursor=days.has(dayKey(now))?now:now-DAY,streak=0,graceUsed=false;
  while(true){
    if(days.has(dayKey(cursor))){streak++;cursor-=DAY;}
    else if(!graceUsed&&days.has(dayKey(cursor-DAY))){graceUsed=true;cursor-=DAY;}
    else break;
  }
  const weekAgo=now-7*DAY;
  const delivered=missions.filter(m=>m.deliveredAt).length,acknowledged=missions.filter(m=>m.acknowledgedAt).length;
  return {
    total:approved.length,
    thisWeek:approved.filter(m=>(m.approvedAt??0)>=weekAgo).length,
    streak,
    graceUsed,
    ackRate:delivered?Math.min(100,Math.round(acknowledged/delivered*100)):null as number|null
  };
}

export type StreakStats={current:number;longest:number;todayDone:boolean};
function consecutiveDays(days:Set<string>,nowMs:number):StreakStats{
  const todayDone=days.has(sparkDay(nowMs));
  let cursor=todayDone?nowMs:nowMs-DAY,current=0;
  while(days.has(sparkDay(cursor))){current++;cursor-=DAY;}
  let longest=0,run=0,previous=NaN;
  for(const key of [...days].sort()){const at=Date.parse(key);run=at-previous===DAY?run+1:1;longest=Math.max(longest,run);previous=at;}
  return {current,longest,todayDone};
}
type StreakMission=Pick<Mission,'status'|'approvedAt'|'deliveredAt'>;
export function devotionStreak(missions:StreakMission[],nowMs:number):StreakStats{
  return consecutiveDays(new Set(missions.filter(m=>m.status==='approved'&&m.approvedAt).map(m=>sparkDay(m.approvedAt!))),nowMs);
}
export function missionStreak(missions:StreakMission[],nowMs:number):StreakStats{
  return consecutiveDays(new Set(missions.filter(m=>m.deliveredAt).map(m=>sparkDay(m.deliveredAt!))),nowMs);
}

export function careDue(missions:Mission[],lastCareAt=0){
  const last=missions.filter(m=>m.status==='approved').reduce((max,m)=>Math.max(max,m.approvedAt??0),0);
  return last>0&&lastCareAt<last;
}

export function milestones(total:number){
  return [5,10,25].map(at=>({at:at as 5|10|25,reached:total>=at}));
}

export function quietDays(session:{last:number}|undefined,now:number){
  return session?Math.max(0,Math.floor((now-session.last)/DAY)):0;
}

export function daysSinceLastEvent(session:{history:{at:number}[];inbox:{at:number}[]}|undefined,now:number){
  const newest=[...(session?.history??[]).map(h=>h.at),...(session?.inbox??[]).map(n=>n.at)].reduce((max,at)=>Math.max(max,at),0);
  return newest>0?Math.max(0,Math.floor((now-newest)/DAY)):0;
}

export function reconnectNudgeDue(session:{status:string;history:{at:number}[];inbox:{at:number}[]}|undefined,now:number,dismissedAt=0){
  if(!session||['stopped','expired'].includes(session.status))return false;
  return daysSinceLastEvent(session,now)>=3&&now-dismissedAt>=3*DAY;
}

export function weeklyRecap(missions:Mission[],now:number){
  const weekAgo=now-7*DAY;
  const week=missions.filter(m=>m.status==='approved'&&(m.approvedAt??0)>=weekAgo);
  const counts:Record<Rating,number>={love:0,like:0,skip:0};
  for(const m of week)if(m.rating)counts[m.rating]++;
  let topRating:Rating|null=null;
  for(const rating of ratings)if(counts[rating]>0&&(topRating===null||counts[rating]>counts[topRating]))topRating=rating;
  return {approvedThisWeek:week.length,topRating,herPointsThisWeek:week.reduce((sum,m)=>sum+m.points,0)};
}

export function eveningClosed(session:{eveningClosedAt?:number},now=Date.now()){
  return session.eveningClosedAt!==undefined&&now-session.eveningClosedAt<EVENING_WINDOW_MS;
}

export function eveningUsed(missions:Mission[],now=Date.now()){
  return missions.filter(m=>now-(m.createdAt??0)<EVENING_WINDOW_MS&&!['cancelled','refused'].includes(m.status)&&!m.season).length;
}

export type Adoration='loved'|'liked'|'ok';
export type QueenScore={score:number;breakdown:{loved:number;liked:number;ok:number;total:number}};
export function queenScore(missions:Pick<Mission,'status'|'adoration'>[]):QueenScore{
  const breakdown={loved:0,liked:0,ok:0,total:0};
  for(const m of missions)if(m.status==='approved'&&m.adoration){breakdown[m.adoration]++;breakdown.total++;}
  return {score:breakdown.loved,breakdown};
}

export type QueenLevelKey='duchess'|'queen'|'empress';
export type QueenLevel={level:QueenLevelKey;name:{he:string;en:string};next:number|null;toNext:number|null;progress:number};
const queenTiers:{level:QueenLevelKey;name:{he:string;en:string};from:number;next:number|null}[]=[
  {level:'duchess',name:{he:'דוכסית',en:'Duchess'},from:0,next:10},
  {level:'queen',name:{he:'מלכה',en:'Queen'},from:10,next:25},
  {level:'empress',name:{he:'קיסרית',en:'Empress'},from:25,next:null},
];
export function queenProgress(missions:Pick<Mission,'id'|'status'|'adoration'>[]):number{
  const unique=[...new Map(missions.map(m=>[m.id,m])).values()];
  return unique.filter(m=>m.status==='approved').length+queenScore(unique).score;
}
export function queenLevel(progress:number):QueenLevel{
  const value=Math.max(0,progress);
  const tier=[...queenTiers].reverse().find(t=>value>=t.from)??queenTiers[0];
  return {level:tier.level,name:tier.name,next:tier.next,toNext:tier.next===null?null:tier.next-value,progress:value};
}

export function favouriteMood(moodCounts?:Partial<Record<Mood,number>>){
  let best:Mood|null=null,max=0;
  for(const mood of moods){const count=moodCounts?.[mood]??0;if(count>max){max=count;best=mood;}}
  return best;
}
