import fs from 'node:fs';
import { newSession, join, cancel, accept } from './core.mjs';

const env = process.env;
for (const key of ['DISCORD_BOT_TOKEN','DISCORD_APPLICATION_ID','DISCORD_GUILD_ID','DISCORD_SESSION_CHANNEL_ID','DISCORD_DEMO_CHANNEL_ID']) {
  if (!env[key] || env[key].includes('PASTE_')) throw Error(`Missing configuration: ${key}`);
}
const apiBase='https://discord.com/api/v10';
async function api(path, method='GET', body) {
  for (let attempt=0;attempt<5;attempt++) {
    const r=await fetch(apiBase+path,{method,headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    if(r.status===429){const d=await r.json();await new Promise(resolve=>setTimeout(resolve,Math.min(d.retry_after*1000+100,30000)));continue;}
    if(!r.ok) throw Error(`Discord request failed: ${r.status}`);
    return r.status===204 ? null : r.json();
  }
  throw Error('Discord rate limit; please retry.');
}
fs.mkdirSync('data',{recursive:true});
const file='data/state.json';
let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{session:newSession(),panels:{},demos:{},outbox:[]};
function save(){fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);}
const button=(id,label,style=1)=>({type:2,custom_id:id,label,style});
const row=(...components)=>({type:1,components});
const message=(content,components=[])=>({content,components,allowed_mentions:{parse:[]}});
const policy='All registered waitlisted players are notified together. The first valid acceptance received by the bot wins, regardless of registration order. Your Discord contact is shared only with your matched player. Payments are settled directly; the bot does not collect or verify them.';
function panel(){const s=state.session;return message(`🏸 **Squash session — test environment**\nSample fee: **${s.fee}** · Capacity: **${s.capacity}**\nConfirmed: **${s.members.length}/${s.capacity}** · Waiting: **${s.waitlist.length}**\n\n${s.members.length?s.members.map(p=>`• ${p.name}`).join('\n'):'No players yet.'}\n\nThis is a sample session, not a real booking. For a solo walkthrough, use <#${env.DISCORD_DEMO_CHANNEL_ID}>.\n\n${policy}`,[row(button('join','Sign up / Join waitlist',3),button('cancel','Cancel / Leave waitlist',2),button('status','My status',2))]);}
async function dm(id,data){const c=await api('/users/@me/channels','POST',{recipient_id:id});return api(`/channels/${c.id}/messages`,'POST',data);}
function enqueue(id,data){state.outbox.push({id:crypto.randomUUID(),recipient:id,data,attempts:0});save();}
let draining=false;
async function drain(){if(draining)return;draining=true;try{for(const item of [...state.outbox]){if(item.attempts>=3)continue;try{await dm(item.recipient,item.data);state.outbox=state.outbox.filter(x=>x.id!==item.id);}catch{item.attempts++;console.log('Private notification pending; delivery attempt failed.');}save();}}finally{draining=false;}}
async function refresh(){if(state.panels.session)await api(`/channels/${env.DISCORD_SESSION_CHANNEL_ID}/messages/${state.panels.session}`,'PATCH',panel());}
async function putPanel(key,channel,data){if(state.panels[key]){try{await api(`/channels/${channel}/messages/${state.panels[key]}`,'PATCH',data);return;}catch{}}
  const m=await api(`/channels/${channel}/messages`,'POST',data);state.panels[key]=m.id;save();}
const commands=[
  {name:'setup',description:'Publish or refresh the session and reviewer demo panels',default_member_permissions:'32',type:1},
  {name:'demo',description:'Start your own fictional cancellation walkthrough',type:1},
  {name:'my-status',description:'Check your participation and pending handoff messages',type:1}
];
if(process.argv.includes('--register')){
  // Upsert only this app's commands; do not replace unrelated commands.
  for(const command of commands)await api(`/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,'POST',command);
  console.log('Registered /setup, /demo, /my-status.');process.exit(0);
}
const app=await api('/oauth2/applications/@me');
if(app.id!==env.DISCORD_APPLICATION_ID)throw Error('Token belongs to another application.');
if(app.interactions_endpoint_url)throw Error('Clear Interactions Endpoint URL in the developer portal to use Gateway interactions.');
await api(`/guilds/${env.DISCORD_GUILD_ID}`);
for(const channelId of [env.DISCORD_SESSION_CHANNEL_ID,env.DISCORD_DEMO_CHANNEL_ID]){
  const c=await api(`/channels/${channelId}`);if(c.guild_id!==env.DISCORD_GUILD_ID)throw Error('Configured channel belongs to another server.');
}
console.log('Authenticated; server and channels verified.');
function demoStart(id){state.demos[id]={stage:'waiting',session:newSession()};const d=state.demos[id];d.session.capacity=1;join(d.session,{id:'fictional-alex',name:'Alex (fictional)'});join(d.session,{id,name:'You'});save();return message(`**Your private demo · 1/3**\nAlex has a confirmed, prepaid spot. You and another fictional player are waiting.\n\n${policy}\n\nNo real booking, contact details or payment. Only you can see this walkthrough.`,[row(button('demo-cancel','Simulate Alex canceling'))]);}
function demoAction(id,action){const d=state.demos[id];if(!d)throw Error('Start a new demo first.');
  if(action==='demo-cancel'){
    if(d.stage!=='waiting')throw Error('This step is already complete. Start a new demo to try again.');
    join(d.session,{id:'fictional-sam',name:'Sam (fictional)'});d.opening=cancel(d.session,'fictional-alex').id;d.stage='offered';save();
    return message('**A spot opened · 2/3**\nThe same offer is sent to you and Sam (fictional).\n🏸 Sample session · Sample fee: 15,000 KRW\n\nThe first valid acceptance received by the bot gets the spot. Choose either outcome to test it.',[row(button('demo-accept','Accept spot',3),button('demo-other','Simulate Sam accepting first',2))]);
  }
  if(!['demo-accept','demo-other'].includes(action))throw Error('Unknown demo action.');
  if(d.stage!=='offered')throw Error('This spot is already filled. Start a new demo to try again.');
  const won=action==='demo-accept';accept(d.session,d.opening,won?id:'fictional-sam');d.stage='complete';save();
  return message(won?'**You’re confirmed · 3/3**\nYou took Alex’s spot. The sample roster now contains you.\n\n**Your handoff notice**\nContact Alex (fictional) at alex@example.invalid and send 15,000 KRW directly.\n\n**Alex’s notice — preview**\nYou replaced Alex. Alex is told to receive 15,000 KRW from you and receives your Discord contact.\n\nNo real message was sent to Alex, and no payment is needed. In live use, the two players receive separate private notices.':'**This spot has been filled · 3/3**\nSam’s acceptance was processed first. You remain on the sample waitlist. Alex and Sam receive the handoff information.\n\nThis demonstrates the same single-winner rule used for the session.',[row(button('demo-start','Try again',2))]);
}
async function handle(i){
  const user=i.member?.user||i.user;const id=user?.id;if(!id)return;
  if(i.guild_id && i.guild_id!==env.DISCORD_GUILD_ID)return;
  const action=i.type===2?i.data.name:i.data.custom_id;
  if(!action)return;
  // Acknowledge within Discord's deadline; all output is private to the caller.
  try{await api(`/interactions/${i.id}/${i.token}/callback`,'POST',{type:5,data:{flags:64}});}catch{console.log('Interaction acknowledgement failed.');return;}
  const reply=data=>api(`/webhooks/${env.DISCORD_APPLICATION_ID}/${i.token}/messages/@original`,'PATCH',data);
  try{
    if(action==='setup'){
      const permissions=BigInt(i.member?.permissions||0);if(!(permissions&32n)&&!(permissions&8n))throw Error('Only a server manager can publish panels.');
      await putPanel('session',env.DISCORD_SESSION_CHANNEL_ID,panel());
      await putPanel('demo',env.DISCORD_DEMO_CHANNEL_ID,message('**Try the cancellation handoff**\nExperience a last-minute cancellation as a waitlisted player. Use fictional participants, on your own, with no real payment. Your walkthrough is private.',[row(button('demo-start','Start demo',3))]));
      await reply(message('Session and demo panels are ready.'));return;
    }
    if(action==='demo'||action==='demo-start'){await reply(demoStart(id));return;}
    if(action.startsWith('demo-')){await reply(demoAction(id,action));return;}
    if(action==='join'){
      if(i.channel_id!==env.DISCORD_SESSION_CHANNEL_ID)throw Error('Use the session channel to register.');
      await reply(message(`**Before you register**\n${policy}\n\nWe will first test whether you can receive private notifications. This is a sample session; do not send money.`,[row(button('consent','Agree & register',3))]));return;
    }
    if(action==='consent'){
      if(state.session.members.some(p=>p.id===id)||state.session.waitlist.some(p=>p.id===id))throw Error('You are already registered. Use My status.');
      await dm(id,message('Private notifications are enabled. Your squash registration is being processed. This is a sample session; no payment is required.'));
      const result=join(state.session,{id,name:user.global_name||user.username});save();
      await reply(message(result==='joined'?'**Your sample spot is confirmed.** No payment is required.':'**You’re on the waitlist.** Watch your DMs for open spots.'));
      for(const o of state.session.openings)if(!o.winner&&o.eligible.includes(id))enqueue(id,offer(o));
      await refresh();void drain();return;
    }
    if(action==='cancel'){
      const member=state.session.members.some(p=>p.id===id);
      await reply(message(member?'**Cancel your spot?**\nThe bot will notify waitlisted players. If someone accepts, you will both receive direct settlement information. Until then, no replacement has been found.':'Leave the waitlist?',[row(button('cancel-confirm',member?'Confirm cancellation':'Leave waitlist',4))]));return;
    }
    if(action==='cancel-confirm'){
      const o=cancel(state.session,id);save();
      if(o)for(const waiterId of o.eligible)enqueue(waiterId,offer(o));
      await reply(message(o?'**Cancellation recorded.** Waitlisted players will receive private offers. If someone accepts, you’ll get their Discord contact and the sample settlement amount. No real payment is required.':'You have left the waitlist.'));
      await refresh();void drain();return;
    }
    if(action.startsWith('accept:')){
      const handoff=accept(state.session,action.split(':')[1],id);save();
      enqueue(handoff.replacement.id,message(`**You’re confirmed!**\nYou replaced ${handoff.canceled.name}. Contact <@${handoff.canceled.id}> (Discord ID: ${handoff.canceled.id}) to arrange direct settlement of **${handoff.fee}**.\n\nTest session: do not send money. The bot does not collect or verify payments.`));
      enqueue(handoff.canceled.id,message(`**Your spot has been filled.**\n${handoff.replacement.name} replaced you. Contact <@${handoff.replacement.id}> (Discord ID: ${handoff.replacement.id}) to receive **${handoff.fee}** directly.\n\nTest session: do not request real payment.`));
      await reply(message('**Your spot is confirmed.** Check your DMs for the handoff details.'));await refresh();void drain();return;
    }
    if(action==='status'||action==='my-status'){
      const s=state.session;const status=s.members.some(p=>p.id===id)?'Confirmed':s.waitlist.some(p=>p.id===id)?'Waitlisted':'Not registered';
      const notices=state.outbox.filter(x=>x.recipient===id);
      const handoffs=s.openings.filter(o=>o.winner&&(o.winner.id===id||o.canceled.id===id)).map(o=>{const other=o.winner.id===id?o.canceled:o.winner;return `${o.winner.id===id?'Send':'Receive'} ${s.fee} · ${other.name} · Discord ID ${other.id} (test only)`;});
      const offers=s.openings.filter(o=>!o.winner&&o.eligible.includes(id)&&s.waitlist.some(p=>p.id===id));
      await reply(message(`**My status: ${status}**\n${handoffs.join('\n')}\n${notices.length?'Some private messages could not be delivered. Enable DMs; handoff details are also listed above.':''}`,offers.slice(0,5).map(o=>row(button(`accept:${o.id}`,'Accept open spot',3)))));return;
    }
    throw Error('Unknown action.');
  }catch(error){const known=!error.message.startsWith('Discord request failed');await reply(message(known?error.message:'Discord could not complete this action. Check that you allow DMs from this server, then use My status before retrying.')).catch(()=>{});console.log('An action could not complete. No credentials logged.');}
}
function offer(o){return message(`**A squash spot opened!**\nSample fee: **${state.session.fee}**\nFirst valid acceptance received by the bot wins. Accepting confirms your spot and shares your Discord contact with the canceled player.\n\nSample session only — no payment required.`,[row(button(`accept:${o.id}`,'Accept spot',3))]);}

let sequence=null,sessionId=null,resumeUrl=null,connection,heartbeat,ack=true,stopped=false,queue=Promise.resolve();
function connect(){
  connection=new WebSocket(`${resumeUrl||'wss://gateway.discord.gg'}/?v=10&encoding=json`);
  const send=(op,d)=>{if(connection.readyState===WebSocket.OPEN)connection.send(JSON.stringify({op,d}));};
  const beat=()=>{if(!ack){connection.close();return;}ack=false;send(1,sequence);};
  connection.onmessage=event=>{
    const p=JSON.parse(event.data);if(p.s!==null&&p.s!==undefined)sequence=p.s;
    if(p.op===10){ack=true;heartbeat=setInterval(beat,p.d.heartbeat_interval);send(1,sequence);if(sessionId)send(6,{token:env.DISCORD_BOT_TOKEN,session_id:sessionId,seq:sequence});else send(2,{token:env.DISCORD_BOT_TOKEN,intents:1,properties:{os:process.platform,browser:'squash-club',device:'squash-club'}});}
    if(p.op===11)ack=true;
    if(p.op===1){send(1,sequence);}
    if(p.op===7)connection.close();
    if(p.op===9){if(!p.d){sessionId=null;resumeUrl=null;sequence=null;}connection.close();}
    if(p.t==='READY'){sessionId=p.d.session_id;resumeUrl=p.d.resume_gateway_url;console.log('Bot online. Run /setup in your server to publish the buttons.');void drain();}
    if(p.t==='RESUMED')console.log('Discord connection resumed.');
    // Acknowledge interactions immediately; mutations execute synchronously before awaits.
    if(p.t==='INTERACTION_CREATE')void handle(p.d).catch(()=>console.log('Interaction failed.'));
  };
  connection.onerror=()=>console.log('Discord connection interrupted.');
  connection.onclose=e=>{clearInterval(heartbeat);if([4004,4010,4011,4013,4014].includes(e.code)){console.log(`Connection configuration error ${e.code}.`);process.exitCode=1;return;}if(!stopped)setTimeout(connect,3000);};
}
connect();
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stopped=true;clearInterval(heartbeat);save();connection?.close();process.exit(0);});
