import type { Mission } from '../server/app';

const DAY=86400000;
export const WISH_COOLDOWN_MS=DAY;
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

export function careDue(missions:Mission[],lastCareAt=0){
  const last=Math.max(0,...missions.filter(m=>m.status==='approved').map(m=>m.approvedAt??0));
  return last>0&&lastCareAt<last;
}

export function milestones(total:number){
  return [5,10,25].map(at=>({at:at as 5|10|25,reached:total>=at}));
}

export function quietDays(session:{last:number}|undefined,now:number){
  return session?Math.max(0,Math.floor((now-session.last)/DAY)):0;
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

export function favouriteMood(moodCounts?:Partial<Record<Mood,number>>){
  let best:Mood|null=null,max=0;
  for(const mood of moods){const count=moodCounts?.[mood]??0;if(count>max){max=count;best=mood;}}
  return best;
}
