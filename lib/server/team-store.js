// lib/server/team-store.js - the records behind team logins. Server-written only (Admin SDK):
//   team_invites/{sha256(token)}          one invite: owner, role, optional email lock, expiry, used/revoked
//   users/{owner}/team_access/{member}    the owner's roster. The database rules look for THIS record to let a member in.
//   users/{owner}/settings/team_roles     the owner's custom roles (lib/roles.js). Server-written; members cannot read or write it.
// A custom role's permissions are also copied onto each member's record and each invite (roleId, perms), because the gate and the
// database rules read the record they already have, not a second document. updateCustomRole keeps the copies in step.
//   users/{member}/settings/workspace     the member's pointer to the workspace they work in
// The token itself is never stored, only its hash, so a leaked database does not leak working invite links.
import crypto from 'node:crypto';
import * as real from '../server-firestore.js';
import { checkInvite, inviteExpiry, looksLikeEmail, normEmail, INVITABLE_ROLES, isRole, rosterView, seatLimit, seatsLeft } from '../workspace-access.js';
import { addRole, removeRole, sanitizeStoredRoles, updateRole } from '../roles.js';
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

export async function createInvite(db, ownerUid, { email = '', role = 'manager', custom = null, seatsLimit = null }, now = Date.now()) {
  if (role === 'custom' ? !custom?.id : !INVITABLE_ROLES.includes(role)) return fail('BAD_ROLE', 'Choose a role.', 422);
  const e = normEmail(email);
  if (e && !looksLikeEmail(e)) return fail('BAD_EMAIL', 'That does not look like an email address.', 422);
  const roster = await loadRoster(db, ownerUid, now);
  const limit = seatLimit(seatsLimit);
  if (e && roster.members.some((m) => normEmail(m.email) === e)) return fail('ALREADY_MEMBER', 'That person is already on your team.');
  if (seatsLeft({ members: roster.counts.members, pendingInvites: roster.counts.pendingInvites, limit }) < 1) {
    return fail('SEATS_FULL', `Your plan allows ${limit} team member${limit === 1 ? '' : 's'} besides you (invites waiting count too). Remove someone or cancel an invite, or upgrade.`, 402);
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const roleId = role === 'custom' ? String(custom.id) : '';
  const perms = role === 'custom' ? [...custom.permissions] : [];
  await F.setDoc(F.doc(db, 'team_invites', hash(token)), { ownerUid, email: e, role, roleId, perms, createdAt: new Date(now).toISOString(), expiresAt: inviteExpiry(now), usedAt: null, revokedAt: null });
  return { ok: true, token, email: e, role, roleId, expiresAt: inviteExpiry(now) };
}

export async function revokeInvite(db, ownerUid, inviteId) {
  const ref = F.doc(db, 'team_invites', String(inviteId || ''));
  const snap = await F.getDoc(ref);
  if (!snap.exists() || snap.data().ownerUid !== ownerUid) return fail('NOT_FOUND', 'That invite was not found.', 404);
  await F.updateDoc(ref, { revokedAt: new Date().toISOString() });
  return { ok: true };
}

/** The one accept step: checks the invite is for this person and still valid, then makes them a member. */
async function applyInvite(db, ref, invite, { uid, email = '', now = Date.now() }) {
  const check = checkInvite(invite, { email, now });
  if (!check.ok) return fail(check.code, check.error, check.code === 'INVITE_INVALID' ? 404 : 410);
  if (invite.ownerUid === uid) return fail('OWN_WORKSPACE', 'This is your own workspace, so there is nothing to accept.');
  const mine = await F.getDoc(F.doc(db, 'users', uid, 'settings', 'workspace'));
  if (mine.exists() && mine.data().ownerUid && mine.data().ownerUid !== uid) {
    const still = await F.getDoc(F.doc(db, 'users', mine.data().ownerUid, 'team_access', uid));
    if (still.exists()) return fail('ALREADY_IN_TEAM', 'You already work in another workspace. Leave it first, then use this invite.');
  }
  // No seat check here on purpose: every waiting invite already reserved its seat when it was created.
  const custom = invite.role === 'custom' ? { roleId: String(invite.roleId), perms: sanitizePermsList(invite.perms) } : null;
  await F.setDoc(F.doc(db, 'users', invite.ownerUid, 'team_access', uid), { role: invite.role, ...(custom ? { roleId: custom.roleId, perms: custom.perms } : {}), email: normEmail(email) || invite.email || '', addedAt: new Date(now).toISOString() });
  await F.setDoc(F.doc(db, 'users', uid, 'settings', 'workspace'), { ownerUid: invite.ownerUid, role: invite.role, joinedAt: new Date(now).toISOString() });
  await F.updateDoc(ref, { usedAt: new Date(now).toISOString(), usedBy: uid });
  invalidateWorkspace(uid);
  return { ok: true, ownerUid: invite.ownerUid, role: invite.role };
}

export async function acceptInvite(db, token, { uid, email = '' }, now = Date.now()) {
  if (!token || String(token).length < 20) return fail('INVITE_INVALID', 'This invite link is not valid. Ask for a new one.', 404);
  const ref = F.doc(db, 'team_invites', hash(token));
  const snap = await F.getDoc(ref);
  const invite = snap.exists() ? snap.data() : null;
  return applyInvite(db, ref, invite, { uid, email, now });
}

/** Accepts the waiting invites sent to this signed-in email, so an invited person does not have to open the link. Matched on the verified sign-in email only. */
export async function acceptPendingInvites(db, { uid, email = '' }, now = Date.now()) {
  const e = normEmail(email);
  if (!e || !uid) return { ok: false, accepted: 0, reason: 'NO_EMAIL' };
  const snap = await F.getDocs(F.query(F.collection(db, 'team_invites'), F.where('email', '==', e)));
  for (const d of snap.docs) {
    const invite = d.data();
    if (!invite || checkInvite(invite, { email: e, now }).ok !== true || invite.ownerUid === uid) continue;
    const ref = d.ref || F.doc(db, 'team_invites', d.id);
    const r = await applyInvite(db, ref, invite, { uid, email: e, now });
    if (r.ok) return { ok: true, accepted: 1, ownerUid: r.ownerUid, role: r.role };
  }
  return { ok: false, accepted: 0, reason: 'NONE' };
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

export async function setMemberRole(db, ownerUid, memberUid, role, custom = null) {
  if (role === 'custom' ? !custom?.id : !INVITABLE_ROLES.includes(role)) return fail('BAD_ROLE', 'Choose a role.', 422);
  const seat = F.doc(db, 'users', ownerUid, 'team_access', String(memberUid || ''));
  const snap = await F.getDoc(seat);
  if (!snap.exists()) return fail('NOT_FOUND', 'That person is not on your team.', 404);
  // a built-in role clears the custom copy, so no stale permissions are left on the record
  await F.updateDoc(seat, role === 'custom' ? { role, roleId: String(custom.id), perms: [...custom.permissions] } : { role, roleId: '', perms: [] });
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

// ---- Custom roles (lib/roles.js) -----------------------------------------------------------------------------------------------

const sanitizePermsList = (list) => (Array.isArray(list) ? list.filter((p) => typeof p === 'string') : []);

/** The owner's custom roles. Anything malformed in the stored list is dropped, never trusted. */
export async function loadCustomRoles(db, ownerUid) {
  const snap = await F.getDoc(F.doc(db, 'users', ownerUid, 'settings', 'team_roles'));
  return snap.exists() ? sanitizeStoredRoles(snap.data().roles) : [];
}

const saveRoles = (db, ownerUid, roles, now) => F.setDoc(F.doc(db, 'users', ownerUid, 'settings', 'team_roles'), { roles, updatedAt: new Date(now).toISOString() });

/** How many people and live invites hold this role. */
async function holdersOf(db, ownerUid, roleId, now) {
  const [seats, invs] = await Promise.all([
    F.getDocs(F.query(F.collection(db, 'users', ownerUid, 'team_access'), F.where('roleId', '==', roleId))),
    F.getDocs(F.query(F.collection(db, 'team_invites'), F.where('ownerUid', '==', ownerUid))),
  ]);
  const waiting = [];
  invs.forEach((d) => { const i = d.data(); if (i.roleId === roleId && !i.usedAt && !i.revokedAt && Date.parse(i.expiresAt || '') > now) waiting.push(d); });
  return { seats: seats.docs, invites: waiting };
}

export async function createCustomRole(db, ownerUid, input, now = Date.now()) {
  const existing = await loadCustomRoles(db, ownerUid);
  const id = `r_${crypto.randomBytes(6).toString('hex')}`;
  const r = addRole(existing, input, id);
  if (!r.ok) return fail(r.code, r.error, 422);
  await saveRoles(db, ownerUid, r.roles, now);
  return { ok: true, role: r.roles.find((x) => x.id === id), roles: r.roles };
}

export async function updateCustomRole(db, ownerUid, roleId, input, now = Date.now()) {
  const existing = await loadCustomRoles(db, ownerUid);
  const r = updateRole(existing, String(roleId || ''), input);
  if (!r.ok) return fail(r.code, r.error, r.code === 'NOT_FOUND' ? 404 : 422);
  await saveRoles(db, ownerUid, r.roles, now);
  // keep the copies on each member and invite in step with the new permissions
  const updated = r.roles.find((x) => x.id === roleId);
  const { seats, invites } = await holdersOf(db, ownerUid, roleId, now);
  for (const d of seats) await F.updateDoc(d.ref || F.doc(db, 'users', ownerUid, 'team_access', d.id), { perms: [...updated.permissions] });
  for (const d of invites) await F.updateDoc(d.ref || F.doc(db, 'team_invites', d.id), { perms: [...updated.permissions] });
  seats.forEach((d) => invalidateWorkspace(d.id));
  return { ok: true, role: updated, roles: r.roles };
}

export async function deleteCustomRole(db, ownerUid, roleId, now = Date.now()) {
  const existing = await loadCustomRoles(db, ownerUid);
  const { seats, invites } = await holdersOf(db, ownerUid, String(roleId || ''), now);
  const r = removeRole(existing, String(roleId || ''), seats.length + invites.length);
  if (!r.ok) return fail(r.code, r.error, r.code === 'NOT_FOUND' ? 404 : 409);
  await saveRoles(db, ownerUid, r.roles, now);
  return { ok: true, roles: r.roles };
}
