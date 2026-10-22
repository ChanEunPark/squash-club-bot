import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeTestSession,makeSharedTestSession,simulateCancellation,simulateClaim} from './testing.mjs';import {newSession,expire,join,cancel,accept} from './core.mjs';
const user={id:'real',name:'Organizer'},now=100000;
test('test presets are isolated and preserve the real session',()=>{const source=newSession({startsAt:now+999999999});const t=makeTestSession(source,{preset:'replacement',role:'participant',phase:'after'},user,now);assert.equal(t.members.length,8);assert.equal(t.waitlist.length,2);assert.equal(t.members[0].id,user.id);assert.equal(source.members.length,0);assert.notEqual(t.id,source.id);assert.equal(t.testOwner,user.id);});
test('real organizer can receive simulated vacancy offer as waiter',()=>{const t=makeTestSession(newSession(),{preset:'replacement',role:'waiter',phase:'after'},user,now);const o=simulateCancellation(t,now).opening;assert.ok(o.eligible.includes(user.id));assert.equal(t.members.length,8);});
test('fictional claim completes a retained booking',()=>{const t=makeTestSession(newSession(),{preset:'replacement',role:'participant',phase:'after'},user,now);simulateCancellation(t,now);const r=simulateClaim(t,now+1);assert.equal(r.opening.status,'filled');assert.equal(t.members.length,8);});
test('fast-forwarded test deadline expires only test search',()=>{const t=makeTestSession(newSession(),{preset:'replacement',role:'waiter',phase:'after'},user,now);const o=simulateCancellation(t,now).opening;o.expiresAt=now;assert.equal(expire(t,now).length,1);});

test('before-cutoff simulation explains why acceptance is unavailable',()=>{const t=makeTestSession(newSession(),{preset:'replacement',role:'waiter',phase:'before'},user,now);simulateCancellation(t,now);assert.throws(()=>simulateClaim(t,now+1),/before cutoff/);});
test('sole real waiter is directed to their own DM offer',()=>{const t=makeTestSession(newSession(),{preset:'full',role:'waiter',phase:'after'},user,now);simulateCancellation(t,now);assert.throws(()=>simulateClaim(t,now+1),/only waiter/);});

test('shared preset keeps canonical date and is available to two real accounts',()=>{
 const source=newSession({id:'wed-test',startsAt:now+999999999,endsAt:now+1007199999});
 const t=makeSharedTestSession(source,{preset:'full',role:'participant',phase:'after'},user,now);
 assert.equal(t.id,source.id);assert.equal(t.startsAt,source.startsAt);assert.equal(t.testOwner,undefined);assert.equal(t.organizerId,user.id);
 const second={id:'second-real',name:'Second account'};join(t,second,{waitlist:true,now});
 const o=cancel(t,user.id,now).opening;assert.ok(o.eligible.includes(second.id));accept(t,o.id,second.id,now+1);
 assert.ok(t.members.some(p=>p.id===second.id));assert.ok(!t.members.some(p=>p.id===user.id));assert.equal(t.members.length,8);
});
