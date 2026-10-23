import http from 'node:http';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DEMO_PLAYER_NAMES as names} from './testing.mjs';
import {nextTwo} from './schedule.mjs';
function publicName(p){if(!p)return 'Player';if(String(p.id).startsWith('fake-')){const index=Number(String(p.id).match(/-(\d+)$/)?.[1]||0)+(String(p.id).includes('waiter')?8:0);return names[index%names.length];}return String(p.name||'Club member').slice(0,100);}
const key=value=>createHash('sha256').update(String(value)).digest('hex').slice(0,16);
export function dashboardSnapshot(state,config={},now=Date.now()){
 const sessions=nextTwo(now).map(({id})=>state.sessions?.[id]).filter(s=>s&&!s.testRetired&&!s.testOwner);
 const player=(p,s,kind)=>{const search=[...(s.openings||[])].reverse().find(o=>o.canceled.id===p.id&&o.status!=='filled');const offers=(s.openings||[]).filter(o=>o.status==='open'&&o.expiresAt>now&&o.eligible.includes(p.id));return {key:key(s.id+':'+p.id),name:publicName(p),fictional:String(p.id).startsWith('fake-'),registeredAt:Number.isFinite(p.registeredAt)?p.registeredAt:null,canceledAt:p.canceledAt||null,status:kind==='cancelled'?'Cancelled':kind==='waitlist'?(offers.length?'Offer sent':'Waitlisted'):search?.status==='open'?'Replacement pending':search?.status==='expired'?'No replacement found':'Confirmed',activity:kind==='cancelled'?({'before-cutoff':'Cancelled before cutoff','left-waitlist':'Left the waitlist',replaced:'Replacement confirmed'}[p.reason]||'Registration cancelled'):kind==='waitlist'?(offers.length?'Open-spot offer sent':'Waiting for a spot'):search?.status==='open'?'Searching for a replacement':search?.status==='expired'?'Search closed · Booking retained':p.confirmedAt>p.registeredAt?'Promoted from waitlist':'Joined session'};};
 return {updatedAt:now,refreshSeconds:30,channel:{name:'squash-session',url:`https://discord.com/channels/${config.guildId||''}/${config.channelId||''}`},sessions:sessions.map(s=>{
 const cancellations=[...(s.cancellations||[])];for(const o of s.openings||[])if(o.status==='filled'&&!cancellations.some(c=>c.id===o.canceled.id&&c.canceledAt===o.finishedAt))cancellations.push({...o.canceled,canceledAt:o.finishedAt,reason:'replaced'});
 const events=(s.events||[]).map(e=>({key:key(s.id+e.type+e.at+e.player?.id),at:e.at,type:e.type,name:publicName(e.player),reason:e.reason}));
 if(s.billing)events.push({key:'billing',at:s.billing.finalizedAt||s.cutoffAt,type:'cutoff',count:s.billing.confirmedCount});
 if(s.cutoffOutlookQueuedAt)events.push({key:'outlook',at:s.cutoffOutlookQueuedAt,type:'outlook'});
 // Older sessions retain their existing bookings; only known facts are reconstructed.
 if(!s.events?.length)for(const o of s.openings||[]){events.push({key:key(o.id),at:o.createdAt,type:'search-started',name:publicName(o.canceled)});if(o.finishedAt)events.push({key:key(o.id+'end'),at:o.finishedAt,type:o.status==='filled'?'accepted':'search-expired',name:publicName(o.winner||o.canceled)});}
 return {id:s.id,title:s.title,location:s.location,startsAt:s.startsAt,endsAt:s.endsAt||s.startsAt+7200000,cutoffAt:s.cutoffAt,capacity:s.capacity,test:!!s.testShared,phase:now>=s.startsAt?'started':now>=s.cutoffAt?'closed':'open',confirmed:s.members.map(p=>player(p,s,'confirmed')),waitlist:s.waitlist.map(p=>player(p,s,'waitlist')),cancelled:cancellations.sort((a,b)=>b.canceledAt-a.canceledAt).map(p=>player(p,s,'cancelled')),searches:(s.openings||[]).filter(o=>o.status==='open'&&o.expiresAt>now).map(o=>({key:key(o.id),name:publicName(o.canceled),expiresAt:o.expiresAt,eligibleCount:s.waitlist.filter(p=>o.eligible.includes(p.id)).length})),expiredCount:(s.openings||[]).filter(o=>o.status==='expired'&&s.members.some(p=>p.id===o.canceled.id)).length,events:events.filter(e=>Number.isFinite(e.at)).sort((a,b)=>b.at-a.at).slice(0,6)};})};
}
export function createDashboardServer({getState,config={},staticDir=new URL('./dashboard/',import.meta.url)}){
 const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"};
 return http.createServer((req,res)=>{for(const [k,v]of Object.entries(headers))res.setHeader(k,v);res.setHeader('Cache-Control','no-store');if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/api/dashboard'){try{const data=JSON.stringify(dashboardSnapshot(getState(),config));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});return res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(503,{'Content-Type':'application/json'});return res.end('{"error":"Dashboard temporarily unavailable"}');}}
 const safe=path==='/'?'index.html':path.slice(1);if(!/^(?:index\.html|app\.js|styles\.css|inter-font\.css|assets\/[a-z0-9-]+\.svg)$/.test(safe)){res.writeHead(404);return res.end('Not found');}
 try{const body=readFileSync(new URL(safe,staticDir));res.writeHead(200,{'Content-Type':safe.endsWith('.css')?'text/css':safe.endsWith('.js')?'text/javascript':safe.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8'});return res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(404);res.end('Not found');}
 });
}
