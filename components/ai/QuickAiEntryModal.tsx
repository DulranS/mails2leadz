"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Modal, Button, Checkbox } from "@/components/ui";
import { useAiAssistant } from "@/contexts/AiAssistantContext";
import { ProposedEntryCard } from "./ProposedEntryCard";
import { AI_QUICK_ENTRY_EXAMPLES } from "@/lib/aiQuickExamples";
import type { ProposedEntry } from "@/lib/aiTypes";
import { BoltIcon, QuestionIcon, WarningIcon } from "@/components/icons";

// One exchange in this modal's own short-lived transcript: what the person
// typed, and (once it arrives) the assistant's reply/question/proposals for
// that exact message. Keeping every turn on screen — not just the latest
// one — matters here specifically because a single quick-entry session
// often logs more than one thing back to back ("sold X" ... "also bought
// Y"); earlier proposals must stay visible and actionable rather than being
// silently replaced by the next turn's reply.
interface Turn {
  id: string;
  userText: string;
  replyText?: string | null; // undefined = still waiting on this turn
  question?: string | null;
  proposals: ProposedEntry[];
  messageId?: string | null;
  autoConfirming?: boolean;
  autoConfirmError?: string | null;
}

// The fourth quick action: "✨ Tell me what happened". A single free-text
// box that turns into pre-filled, reviewable sale/purchase/expense entries
// via the same AI Assistant backing the full /assistant page — this is
// deliberately the fastest possible path from "I did a thing" to a logged
// entry, for the moment-to-moment data entry friction a solo owner
// actually feels.
export default function QuickAiEntryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sendMessage, currentSessionId, startNewSession, sending, error, clearError, autoConfirmEntries, updateProposalStatus } =
    useAiAssistant();
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [autoConfirm, setAutoConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const lastTurn = turns[turns.length - 1];
  const awaitingAnswer = !!lastTurn?.question;
  const anyAutoConfirming = turns.some((t) => t.autoConfirming);

  // Keep the transcript scrolled to the newest turn as replies and
  // proposal cards stream in — same behaviour as the full assistant page.
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  function reset() {
    setText("");
    setTurns([]);
    clearError();
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Fills the composer with an example rather than sending it straight
  // away — if someone has ticked "save without review", firing an example
  // verbatim could log a fake sale/product to the real ledger. The person
  // still has to edit it with their real numbers and hit Send.
  function fillExample(example: string) {
    setText(example);
    textareaRef.current?.focus();
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (!currentSessionId) startNewSession();
    clearError();
    setText("");

    const turnId = crypto.randomUUID();
    setTurns((prev) => [...prev, { id: turnId, userText: trimmed, proposals: [] }]);

    function patchTurn(patch: Partial<Turn>) {
      setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, ...patch } : t)));
    }

    try {
      const result = await sendMessage(trimmed);
      patchTurn({
        replyText: result.reply,
        question: result.question || null,
        proposals: result.proposals,
        messageId: result.messageId,
      });

      // The assistant never writes to the ledger on its own: every proposal
      // comes back "pending" and shows as a pre-filled form to review and
      // save. This checkbox is the person's explicit, per-message opt-in to
      // skip that review; it is OFF by default. Entries that still lack
      // something required (see isAutoConfirmable) are refused by the server
      // and stay here for review either way.
      const stillPending = result.proposals.filter((p) => p.status === "pending");
      if (autoConfirm && stillPending.length > 0 && !result.question) {
        patchTurn({ autoConfirming: true });
        try {
          const confirmResults = await autoConfirmEntries(stillPending);
          const succeededIds = new Set(confirmResults.filter((r) => r.success).map((r) => r.id));
          await Promise.all(
            [...succeededIds].map((id) => updateProposalStatus(result.messageId, id, "confirmed").catch(() => {}))
          );
          const failedCount = confirmResults.length - succeededIds.size;
          setTurns((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    proposals: t.proposals.map((p) => (succeededIds.has(p.id) ? { ...p, status: "confirmed" } : p)),
                    autoConfirming: false,
                    autoConfirmError:
                      failedCount > 0
                        ? `${failedCount} entr${failedCount === 1 ? "y" : "ies"} couldn't be auto-confirmed — review ${failedCount === 1 ? "it" : "them"} below.`
                        : null,
                  }
                : t
            )
          );
        } catch {
          patchTurn({ autoConfirming: false, autoConfirmError: "Auto-confirmation failed. Please review and confirm manually." });
        }
      }
    } catch {
      // Something failed before a reply ever came back — drop the
      // placeholder turn rather than leaving a permanently "Thinking…"
      // bubble; the real error is surfaced via context.error below.
      setTurns((prev) => prev.filter((t) => t.id !== turnId));
    }
  }

  function handleProposalStatusChange(turnId: string, messageId: string | null | undefined, proposalId: string, status: "confirmed" | "discarded") {
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, proposals: t.proposals.map((p) => (p.id === proposalId ? { ...p, status } : p)) } : t))
    );
    if (messageId) updateProposalStatus(messageId, proposalId, status).catch(() => {});
  }

  const sendLabel = sending ? "Thinking…" : anyAutoConfirming ? "Logging…" : awaitingAnswer ? "Send answer" : "Log entry";

  return (
    <Modal open={open} onClose={handleClose} title="Quick entry with AI">
      <div className="space-y-4">
        {turns.length === 0 ? (
          <div className="bg-panel2 border border-line rounded-md p-3">
            <p className="text-sm text-fg font-medium">Describe what happened, in plain English</p>
            <p className="text-xs text-muted mt-1">
              I&apos;ll turn it into a sale, purchase, or bill for you to check — new products are created automatically, and
              I&apos;ll ask if anything&apos;s missing.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {AI_QUICK_ENTRY_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => fillExample(ex)}
                  className="text-xs text-left px-2.5 py-1.5 rounded-md border border-line bg-panel text-muted hover:text-fg hover:border-amber-dim transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={transcriptRef} className="max-h-[45vh] overflow-y-auto space-y-3 pr-1 -mr-1">
            {turns.map((t) => (
              <div key={t.id} className="space-y-2">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-amber text-ink whitespace-pre-wrap">{t.userText}</div>
                </div>

                {t.replyText === undefined ? (
                  <div className="text-xs text-muted px-1">Thinking…</div>
                ) : (
                  <>
                    {t.replyText && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-panel2 text-fg whitespace-pre-wrap">{t.replyText}</div>
                      </div>
                    )}
                    {t.autoConfirming && (
                      <div className="text-xs text-muted px-1 flex items-center gap-1.5">
                        <BoltIcon className="w-3.5 h-3.5" /> Logging entries automatically…
                      </div>
                    )}
                    {t.question && (
                      <div className="text-sm bg-amber/10 border border-amber/30 text-amber-soft rounded-md px-3 py-2 flex items-start gap-2">
                        <QuestionIcon className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="font-medium">{t.question}</span>
                      </div>
                    )}
                    {t.autoConfirmError && (
                      <div className="text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{t.autoConfirmError}</div>
                    )}
                    {t.proposals.length > 0 && (
                      <div className="space-y-2">
                        {t.proposals.map((p) => (
                          // Keyed on id+status so a status set externally (auto-confirmed
                          // by the assistant itself, or by the checkbox above) forces this
                          // card to remount and render as "Logged" instead of staying stuck
                          // on its own stale internal "pending" state.
                          <ProposedEntryCard
                            key={`${p.id}:${p.status}`}
                            entry={p}
                            onStatusChange={(status) => handleProposalStatusChange(t.id, t.messageId, p.id, status)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={awaitingAnswer ? `Answer: ${lastTurn.question}` : "Type what happened… (Enter to send)"}
          rows={awaitingAnswer || turns.length > 0 ? 2 : 3}
          className="w-full bg-panel2 border border-line rounded-md px-3 py-2 text-base sm:text-sm text-fg placeholder:text-muted focus:outline-none focus:border-amber-dim resize-none"
          autoFocus={!awaitingAnswer}
        />

        <label
          htmlFor="auto-confirm"
          className="flex items-start gap-2.5 bg-panel2 border border-line rounded-md px-3 py-2.5 cursor-pointer"
        >
          <Checkbox id="auto-confirm" checked={autoConfirm} onCheckedChange={setAutoConfirm} className="mt-0.5 shrink-0" />
          <span className="text-sm text-fg">
            Save without reviewing
            <span className="block text-xs text-muted mt-0.5">
              Off by default: you check each entry before it&apos;s saved. Turn this on only when you trust the match —
              complete entries are then saved as soon as the assistant replies.
            </span>
          </span>
        </label>

        <Button onClick={handleSend} disabled={!text.trim() || sending || anyAutoConfirming} className="w-full">
          {sendLabel}
        </Button>

        {error && (
          <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2 flex items-start gap-2">
            <WarningIcon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {currentSessionId && (
          <Link
            href="/assistant"
            onClick={handleClose}
            className="block text-center text-xs text-muted hover:text-fg pt-2"
          >
            Continue conversation in full assistant →
          </Link>
        )}
      </div>
    </Modal>
  );
}
