// Team sign-in (Pass 177): a person invited by email joins on sign-in with that verified email; nothing else joins.
import assert from 'node:assert/strict';
import { createInvite, acceptPendingInvites, __useFirestore } from '../lib/server/team-store.js';
import { setWorkspaceResolver } from '../lib/server/workspace.js';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };

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

await t('an invited email joins on sign-in; a second sign-in does nothing more', async () => {
  const f = fakeDb(); __useFirestore(f.api); setWorkspaceResolver(async () => null);
  await createInvite(f.db, 'owner1', { email: 'Team@X.com', role: 'manager', seatsLimit: 5 });
  const first = await acceptPendingInvites(f.db, { uid: 'member1', email: 'team@x.com' });
  assert.equal(first.ok, true);
  assert.equal(first.ownerUid, 'owner1');
  assert.equal(f.m.get('users/owner1/team_access/member1').role, 'manager');
  assert.equal((await acceptPendingInvites(f.db, { uid: 'member1', email: 'team@x.com' })).ok, false);
});

await t('a different email gets nothing, and the owner never joins their own workspace', async () => {
  const f = fakeDb(); __useFirestore(f.api); setWorkspaceResolver(async () => null);
  await createInvite(f.db, 'owner1', { email: 'team@x.com', role: 'viewer', seatsLimit: 5 });
  assert.equal((await acceptPendingInvites(f.db, { uid: 'stranger', email: 'other@x.com' })).ok, false);
  assert.equal((await acceptPendingInvites(f.db, { uid: 'owner1', email: 'team@x.com' })).ok, false);
  assert.equal((await acceptPendingInvites(f.db, { uid: 'member2', email: '' })).reason, 'NO_EMAIL');
});

console.log(`\n${n} passed`);
