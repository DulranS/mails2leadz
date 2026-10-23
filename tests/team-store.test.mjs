import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvite, acceptInvite, loadRoster, removeMember, setMemberRole, leaveWorkspace, revokeInvite, __useFirestore } from '../lib/server/team-store.js';
import { setWorkspaceResolver } from '../lib/server/workspace.js';

// A tiny in-memory Firestore: just enough for the team records.
function fakeDb() {
  const m = new Map();
  const key = (segs) => segs.join('/');
  const api = {
    doc: (_db, ...segs) => ({ path: key(segs), id: segs[segs.length - 1] }),
    collection: (_db, ...segs) => ({ coll: key(segs) }),
    where: (field, op, value) => ({ field, op, value }),
    query: (c, w) => ({ ...c, w }),
    getDoc: async (ref) => ({ exists: () => m.has(ref.path), data: () => m.get(ref.path), id: ref.id }),
    setDoc: async (ref, data, opts) => { m.set(ref.path, opts && opts.merge ? { ...(m.get(ref.path) || {}), ...data } : { ...data }); },
    updateDoc: async (ref, data) => { if (!m.has(ref.path)) throw new Error('missing'); m.set(ref.path, { ...m.get(ref.path), ...data }); },
    deleteDoc: async (ref) => { m.delete(ref.path); },
    getDocs: async (q) => {
      const docs = [];
      for (const [path, data] of m) {
        const i = path.lastIndexOf('/');
        if (path.slice(0, i) !== q.coll) continue;
        if (q.w && !(q.w.op === '==' && data[q.w.field] === q.w.value)) continue;
        docs.push({ id: path.slice(i + 1), data: () => data });
      }
      return { docs, forEach: (fn) => docs.forEach(fn) };
    },
  };
  return { db: {}, api, m };
}
const NOW = Date.parse('2026-10-20T12:00:00Z');
const setup = () => { const f = fakeDb(); __useFirestore(f.api); setWorkspaceResolver(async () => null); return f; };

test('invite, accept: the roster record and the pointer are written, the token works once', async () => {
  const f = setup();
  const inv = await createInvite(f.db, 'owner', { email: 'Mgr@X.com', role: 'manager', seatsLimit: 3 }, NOW);
  assert.ok(inv.ok && inv.token.length >= 30 && inv.email === 'mgr@x.com');
  assert.ok(![...f.m.keys()].some((k) => k.includes(inv.token)), 'the raw token is never stored');
  const bad = await acceptInvite(f.db, inv.token, { uid: 'mgr', email: 'other@x.com' }, NOW);
  assert.equal(bad.code, 'INVITE_OTHER_EMAIL');
  const ok = await acceptInvite(f.db, inv.token, { uid: 'mgr', email: 'mgr@x.com' }, NOW + 1000);
  assert.deepEqual([ok.ok, ok.ownerUid, ok.role], [true, 'owner', 'manager']);
  assert.equal(f.m.get('users/owner/team_access/mgr').role, 'manager');
  assert.equal(f.m.get('users/mgr/settings/workspace').ownerUid, 'owner');
  assert.equal((await acceptInvite(f.db, inv.token, { uid: 'someone', email: 'mgr@x.com' }, NOW + 2000)).code, 'INVITE_USED');
  const roster = await loadRoster(f.db, 'owner', NOW + 3000);
  assert.deepEqual([roster.members.length, roster.invites.length, roster.counts.members], [1, 0, 1]);
});

