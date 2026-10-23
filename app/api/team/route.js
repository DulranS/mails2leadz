// app/api/team/route.js - team logins: the owner manages who can work in the workspace; anyone signed in may accept an invite;
// a member may leave. GET -> { workspace: { role, ownerUid, isOwner }, roster (owner only), seats, mail }.
// POST { action: "invite" | "revoke_invite" | "remove" | "set_role" }  owner only
// POST { action: "accept", token } | { action: "leave" }                the signed-in person themselves
// The gate (proxy.js) has already verified the token and set the actor headers; roles are enforced here and in the database rules.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { identify, getDb, actorFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { getEntitlement } from '../../../lib/server/tenant.js';
import { acceptInvite, createInvite, leaveWorkspace, loadRoster, removeMember, revokeInvite, setMemberRole } from '../../../lib/server/team-store.js';
import { sendSystemMail, mailProvider } from '../../../lib/server/system-mail.js';
import { teamInviteEmail } from '../../../lib/system-emails.js';
import { seatLimit } from '../../../lib/workspace-access.js';

const ok = (body) => NextResponse.json({ success: true, ...body }, { headers: NO_STORE });
const fail = (status, error, code) => NextResponse.json({ success: false, error, code }, { status, headers: NO_STORE });
const NO_ADMIN = 'Team access needs a server connection to the database. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first.';
const baseUrl = (request) => { const e = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim(); return /^https?:\/\//.test(e) ? new URL(e).origin : request.nextUrl.origin; };

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const actor = actorFromRequest(request);
  const isOwner = actor.uid === actor.tenantUid;
  const workspace = { role: isOwner ? 'owner' : actor.role, ownerUid: actor.tenantUid, isOwner };
  const mail = { configured: mailProvider() !== 'none' };
  if (!isOwner || !isAdminMode()) return ok({ workspace, mail, adminMode: isAdminMode() });
  try {
    const db = getDb();
    const [roster, ent] = await Promise.all([loadRoster(db, actor.tenantUid), getEntitlement(db, actor.tenantUid).catch(() => null)]);
    const limit = seatLimit(ent?.limits?.teamSeats ?? null);
    return ok({ workspace, mail, adminMode: true, roster, seats: { limit, used: roster.counts.members + roster.counts.pendingInvites } });
  } catch (e) { console.error('team read error:', e); return fail(500, 'Could not read the team right now.'); }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const who = identify(request, body?.userId);
    if (who.response) return who.response;
    if (!isAdminMode()) return fail(503, NO_ADMIN, 'NO_ADMIN');
    const actor = actorFromRequest(request);
    const isOwner = actor.uid === actor.tenantUid;
    const action = String(body?.action || '');
    const db = getDb();

    if (action === 'accept') {
      if (!actor.email) return fail(400, 'Your account has no email address, so the invite cannot be matched.', 'NO_EMAIL');
      const r = await acceptInvite(db, String(body?.token || ''), { uid: actor.uid, email: actor.email });
      return r.ok ? ok({ ownerUid: r.ownerUid, role: r.role }) : fail(r.status, r.error, r.code);
    }
    if (action === 'leave') {
      const r = await leaveWorkspace(db, actor.uid);
      return r.ok ? ok({}) : fail(r.status, r.error, r.code);
    }

    if (!isOwner) return fail(403, 'Only the owner of this workspace can manage the team.', 'OWNER_ONLY');
    const ownerUid = actor.tenantUid;

    if (action === 'invite') {
      const ent = await getEntitlement(db, ownerUid).catch(() => null);
      const r = await createInvite(db, ownerUid, { email: body?.email, role: body?.role, seatsLimit: ent?.limits?.teamSeats ?? null });
      if (!r.ok) return fail(r.status, r.error, r.code);
      const link = `${baseUrl(request)}/join?token=${r.token}`;
      let emailed = false;
      if (r.email) {
        const mail = teamInviteEmail({ ownerName: String(body?.ownerName || '').slice(0, 80), role: r.role, link, expiresAt: r.expiresAt });
        const sent = await sendSystemMail({ db, to: r.email, kind: 'invite', uid: ownerUid, ...mail });
        emailed = sent.sent;
      }
      return ok({ link, emailed, email: r.email, role: r.role, expiresAt: r.expiresAt });
    }
    if (action === 'revoke_invite') { const r = await revokeInvite(db, ownerUid, body?.id); return r.ok ? ok({}) : fail(r.status, r.error, r.code); }
    if (action === 'remove') { const r = await removeMember(db, ownerUid, String(body?.uid || '')); return r.ok ? ok({}) : fail(r.status, r.error, r.code); }
    if (action === 'set_role') { const r = await setMemberRole(db, ownerUid, String(body?.uid || ''), String(body?.role || '')); return r.ok ? ok({}) : fail(r.status, r.error, r.code); }
    return fail(400, 'Unknown action.', 'BAD_ACTION');
  } catch (e) {
    console.error('team error:', e);
    return fail(500, 'Could not update the team right now.');
  }
}
