// lib/workspace-access.js - team logins (who may do what in a shared workspace), as PURE rules. One workspace belongs to one owner. People the owner invites sign in with their OWN
// account and work inside the owner's workspace with a role. Works the same whether the deployment is internal-only, sold to
// other businesses (SAAS_MODE on), or both: each customer business is its own workspace with its own team.
//
//   owner    everything, including the team, billing and deleting the account
//   manager  all the daily work (leads, outreach, replies, CRM, customers, billing, content); NOT the team, plan and payments,
//            keys, deleting the account, or re-connecting the mailbox
//   viewer   read only: sees everything a manager sees, changes nothing

export const ROLES = {
  owner: { id: 'owner', label: 'Owner', blurb: 'Everything, including the team, plan and deleting the account.' },
  manager: { id: 'manager', label: 'Manager', blurb: 'All the daily work. Cannot change the team, plan, keys or delete the account.' },
  viewer: { id: 'viewer', label: 'Viewer', blurb: 'Sees everything, changes nothing.' },
};
export const INVITABLE_ROLES = ['manager', 'viewer'];
export const INVITE_TTL_DAYS = 7;
export const DEFAULT_MAX_SEATS = 10; // people besides the owner, when the plan sets no number
const DAY = 86400000;

export const isRole = (r) => r === 'owner' || r === 'manager' || r === 'viewer';
export const normEmail = (e) => String(e ?? '').trim().toLowerCase();
export const looksLikeEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(normEmail(e)) && normEmail(e).length <= 254;

// API areas a manager must not touch: money and plan, keys, the account itself, re-connecting the mailbox.
// (/api/team decides for itself: only the owner may manage the roster; anyone signed in may accept an invite, and a member may leave.)
const OWNER_ONLY = ['/api/saas', '/api/stripe', '/api/tenant', '/api/inbound-key', '/api/lead-inbox/key', '/api/gmail-offline'];
const startsWithPath = (p, prefix) => p === prefix || p.startsWith(`${prefix}/`);

/**
 * May this role call this API route? Decided at the gate (proxy.js), before any route runs.
 * @returns {{ ok: true } | { ok: false, code: string, error: string }}
 */
export function routeAccess(role, method, pathname) {
  const r = isRole(role) ? role : 'viewer'; // an unknown role is treated as the least powerful
  if (r === 'owner') return { ok: true };
  const p = String(pathname || '');
  if (startsWithPath(p, '/api/team')) return { ok: true }; // the route itself checks owner / own-membership
  const m = String(method || 'GET').toUpperCase();
  if (OWNER_ONLY.some((x) => startsWithPath(p, x))) {
    return { ok: false, code: 'OWNER_ONLY', error: 'Only the owner of this workspace can do that.' };
  }
  if (r === 'viewer' && m !== 'GET' && m !== 'HEAD') {
    return { ok: false, code: 'VIEW_ONLY', error: 'You have view-only access to this workspace, so you cannot make changes.' };
  }
  return { ok: true };
}

/** People besides the owner an account may have. `seatsLimit` is the plan number or null (then the deployment default / env). */
export function seatLimit(seatsLimit, env = process.env) {
  if (Number.isFinite(Number(seatsLimit)) && Number(seatsLimit) >= 0 && seatsLimit !== null) return Math.floor(Number(seatsLimit));
  const e = Number(env.TEAM_MAX_SEATS);
  return Number.isFinite(e) && e >= 0 ? Math.floor(e) : DEFAULT_MAX_SEATS;
}

/** Is there room for one more person (counting members and invites still waiting)? */
export function seatsLeft({ members = 0, pendingInvites = 0, limit }) {
  return Math.max(0, limit - members - pendingInvites);
}

/** Is this invite usable by this person right now? Reasons are plain language. */
export function checkInvite(invite, { email = '', now = Date.now() } = {}) {
  if (!invite) return { ok: false, code: 'INVITE_INVALID', error: 'This invite link is not valid. Ask for a new one.' };
  if (invite.usedAt) return { ok: false, code: 'INVITE_USED', error: 'This invite was already used. Ask for a new one.' };
  if (invite.revokedAt) return { ok: false, code: 'INVITE_REVOKED', error: 'This invite was cancelled. Ask for a new one.' };
  const exp = Date.parse(invite.expiresAt || '');
  if (!Number.isFinite(exp) || now > exp) return { ok: false, code: 'INVITE_EXPIRED', error: `This invite expired (invites last ${INVITE_TTL_DAYS} days). Ask for a new one.` };
  if (!isRole(invite.role) || invite.role === 'owner') return { ok: false, code: 'INVITE_INVALID', error: 'This invite is not valid. Ask for a new one.' };
  if (invite.email && normEmail(invite.email) !== normEmail(email)) {
    return { ok: false, code: 'INVITE_OTHER_EMAIL', error: `This invite was sent to ${normEmail(invite.email)}. Sign in with that email address.` };
  }
  return { ok: true };
}

export const inviteExpiry = (now = Date.now()) => new Date(now + INVITE_TTL_DAYS * DAY).toISOString();

/** What the owner sees: members and waiting invites, newest first. Never includes anything secret. */
export function rosterView({ members = [], invites = [] } = {}, now = Date.now()) {
  return {
    members: members.map((m) => ({ uid: m.uid, email: m.email || '', name: m.name || '', role: isRole(m.role) ? m.role : 'viewer', addedAt: m.addedAt || '' }))
      .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt))),
    invites: invites.filter((i) => !i.usedAt && !i.revokedAt && Date.parse(i.expiresAt || '') > now)
      .map((i) => ({ id: i.id, email: i.email || '', role: i.role, expiresAt: i.expiresAt }))
      .sort((a, b) => String(b.expiresAt).localeCompare(String(a.expiresAt))),
  };
}
