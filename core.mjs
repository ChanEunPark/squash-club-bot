export const DAY = 24 * 60 * 60 * 1000;
export function recordEvent(s,type,player,now=Date.now(),extra={}){
 s.events??=[];s.events.push({type,at:now,player:{id:player.id,name:player.name},...extra});
 if(s.events.length>500)s.events.splice(0,s.events.length-500);
}
function recordCancellation(s,player,now,reason){s.cancellations??=[];s.cancellations.push({...player,canceledAt:now,reason});recordEvent(s,'canceled',player,now,{reason});}
export function newSession(config = {}) {
  return { id: crypto.randomUUID(), capacity: 8, fee: 'Final amount pending (USD)', title: 'Squash session', location: 'Sample court', cutoffAt: null, startsAt: null, members: [], waitlist: [], openings: [], ...config };
}
export function validateTimes(cutoff, start, now = Date.now()) {
  const explicit = value => typeof value === 'string' && /(Z|[+-]\d\d:\d\d)$/.test(value);
  const c = Date.parse(cutoff), s = Date.parse(start);
  if (!explicit(cutoff) || !explicit(start) || !Number.isFinite(c) || !Number.isFinite(s) || c >= s || s <= now) throw Error('Use valid ISO dates with a timezone, with cutoff before start and start in the future.');
  return { cutoffAt: c, startsAt: s };
}
export function ready(s, now) {
  if (!Number.isFinite(s.cutoffAt) || !Number.isFinite(s.startsAt)) throw Error('The organizer needs to configure the session dates first.');
  if (now >= s.startsAt) throw Error('This session has started. Registration and replacement offers are closed.');
}
export function join(s, user, {waitlist = false, now = Date.now()} = {}) {
  ready(s, now);
  if (s.members.some(p => p.id === user.id) || s.waitlist.some(p => p.id === user.id)) throw Error('You are already registered. Use My status.');
  if (!waitlist && now < s.cutoffAt && s.members.length < s.capacity) { s.members.push({...user,registeredAt:now,confirmedAt:now}); recordEvent(s,'joined',user,now); return 'joined'; }
  if (!waitlist) return 'needs-waitlist-consent';
  s.waitlist.push({...user,registeredAt:now});recordEvent(s,'waitlisted',user,now);
  for (const o of s.openings) if (o.status === 'open' && o.expiresAt > now && o.canceled.id !== user.id && !o.eligible.includes(user.id)) o.eligible.push(user.id);
  return 'waitlisted';
}
export function promoteWaitlist(s, now = Date.now()) {
  if (!Number.isFinite(s.cutoffAt) || !Number.isFinite(s.startsAt) || now >= s.cutoffAt || now >= s.startsAt) return [];
  const promoted = [];
  while (s.members.length < s.capacity && s.waitlist.length) {
    const player = s.waitlist.shift();
    if (s.members.some(p => p.id === player.id)) continue;
    player.confirmedAt=now;s.members.push(player); promoted.push(player);recordEvent(s,'promoted',player,now);
  }
  return promoted;
}
export function cancel(s, id, now = Date.now()) {
  ready(s, now);
  const wi = s.waitlist.findIndex(p => p.id === id);
  if (wi >= 0) { const [player]=s.waitlist.splice(wi, 1);recordCancellation(s,player,now,'left-waitlist');return { kind: 'left-waitlist' }; }
  const member = s.members.find(p => p.id === id);
  if (!member) throw Error('You are not registered for this session.');
  if (now < s.cutoffAt) { recordCancellation(s,member,now,'before-cutoff');s.members = s.members.filter(p => p.id !== id); return { kind: 'canceled', promoted: promoteWaitlist(s, now) }; }
  if (s.openings.some(o => o.canceled.id === id && o.status === 'open')) throw Error('A replacement search is already in progress. Your fee responsibility remains until a replacement accepts.');
  const o = { id: crypto.randomUUID(), canceled: {...member}, eligible: s.waitlist.map(p => p.id), winner: null, status: 'open', createdAt: now, expiresAt: Math.min(now + DAY, s.startsAt) };
  s.openings.push(o);recordEvent(s,'search-started',member,now);
  return { kind: 'searching', opening: o };
}
export function accept(s, openingId, userId, now = Date.now()) {
  ready(s, now);
  const o = s.openings.find(p => p.id === openingId);
  if (!o || o.status !== 'open' || now >= o.expiresAt) throw Error('This offer is closed or has already been filled.');
  const i = s.waitlist.findIndex(p => p.id === userId);
  if (!o.eligible.includes(userId) || i < 0) throw Error('Only registered waitlisted players can accept this spot.');
  const mi = s.members.findIndex(p => p.id === o.canceled.id);
  if (mi < 0) throw Error('The original booking is no longer available.');
  const [player] = s.waitlist.splice(i, 1);
  player.confirmedAt=now;s.members[mi] = player;
  o.winner = player; o.status = 'filled'; o.finishedAt = now;recordCancellation(s,o.canceled,now,'replaced');recordEvent(s,'accepted',player,now);
  return { canceled: o.canceled, replacement: player, fee: s.fee };
}
export function expire(s, now = Date.now()) {
  const expired = s.openings.filter(o => o.status === 'open' && now >= o.expiresAt);
  for (const o of expired) { o.status = 'expired'; o.finishedAt = now;recordEvent(s,'search-expired',o.canceled,now); }
  return expired;
}
export function status(s, id) {
  if (s.waitlist.some(p => p.id === id)) return 'Waitlisted';
  if (s.members.some(p => p.id === id)) {
    const last = [...s.openings].reverse().find(o => o.canceled.id === id && o.status !== 'filled');
    return last?.status === 'open' ? 'Replacement search in progress — fee responsibility remains' : last?.status === 'expired' ? 'No replacement found — fee responsibility remains' : 'Confirmed';
  }
  return 'Not registered';
}