test('guards: bad token, own workspace, expired, one workspace per person', async () => {
  const f = setup();
  assert.equal((await acceptInvite(f.db, 'short', { uid: 'a', email: 'a@x.com' }, NOW)).code, 'INVITE_INVALID');
  assert.equal((await acceptInvite(f.db, 'x'.repeat(40), { uid: 'a', email: 'a@x.com' }, NOW)).code, 'INVITE_INVALID');
  const own = await createInvite(f.db, 'owner', { role: 'viewer', seatsLimit: 5 }, NOW);
  assert.equal((await acceptInvite(f.db, own.token, { uid: 'owner', email: 'o@x.com' }, NOW)).code, 'OWN_WORKSPACE');
  const old = await createInvite(f.db, 'owner', { role: 'viewer', seatsLimit: 5 }, NOW);
  assert.equal((await acceptInvite(f.db, old.token, { uid: 'z', email: 'z@x.com' }, NOW + 8 * 864e5)).code, 'INVITE_EXPIRED');
  const a = await createInvite(f.db, 'owner', { role: 'viewer', seatsLimit: 5 }, NOW);
  assert.ok((await acceptInvite(f.db, a.token, { uid: 'p', email: 'p@x.com' }, NOW)).ok);
  const other = await createInvite(f.db, 'owner2', { role: 'viewer', seatsLimit: 5 }, NOW);
  assert.equal((await acceptInvite(f.db, other.token, { uid: 'p', email: 'p@x.com' }, NOW)).code, 'ALREADY_IN_TEAM');
});

test('seats count members and waiting invites; owner roles and bad emails are refused', async () => {
  const f = setup();
  assert.ok((await createInvite(f.db, 'o', { role: 'manager', seatsLimit: 2 }, NOW)).ok);
  const second = await createInvite(f.db, 'o', { email: 'b@x.com', role: 'viewer', seatsLimit: 2 }, NOW);
  assert.ok(second.ok);
  const third = await createInvite(f.db, 'o', { role: 'viewer', seatsLimit: 2 }, NOW);
  assert.equal(third.code, 'SEATS_FULL');
  assert.equal(third.status, 402);
  assert.equal((await createInvite(f.db, 'o', { role: 'owner', seatsLimit: 9 }, NOW)).code, 'BAD_ROLE');
  assert.equal((await createInvite(f.db, 'o', { email: 'nope', role: 'viewer', seatsLimit: 9 }, NOW)).code, 'BAD_EMAIL');
  const roster = await loadRoster(f.db, 'o', NOW);
  assert.ok((await revokeInvite(f.db, 'o', roster.invites[0].id)).ok);
  assert.equal((await revokeInvite(f.db, 'someone-else', roster.invites[0].id)).code, 'NOT_FOUND');
  assert.ok((await createInvite(f.db, 'o', { role: 'viewer', seatsLimit: 2 }, NOW)).ok);
});

test('remove, change role and leave all end or change access through the roster record', async () => {
  const f = setup();
  const inv = await createInvite(f.db, 'o', { role: 'manager', seatsLimit: 5 }, NOW);
  await acceptInvite(f.db, inv.token, { uid: 'm', email: 'm@x.com' }, NOW);
  assert.ok((await setMemberRole(f.db, 'o', 'm', 'viewer')).ok);
  assert.equal(f.m.get('users/o/team_access/m').role, 'viewer');
  assert.equal(f.m.get('users/m/settings/workspace').role, 'viewer');
  assert.equal((await setMemberRole(f.db, 'o', 'm', 'owner')).code, 'BAD_ROLE');
  assert.equal((await setMemberRole(f.db, 'o', 'ghost', 'viewer')).code, 'NOT_FOUND');
  assert.ok((await removeMember(f.db, 'o', 'm')).ok);
  assert.equal(f.m.has('users/o/team_access/m'), false);
  assert.equal(f.m.has('users/m/settings/workspace'), false);
  assert.equal((await removeMember(f.db, 'o', 'm')).code, 'NOT_FOUND');
  const again = await createInvite(f.db, 'o', { role: 'viewer', seatsLimit: 5 }, NOW);
  await acceptInvite(f.db, again.token, { uid: 'q', email: 'q@x.com' }, NOW);
  assert.ok((await leaveWorkspace(f.db, 'q')).ok);
  assert.equal(f.m.has('users/o/team_access/q'), false);
  assert.equal((await leaveWorkspace(f.db, 'q')).code, 'NOT_A_MEMBER');
});
