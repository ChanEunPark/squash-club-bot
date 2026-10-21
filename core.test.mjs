import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, join, cancel, accept } from './core.mjs';
const p = id => ({id, name:id});
test('only one waiter wins and existing players keep their fee', () => {
  const s = newSession(); s.capacity=1;
  join(s,p('paid')); join(s,p('a')); join(s,p('b'));
  const o=cancel(s,'paid');
  assert.equal(accept(s,o.id,'b').canceled.id,'paid');
  assert.throws(()=>accept(s,o.id,'a'), /filled/);
  assert.deepEqual(s.members.map(x=>x.id),['b']);
  assert.equal(s.fee,'15,000 KRW (sample)');
});
test('unregistered users cannot claim, and withdrawing removes eligibility', () => {
  const s=newSession();s.capacity=1;join(s,p('paid'));join(s,p('a'));
  const o=cancel(s,'paid');
  assert.throws(()=>accept(s,o.id,'outsider'),/registered/);
  cancel(s,'a');assert.throws(()=>accept(s,o.id,'a'),/registered/);
});
test('multiple cancellations have separate handoffs and a winner cannot claim twice',()=>{
  const s=newSession();s.capacity=2;
  ['p1','p2','a','b'].forEach(id=>join(s,p(id)));
  const one=cancel(s,'p1'),two=cancel(s,'p2');
  assert.equal(accept(s,one.id,'a').canceled.id,'p1');
  assert.throws(()=>accept(s,two.id,'a'));
  assert.equal(accept(s,two.id,'b').canceled.id,'p2');
});
