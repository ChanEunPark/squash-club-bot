import {newSession,DAY} from './core.mjs';
export const TIME_ZONE='America/New_York';
function parts(at){return Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function localTime(y,m,d,h){let utc=Date.UTC(y,m-1,d,h);for(let i=0;i<3;i++){const p=parts(utc),wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);utc+=Date.UTC(y,m-1,d,h)-wall;}return utc;}
export function nextTwo(now=Date.now()){
 const p=parts(now),day=Date.UTC(p.year,p.month-1,p.day),weekday=new Date(day).getUTCDay();let target=day+((3-weekday+7)%7)*DAY;const result=[];
 while(result.length<2){const d=new Date(target),y=d.getUTCFullYear(),m=d.getUTCMonth()+1,n=d.getUTCDate();const startsAt=localTime(y,m,n,20);
  if(startsAt>now){const monday=new Date(target-2*DAY);result.push({id:`wed-${y}-${String(m).padStart(2,'0')}-${String(n).padStart(2,'0')}`,title:'Wednesday Squash',startsAt,endsAt:localTime(y,m,n,22),cutoffAt:localTime(monday.getUTCFullYear(),monday.getUTCMonth()+1,monday.getUTCDate(),15),schedule:'weekly-wednesday',timeZone:TIME_ZONE});}target+=7*DAY;
 }return result;
}
export function ensureUpcoming(sessions,now=Date.now()){return nextTwo(now).map(config=>{sessions[config.id]??=newSession(config);return sessions[config.id];});}
