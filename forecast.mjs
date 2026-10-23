import fs from 'node:fs';
import {createHash} from 'node:crypto';
export const history=JSON.parse(fs.readFileSync(new URL('./fixtures/forecast-history.json',import.meta.url),'utf8'));
const HOUR=3600000;
const hash=value=>parseInt(createHash('sha256').update(String(value)).digest('hex').slice(0,8),16);
function rng(seed){return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// Every live identity maps to a FICTIONAL profile. No claim is made about that person's real history.
export function profileFor(player,scenario='mixed',data=history){
 const candidates=scenario==='mixed'?data.members:data.members.filter(p=>p.cohort===scenario);
 if(!candidates.length)throw Error('Unknown mock scenario.');
 return candidates.find(p=>p.id===player.forecastProfileId)||candidates[hash(player.id)%candidates.length];
}
function evidence(player,s,now,data){
 const profile=profileFor(player,s.forecastScenario||'mixed',data);
 const last=Math.max(...data.sessions.map(x=>x.startsAt));const sessionMap=new Map(data.sessions.map(x=>[x.id,x]));
 const summarize=records=>{
  let exposure=0,cancellations=0;const timings=[];
  for(const r of records){const session=sessionMap.get(r.sessionId);const weight=2**(-(last-session.startsAt)/(16*7*24*HOUR));exposure+=weight;
   if(r.canceledAt!==null){cancellations+=weight;timings.push({lead:(session.startsAt-r.canceledAt)/HOUR,weight});}
  }return {exposure,cancellations,timings};
 };
 const all=summarize(data.records),own=summarize(data.records.filter(r=>r.memberId===profile.id));
 const baseRate=all.cancellations/all.exposure;
 const rate=(own.cancellations+6*baseRate)/(own.exposure+6);
 // Mix individual timing evidence with a cohort-wide prior; do not overfit one cancellation.
 const timings=[...own.timings,...all.timings.map(t=>({...t,weight:t.weight*6/all.exposure}))];
 const total=timings.reduce((v,t)=>v+t.weight,0);
 const remaining=timings.filter(t=>s.startsAt-t.lead*HOUR>now);
 const futureWeight=remaining.reduce((v,t)=>v+t.weight,0);
 const futureMass=total?futureWeight/total:0;
 const conditionalRate=rate*futureMass/(1-rate+rate*futureMass);
 return {rate:conditionalRate,timings:remaining,historicalRate:rate,overallRate:baseRate,sampleCount:data.records.filter(r=>r.memberId===profile.id).length};
}
function weightedSample(items,random){const total=items.reduce((v,t)=>v+t.weight,0);let value=random()*total;return items.find(t=>(value-=t.weight)<=0)||items.at(-1);}
export function clubInsights(s,deadline,now=Date.now(),data=history){
 const sessionMap=new Map(data.sessions.map(x=>[x.id,x]));
 const canceled=data.records.filter(r=>r.canceledAt!==null);
 const profileEvidence=s.members.map(p=>evidence(p,s,now,data));
 const baseline=profileEvidence[0]?.overallRate||0;
 const rosterRate=profileEvidence.length?profileEvidence.reduce((v,e)=>v+e.historicalRate,0)/profileEvidence.length:baseline;
 const delta=rosterRate-baseline;
 const pct=n=>Math.round(n*100);
 const futurePattern=canceled.map(r=>{const past=sessionMap.get(r.sessionId);return s.startsAt-(past.startsAt-r.canceledAt);}).filter(t=>t>now&&t<s.startsAt);
 const beforeDeadline=futurePattern.filter(t=>t<=deadline).length;
 const overlap=futurePattern.length?beforeDeadline/futurePattern.length:0;
 const afterCutoff=canceled.filter(r=>r.canceledAt>=sessionMap.get(r.sessionId).cutoffAt).length;
 const responses=data.responses.filter(r=>r.accepted).map(r=>r.delayMinutes).sort((a,b)=>a-b);
 const median=responses.length?responses[Math.floor(responses.length/2)]:null;
 const findings=[];
 if(profileEvidence.length)findings.push({id:'lineup-pattern',direction:delta<-.03?'limits':delta>.03?'supports':'neutral',priority:Math.abs(delta)>.03?4:1,
  observation:delta<-.03?'This lineup shows a lower cancellation tendency than the club baseline.':delta>.03?'This lineup shows a higher cancellation tendency than the club baseline.':'This lineup’s cancellation tendency is close to the club baseline.',
  evidence:`Lineup cancellation tendency: ${pct(rosterRate)}% vs club baseline ${pct(baseline)}% (recency-adjusted, with an overall prior for sparse profiles).`,
  implication:delta<-.03?'Fewer cancellations from this lineup can limit new openings, even if there is plenty of time left.':delta>.03?'This lineup can create more opportunities than a steadier lineup, but an opening is not a confirmed booking.':'The lineup itself offers little advantage relative to the club baseline.'});
 if(futurePattern.length)findings.push({id:'deadline-overlap',direction:overlap<.5?'limits':'supports',priority:overlap<.5?5:2,
  observation:overlap<.5?'Most still-relevant cancellation timings from past records fall after the user’s chosen time.':'Most still-relevant cancellation timings from past records fall before the user’s chosen time.',
  evidence:`${beforeDeadline} of ${futurePattern.length} still-relevant historical cancellation timings fall before your chosen time when aligned to this session.`,
  implication:overlap<.5?'A later opening would not help the user make plans by their selected time.':'There is still time for historically typical opportunities, but their occurrence is uncertain.'});
 if(canceled.length)findings.push({id:'cancellation-timing',direction:'context',priority:now>=s.cutoffAt?3:2,
  observation:afterCutoff>canceled.length/2?'In past club records, most cancellations happened after registration closed.':'In past club records, cancellations were not predominantly after registration closed.',
  evidence:`${afterCutoff} of ${canceled.length} cancellations happened after cutoff, across ${data.sessions.length} sessions.`,
  implication:afterCutoff>canceled.length/2?'Registration closing does not mean all potential opportunities have already passed.':'Some of the historical cancellation opportunities occurred before registration closed.'});
 if(now>=s.cutoffAt&&median!==null)findings.push({id:'response-pattern',direction:'limits',priority:4,
  observation:'Accepting waiters in past records often responded promptly to offers.',
  evidence:`Median response time among ${responses.length} accepting waiters: ${median} minutes.`,
  implication:'After cutoff, responding before other waiters matters; a cancellation alone does not mean this user gets the spot.'});
 findings.sort((a,b)=>b.priority-a.priority);
 // Always ground the explanation in actual computed patterns; do not manufacture a causal attribution.
 const selected=findings.slice(0,2);
 return {synthetic:true,sessionCount:data.sessions.length,bookingCount:data.records.length,cancellationCount:canceled.length,
  rosterCancellationPercent:pct(rosterRate),clubCancellationPercent:pct(baseline),deadlineOverlapPercent:pct(overlap),medianAcceptMinutes:median,
  selected,all:findings};
}
export function predictOutlook(s,userId,deadline,now=Date.now(),{data=history,trials=1800}={}){
 const position=s.waitlist.findIndex(p=>p.id===userId);
 if(position<0)return {available:false,reason:'not-waitlisted'};
 if(!Number.isFinite(deadline)||deadline<=now||deadline>s.startsAt)return {available:false,reason:'deadline-passed-or-invalid'};
 const evidenceList=s.members.map(p=>evidence(p,s,now,data));
 const open=s.openings.filter(o=>o.status==='open'&&o.expiresAt>now);
 const canceling=new Set(open.map(o=>o.canceled.id));
 const seed=hash(JSON.stringify([s.id,s.members.map(p=>p.id),s.waitlist.map(p=>p.id),s.forecastScenario,open.map(o=>o.id),deadline,Math.floor(now/900000)]));
 function simulate(multiplier){
  const random=rng(seed);let successes=0;const times=[];
  for(let trial=0;trial<trials;trial++){
   const events=open.map(o=>({time:now,expires:o.expiresAt,eligible:new Set(o.eligible)}));
   evidenceList.forEach((e,index)=>{
    if(canceling.has(s.members[index].id)||!e.timings.length||random()>=clamp(e.rate*multiplier,0,1))return;
    const timing=weightedSample(e.timings,random);const time=s.startsAt-timing.lead*HOUR;
    if(time<=deadline)events.push({time,expires:Math.min(time+24*HOUR,s.startsAt),eligible:null});
   });
   const waiters=s.waitlist.map(p=>p.id),filledOffers=new Set();let won=false;
   while(events.length){
    events.sort((a,b)=>a.time-b.time);const event=events.shift();
    if(event.time>deadline)break;
    if(event.kind==='accept'){
     if(filledOffers.has(event.offer)||!waiters.includes(event.id))continue;
     filledOffers.add(event.offer);waiters.splice(waiters.indexOf(event.id),1);
     if(event.id===userId){times.push(event.time);won=true;break;}
    }else if(event.time<s.cutoffAt){
     const winner=waiters.shift();if(winner===userId){times.push(event.time);won=true;break;}
    }else{
     // Competing responses are processed in time order, including overlapping offers.
     const offer=event;
     for(const id of waiters.filter(id=>!event.eligible||event.eligible.has(id))){
      const r=data.responses[Math.floor(random()*data.responses.length)];const time=event.time+r.delayMinutes*60000;
      if(r.accepted&&time<event.expires&&time<=deadline)events.push({kind:'accept',id,time,offer});
     }
    }
   }
   if(won)successes++;
  }
  times.sort((a,b)=>a-b);return {probability:successes/trials,times};
 }
 const base=simulate(1),low=simulate(.75),high=simulate(1.25);
 const round=p=>Math.round(p*20)*5;
 const minSamples=Math.min(...s.members.map(p=>data.records.filter(r=>r.memberId===profileFor(p,s.forecastScenario||'mixed',data).id).length));
 return {available:true,synthetic:true,modelVersion:'conditional-cancellation-monte-carlo-v1',deadline,generatedAt:now,
  chancePercent:round(base.probability),rangePercent:[round(Math.min(low.probability,base.probability)),round(Math.max(high.probability,base.probability))],
  // Window is conditional on successful confirmation by the user's deadline, not an expected notification promise.
  window:base.times.length>=30?{from:base.times[Math.floor(base.times.length*.2)],to:base.times[Math.floor(base.times.length*.8)]}:null,
  activeOfferCount:open.length,confirmedCount:s.members.length,capacity:s.capacity,queuePosition:now<s.cutoffAt?position+1:null,phase:now<s.cutoffAt?'before-cutoff':'after-cutoff',waiters:s.waitlist.length,
  insights:clubInsights(s,deadline,now,data),historicalSessions:data.sessions.length,minimumProfileSamples:Number.isFinite(minSamples)?minSamples:0,
  uncertainty:'Unvalidated synthetic-data estimate. Range varies cancellation assumptions by ±25%; it is not a confidence interval.',
  factors:[now<s.cutoffAt?'Waitlist registration order applies until cutoff.':'After cutoff, first valid acceptance wins; no queue priority.',
   'Current participants are assigned fictional historical profiles for this demo; no real personal history is used.',
   'Cancellation estimates use recency weighting, an overall prior for sparse profiles, and cancellation timing.',
   'Response times are drawn from synthetic history, not your measured response speed.']};
}
export function parseDeadline(value,startsAt,now=Date.now()){
 const match=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value.trim());
 if(!match)throw Error('Use YYYY-MM-DD HH:mm in Eastern Time, for example 2026-10-28 17:00.');
 const [,y,m,d,h,min]=match.map(Number);if(h>23||min>59||m<1||m>12||d<1||d>31)throw Error('Enter a valid date and time.');
 const target=Date.UTC(y,m-1,d,h,min);let utc=target;
 const parts=at=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 for(let i=0;i<4;i++){const p=parts(utc);utc+=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);}
 const p=parts(utc);if(p.year!==y||p.month!==m||p.day!==d||p.hour!==h||p.minute!==min)throw Error('That local date/time does not exist. Choose another time.');
 const alternate=parts(utc+HOUR);if(alternate.year===y&&alternate.month===m&&alternate.day===d&&alternate.hour===h&&alternate.minute===min)throw Error('That Eastern time occurs twice during the clock change. Choose a different hour.');
 if(utc<=now||utc>startsAt)throw Error('Choose a future time no later than the session start.');return utc;
}

// Persisted once-per-session boundary event. No catch-up messages for sessions already started.
export function cutoffOutlookRecipients(s,now=Date.now()){
 if(s.testRetired||s.cutoffOutlookQueuedAt!==undefined||!Number.isFinite(s.cutoffAt)||now<s.cutoffAt||!Number.isFinite(s.startsAt)||now>=s.startsAt)return [];
 s.cutoffOutlookQueuedAt=now;
 return [...new Set(s.waitlist.map(p=>p.id).filter(id=>!String(id).startsWith('fake-')))];
}
