// lib/server/team-store.js - the records behind team logins. Server-written only (Admin SDK):
//   team_invites/{sha256(token)}          one invite: owner, role, optional email lock, expiry, used/revoked
//   users/{owner}/team_access/{member}    the owner's roster. The database rules look for THIS record to let a member in.
//   users/{member}/settings/workspace     the member's pointer to the workspace they work in
// The token itself is never stored, only its hash, so a leaked database does not leak working invite links.
import crypto from 'node:crypto';
import * as real from '../server-firestore.js';
import { checkInvite, inviteExpiry, looksLikeEmail, normEmail, INVITABLE_ROLES, isRole, rosterView, seatLimit, seatsLeft } from '../workspace-access.js';
import { invalidateWorkspace } from './workspace.js';

// The database calls go through F so tests can swap in an in-memory database (see tests/team-store.test.mjs).
let F = real;
export const __useFirestore = (fake) => { F = fake || real; };

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const fail = (code, error, status = 409) => ({ ok: false, code, error, status });

export async function loadRoster(db, ownerUid, now = Date.now()) {
  const [seats, invs] = await Promise.all([
    F.getDocs(F.collection(db, 'users', ownerUid, 'team_access')),
    F.getDocs(F.query(F.collection(db, 'team_invites'), F.where('ownerUid', '==', ownerUid))),
  ]);
  const members = []; seats.forEach((d) => members.push({ uid: d.id, ...d.data() }));
  const invites = []; invs.forEach((d) => invites.push({ id: d.id, ...d.data() }));
  return { ...rosterView({ members, invites }, now), counts: { members: members.length, pendingInvites: rosterView({ members: [], invites }, now).invites.length } };
}

export async function createInvite(db, ownerUid, { email = '', role = 'manager', seatsLimit = null }, now = Date.now()) {
  if (!INVITABLE_ROLES.includes(role)) return fail('BAD_ROLE', 'Choose Manager or Viewer.', 422);
  const e = normEmail(email);
  if (e && !looksLikeEmail(e)) return fail('BAD_EMAIL', 'That does not look like an email address.', 422);
  const roster = await loadRoster(db, ownerUid, now);
  const limit = seatLimit(seatsLimit);
  if (e && roster.members.some((m) => normEmail(m.email) === e)) return fail('ALREADY_MEMBER', 'That person is already on your team.');
  if (seatsLeft({ members: roster.counts.members, pendingInvites: roster.counts.pendingInvites, limit }) < 1) {
    return fail('SEATS_FULL', `Your plan allows ${limit} team member${limit === 1 ? '' : 's'} besides you (invites waiting count too). Remove someone or cancel an invite, or upgrade.`, 402);
  }
  const token = crypto.randomBytes(24).toString('base64url');
  await F.setDoc(F.doc(db, 'team_invites', hash(token)), { ownerUid, email: e, role, createdAt: new Date(now).toISOString(), expiresAt: inviteExpiry(now), usedAt: null, revokedAt: null });
  return { ok: true, token, email: e, role, expiresAt: inviteExpiry(now) };
}

export async function revokeInvite(db, ownerUid, inviteId) {
  const ref = F.doc(db, 'team_invites', String(inviteId || ''));
  const snap = await F.getDoc(ref);
  if (!snap.exists() || snap.data().ownerUid !== ownerUid) return fail('NOT_FOUND', 'That invite was not found.', 404);
  await F.updateDoc(ref, { revokedAt: new Date().toISOString() });
  return { ok: true };
}

export async function acceptInvite(db, token, { uid, email = '' }, now = Date.now()) {
  if (!token || String(token).length < 20) return fail('INVITE_INVALID', 'This invite link is not valid. Ask for a new one.', 404);
  const ref = F.doc(db, 'team_invites', hash(token));
  const snap = await F.getDoc(ref);
  const invite = snap.exists() ? snap.data() : null;
  const check = checkInvite(invite, { email, now });
  if (!check.ok) return fail(check.code, check.error, check.code === 'INVITE_INVALID' ? 404 : 410);
  if (invite.ownerUid === uid) return fail('OWN_WORKSPACE', 'This is your own workspace, so there is nothing to accept.');
  const mine = await F.getDoc(F.doc(db, 'users', uid, 'settings', 'workspace'));
  if (mine.exists() && mine.data().ownerUid && mine.data().ownerUid !== uid) {
    const still = await F.getDoc(F.doc(db, 'users', mine.data().ownerUid, 'team_access', uid));
    if (still.exists()) return fail('ALREADY_IN_TEAM', 'You already work in another workspace. Leave it first, then use this invite.');
  }
  // No seat check here on purpose: every waiting invite already reserved its seat when it was created.
  await F.setDoc(F.doc(db, 'users', invite.ownerUid, 'team_access', uid), { role: invite.role, email: normEmail(email) || invite.email || '', addedAt: new Date(now).toISOString() });
  await F.setDoc(F.doc(db, 'users', uid, 'settings', 'workspace'), { ownerUid: invite.ownerUid, role: invite.role, joinedAt: new Date(now).toISOString() });
  await F.updateDoc(ref, { usedAt: new Date(now).toISOString(), usedBy: uid });
  invalidateWorkspace(uid);
  return { ok: true, ownerUid: invite.ownerUid, role: invite.role };
}

export async function removeMember(db, ownerUid, memberUid) {
  const seat = F.doc(db, 'users', ownerUid, 'team_access', String(memberUid || ''));
  const snap = await F.getDoc(seat);
  if (!snap.exists()) return fail('NOT_FOUND', 'That person is not on your team.', 404);
  await F.deleteDoc(seat); // the database rules stop honouring them immediately
  try { await F.deleteDoc(F.doc(db, 'users', memberUid, 'settings', 'workspace')); } catch { /* the roster record is what grants access */ }
  invalidateWorkspace(memberUid);
  return { ok: true };
}

export async function setMemberRole(db, ownerUid, memberUid, role) {
  if (!INVITABLE_ROLES.includes(role)) return fail('BAD_ROLE', 'Choose Manager or Viewer.', 422);
  const seat = F.doc(db, 'users', ownerUid, 'team_access', String(memberUid || ''));
  const snap = await F.getDoc(seat);
  if (!snap.exists()) return fail('NOT_FOUND', 'That person is not on your team.', 404);
  await F.updateDoc(seat, { role });
  try { await F.updateDoc(F.doc(db, 'users', memberUid, 'settings', 'workspace'), { role }); } catch { /* pointer is informational; the roster decides */ }
  invalidateWorkspace(memberUid);
  return { ok: true };
}

/** A member leaves on their own. Only ever touches their own pointer and their own seat. */
export async function leaveWorkspace(db, uid) {
  const mine = await F.getDoc(F.doc(db, 'users', uid, 'settings', 'workspace'));
  if (!mine.exists() || !mine.data().ownerUid || mine.data().ownerUid === uid) return fail('NOT_A_MEMBER', 'You are not working in anyone else\'s workspace.', 404);
  try { await F.deleteDoc(F.doc(db, 'users', mine.data().ownerUid, 'team_access', uid)); } catch { /* ignore */ }
  await F.deleteDoc(F.doc(db, 'users', uid, 'settings', 'workspace'));
  invalidateWorkspace(uid);
  return { ok: true };
}
export { isRole };
