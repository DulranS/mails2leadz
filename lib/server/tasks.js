// lib/server/tasks.js - the owner's team tasks in users/{uid}/tasks. Each write is one document; reads are capped.
import { collection, doc, addDoc, getDocs, query, orderBy, limit, updateDoc, deleteDoc } from '../server-firestore.js';
import { TASK_LIST_MAX, validTaskId } from '../task-rules.js';

export async function listTasks(db, uid) {
  const snap = await getDocs(query(collection(db, 'users', String(uid), 'tasks'), orderBy('createdAt', 'desc'), limit(TASK_LIST_MAX)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** @returns {Promise<string>} the new task's id */
export async function addTask(db, uid, task, { createdBy = '' } = {}) {
  const ref = await addDoc(collection(db, 'users', String(uid), 'tasks'), {
    ...task,
    createdAt: new Date().toISOString(),
    createdBy: String(createdBy).slice(0, 128),
  });
  return ref.id;
}

/** @returns {Promise<{ok:boolean, error?:string}>} */
export async function setTaskDone(db, uid, id, done) {
  if (!validTaskId(id)) return { ok: false, error: 'That task was not found.' };
  await updateDoc(doc(db, 'users', String(uid), 'tasks', id), { done: done === true, doneAt: done === true ? new Date().toISOString() : null });
  return { ok: true };
}

/** @returns {Promise<{ok:boolean, error?:string}>} */
export async function removeTask(db, uid, id) {
  if (!validTaskId(id)) return { ok: false, error: 'That task was not found.' };
  await deleteDoc(doc(db, 'users', String(uid), 'tasks', id));
  return { ok: true };
}
