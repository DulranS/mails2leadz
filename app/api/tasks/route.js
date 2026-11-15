// app/api/tasks/route.js - the team's tasks: a title, a due day and one assignee. Owners and managers can change them; viewers can read.
import { NextResponse } from 'next/server';
import { identify, getDb, actorFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { ownersFor } from '../../../lib/server/owner-settings.js';
import { ownerOffsetMin } from '../../../lib/server/owner-clock.js';
import { listTasks, addTask, setTaskDone, removeTask } from '../../../lib/server/tasks.js';
import { sanitizeTask, tasksView, tasksSummary } from '../../../lib/task-rules.js';


export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const db = getDb();
  const now = Date.now();
  const [rows, owners, offset] = await Promise.all([listTasks(db, who.uid), ownersFor(db, who.uid), ownerOffsetMin(db, who.uid, now)]);
  return NextResponse.json({
    tasks: tasksView(rows, now, offset, { includeDone: new URL(request.url).searchParams.get('done') === '1' }),
    summary: tasksSummary(rows, now, offset),
    owners: owners.map((o) => ({ key: o.key, label: o.label })),
  }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const actor = actorFromRequest(request);
  if (actor.role === 'viewer') {
    return NextResponse.json({ error: 'Viewers can read tasks but cannot change them.', code: 'VIEWER_READ_ONLY' }, { status: 403, headers: NO_STORE });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send the task as JSON.' }, { status: 400, headers: NO_STORE }); }
  const db = getDb();
  const action = String(body?.action || '');

  if (action === 'add') {
    const s = sanitizeTask(body, await ownersFor(db, who.uid));
    if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400, headers: NO_STORE });
    const id = await addTask(db, who.uid, s.task, { createdBy: actor.uid });
    return NextResponse.json({ ok: true, id }, { headers: NO_STORE });
  }
  if (action === 'done' || action === 'reopen') {
    const r = await setTaskDone(db, who.uid, body?.id, action === 'done');
    return NextResponse.json(r.ok ? { ok: true } : { error: r.error }, { status: r.ok ? 200 : 400, headers: NO_STORE });
  }
  if (action === 'delete') {
    const r = await removeTask(db, who.uid, body?.id);
    return NextResponse.json(r.ok ? { ok: true } : { error: r.error }, { status: r.ok ? 200 : 400, headers: NO_STORE });
  }
  return NextResponse.json({ error: 'Unknown task action.' }, { status: 400, headers: NO_STORE });
}
