import type { Mission } from '../server/app';

const DAY=86400000;
const dayKey=(at:number)=>new Date(at).toDateString();

export function progressStats(missions:Mission[],now:number){
  const approved=missions.filter(m=>m.status==='approved');
  const days=new Set(approved.filter(m=>m.approvedAt).map(m=>dayKey(m.approvedAt!)));
  let cursor=days.has(dayKey(now))?now:now-DAY,streak=0;
  while(days.has(dayKey(cursor))){streak++;cursor-=DAY;}
  const weekAgo=now-7*DAY;
  const delivered=missions.filter(m=>m.deliveredAt).length,acknowledged=missions.filter(m=>m.acknowledgedAt).length;
  return {
    total:approved.length,
    thisWeek:approved.filter(m=>(m.approvedAt??0)>=weekAgo).length,
    streak,
    ackRate:delivered?Math.min(100,Math.round(acknowledged/delivered*100)):null as number|null
  };
}

export function careDue(missions:Mission[],lastCareAt=0){
  const last=Math.max(0,...missions.filter(m=>m.status==='approved').map(m=>m.approvedAt??0));
  return last>0&&lastCareAt<last;
}
