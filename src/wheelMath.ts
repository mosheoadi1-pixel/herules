export function spinAngle(previous:number,index:number,count:number) {
 const target=(360-(index+0.5)*360/count)%360;
 return previous+1080+((target-previous%360+360)%360);
}
