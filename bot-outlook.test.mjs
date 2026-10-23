import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as core from './core.mjs';import * as testing from './testing.mjs';import * as schedule from './schedule.mjs';import {finalizeBilling} from './billing.mjs';import {predictOutlook,parseDeadline,cutoffOutlookRecipients} from './forecast.mjs';import {explainOutlook} from './outlook-ai.mjs';
async function harness(){
 const requests=[];const env={DISCORD_BOT_TOKEN:'fake',DISCORD_APPLICATION_ID:'app',DISCORD_GUILD_ID:'guild',DISCORD_SESSION_CHANNEL_ID:'session',DISCORD_DEMO_CHANNEL_ID:'controls'};
 const fakeFs={mkdirSync(){},existsSync(){return false},writeFileSync(){},renameSync(){}};
 const fetchImpl=async(url,opts={})=>{const body=opts.body?JSON.parse(opts.body):undefined;requests.push({url,method:opts.method,body});const result=url.endsWith('/oauth2/applications/@me')?{id:'app'}:url.endsWith('/users/@me/channels')?{id:'dm'}:{id:'message',guild_id:'guild'};return new Response(JSON.stringify(result),{status:200});};
 const source=fs.readFileSync(new URL('./bot.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').split('let sequence=null')[0];
 const deps={...core,...testing,...schedule,finalizeBilling,predictOutlook,parseDeadline,cutoffOutlookRecipients,explainOutlook,fs:fakeFs,process:{env,argv:[]},fetch:fetchImpl};
 const factory=Object.getPrototypeOf(async function(){}).constructor;
 const bot=await new factory(...Object.keys(deps),source+';return {handle,state,drain,testControls,deadlinePrompt,deadlineButtons};')(...Object.values(deps));
 const s=core.newSession({id:'wed-demo',startsAt:Date.now()+7*core.DAY,cutoffAt:Date.now()+2*core.DAY,capacity:1,members:[{id:'booked'}],waitlist:[]});bot.state.sessions[s.id]=s;
 let count=0;const interaction=(action,components)=>({id:String(++count),token:'token',type:components?5:3,user:{id:'person',username:'Tester'},channel_id:'dm',message:{timestamp:new Date().toISOString()},data:{custom_id:action,...(components?{components}:{})}});
 return {bot,s,requests,interaction};
}
test('waitlist confirmation asks for optional deadline; modal submission persists it and returns labelled outlook',async()=>{
 const {bot,s,requests,interaction}=await harness();await bot.handle(interaction('wait:'+s.id));await new Promise(resolve=>setImmediate(resolve));await bot.drain();
 const registration=requests.find(r=>r.body?.content?.includes('Waitlist registration confirmed'));
 assert.ok(registration,JSON.stringify(requests.map(r=>r.body)));assert.ok(registration.body.content.includes('When’s the latest you can hear about a spot?'));assert.equal(registration.body.components[0].components.length,3);assert.ok(registration.body.content.length<2000);
 await bot.handle(interaction('forecast-time:'+s.id));const modal=requests.find(r=>r.body?.type===9);assert.equal(modal.body.data.components[0].type,18);
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(s.startsAt-86400000)+' 17:00';
 await bot.handle(interaction('forecast-save:'+s.id+':0',[{type:18,component:{custom_id:'deadline',value:date}}]));
 assert.ok(s.outlookPreferences.person.deadline<s.startsAt);const replies=requests.filter(r=>r.body?.embeds);assert.ok(replies.at(-1).body.embeds[0].description.includes('Simulated data'));assert.ok(replies.at(-1).body.embeds[0].description.includes('AI unavailable'));
 await bot.handle(interaction('status:'+s.id));const outlook=requests.at(-1).body.embeds[0].description;assert.ok(outlook.includes('When might you hear?'));assert.ok(!outlook.includes('your deadline'));assert.ok(outlook.indexOf('%')<outlook.indexOf('When might you hear?'));assert.ok(outlook.indexOf('When might you hear?')<outlook.indexOf('**Why'));assert.ok(!outlook.includes('assumption sensitivity'));assert.equal(s.waitlist.length,1);
});
test('skip and expired/invalid modal submissions do not cancel registration or save invalid deadlines',async()=>{
 const {bot,s,requests,interaction}=await harness();s.waitlist.push({id:'person'});
 await bot.handle(interaction('forecast-skip:'+s.id));assert.equal(s.waitlist.length,1);
 await bot.handle(interaction('forecast-save:'+s.id+':0',[{type:18,component:{custom_id:'deadline',value:'nonsense'}}]));assert.equal(s.outlookPreferences.person,undefined);
 s.changedAt=123;await bot.handle(interaction('forecast-save:'+s.id+':0',[{type:18,component:{custom_id:'deadline',value:'2026-10-28 17:00'}}]));assert.ok(requests.at(-1).body.content.includes('reconfigured'));
});
test('test panel stays within Discord content and component limits with forecast scenario controls',async()=>{
 const {bot,s}=await harness();const data=bot.testControls({...s,organizerId:'person'});assert.ok(data.content.length<=2000,`panel length ${data.content.length}`);assert.equal(data.components.length,5);assert.ok(data.components.every(r=>r.components.length<=5));
});

test('My status overview offers evidence for each waitlisted session',async()=>{const {bot,s,requests,interaction}=await harness();s.waitlist.push({id:'person'});await bot.handle(interaction('status'));const response=requests.filter(r=>r.body?.embeds).at(-1).body;const buttons=response.components.flatMap(r=>r.components);assert.ok(buttons.some(b=>b.custom_id==='forecast-info:'+s.id&&b.label==='Why this estimate?'));assert.ok(buttons.some(b=>b.custom_id==='status:'+s.id));});

test('cutoff generates a proactive outlook DM once without requiring My status',async()=>{const {bot,s,requests,interaction}=await harness();s.waitlist.push({id:'person'});s.cutoffAt=Date.now()-1000;await bot.handle(interaction('status:'+s.id));await new Promise(resolve=>setImmediate(resolve));await bot.drain();const notices=()=>requests.filter(r=>r.body?.content?.includes('Registration has closed — your waitlist update'));assert.equal(notices().length,1);assert.ok(notices()[0].body.embeds[0].description.includes('watch your DMs'));await bot.handle(interaction('status:'+s.id));await new Promise(resolve=>setImmediate(resolve));await bot.drain();assert.equal(notices().length,1);});

test('evidence expands and collapses on the original message without changing the forecast or waitlist',async()=>{
 const {bot,s,requests,interaction}=await harness();s.waitlist.push({id:'person'});
 const original={embeds:[{description:'Existing outlook · Simulated data',color:0x5865f2}],components:[{type:1,components:[{type:2,style:2,label:'Why this estimate?',custom_id:'forecast-info:'+s.id}]}]};
 const open=interaction('forecast-info:'+s.id);Object.assign(open.message,original);await bot.handle(open);
 const expanded=requests.at(-1).body;assert.equal(expanded.type,7);assert.equal(expanded.data.embeds[0].description,original.embeds[0].description);assert.ok(expanded.data.embeds[1].description.includes('How the model works'));assert.equal(expanded.data.components[0].components[0].label,'Hide details');
 const close=interaction('forecast-hide:'+s.id);Object.assign(close.message,expanded.data);await bot.handle(close);const collapsed=requests.at(-1).body;assert.equal(collapsed.type,7);assert.equal(collapsed.data.embeds.length,1);assert.equal(collapsed.data.components[0].components[0].custom_id,'forecast-info:'+s.id);assert.equal(s.waitlist.length,1);
});
