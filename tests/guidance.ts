import assert from 'node:assert/strict';
import { currentMission } from '../src/guidance.ts';
import type { Session, Mission } from '../server/app.ts';

const mission=(id:string,status:string):Mission=>({id,status,title:id,text:'Optional conversation',revision:1,points:0,secret:false});
const session={revision:1,missions:[mission('draft','draft'),mission('pending','pending'),mission('submitted','submitted')]} as Session;
assert.equal(currentMission(session,'wife')?.id,'submitted','Review work before authoring another draft');
assert.equal(currentMission(session,'husband')?.id,'pending','Receipt needs explicit participant action');
assert.equal(currentMission({...session,sequence:['draft','pending']},'wife')?.id,'draft');
assert.equal(currentMission({...session,sequence:['missing','submitted','pending']},'husband')?.id,'submitted','Sequence can wait on partner, never auto-accept the next invitation');
assert.equal(currentMission({...session,missions:[mission('old','approved'),mission('declined','refused'),mission('cancelled','cancelled')]},'wife'),undefined);
assert.equal(currentMission({...session,missions:[{...mission('stale','pending'),revision:0},mission('adjust','adjustment')]},'husband')?.id,'adjust');
assert.equal(currentMission({...session,missions:[mission('wait','queued'),mission('work','acknowledged')]},'husband')?.id,'work');
console.log('PASS guidance: role actions, explicit sequence waiting, legacy order, final/stale exclusion');
