// In-memory stand-in for lib/server-firestore.js, used only by the route tests. Same function names, no network.
const store = new Map(); // path -> data
let seq = 0;
const join = (segs) => segs.filter((x) => x !== undefined && x !== null).map(String).join('/');
const refOf = (path) => ({ path, id: path.split('/').pop(), ref: undefined });
const mk = (path) => { const r = refOf(path); r.ref = r; return r; };
const snapOf = (path) => {
  const exists = store.has(path);
  return { id: path.split('/').pop(), exists: () => exists, data: () => (exists ? { ...store.get(path) } : undefined), ref: mk(path) };
};

export const getFirestore = () => ({ __fake: true });
export const isAdminMode = () => true;
export const serverMode = () => 'admin';
export const adminProblem = () => null;
export const adminProjectMismatch = () => false;
export const adminReason = () => '';
export const serverLoginProblem = () => null;
export const increment = (n) => ({ __inc: n });
export const orderBy = (...a) => ({ __order: a });

export function collection(_db, ...segs) { return { __coll: join(segs) }; }
export function doc(first, ...segs) {
  if (first && first.__coll !== undefined) return mk(`${first.__coll}/${join(segs)}`);
  return mk(join(segs));
}
export async function getDoc(ref) { return snapOf(ref.path); }
export async function setDoc(ref, data, opts = {}) {
  const prev = store.get(ref.path) || {};
  store.set(ref.path, opts && opts.merge ? { ...prev, ...data } : { ...data });
}
export async function updateDoc(ref, patch) {
  if (!store.has(ref.path)) throw new Error(`No document to update: ${ref.path}`);
  store.set(ref.path, { ...store.get(ref.path), ...patch });
}
export async function addDoc(collRef, data) {
  const id = `auto${++seq}`;
  const path = `${collRef.__coll}/${id}`;
  store.set(path, { ...data });
  return mk(path);
}
export async function deleteDoc(ref) { store.delete(ref.path); }
export function where(field, op, value) { return { __where: [field, op, value] }; }
export function limit(n) { return { __limit: n }; }
export function query(coll, ...constraints) { return { __query: coll.__coll, constraints }; }
export async function getDocs(q) {
  const coll = q.__query;
  const wheres = q.constraints.filter((c) => c.__where).map((c) => c.__where);
  const lim = (q.constraints.find((c) => c.__limit) || {}).__limit;
  const prefix = `${coll}/`;
  const rows = [];
  for (const [path, data] of store) {
    if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
    if (wheres.every(([f, op, v]) => (op === '==' ? data[f] === v : true))) rows.push({ path, data });
  }
  const docs = (lim ? rows.slice(0, lim) : rows).map((r) => ({ id: r.path.split('/').pop(), data: () => ({ ...r.data }), ref: mk(r.path) }));
  return { docs, empty: docs.length === 0, size: docs.length };
}

// test helpers
export const __seed = (path, data) => store.set(path, { ...data });
export const __read = (path) => (store.has(path) ? { ...store.get(path) } : undefined);
export const __all = (prefix) => [...store.entries()].filter(([p]) => p.startsWith(`${prefix}/`) && !p.slice(prefix.length + 1).includes('/')).map(([p, d]) => ({ id: p.split('/').pop(), ...d }));
export const __reset = () => { store.clear(); seq = 0; };
