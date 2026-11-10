import assert from 'node:assert/strict';
import { spinAngle } from '../src/roulette';

for (const count of [1, 2, 5, 12]) {
 for (let index=0; index<count; index++) {
  for (const previous of [0, 721, 5000]) {
   const angle=spinAngle(previous,index,count);
   assert.ok(angle>=previous+360*3);
   const pointed=((360-angle%360)%360)/(360/count);
   assert.equal(Math.floor(pointed),index);
  }
 }
}
console.log('PASS roulette: cumulative spins land on the selected slice');
