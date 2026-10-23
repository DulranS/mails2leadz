// lib/workspace-client.js - browser side of team logins. Asks the SERVER whose workspace this person works in (GET /api/team: the
// server decides from its own records), remembers the answer for a few minutes, and gives pages a user whose uid is the WORKSPACE
// owner's, so every page that reads "user.uid" works inside the shared workspace without knowing about teams.
// Anything going wrong means "own workspace": it can never show someone else's data, because the database rules decide that.
const KEY = (uid) => `al_ws_${uid}`;
const TTL_MS = 10 * 60 * 1000;

export const ownWorkspace = (uid) => ({ ownerUid: uid, role: 'owner', isOwner: true, actorUid: uid });

export function peekWorkspace(uid) {
  try {
    if (typeof sessionStorage === 'undefined' || !uid) return null;
    const v = JSON.parse(sessionStorage.getItem(KEY(uid)) || 'null');
    if (v && Date.now() - v.at < TTL_MS && typeof v.ws?.ownerUid === 'string') return { ...v.ws, actorUid: uid };
  } catch { /* ignore */ }
  return null;
}
export function rememberWorkspace(uid, ws) {
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY(uid), JSON.stringify({ at: Date.now(), ws: { ownerUid: ws.ownerUid, role: ws.role, isOwner: ws.isOwner } })); } catch { /* ignore */ }
}
export function forgetWorkspace(uid) { try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(KEY(uid)); } catch { /* ignore */ } }

/** Ask the server. Returns null when it cannot answer (then the caller keeps the person in their own workspace). */
export async function fetchWorkspace(uid, { timeoutMs = 6000 } = {}) {
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    const res = await fetch('/api/team', { signal: ctl ? ctl.signal : undefined });
    if (t) clearTimeout(t);
    const data = await res.json().catch(() => null);
    const w = data?.workspace;
    if (!res.ok || !data?.success || !w || typeof w.ownerUid !== 'string') return null;
    const ws = { ownerUid: w.ownerUid, role: w.role || 'owner', isOwner: !!w.isOwner, actorUid: uid };
    rememberWorkspace(uid, ws);
    return ws;
  } catch { return null; }
}

/** A user whose uid is the workspace owner's (everything else, including getIdToken, still belongs to the real person). */
export function asWorkspaceUser(raw, ws) {
  if (!raw || !ws || ws.isOwner || !ws.ownerUid || ws.ownerUid === raw.uid) return raw;
  return Object.create(raw, { uid: { value: ws.ownerUid, enumerable: true }, actorUid: { value: raw.uid, enumerable: true } });
}

/** For code that runs its own sign-in listener: the right user, waiting for the server only when nothing is remembered. */
export async function resolveWorkspaceUser(raw) {
  if (!raw) return { user: null, workspace: null };
  const ws = peekWorkspace(raw.uid) || (await fetchWorkspace(raw.uid)) || ownWorkspace(raw.uid);
  return { user: asWorkspaceUser(raw, ws), workspace: ws };
}

const INVITE_KEY = 'al_invite';
export function rememberInvite(token) { try { if (token && typeof localStorage !== 'undefined') localStorage.setItem(INVITE_KEY, String(token)); } catch { /* ignore */ } }
export function pendingInvite() { try { return (typeof localStorage !== 'undefined' && localStorage.getItem(INVITE_KEY)) || ''; } catch { return ''; } }
export function clearInvite() { try { if (typeof localStorage !== 'undefined') localStorage.removeItem(INVITE_KEY); } catch { /* ignore */ } }

/** Accept an invite for the signed-in person. One try per token: it is forgotten either way, so it can never loop. */
export async function acceptInvite(uid, token) {
  clearInvite();
  try {
    const res = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept', token }) });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) { forgetWorkspace(uid); return { ok: true, role: data.role }; }
    return { ok: false, error: data?.error || 'Could not accept the invite. Ask for a new link.' };
  } catch { return { ok: false, error: 'Could not reach the server. Try the link again.' }; }
}
