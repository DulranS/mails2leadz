"use client";
// The sales assistant (v376): ask questions about your own pipeline in plain words. It reads your deals and answers; it changes nothing.
import React, { useState } from "react";
import Link from "next/link";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium bg-blue-600 text-white disabled:opacity-50";
const EXAMPLES = [
  "Which open deals have gone quiet?",
  "What is the biggest deal in negotiation?",
  "How much did I win and lose in the last 30 days?",
  "Where is most of my open value sitting?",
];

export default function AssistantPage() {
  const { user, ready } = useAuthUser();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState([]); // { role: "owner" | "assistant", text }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ask = async (text) => {
    const q = String(text || "").trim();
    if (!q || busy) return;
    setBusy(true);
    setError("");
    const earlier = turns.slice(-6);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: earlier }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setTurns((t) => [...t, { role: "owner", text: q }, { role: "assistant", text: j.answer || "No answer came back. Try asking again." }]);
        setQuestion("");
      } else {
        setError(j.error || "The assistant could not answer right now.");
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (ready && !user) {
    return (
      <DashboardLayout title="Assistant">
        <section className={card}>
          <p className="text-gray-700 dark:text-gray-200">
            Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to use the assistant.
          </p>
        </section>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Assistant" subtitle="Ask about your own pipeline. It reads your deals and answers; it changes nothing.">
      <div className="space-y-4">
        <section className={card}>
          {turns.length === 0 && (
            <div className="mb-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Try one of these:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => ask(ex)} disabled={busy}
                    className="min-h-[44px] px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.length > 0 && (
            <ul className="space-y-3 mb-4" aria-live="polite">
              {turns.map((t, i) => (
                <li key={i} className={t.role === "owner" ? "text-right" : "text-left"}>
                  <span className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                    t.role === "owner"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"}`}>
                    {t.text}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="flex flex-col sm:flex-row gap-2">
            <label className="sr-only" htmlFor="assistant-question">Your question</label>
            <input id="assistant-question" className={field} value={question} maxLength={600}
              onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your deals, value or follow-ups" />
            <button type="submit" className={btn} disabled={busy || !question.trim()}>
              {busy ? "Thinking..." : "Ask"}
            </button>
          </form>

          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Answers come from your deals as they are now. Check anything important in the CRM before acting on it.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}
