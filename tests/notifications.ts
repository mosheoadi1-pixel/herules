import assert from 'node:assert/strict';
import { newPartnerUpdates } from '../src/notifications.ts';
import type { Session } from '../server/app.ts';

const s={inbox:[{id:'one',at:1,event:'message',readBy:[]}],history:[{at:1,event:'message',by:'partner'}]} as Session;
const initial=newPartnerUpdates([s],'me',null);
assert.equal(initial.hasUpdate,false);
assert.equal(newPartnerUpdates([s],'me',initial.next).hasUpdate,false);
const own={...s,inbox:[...s.inbox,{id:'two',at:2,event:'message',readBy:[]}],history:[...s.history,{at:2,event:'message',by:'me'}]};
assert.equal(newPartnerUpdates([own],'me',initial.next).hasUpdate,false);
const partner={...own,inbox:[...own.inbox,{id:'three',at:3,event:'message',readBy:[]}],history:[...own.history,{at:3,event:'message',by:'partner'}]};
assert.equal(newPartnerUpdates([partner],'me',initial.next).hasUpdate,true);
console.log('PASS notifications: baseline, deduplication, own events and partner updates');
