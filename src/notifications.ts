import type { Session } from '../server/app';

export function newPartnerUpdates(sessions:Pick<Session,'inbox'|'history'>[],userId:string,seen:Set<string>|null) {
 const next=new Set<string>();let hasUpdate=false;
 for(const session of sessions)for(const notice of session.inbox){
  next.add(notice.id);
  if(seen&&!seen.has(notice.id)&&session.history.some(event=>event.at===notice.at&&event.event===notice.event&&event.by!==userId))hasUpdate=true;
 }
 return {next,hasUpdate};
}
