"use client";
// Team tasks: what needs doing, the day it is due and who has it. Overdue and due-today tasks also show on Today.
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200";
const STATE_LABEL = { overdue: "Overdue", due_today: "Due today", open: "Open", no_date: "No due date", done: "Done" };
const STATE_CLS = { overdue: "text-red-600 dark:text-red-400", due_today: "text-amber-700 dark:text-amber-300", open: "text-gray-600 dark:text-gray-300", no_date: "text-gray-600 dark:text-gray-300", done: "text-green-700 dark:text-green-400" };

export default function TasksPage() {
  const { user, ready } = useAuthUser();
  const [tasks, setTasks] = useState([]);
  const [owners, setOwners] = useState([]);
  const [summary, setSummary] = useState({ overdue: 0, dueToday: 0, needsAttention: 0 });
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState(false);
  const [remindOn, setRemindOn] = useState(false);
  const [remindAvailable, setRemindAvailable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setTasks(Array.isArray(j.tasks) ? j.tasks : []);
        setOwners(Array.isArray(j.owners) ? j.owners : []);
        setSummary(j.summary || { overdue: 0, dueToday: 0, needsAttention: 0 });
        setRemindOn(j.reminders?.on === true);
        setRemindAvailable(j.reminders?.available !== false);
        setError("");
      } else setError(j.error || "Could not load tasks.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready && user) load(); else if (ready) setLoading(false); }, [ready, user, load]);

  // Sends one change and reloads the list, so the screen always shows what is saved.
  const act = async (body) => {
    setError("");
    try {
      const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 403) setViewer(true);
      if (!res.ok) { setError(j.error || "Could not save that."); return false; }
      await load();
      return true;
    } catch {
      setError("Could not reach the server. Nothing was saved.");
      return false;
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const ok = await act({ action: "add", title, dueDate, assignedTo });
    if (ok) { setTitle(""); setDueDate(""); setAssignedTo(""); }
  };

  if (ready && !user) {
    return <DashboardLayout title="Tasks"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  }

  const label = (key) => owners.find((o) => o.key === key)?.label || "Unassigned";
  const open = tasks.filter((t) => !t.done);

  return (
    <DashboardLayout title="Tasks" subtitle="What needs doing, when it is due and who has it">
      <div className="space-y-4">
        <section className={card} aria-label="Summary">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {summary.needsAttention ? `${summary.overdue} overdue and ${summary.dueToday} due today.` : "Nothing overdue or due today."}
          </p>
          {viewer ? <p role="status" className="text-xs text-gray-600 dark:text-gray-300 mt-2">You can read tasks but not change them.</p> : null}
          {error ? <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </section>

        <section className={card} aria-label="Daily email reminder">
          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0"
              checked={remindOn}
              disabled={viewer || !remindAvailable}
              onChange={(e) => act({ action: "reminders", on: e.target.checked })}
            />
            <span className="text-sm text-gray-900 dark:text-white">
              Email me a daily list of overdue and due-today tasks
              <span className="block text-xs text-gray-600 dark:text-gray-300 mt-1">
                Off unless you turn it on. At most one email a day, sent from your connected Gmail to your own address, and only when something is overdue or due today. Needs Gmail connected with permission to send.
              </span>
              {!remindAvailable ? <span className="block text-xs text-amber-700 dark:text-amber-300 mt-1">The server connection to the database is not set up, so this cannot be switched on yet.</span> : null}
            </span>
          </label>
        </section>

        {!viewer ? (
          <form className={`${card} space-y-3`} onSubmit={add} aria-label="New task">
            <div>
              <label htmlFor="task-title" className="text-sm font-medium text-gray-900 dark:text-white">Task</label>
              <input id="task-title" className={`${field} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Call back the Hilltop Dental quote" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="task-due" className="text-sm font-medium text-gray-900 dark:text-white">Due day</label>
                <input id="task-due" type="date" className={`${field} mt-1`} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <label htmlFor="task-who" className="text-sm font-medium text-gray-900 dark:text-white">Who</label>
                <select id="task-who" className={`${field} mt-1`} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  <option value="">Unassigned</option>
                  {owners.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" className={`${btn} bg-blue-600 text-white border-blue-600`}>Add task</button>
          </form>
        ) : null}

        <section className={card} aria-label="Open tasks">
          {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading tasks...</p> : null}
          {!loading && open.length === 0 ? <p className="text-sm text-gray-700 dark:text-gray-200">No open tasks. Add one above.</p> : null}
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {open.map((t) => (
              <li key={t.id} className="py-3 flex flex-wrap items-start gap-3">
                {!viewer ? (
                  <button type="button" className={`${btn} min-w-[44px]`} onClick={() => act({ action: "done", id: t.id })} aria-label={`Mark done: ${t.title}`}>Done</button>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{t.title}</p>
                  {t.kind === "sms" && t.draft ? <p className="mt-1 text-xs text-gray-700 dark:text-gray-300 break-words">Draft to send from your phone{t.phone ? ` to ${t.phone}` : " (no number on file)"}: {t.draft}</p> : null}
                  {t.kind === "call" && t.note ? <p className="mt-1 text-xs text-gray-700 dark:text-gray-300 break-words">Note: {t.note}</p> : null}
                  <p className={`text-xs ${STATE_CLS[t.state] || ""}`}>{STATE_LABEL[t.state] || ""}{t.dueDate ? ` · ${t.dueDate}` : ""} · {label(t.assignedTo)}</p>
                </div>
                {!viewer ? (
                  <button type="button" className="text-xs underline min-h-[44px] px-2 text-gray-600 dark:text-gray-300" onClick={() => act({ action: "delete", id: t.id })} aria-label={`Delete: ${t.title}`}>Delete</button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  );
}
