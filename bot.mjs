import fs from 'node:fs';
import {makeTestSession,simulateCancellation,simulateClaim,isFictional} from './testing.mjs';
import {ensureUpcoming,TIME_ZONE} from './schedule.mjs';
import {newSession,join,cancel,accept,expire,status,validateTimes,DAY} from './core.mjs';
const env=process.env;
for(const k of ['DISCORD_BOT_TOKEN','DISCORD_APPLICATION_ID','DISCORD_GUILD_ID','DISCORD_SESSION_CHANNEL_ID','DISCORD_DEMO_CHANNEL_ID'])if(!env[k]||env[k].includes('PASTE_'))throw Error(`Missing configuration: ${k}`);
async function api(path,method='GET',body){
  for(let n=0;n<5;n++){
    const r=await fetch('https://discord.com/api/v10'+path,{method,headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    if(r.status===429){const d=await r.json();await new Promise(r=>setTimeout(r,Math.min(d.retry_after*1000+100,30000)));continue;}
    if(!r.ok){const error=Error(`Discord request failed (${r.status}). Enable private messages and try again.`);error.httpStatus=r.status;throw error;}
    return r.status===204?null:r.json();
  }throw Error('Discord is busy. Please try again.');
}
fs.mkdirSync('data',{recursive:true});
const file='data/state.json';
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{session:newSession(),panels:{},demos:{},outbox:[]};
// Preserve the old one-off test session separately; never reassign its bookings to a weekly date.
state.sessions??={};
if(state.session){const legacy={...newSession(),...state.session};state.sessions[legacy.id]??=legacy;for(const j of state.jobs||[])j.sessionId??=legacy.id;delete state.session;}
state.schema=4;state.jobs??=[];state.testSessions??={};state.testDrafts??={};
for(const old of state.outbox||[])state.jobs.push({key:crypto.randomUUID(),type:'dm',recipient:old.recipient,data:old.data,attempts:old.attempts||0,nextAt:0});state.outbox=[];
for(const session of Object.values(state.sessions))for(const o of session.openings){o.status??=o.winner?'filled':'expired';o.expiresAt??=0;}
function upcoming(){const result=ensureUpcoming(state.sessions);save();return result;}
function save(){fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);}
function job(entry){if(isFictional(entry.recipient))return;state.jobs.push({key:crypto.randomUUID(),attempts:0,nextAt:0,...entry});}
const btn=(id,label,style=1,disabled=false)=>({type:2,custom_id:id,label,style,disabled});
const row=(...components)=>({type:1,components});
const msg=(content,components=[])=>({content,components,allowed_mentions:{parse:[]}});
const when=t=>Number.isFinite(t)?`<t:${Math.floor(t/1000)}:F>`:'Not configured';
const policy='Before the registration cutoff, cancellations release your spot immediately. After cutoff, we search for a replacement for up to 24 hours (or until the session starts). Your fee responsibility remains until someone accepts. All waitlisted players are notified; the first valid acceptance received by the bot wins. Discord contact is shared with your match only. Payments are settled directly, without collection or verification by this bot.';
function details(s){return `**${s.title}**\nSession: ${when(s.startsAt)}\nRegistration cutoff: ${when(s.cutoffAt)}\nLocation: ${s.location}\nFee: **${s.fee}**`;}
const liveId=(action,s)=>`${action}:${s.id}`;
const shortDate=s=>new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,weekday:'short',month:'short',day:'numeric'}).format(s.startsAt);
function panel(){const sessions=upcoming();return msg(`🏸 **Wednesday Squash**\nEvery Wednesday · **8–10 PM America/New_York**\nRegistration cutoff: **Monday 3 PM ET**\n\n${sessions.map(s=>`${details(s)}\nConfirmed: **${s.members.length}/${s.capacity}** · Waiting: **${s.waitlist.length}**`).join('\n\n')}\n\nChoose an action below, then select a session in your DMs. Session options are recalculated when you click.\n**Demo environment — no real booking or payment.**`,[row(btn('signup','Sign up',3),btn('cancel','Cancel registration',2),btn('status','My status',2))]);}
async function dm(id,data){if(isFictional(id))return null;const c=await api('/users/@me/channels','POST',{recipient_id:id});const m=await api(`/channels/${c.id}/messages`,'POST',data);return {channel:c.id,id:m.id};}
async function refresh(){if(state.panels.session)await api(`/channels/${env.DISCORD_SESSION_CHANNEL_ID}/messages/${state.panels.session}`,'PATCH',panel());}
async function putPanel(key,channel,data){if(state.panels[key]){try{await api(`/channels/${channel}/messages/${state.panels[key]}`,'PATCH',data);return;}catch(e){if(e.httpStatus!==404)throw e;}}const m=await api(`/channels/${channel}/messages`,'POST',data);state.panels[key]=m.id;save();}
function offer(o,s){return msg(`**A spot is available**\n${details(s)}\nAccept by: ${when(o.expiresAt)}\n\nFirst valid acceptance wins. Accepting confirms your booking and connects you with the original player for direct settlement.\nTest only — do not send money.`,[row(btn(`accept:${s.id}:${o.id}`,'Accept spot',3))]);}
function closedOffer(o){const filled=o.status==='filled';return msg(filled?'**충원 완료 · Spot filled**\nThis spot has been filled. Other waitlisted players remain on the waitlist.':'**모집 종료 · Search closed**\nNo replacement was found before the deadline. This offer is no longer available.',[row(btn(`closed:${o.id}`,filled?'충원 완료':'모집 종료',2,true))]);}
function queueClose(o){for(const ref of o.messages||[])job({type:'edit',ref,data:closedOffer(o)});}
function sweep(now=Date.now()){
  ensureUpcoming(state.sessions,now);
  for(const s of Object.values(state.sessions).filter(s=>!s.testRetired))for(const o of expire(s,now)){
    job({type:'dm',recipient:o.canceled.id,data:msg(`**No replacement found**\n${details(s)}\n\nThe replacement search has ended. Your original fee responsibility remains. No real payment is required in this demo.`)});queueClose(o);
  }
  save();
}
let draining=false;
async function drain(){if(draining)return;draining=true;try{
  // Bounded batch; the timer continues draining large waitlists without blocking interactions.
  for(const j of state.jobs.filter(j=>j.attempts<5&&j.nextAt<=Date.now()).slice(0,20)){
    try{
      if(j.type==='offer'){
        const session=state.sessions[j.sessionId];
        const o=session?.openings.find(o=>o.id===j.openingId);
        if(!o||o.status!=='open'||o.expiresAt<=Date.now()||!session.waitlist.some(p=>p.id===j.recipient)){state.jobs=state.jobs.filter(x=>x.key!==j.key);save();continue;}
        const ref=await dm(j.recipient,offer(o,session));o.messages??=[];o.messages.push(ref);
        // A claim may arrive while the send request is in flight.
        if(o.status!=='open'||o.expiresAt<=Date.now())job({type:'edit',ref,data:closedOffer(o)});
      }else if(j.type==='edit')await api(`/channels/${j.ref.channel}/messages/${j.ref.id}`,'PATCH',j.data);
      else await dm(j.recipient,j.data);
      state.jobs=state.jobs.filter(x=>x.key!==j.key);
    }catch(e){j.attempts++;j.nextAt=Date.now()+Math.min(60000*2**j.attempts,3600000);if(e.httpStatus===403||e.httpStatus===404)j.attempts=5;console.log('Notification deferred; recipient can use My status.');}
    save();
  }
}finally{draining=false;}}
const commands=[
 {name:'test',description:'Organizer-only isolated test presets, roles and time controls',default_member_permissions:'32'},
 {name:'setup',description:'Publish or refresh the session and demo panels',default_member_permissions:'32'},
 {name:'configure',description:'Set session dates and details; never resets existing registrations',default_member_permissions:'32',options:[
  {type:3,name:'session',description:'Session date YYYY-MM-DD, e.g. 2026-10-28',required:true},
  {type:3,name:'cutoff',description:'ISO date with timezone, e.g. 2026-10-25T15:00:00-04:00',required:true},
  {type:3,name:'start',description:'ISO date with timezone, after cutoff',required:true},
  {type:3,name:'title',description:'Session name',required:false,max_length:100},
  {type:3,name:'location',description:'Court / location',required:false,max_length:150},
  {type:3,name:'fee',description:'Fixed session fee for direct settlement (sample only)',required:false,max_length:60},
  {type:4,name:'capacity',description:'Number of spots',required:false,min_value:1,max_value:50}]},
 {name:'demo',description:'Privately test pre-cutoff cancellation, replacement or expiry'},
 {name:'my-status',description:'Privately view your session status in the channel'}
];
if(process.argv.includes('--register')){for(const c of commands)await api(`/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,'POST',c);console.log('Commands registered.');process.exit(0);}
const app=await api('/oauth2/applications/@me');if(app.id!==env.DISCORD_APPLICATION_ID)throw Error('Wrong application token.');if(app.interactions_endpoint_url)throw Error('Clear the Interactions Endpoint URL to use the Gateway.');
for(const id of [env.DISCORD_SESSION_CHANNEL_ID,env.DISCORD_DEMO_CHANNEL_ID])if((await api(`/channels/${id}`)).guild_id!==env.DISCORD_GUILD_ID)throw Error('Channel/server mismatch.');
if(process.argv.includes('--publish')){
  await putPanel('session',env.DISCORD_SESSION_CHANNEL_ID,panel());
  await putPanel('demo',env.DISCORD_DEMO_CHANNEL_ID,msg('**Try the booking and replacement flow**\nPrivately test pre-cutoff cancellation, successful replacement, another waiter winning, and 24-hour expiry. No payment required.',[row(btn('demo-start','Start demo',3))]));
  console.log('Session and demo panels updated.');process.exit(0);
}
function manager(i){const p=BigInt(i.member?.permissions||0);if(!(p&32n)&&!(p&8n))throw Error('Only a server manager can do this.');}
function person(i){const u=i.member?.user||i.user;return {id:u.id,name:u.global_name||u.username};}
function demoStart(id){const key=crypto.randomUUID();state.demos[id]={key,stage:'choose'};save();return msg('**Choose a private demo**\nFictional players, no payment. These use the same booking rules as the session. The 24-hour timeout can be fast-forwarded here.',[row(btn(`demo:pre:${key}`,'Before cutoff'),btn(`demo:post:${key}`,'After cutoff'))]);}
function demoAction(id,action,key){const d=state.demos[id];if(!d||d.key!==key)throw Error('This demo is outdated. Start a new demo.');
 if(['pre','post'].includes(action)){
  if(d.stage!=='choose')throw Error('This step is already complete.');
  d.s=newSession({capacity:1,cutoffAt:100,startsAt:DAY*3});join(d.s,{id:'alex',name:'Alex (fictional)'},{now:1});join(d.s,{id,name:'You'},{waitlist:true,now:1});d.stage=action;
  save();return msg(action==='pre'?'**Before cutoff**\nAlex has a spot. Canceling now will immediately release it.':'**After cutoff**\nAlex has a prepaid spot. Canceling now requests a replacement; Alex keeps the booking and fee responsibility until someone accepts.',[row(btn(`demo:cancel:${key}`,'Simulate Alex canceling'))]);
 }
 if(action==='cancel'){
  if(!['pre','post'].includes(d.stage))throw Error('This step is already complete.');
  const result=cancel(d.s,'alex',d.stage==='pre'?99:100);
  if(result.kind==='canceled'){d.stage='done';save();return msg('**Cancellation complete**\nBefore cutoff: Alex is removed immediately. No replacement search or settlement handoff was created.',[row(btn('demo-start','Try again',2))]);}
  d.o=result.opening.id;d.stage='offered';save();return msg('**A spot is available**\nAlex remains responsible for the fee. You and fictional Sam receive the offer. It expires 24 hours after the search starts, or at session start if sooner.\n\nChoose an outcome:',[row(btn(`demo:accept:${key}`,'Accept spot',3),btn(`demo:other:${key}`,'Sam accepts first',2),btn(`demo:expire:${key}`,'Fast-forward 24h',2))]);
 }
 if(d.stage!=='offered')throw Error('This offer is closed. Start another demo.');
 const o=d.s.openings.find(o=>o.id===d.o);
 if(action==='expire'){expire(d.s,o.expiresAt);d.stage='done';save();return msg('**모집 종료 · Search closed**\n**Alex’s DM — preview:** No replacement found. Your original fee responsibility remains.\n\nThe offer button is disabled and Alex remains on the booking. This is simulated time; real offers expire automatically.',[row(btn(`closed:${key}`,'모집 종료',2,true),btn('demo-start','Try again',2))]);}
 if(!['accept','other'].includes(action))throw Error('Unknown action.');
 if(action==='other')join(d.s,{id:'sam',name:'Sam (fictional)'},{waitlist:true,now:101});
 accept(d.s,o.id,action==='accept'?id:'sam',102);d.stage='done';save();
 return msg(action==='accept'?'**충원 완료 · You’re confirmed**\nYour booking replaces Alex’s.\n\n**Your DM — preview:** Contact Alex’s Discord profile and send the stated fee directly.\n**Alex’s DM — preview:** You replaced Alex; Alex receives your Discord contact and the amount to receive.\n\nNo actual payment or messages to fictional players.':'**충원 완료 · Sam accepted first**\nYou stay on the waitlist. The old offer is closed. Alex and Sam receive separate settlement DMs in real use.',[row(btn(`closed:${key}`,'충원 완료',2,true),btn('demo-start','Try again',2))]);
}
function sessionsFor(id){const all=upcoming(),t=state.sessions[state.testSessions[id]];return t&&!t.testRetired?all.map(s=>s.id===t.sourceId?t:s):all;}
function testControls(t){return msg(`**Organizer test controls**\nIsolated test · no real booking or payment.\n${details(t)}\nConfirmed: **${t.members.length}/8** · Waiting: **${t.waitlist.length}**\nYour status: **${status(t,t.testOwner)}**\n\nUse the normal channel buttons to test your own actions. Your selected date now opens this private test copy. Fictional players never receive real DMs.`,[
 row(btn('test:vacancy','Simulate player cancellation'),btn('test:claim','Simulate waiter accepting',2)),
 row(btn('test:expire','Fast-forward deadline',2),btn('test:reset','Reset my test',4)),
 row(btn('test:new','Change preset',2))]);}
function retireTest(id){const t=state.sessions[state.testSessions[id]];if(t){t.testRetired=true;for(const o of t.openings)if(o.status==='open'){o.status='expired';queueClose(o);}state.jobs=state.jobs.filter(j=>j.type!=='offer'||j.sessionId!==t.id);}delete state.testSessions[id];save();}
async function testUI(i,p,action,reply){
 manager(i);
 if(action==='test'&&state.sessions[state.testSessions[p.id]]&&!state.sessions[state.testSessions[p.id]].testRetired){await reply(testControls(state.sessions[state.testSessions[p.id]]));return;}
 if(action==='test'||action==='test:new'){const key=crypto.randomUUID();state.testDrafts[p.id]={key,step:'date'};save();await reply(msg('**Organizer test setup**\nChoose which Wednesday to copy. Existing registrations are untouched.',upcoming().map(s=>row(btn(`test:date:${s.id}`,shortDate(s),3)))));return;}
 const [,step,value]=action.split(':');let draft=state.testDrafts[p.id];
 if(step==='date'){const src=upcoming().find(s=>s.id===value);if(!src)throw Error('Choose an available Wednesday.');draft={key:crypto.randomUUID(),sourceId:value,step:'preset'};state.testDrafts[p.id]=draft;save();await reply(msg('**Choose fictional headcount**',[row(btn('test:preset:empty','Empty · 0 + 0'),btn('test:preset:almost','One spot left · 7 + 0')) ,row(btn('test:preset:full','Full · 8 + 0'),btn('test:preset:replacement','Replacement · 8 + 2'))]));return;}
 if(step==='preset'){if(!draft||draft.step!=='preset')throw Error('Start /test again.');draft.preset=value;draft.step='role';save();await reply(msg('**Your role**\nCounts include you. If a preset has no slot for your role, one is added.',[row(btn('test:role:participant','Confirmed player'),btn('test:role:waiter','Waitlisted player'),btn('test:role:none','Not registered'))]));return;}
 if(step==='role'){if(!draft||draft.step!=='role')throw Error('Start /test again.');draft.role=value;draft.step='phase';save();await reply(msg('**Registration phase**',[row(btn('test:phase:before','Before cutoff'),btn('test:phase:after','After cutoff'))]));return;}
 if(step==='phase'){if(!draft||draft.step!=='phase')throw Error('Start /test again.');draft.phase=value;draft.step='apply';const preview=makeTestSession(state.sessions[draft.sourceId],draft,p);save();await reply(msg(`**Apply this test?**\n${shortDate(state.sessions[draft.sourceId])} · ${value==='before'?'Before':'After'} cutoff\nConfirmed: **${preview.members.length}** · Waiting: **${preview.waitlist.length}**\nYour role: **${draft.role}**\n\nCreates an isolated copy. Any previous private test is archived. Real registrations remain unchanged.`,[row(btn(`test:apply:${draft.key}`,'Apply test',3))]));return;}
 if(step==='apply'){if(!draft||draft.step!=='apply'||draft.key!==value)throw Error('This setup is outdated. Start /test again.');const t=makeTestSession(state.sessions[draft.sourceId],draft,p);retireTest(p.id);state.sessions[t.id]=t;state.testSessions[p.id]=t.id;delete state.testDrafts[p.id];save();await reply(testControls(t));return;}
 const t=state.sessions[state.testSessions[p.id]];if(!t||t.testRetired||t.testOwner!==p.id)throw Error('Create a test with /test first.');
 if(step==='reset'){await reply(msg('**Reset your isolated test?**\nYour test will be archived and normal Wednesday sessions will appear again. Real registrations are untouched.',[row(btn(`test:reset-confirm:${t.id}`,'Confirm reset',4))]));return;}
 if(step==='reset-confirm'){if(value!==t.id)throw Error('This reset is outdated.');retireTest(p.id);await reply(msg('Test archived. Normal Wednesday sessions are restored.',[row(btn('test','Create another test',3))]));return;}
 if(step==='vacancy'){const r=simulateCancellation(t);if(r.opening)for(const recipient of r.opening.eligible)job({type:'offer',recipient,openingId:r.opening.id,sessionId:t.id});save();await reply(testControls(t));void drain();return;}
 if(step==='claim'){const {opening:o,handoff:h}=simulateClaim(t);queueClose(o);if(!isFictional(h.canceled.id))job({type:'dm',recipient:h.canceled.id,data:msg(`**충원 완료 · Test replacement accepted**\n${details(t)}\n${h.replacement.name} is fictional. In a real handoff, you would receive **${h.fee}** directly. No payment is needed.`)});save();await reply(testControls(t));void drain();return;}
 if(step==='expire'){for(const o of t.openings)if(o.status==='open')o.expiresAt=Date.now();sweep();await reply(testControls(t));void drain();return;}
 throw Error('Unknown test action.');
}
async function handle(i){const p=person(i);if(i.guild_id&&i.guild_id!==env.DISCORD_GUILD_ID)return;
 try{await api(`/interactions/${i.id}/${i.token}/callback`,'POST',{type:5,data:{flags:64}});}catch{return;}
 const reply=data=>api(`/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}/messages/@original`,'PATCH',data);
 try{
  sweep();void drain();
  let action=i.type===2?i.data.name:i.data.custom_id;
  if(action==='test'||action.startsWith('test:')){await testUI(i,p,action,reply);return;}
  if(action==='setup'){manager(i);await putPanel('session',env.DISCORD_SESSION_CHANNEL_ID,panel());await putPanel('demo',env.DISCORD_DEMO_CHANNEL_ID,msg('**Try the booking and replacement flow**\nPrivately test cancellation before cutoff, a successful replacement, and a 24-hour timeout. No other players or payment needed.',[row(btn('demo-start','Start demo',3))]));await reply(msg('Panels updated.'));return;}
  if(action==='configure'){
   manager(i);const opts=Object.fromEntries(i.data.options.map(o=>[o.name,o.value]));const times=validateTimes(opts.cutoff,opts.start);
   const s=Object.values(state.sessions).find(s=>s.id===`wed-${opts.session}`);if(!s)throw Error('Select one of the currently available Wednesday dates.');if(s.openings.some(o=>o.status==='open'))throw Error('Finish active replacement searches before changing dates.');
   if(s.members.length&&Number.isFinite(s.cutoffAt)&&(s.cutoffAt!==times.cutoffAt||s.startsAt!==times.startsAt||opts.fee&&opts.fee!==s.fee))throw Error('Dates and fees cannot change while bookings exist. Cancel the test bookings first.');
   if(opts.capacity&&opts.capacity<s.members.length)throw Error('Capacity cannot be smaller than current bookings.');
   Object.assign(s,times);for(const k of ['title','location','fee','capacity'])if(opts[k]!==undefined)s[k]=opts[k];save();await refresh();await reply(msg(`Session configured.\n${details(s)}`));return;
  }
  if(action==='demo'||action==='demo-start'){await reply(demoStart(p.id));return;}
  if(action.startsWith('demo:')){const [,a,key]=action.split(':');await reply(demoAction(p.id,a,key));return;}
  if(action==='my-status')action='status';
  if(action==='status'){
   const next=sessionsFor(p.id);
   const extra=Object.values(state.sessions).filter(s=>!s.testRetired&&(!s.testOwner||s.testOwner===p.id)&&s.startsAt>Date.now()&&!next.some(n=>n.id===s.id)&&(s.members.some(u=>u.id===p.id)||s.waitlist.some(u=>u.id===p.id)));
   const sessions=[...next,...extra].slice(0,5);
   const actions=sessions.map(s=>{const waiting=s.waitlist.some(u=>u.id===p.id),booked=s.members.some(u=>u.id===p.id);return row(btn(liveId(waiting?'status':booked?'cancel':'signup',s),`${shortDate(s)} · ${waiting?'View status':booked?'Cancel booking':'Book'}`,waiting?2:booked?4:3));});
   const data=msg('**My status**\nOnly you can see this. All times: America/New_York.',actions);
   data.embeds=sessions.map(s=>({title:shortDate(s),description:`${details(s)}\n\nYour status: **${status(s,p.id)}**`,color:s.waitlist.some(u=>u.id===p.id)?0xe9b949:s.members.some(u=>u.id===p.id)?0x33a474:0x8792a2}));
   await reply(data);return;
  }
  if(['signup','join','cancel'].includes(action)){
   const all=sessionsFor(p.id);const candidates=action==='signup'||action==='join'?all:Object.values(state.sessions).filter(s=>!s.testRetired&&(!s.testOwner||s.testOwner===p.id)&&s.startsAt>Date.now()&&(s.members.some(u=>u.id===p.id)||s.waitlist.some(u=>u.id===p.id))).sort((a,b)=>a.startsAt-b.startsAt);
   if(!candidates.length)throw Error('You have no upcoming registrations. Use Sign up to choose a Wednesday.');
   const selectedAction=action==='join'?'signup':action;
   await dm(p.id,msg(`**Choose a session**\nAll times: America/New_York. Wednesdays 8–10 PM; signup cutoff Monday 3 PM.\n\n${candidates.slice(0,5).map(s=>`${details(s)}\nYour status: **${status(s,p.id)}**`).join('\n\n')}`,candidates.slice(0,5).map(s=>row(btn(liveId(selectedAction,s),shortDate(s),3)))));
   await reply(msg('📩 Choose a session in your DMs.'));return;
  }
  const [a,sid,oid]=action.split(':');const s=state.sessions[sid];
  if(!s||s.testRetired||s.testOwner&&s.testOwner!==p.id)throw Error('This session is no longer available. Use the latest session buttons.');
  const send=async data=>{await dm(p.id,data);await reply(msg('📩 Check your DMs from Squash Club Bot.'));};
  if(a==='signup'||a==='join'){
   if(s.members.some(u=>u.id===p.id)||s.waitlist.some(u=>u.id===p.id))throw Error('You are already registered. Use My status.');
   const full=s.members.length>=s.capacity||Date.now()>=s.cutoffAt;
   await send(msg(`${details(s)}\n\n${full?'Registration is full or the cutoff has passed. Would you like to join the waitlist?':'Would you like to sign up?'}\n\n${policy}\n\nDemo only — no real payment.`,[row(btn(liveId(full?'wait':'register',s),full?'Agree & join waitlist':'Agree & sign up',3))]));return;
  }
  if(a==='register'||a==='wait'){
   // Test DM delivery before changing the registration, and recheck capacity afterward.
   if(s.members.some(u=>u.id===p.id)||s.waitlist.some(u=>u.id===p.id))throw Error('You are already registered. Use My status.');
   await dm(p.id,msg('Processing your registration…'));
   const result=join(s,p,{waitlist:a==='wait'});save();
   if(result==='needs-waitlist-consent'){await send(msg('The session is full or cutoff has passed. Join the waitlist instead?\n\n'+policy,[row(btn(liveId('wait',s),'Agree & join waitlist',3))]));return;}
   job({type:'dm',recipient:p.id,data:msg(`${result==='joined'?'**Booking confirmed**':'**Waitlist registration confirmed**'}\n${details(s)}\n\n${result==='joined'?'Before cutoff, use Cancel registration to cancel.':'✅ **You will receive open-spot offers here. First valid acceptance wins.**'}\nDemo only — no payment.`)});
   if(result==='waitlisted')for(const o of s.openings)if(o.status==='open'&&o.eligible.includes(p.id))job({type:'offer',recipient:p.id,openingId:o.id,sessionId:s.id});
   save();await reply(msg('Registration saved. Check your DMs.'));await refresh();void drain();return;
  }
  if(a==='cancel'){
   const waiting=s.waitlist.some(u=>u.id===p.id);if(!waiting&&!s.members.some(u=>u.id===p.id))throw Error('You are not registered.');
   await send(msg(`${details(s)}\n\n${waiting?'Leave the waitlist?':Date.now()<s.cutoffAt?'Before cutoff: your spot will be canceled immediately.':'After cutoff: request a replacement search. Your booking and fee responsibility remain until a replacement accepts. The search ends after 24 hours or at session start, whichever comes first.'}`,[row(btn(liveId('cancel-confirm',s),waiting?'Leave waitlist':Date.now()<s.cutoffAt?'Confirm cancellation':'Find a replacement',4))]));return;
  }
  if(a==='cancel-confirm'){
   const r=cancel(s,p.id);if(r.opening)for(const id of r.opening.eligible)job({type:'offer',recipient:id,openingId:r.opening.id,sessionId:s.id});
   job({type:'dm',recipient:p.id,data:msg(r.kind==='searching'?`**Replacement search started**\n${details(s)}\nDeadline: ${when(r.opening.expiresAt)}\nYour booking and fee responsibility remain until someone accepts. We will DM the result, including if no replacement is found.`:r.kind==='canceled'?'**Cancellation complete**\nYour pre-cutoff booking has been removed.':'**You have left the waitlist.**')});save();await reply(msg('Request saved. Check your DMs.'));await refresh();void drain();return;
  }
  if(a==='accept'){
   const h=accept(s,oid,p.id);const o=s.openings.find(o=>o.id===oid);
   job({type:'dm',recipient:h.replacement.id,data:msg(`**Booking confirmed — 충원 완료**\n${details(s)}\nYou replaced ${h.canceled.name}.\nContact: ${isFictional(h.canceled.id)?'Fictional test player — no contact or payment needed':`https://discord.com/users/${h.canceled.id}`}\n**Send ${h.fee} directly to this player.**\nDemo only — do not send money.`)});
   job({type:'dm',recipient:h.canceled.id,data:msg(`**Your spot has been replaced — 충원 완료**\n${details(s)}\n${h.replacement.name} took your spot.\nContact: https://discord.com/users/${h.replacement.id}\n**Receive ${h.fee} directly from this player.**\nDemo only — no payment.`)});queueClose(o);save();await reply(msg('Your spot is confirmed. Settlement details are in your DMs.'));await refresh();void drain();return;
  }
  if(a==='status'){
   const handoffs=s.openings.filter(o=>o.status==='filled'&&(o.winner.id===p.id||o.canceled.id===p.id)).map(o=>{const receiving=o.canceled.id===p.id,other=receiving?o.winner:o.canceled;return `${receiving?'Receive':'Send'} ${s.fee} · ${other.name}\n${isFictional(other.id)?'Fictional player — no payment needed':`https://discord.com/users/${other.id}`}`;});
   const offers=s.openings.filter(o=>o.status==='open'&&o.eligible.includes(p.id)&&s.waitlist.some(w=>w.id===p.id));
   await reply(msg(`**My status: ${status(s,p.id)}**\n${details(s)}\n\n${handoffs.join('\n')}\nDemo only — no payment.`,offers.slice(0,5).map(o=>row(btn(`accept:${s.id}:${o.id}`,'Accept available spot',3)))));return;
  }
  throw Error('This button is outdated. Use the current session panel or /demo.');
 }catch(e){await reply(msg(e.message)).catch(()=>{});console.log('Action could not complete; no credentials logged.');}
}
let sequence=null,sessionId=null,resumeUrl=null,connection,heartbeat,ack=true,stopped=false;
function connect(){
 const ws=new WebSocket(`${resumeUrl||'wss://gateway.discord.gg'}/?v=10&encoding=json`);connection=ws;
 const send=(op,d)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({op,d}));};
 ws.onmessage=event=>{const p=JSON.parse(event.data);if(p.s!=null)sequence=p.s;
  if(p.op===10){ack=true;heartbeat=setInterval(()=>{if(!ack){ws.close();return;}ack=false;send(1,sequence);},p.d.heartbeat_interval);if(sessionId)send(6,{token:env.DISCORD_BOT_TOKEN,session_id:sessionId,seq:sequence});else send(2,{token:env.DISCORD_BOT_TOKEN,intents:1,properties:{os:process.platform,browser:'squash-club',device:'squash-club'}});}
  if(p.op===11)ack=true;if(p.op===1)send(1,sequence);if(p.op===7)ws.close();
  if(p.op===9){if(!p.d){sessionId=null;resumeUrl=null;sequence=null;}ws.close();}
  if(p.t==='READY'){sessionId=p.d.session_id;resumeUrl=p.d.resume_gateway_url;sweep();void drain();console.log('Bot online. Commands: /configure, /setup, /demo.');}
  if(p.t==='RESUMED'){sweep();void drain();console.log('Discord connection resumed.');}
  if(p.t==='INTERACTION_CREATE')void handle(p.d).catch(()=>console.log('Interaction failed.'));
 };
 ws.onerror=()=>console.log('Discord connection interrupted.');
 ws.onclose=e=>{clearInterval(heartbeat);if([4004,4010,4011,4013,4014].includes(e.code)){console.log(`Connection configuration error ${e.code}`);process.exit(1);}if(!stopped)setTimeout(connect,3000);};
}
let lastWeeklyIds=upcoming().map(s=>s.id).join(',');
const timer=setInterval(()=>{sweep();void drain();const ids=upcoming().map(s=>s.id).join(',');if(ids!==lastWeeklyIds){lastWeeklyIds=ids;void refresh().catch(()=>console.log('Panel refresh deferred.'));}},15000);
connect();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;clearInterval(timer);clearInterval(heartbeat);save();connection?.close();process.exit(0);});
