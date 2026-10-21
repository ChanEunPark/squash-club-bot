export function newSession() {
  return { capacity: 8, fee: '15,000 KRW (sample)', members: [], waitlist: [], openings: [], closed: false };
}
export function join(s, user) {
  if (s.members.some(p => p.id === user.id)) throw Error('You already have a spot.');
  if (s.waitlist.some(p => p.id === user.id)) throw Error('You are already on the waitlist.');
  if (!s.closed && s.members.length < s.capacity) { s.members.push(user); return 'joined'; }
  s.waitlist.push(user);
  // Eligibility is captured when a vacancy is offered, including newly registered waiters.
  for (const o of s.openings) if (!o.winner && o.canceled.id !== user.id) o.eligible.push(user.id);
  return 'waitlisted';
}
export function cancel(s, id) {
  const wi = s.waitlist.findIndex(p => p.id === id);
  if (wi >= 0) { s.waitlist.splice(wi, 1); return null; }
  const i = s.members.findIndex(p => p.id === id);
  if (i < 0) throw Error('You do not have a spot or waitlist registration.');
  const [canceled] = s.members.splice(i, 1);
  s.closed = true;
  const opening = { id: String(s.openings.length + 1), canceled, eligible: s.waitlist.map(p => p.id), winner: null };
  s.openings.push(opening);
  return opening;
}
export function accept(s, openingId, userId) {
  const o = s.openings.find(p => p.id === openingId);
  if (!o || o.winner) throw Error('This spot has already been filled or is no longer available.');
  const i = s.waitlist.findIndex(p => p.id === userId);
  if (!o.eligible.includes(userId) || i < 0) throw Error('Only registered waitlisted players can accept this spot.');
  if (s.members.length >= s.capacity) throw Error('The session is full.');
  const [player] = s.waitlist.splice(i, 1);
  o.winner = player;
  s.members.push(player);
  return { canceled: o.canceled, replacement: player, fee: s.fee };
}
