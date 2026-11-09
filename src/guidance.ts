import type { Mission, Session, User } from '../server/app';

export function currentMission(s:Session,role:User['role']):Mission|undefined {
  const open=s.missions.filter(m=>m.revision===s.revision&&!['approved','refused','cancelled'].includes(m.status));
  const selected=s.sequence?.map(id=>open.find(m=>m.id===id)).find(m=>m!==undefined);
  if(selected)return selected;
  const actionable=role==='wife'?['submitted','adjustment','draft']:['pending','acknowledged','revision'];
  return actionable.flatMap(status=>open.filter(m=>m.status===status))[0]??open[0];
}
