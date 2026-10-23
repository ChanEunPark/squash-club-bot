// One-time demo initialization. Run only while the bot is stopped.
import fs from 'node:fs';import {newSession,join,cancel} from '../core.mjs';import {ensureUpcoming} from '../schedule.mjs';import {makeSharedTestSession,simulateCancellation} from '../testing.mjs';
const file='data/state.json',now=Date.now();const state=JSON.parse(fs.readFileSync(file,'utf8'));const source=ensureUpcoming(state.sessions,now)[0];
if(source.members.length||source.waitlist.length||source.events?.length||source.openings.length||source.cancellations?.length){console.log('Existing session data preserved; no demo seed applied.');process.exit(0);}
fs.copyFileSync(file,`data/before-dashboard-demo-${now}.json`);
const s=makeSharedTestSession(source,{preset:'replacement',role:'none',phase:'after'},{id:'fake-organizer',name:'Demo organizer'},now);
join(s,{id:'fake-waiter-dashboard-2',name:'Alexis Reed (fictional)'},{waitlist:true,now});
const past=newSession({...source,id:'demo-history',cutoffAt:now-3600000});
for(const i of [11,12]){join(past,{id:`fake-member-dashboard-${i}`,name:i===11?'Avery Brooks (fictional)':'Drew Wilson (fictional)'},{now:now-3*86400000});cancel(past,`fake-member-dashboard-${i}`,now-2*86400000+i*60000);}
s.cancellations=past.cancellations;s.events=[...past.events,...(s.events||[])];simulateCancellation(s,now);
state.sessions[s.id]=s;state.sharedTestId=s.id;fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);console.log('Demo ready: 8 confirmed, 3 waiters, 2 completed cancellations, 1 replacement search.');
