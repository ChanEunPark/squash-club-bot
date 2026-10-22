import {newSession,cancel,accept} from './core.mjs';
export const isFictional=id=>String(id).startsWith('fake-');
export function makeTestSession(source,{preset,role,phase},user,now=Date.now()){
 const counts={empty:[0,0],almost:[7,0],full:[8,0],replacement:[8,2]};
 if(!counts[preset]||!['participant','waiter','none'].includes(role)||!['before','after'].includes(phase))throw Error('Invalid test setup.');
 const [members,waiters]=counts[preset];
 const s=newSession({title:`TEST · ${source.title}`,location:source.location,fee:source.fee,capacity:8,startsAt:Math.max(source.startsAt,now+2*86400000),endsAt:Math.max(source.startsAt,now+2*86400000)+7200000,cutoffAt:phase==='before'?now+86400000:now-1000,testOwner:user.id,sourceId:source.id,testPhase:phase});
 for(let n=0;n<Math.max(members,role==='participant'?1:0);n++)s.members.push(n===0&&role==='participant'?user:{id:`fake-member-${s.id}-${n}`,name:`Test player ${n+1} (fictional)`});
 for(let n=0;n<Math.max(waiters,role==='waiter'?1:0);n++)s.waitlist.push(n===0&&role==='waiter'?user:{id:`fake-waiter-${s.id}-${n}`,name:`Test waiter ${n+1} (fictional)`});
 return s;
}
export function simulateCancellation(s,now=Date.now()){const p=s.members.find(p=>isFictional(p.id));if(!p)throw Error('No fictional confirmed player is available. Choose a preset with more players.');return cancel(s,p.id,now);}
export function simulateClaim(s,now=Date.now()){const o=s.openings.find(o=>o.status==='open'&&o.expiresAt>now);const p=s.waitlist.find(p=>isFictional(p.id)&&o?.eligible.includes(p.id));if(!o||!p)throw Error('Create an open search with fictional waiters first.');return {opening:o,handoff:accept(s,o.id,p.id,now)};}
