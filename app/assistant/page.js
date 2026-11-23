"use client";
// The sales assistant (v377): saved chats, several per business. A chat is titled and saved automatically; the newest opens first.
// It reads your deals and answers in words. It changes nothing.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl";
const EXAMPLES = [
  { q: "Which open deals have gone quiet?", icon: "🕒" },
  { q: "What is the biggest deal in negotiation?", icon: "💎" },
  { q: "How much did I win and lose in the last 30 days?", icon: "📈" },
  { q: "Where is most of my open value sitting?", icon: "🧭" },
];
const FOLLOW_UPS = ["Break that down by stage", "Which of these should I follow up first?", "Show the biggest open deal"];

function timeAgo(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return "";
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2" aria-label="The assistant is writing">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-300 animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  );
}

function Avatar({ role, initial }) {
  if (role === "assistant") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-sm text-white shadow" aria-hidden="true">✦</span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-100" aria-hidden="true">{initial}</span>
  );
}

const STATUS_TEXT = { done: "Done", rejected: "Not made", failed: "Could not be made" };

// One proposed change: what it does, and Confirm or Not now until the owner decides.
function ActionCard({ a, busy, onDecide }) {
  const tone = a.status === "done" ? "text-green-700 dark:text-green-300" : a.status === "failed" ? "text-red-700 dark:text-red-300" : "text-gray-500 dark:text-gray-400";
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2.5 dark:border-indigo-500/40 dark:bg-indigo-500/10">
      <p className="break-words text-sm font-medium text-gray-900 dark:text-gray-100">{a.summary}</p>
      {a.type === "add_note" && a.text && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-600 dark:text-gray-300">Note: {a.text}</p>}
      {a.status === "proposed" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => onDecide("confirm")} className="min-h-[40px] rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white disabled:opacity-50">Confirm</button>
          <button type="button" disabled={busy} onClick={() => onDecide("reject")} className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200">Not now</button>
        </div>
      ) : (
        <p className={`mt-1 break-words text-xs font-medium ${tone}`}>
          {STATUS_TEXT[a.status] || a.status}{a.status === "failed" && a.reason ? `: ${a.reason}` : ""}
        </p>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const { user, ready } = useAuthUser();
  const initial = String(user?.displayName || user?.email || "You").trim().charAt(0).toUpperCase() || "Y";

  const [chats, setChats] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingQ, setPendingQ] = useState(null); // the question being answered, shown straight away
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const autoOpened = useRef(false);

  const activeTitle = useMemo(() => chats.find((c) => c.id === activeId)?.title || "New chat", [chats, activeId]);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant");
      const j = await res.json().catch(() => ({}));
      if (res.ok) setChats(Array.isArray(j.sessions) ? j.sessions : []);
      else setError(j.error || "Could not load your chats.");
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setListLoading(false);
    }
  }, []);

  const openChat = useCallback(async (id) => {
    setActiveId(id);
    setMessages([]);
    setError("");
    setChatLoading(true);
    try {
      const res = await fetch(`/api/assistant?session=${encodeURIComponent(id)}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) setMessages(Array.isArray(j.messages) ? j.messages : []);
      else { setError(j.error || "That chat could not be opened."); setActiveId(null); }
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setChatLoading(false);
    }
  }, []);

  const newChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setError("");
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (ready && user) loadList();
    else if (ready) setListLoading(false);
  }, [ready, user, loadList]);

  // The newest chat opens by itself the first time the list arrives, so the page never starts blank when there is history.
  useEffect(() => {
    if (!autoOpened.current && !listLoading && chats.length > 0 && !activeId) {
      autoOpened.current = true;
      openChat(chats[0].id);
    }
  }, [listLoading, chats, activeId, openChat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text) => {
    const q = String(text || "").trim();
    if (!q || busy) return;
    setBusy(true);
    setError("");
    setPendingQ(q);
    setInput("");
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeId ? { question: q, sessionId: activeId } : { question: q }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const stamp = Date.now();
        setMessages((m) => [
          ...m,
          { id: `o${stamp}`, role: "owner", text: q, createdAt: stamp },
          { id: j.messageId || `a${stamp}`, role: "assistant", text: j.answer || "No answer came back. Try asking again.", createdAt: stamp + 1, actions: Array.isArray(j.actions) ? j.actions : [], rejected: Array.isArray(j.rejected) ? j.rejected : [] },
        ]);
        if (!activeId && j.sessionId) setActiveId(j.sessionId);
        loadList();
      } else {
        setError(j.error || "The assistant could not answer right now.");
        setInput(q);
      }
    } catch {
      setError("Could not reach the server. Your question is still in the box.");
      setInput(q);
    } finally {
      setPendingQ(null);
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const removeChat = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm("Delete this chat? Its messages are removed for everyone in the business.")) return;
    try {
      const res = await fetch("/api/assistant", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "That chat could not be deleted.");
        return;
      }
      if (activeId === id) newChat();
      loadList();
    } catch {
      setError("Could not reach the server. Check your connection.");
    }
  };

  const decide = async (messageId, actionId, decision) => {
    if (!activeId || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/assistant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeId, messageId, actionId, decision }),
      });
      const j = await res.json().catch(() => ({}));
      if ((res.ok || res.status === 409) && j.action) {
        setMessages((ms) => ms.map((m) => (m.id !== messageId ? m : { ...m, actions: (m.actions || []).map((a) => (a.id === actionId ? j.action : a)) })));
      } else {
        setError(j.error || "That change could not be updated.");
      }
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      setError("Could not copy. Select the text and copy it instead.");
    }
  };

  if (ready && !user) {
    return (
      <DashboardLayout title="Assistant">
        <section className={`${card} p-5`}>
          <p className="text-gray-700 dark:text-gray-200">
            Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to use the assistant.
          </p>
        </section>
      </DashboardLayout>
    );
  }

  const empty = !chatLoading && messages.length === 0 && !pendingQ;

  return (
    <DashboardLayout title="Assistant" subtitle="Ask about your pipeline in plain words. It reads your deals and answers. It changes nothing.">
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:h-[calc(100dvh-10rem)] md:grid-cols-[260px_minmax(0,1fr)]">
        {/* Chat list */}
        <aside className={`${card} min-w-0 w-full p-3 flex flex-col min-h-[180px] md:min-h-0 md:h-full`} aria-label="Your chats">
          <button
            type="button"
            onClick={newChat}
            className="min-h-[44px] w-full rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white shadow hover:opacity-95 transition"
          >
            + New chat
          </button>

          <div className="mt-3 flex-1 min-h-0 space-y-1 overflow-y-auto max-h-[420px] md:max-h-none pr-1">
            {listLoading && [0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
            ))}
            {!listLoading && chats.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                No chats yet. Your first question starts one, and it is saved here automatically.
              </p>
            )}
            {!listLoading && chats.map((c) => {
              const active = c.id === activeId;
              return (
                <div key={c.id} className={`group relative rounded-xl transition ${active ? "bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-300 dark:ring-indigo-500/40" : "hover:bg-gray-50 dark:hover:bg-gray-700/60"}`}>
                  <button type="button" onClick={() => openChat(c.id)} className="block w-full min-w-0 min-h-[44px] px-3 py-2 pr-9 text-left">
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">{c.title || "New chat"}</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {c.lastPreview ? c.lastPreview : "No answer yet"} · {timeAgo(c.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => removeChat(c.id, e)}
                    aria-label={`Delete chat ${c.title || ""}`}
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-300 opacity-70 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Conversation */}
        <section className={`${card} min-w-0 w-full flex flex-col min-h-[460px] md:min-h-0 md:h-full overflow-hidden`}>
          <header className="flex min-w-0 items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 px-4 py-3">
            <div className="min-w-0 flex items-center gap-3">
              <Avatar role="assistant" />
              <div className="min-w-0">
                <h2 className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{activeTitle}</h2>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {busy ? "Looking at your deals..." : "Reads your deals as they are now"}
                </p>
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-4" aria-live="polite">
            {chatLoading && (
              <div className="space-y-3">
                {[0, 1].map((i) => <div key={i} className="h-14 w-2/3 rounded-2xl bg-gray-100 dark:bg-gray-700 animate-pulse" />)}
              </div>
            )}

            {empty && (
              <div className="flex flex-col items-center text-center py-6">
                <div className="relative mb-4">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-400 blur-xl opacity-40 animate-pulse" aria-hidden="true" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-2xl text-white shadow-lg">✦</div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">What do you want to know about your pipeline?</h3>
                <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">Pick a starting point, or type your own question below.</p>
                <div className="mt-5 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.q}
                      type="button"
                      onClick={() => send(ex.q)}
                      disabled={busy}
                      className="min-h-[52px] rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 px-3 py-2 text-left text-sm text-gray-800 dark:text-gray-100 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10 transition disabled:opacity-50"
                    >
                      <span className="mr-2" aria-hidden="true">{ex.icon}</span>{ex.q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.role === "owner" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && <Avatar role="assistant" />}
                <div className={`group max-w-[85%] sm:max-w-[75%] ${m.role === "owner" ? "items-end" : "items-start"} flex flex-col`}>
                  <div className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                    m.role === "owner"
                      ? "rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
                      : "rounded-bl-md border border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"}`}>
                    {m.text}
                  </div>
                  {m.role === "assistant" && Array.isArray(m.actions) && m.actions.length > 0 && (
                    <div className="mt-2 w-full space-y-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Nothing changes until you confirm.</p>
                      {m.actions.map((a) => (
                        <ActionCard key={a.id} a={a} busy={busy} onDecide={(d) => decide(m.id, a.id, d)} />
                      ))}
                    </div>
                  )}
                  {m.role === "assistant" && Array.isArray(m.rejected) && m.rejected.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                      {m.rejected.map((r, i) => <li key={i} className="break-words">{r}</li>)}
                    </ul>
                  )}
                  {m.role === "assistant" && (
                    <button type="button" onClick={() => copy(m.id, m.text)} className="mt-1 min-h-[32px] px-2 text-xs text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 opacity-70 md:opacity-0 md:group-hover:opacity-100">
                      {copied === m.id ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
                {m.role === "owner" && <Avatar role="owner" initial={initial} />}
              </div>
            ))}

            {pendingQ && (
              <>
                <div className="flex gap-3 justify-end">
                  <div className="max-w-[85%] sm:max-w-[75%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-2.5 text-sm text-white opacity-80">{pendingQ}</div>
                  <Avatar role="owner" initial={initial} />
                </div>
                <div className="flex gap-3 justify-start">
                  <Avatar role="assistant" />
                  <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3 dark:border-gray-600 dark:bg-gray-700"><TypingDots /></div>
                </div>
              </>
            )}

            {!busy && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
              <div className="flex flex-wrap gap-2 pl-11">
                {FOLLOW_UPS.map((f) => (
                  <button key={f} type="button" onClick={() => send(f)} className="min-h-[36px] rounded-full border border-indigo-200 px-3 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/40 dark:text-indigo-200 dark:hover:bg-indigo-500/15">
                    {f}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {error && <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="border-t border-gray-100 dark:border-gray-700 p-3 pr-20 md:pr-3 flex items-end gap-2 min-w-0"
          >
            <label htmlFor="assistant-question" className="sr-only">Your question</label>
            <textarea
              id="assistant-question"
              ref={inputRef}
              value={input}
              rows={1}
              maxLength={600}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
              }}
              placeholder="Ask about your deals..."
              className="max-h-32 min-h-[44px] w-full min-w-0 flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:ring-indigo-500/30"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="min-h-[44px] rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-4 text-sm font-semibold text-white shadow disabled:opacity-40 transition"
            >
              {busy ? "..." : "Send"}
            </button>
          </form>
          <p className="px-4 pb-3 text-[11px] text-gray-400 dark:text-gray-500">
            Enter sends. Answers come from your deals as they are now. Check anything important in the CRM before acting on it.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}
