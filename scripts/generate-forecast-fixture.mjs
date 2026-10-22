import fs from 'node:fs';
import {nextTwo} from '../schedule.mjs';
// Reproducible synthetic records only: no real Discord identities or real attendance data.
let seed=20261022;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const members=Array.from({length:24},(_,i)=>({id:`mock-${i+1}`,cohort:i<8?'stable':i<16?'mixed':'flexible'}));
const sessions=[];const records=[];const responses=[];
for(let week=0;week<48;week++){
 const {startsAt,cutoffAt}=nextTwo(Date.UTC(2025,10,1+week*7))[0];
 sessions.push({id:`mock-week-${week+1}`,startsAt,cutoffAt,capacity:8});
 for(let j=0;j<8;j++){
  const member=members[(week*5+j*3+j%3)%24];const risk={stable:.08,mixed:.25,flexible:.48}[member.cohort];
  const canceled=random()<risk;const leadHours=canceled?[120,72,56,48,24,8,3][Math.floor(random()*7)]:null;
  records.push({sessionId:`mock-week-${week+1}`,memberId:member.id,bookedAt:startsAt-168*3600000,canceledAt:canceled?startsAt-leadHours*3600000:null,attended:!canceled});
 }
 for(let j=0;j<4;j++){const accepted=random()<.72,delayMinutes=[2,5,10,20,45,90,180][Math.floor(random()*7)],offeredAt=startsAt-8*3600000;responses.push({sessionId:`mock-week-${week+1}`,memberId:members[(week+j)%24].id,waitlistedAt:cutoffAt-(24-j)*3600000,offeredAt,accepted,delayMinutes,confirmedAt:accepted?offeredAt+delayMinutes*60000:null});}
}
const fixture={version:'synthetic-v1',synthetic:true,description:'Fictional Wednesday squash history for demonstrating an unvalidated statistical forecast. Mock profiles are mapped to current accounts for simulation only; they are not their actual participation histories.',members,sessions,records,responses};
fs.writeFileSync(new URL('../fixtures/forecast-history.json',import.meta.url),JSON.stringify(fixture)+'\n');
