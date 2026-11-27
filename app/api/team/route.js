// app/api/team/route.js - team logins: people with "Manage team" (the owner, and any custom role given it) invite people, change roles and
// custom roles; anyone signed in may accept an invite; a member may leave. GET -> { workspace: { role, ownerUid, isOwner, permissions }, roster, roles, seats, mail }.
// POST { action: "invite" | "revoke_invite" | "remove" | "set_role" | "create_role" | "update_role" | "delete_role" }  needs Manage team
// POST { action: "accept", token } | { action: "leave" }                the signed-in person themselves
// The gate (proxy.js) has already verified the token and set the actor headers; roles are enforced here and in the database rules.
// Nobody can give a role, or change a person or role, with more permissions than they hold themselves (canGrant in lib/roles.js).
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { identify, getDb, actorFromRequest, actorPerms, NO_STORE } from '../../../lib/server/route-helpers.js';
import { recordAudit } from '../../../lib/server/audit.js';
import { getEntitlement } from '../../../lib/server/tenant.js';
import { acceptInvite, createCustomRole, createInvite, deleteCustomRole, leaveWorkspace, loadCustomRoles, loadRoster, removeMember, revokeInvite, setMemberRole, acceptPendingInvites, updateCustomRole } from '../../../lib/server/team-store.js';
import { sendSystemMail, mailProvider } from '../../../lib/server/system-mail.js';
import { teamInviteEmail } from '../../../lib/system-emails.js';
import { seatLimit } from '../../../lib/workspace-access.js';
import { can, canGrant, permissionsFor, resolveRoleChoice, sanitizeRole } from '../../../lib/roles.js';

