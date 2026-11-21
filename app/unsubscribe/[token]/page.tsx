"use client";

// Where the unsubscribe link in a marketing email lands. No sign-in. Pressing the button switches that customer's offers off.
import { useState } from "react";
import { useParams } from "next/navigation";

export default function UnsubscribePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [state, setState] = useState<"ask" | "busy" | "done" | "error">("ask");
  const [business, setBusiness] = useState("");
  const [message, setMessage] = useState("");

  async function confirm() {
    setState("busy");
    try {
      const res = await fetch("/api/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(data.error || "Couldn't update your choice."); setState("error"); return; }
      setBusiness(String(data.businessName ?? ""));
      setState("done");
    } catch {
      setMessage("Couldn't reach the server. Check your connection and try again.");
      setState("error");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border border-line p-6 text-center space-y-4">
        {state === "done" ? (
          <>
            <h1 className="text-lg font-semibold">You are unsubscribed</h1>
            <p className="text-sm text-muted">{business ? `${business} will` : "You will"} not send you offers by email any more. This takes effect straight away.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Stop offer emails?</h1>
            <p className="text-sm text-muted">Press the button and you will no longer get offers by email from this business. Messages about your orders are not affected.</p>
            {state === "error" && <p className="text-sm text-bad">{message}</p>}
            <button onClick={confirm} disabled={state === "busy"} className="px-4 py-2 rounded bg-amber-soft text-black text-sm font-medium disabled:opacity-50">
              {state === "busy" ? "Working…" : "Unsubscribe me"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