const ok = (body) => NextResponse.json({ success: true, ...body }, { headers: NO_STORE });
const fail = (status, error, code) => NextResponse.json({ success: false, error, code }, { status, headers: NO_STORE });
const NO_ADMIN = 'Team access needs a server connection to the database. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first.';
const NO_TEAM = 'Only the owner, or someone with the Manage team permission, can change the team.';
const baseUrl = (request) => { const e = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim(); return /^https?:\/\//.test(e) ? new URL(e).origin : request.nextUrl.origin; };
// What a person on the roster may do, from their role (a custom role reads its own list).
const permsOfMember = (m, roles) => permissionsFor(m.role, (roles.find((r) => r.id === m.roleId) || {}).permissions);

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const actor = actorFromRequest(request);
  const isOwner = actor.uid === actor.tenantUid;
  const perms = actorPerms(request);
  const workspace = { role: isOwner ? 'owner' : actor.role, ownerUid: actor.tenantUid, isOwner, permissions: perms };
  const mail = { configured: mailProvider() !== 'none' };
  if (!can(perms, 'manageTeam') || !isAdminMode()) return ok({ workspace, mail, adminMode: isAdminMode() });
  try {
    const db = getDb();
    const [roster, roles, ent] = await Promise.all([loadRoster(db, actor.tenantUid), loadCustomRoles(db, actor.tenantUid), getEntitlement(db, actor.tenantUid).catch(() => null)]);
    const limit = seatLimit(ent?.limits?.teamSeats ?? null);
    return ok({ workspace, mail, adminMode: true, roster, roles, seats: { limit, used: roster.counts.members + roster.counts.pendingInvites } });
  } catch (e) { console.error('team read error:', e); return fail(500, 'Could not read the team right now.'); }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const who = identify(request, body?.userId);
    if (who.response) return who.response;
    if (!isAdminMode()) return fail(503, NO_ADMIN, 'NO_ADMIN');
    const actor = actorFromRequest(request);
    const perms = actorPerms(request);
    const action = String(body?.action || '');
    const db = getDb();

    if (action === 'accept_pending') {
      const r = await acceptPendingInvites(db, { uid: actor.uid, email: actor.email || '' });
      return ok(r);
    }
    if (action === 'accept') {
      if (!actor.email) return fail(400, 'Your account has no email address, so the invite cannot be matched.', 'NO_EMAIL');
      const r = await acceptInvite(db, String(body?.token || ''), { uid: actor.uid, email: actor.email });
      return r.ok ? ok({ ownerUid: r.ownerUid, role: r.role }) : fail(r.status, r.error, r.code);
    }
    if (action === 'leave') {
      const r = await leaveWorkspace(db, actor.uid);
      return r.ok ? ok({}) : fail(r.status, r.error, r.code);
    }

    if (!can(perms, 'manageTeam')) return fail(403, NO_TEAM, 'NO_PERMISSION');
    const ownerUid = actor.tenantUid;
    const customRoles = await loadCustomRoles(db, ownerUid);
    const audit = (a, extra = {}) => recordAudit(db, ownerUid, { action: a, actorUid: actor.uid, actorEmail: actor.email, ...extra });

    if (action === 'invite') {
      const pick = resolveRoleChoice(body?.role, customRoles);
      if (!pick) return fail(422, 'Choose a role.', 'BAD_ROLE');
      if (!canGrant(perms, pick.perms)) return fail(403, 'You cannot give a role with more permissions than your own.', 'NO_PERMISSION');
      const ent = await getEntitlement(db, ownerUid).catch(() => null);
      const r = await createInvite(db, ownerUid, { email: body?.email, role: pick.role, custom: pick.custom, seatsLimit: ent?.limits?.teamSeats ?? null });
      if (!r.ok) return fail(r.status, r.error, r.code);
      const link = `${baseUrl(request)}/join?token=${r.token}`;
      let emailed = false;
      if (r.email) {
        const mail = teamInviteEmail({ ownerName: String(body?.ownerName || '').slice(0, 80), role: r.role, roleName: pick.custom?.name || '', link, expiresAt: r.expiresAt });
        const sent = await sendSystemMail({ db, to: r.email, kind: 'invite', uid: ownerUid, ...mail });
        emailed = sent.sent;
      }
      await audit('team.invited', { summary: `Invited as ${pick.custom ? pick.custom.name : r.role}` });
      return ok({ link, emailed, email: r.email, role: r.role, roleId: r.roleId, expiresAt: r.expiresAt });
    }
    if (action === 'revoke_invite') { const r = await revokeInvite(db, ownerUid, body?.id); if (r.ok) await audit('team.invite_revoked', { entityId: String(body?.id || '') }); return r.ok ? ok({}) : fail(r.status, r.error, r.code); }

    if (action === 'remove' || action === 'set_role') {
      const memberUid = String(body?.uid || '');
      if (action === 'set_role' && memberUid === actor.uid) return fail(403, 'You cannot change your own role.', 'NO_PERMISSION');
      const roster = await loadRoster(db, ownerUid);
      const target = roster.members.find((m) => m.uid === memberUid);
      if (!target) return fail(404, 'That person is not on your team.', 'NOT_FOUND');
      if (!canGrant(perms, permsOfMember(target, customRoles))) return fail(403, 'That person has more access than you, so you cannot change them.', 'NO_PERMISSION');
      if (action === 'remove') { const r = await removeMember(db, ownerUid, memberUid); if (r.ok) await audit('team.removed', { entityId: memberUid }); return r.ok ? ok({}) : fail(r.status, r.error, r.code); }
      const pick = resolveRoleChoice(body?.role, customRoles);
      if (!pick) return fail(422, 'Choose a role.', 'BAD_ROLE');
      if (!canGrant(perms, pick.perms)) return fail(403, 'You cannot give a role with more permissions than your own.', 'NO_PERMISSION');
      const r = await setMemberRole(db, ownerUid, memberUid, pick.role, pick.custom);
      if (r.ok) await audit('team.role_changed', { entityId: memberUid, summary: `Set to ${pick.custom ? pick.custom.name : pick.role}` });
      return r.ok ? ok({}) : fail(r.status, r.error, r.code);
    }

    if (action === 'create_role' || action === 'update_role' || action === 'delete_role') {
      const roleId = String(body?.id || '');
      const current = action === 'create_role' ? null : customRoles.find((r) => r.id === roleId);
      if (action !== 'create_role' && !current) return fail(404, 'That role was not found.', 'NOT_FOUND');
      if (current && !canGrant(perms, current.permissions)) return fail(403, 'You cannot change a role with more permissions than your own.', 'NO_PERMISSION');
      if (action === 'delete_role') {
        const r = await deleteCustomRole(db, ownerUid, roleId);
        if (!r.ok) return fail(r.status, r.error, r.code);
        await audit('team.role_deleted', { summary: `Deleted role ${current.name}` });
        return ok({ roles: r.roles });
      }
      const check = sanitizeRole(body);
      if (!check.ok) return fail(422, check.error, check.code);
      if (!canGrant(perms, check.role.permissions)) return fail(403, 'You cannot give a role more permissions than your own.', 'NO_PERMISSION');
      const r = action === 'create_role' ? await createCustomRole(db, ownerUid, body) : await updateCustomRole(db, ownerUid, roleId, body);
      if (!r.ok) return fail(r.status, r.error, r.code);
      await audit(action === 'create_role' ? 'team.role_created' : 'team.role_changed_definition', { summary: `${action === 'create_role' ? 'Created' : 'Updated'} role ${check.role.name}` });
      return ok({ role: r.role, roles: r.roles });
    }
    return fail(400, 'Unknown action.', 'BAD_ACTION');
  } catch (e) {
    console.error('team error:', e);
    return fail(500, 'Could not update the team right now.');
  }
}
