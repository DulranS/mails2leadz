"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useRequireRole } from "@/lib/roleGuard";
import { useAiAssistant } from "@/contexts/AiAssistantContext";
import { useData } from "@/contexts/DataContext";
import { PageHeader, Card, Button, EmptyState, Modal } from "@/components/ui";
import { ProposedEntryCard } from "@/components/ai/ProposedEntryCard";
import { AI_QUICK_ENTRY_EXAMPLES } from "@/lib/aiQuickExamples";
import { generateSuggestedQuestions } from "@/lib/aiSuggestedQuestions";
import type { AiChatMessage, AiChatSession } from "@/lib/aiTypes";
import { EditIcon, TrashIcon, BoltIcon, BrainIcon, LightbulbIcon } from "@/components/icons";

function relativeDay(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// --- Sidebar -----------------------------------------------------------
// SessionRow/SessionList used to be declared *inside* AssistantPage's
// render body. That gave them a brand-new function identity on every
// render of the page — including every keystroke in the composer, since
// `draft` lives in the same component. React treats a changed component
// type as "different component", so it was unmounting and rebuilding the
// entire sidebar (and losing any in-progress rename input) on every
// character typed. Hoisting them to module scope plus React.memo means
// they only re-render when their own props actually change.

interface SessionRowProps {
  session: AiChatSession;
  active: boolean;
  renaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onRenameValueChange: (value: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
}

const SessionRow = memo(function SessionRow({
  session,
  active,
  renaming,
  renameValue,
  onSelect,
  onRenameValueChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
}: SessionRowProps) {
  if (renaming) {
    return (
      <input
        autoFocus
        value={renameValue}
        onChange={(e) => onRenameValueChange(e.target.value)}
        onBlur={onCommitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommitRename();
          if (e.key === "Escape") onCancelRename();
        }}
        className="w-full bg-panel2 border border-amber-dim rounded-md px-2.5 py-2 text-sm text-fg focus:outline-none"
      />
    );
  }
  return (
    <div
      className={clsx(
        "group flex items-center gap-1.5 rounded-md px-2.5 py-2 cursor-pointer",
        active ? "bg-panel2 border border-amber-dim/60" : "hover:bg-panel2 border border-transparent"
      )}
      onClick={onSelect}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm text-fg truncate">{session.title}</div>
        <div className="text-[11px] text-muted">{relativeDay(session.updatedAt)}</div>
      </div>
      {/* Always visible below sm (touch screens have no ":hover" to reveal
          these on, so "opacity-0 until hovered" would make them permanently
          unreachable on mobile) and hover-revealed on desktop, where a
          pointer makes that discoverable and keeps the row visually calm. */}
      <button
        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-muted hover:text-fg text-sm w-11 h-11 sm:w-7 sm:h-7 flex items-center justify-center shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onStartRename();
        }}
        aria-label="Rename"
      >
        <EditIcon className="w-3.5 h-3.5" />
      </button>
      <button
        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-muted hover:text-bad text-sm w-11 h-11 sm:w-7 sm:h-7 flex items-center justify-center shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

interface SessionListProps {
  sessions: AiChatSession[];
  currentSessionId: string | null;
  renamingId: string | null;
  renameValue: string;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRenameValueChange: (value: string) => void;
  onStartRename: (id: string, currentTitle: string) => void;
  onCommitRename: (id: string) => void;
  onCancelRename: () => void;
  onDelete: (session: AiChatSession) => void;
}

const SessionList = memo(function SessionList({
  sessions,
  currentSessionId,
  renamingId,
  renameValue,
  onNewChat,
  onSelect,
  onRenameValueChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
}: SessionListProps) {
  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={onNewChat} className="w-full">
        + New conversation
      </Button>
      {sessions.length === 0 ? (
        <div className="text-xs text-muted px-1">No conversations yet.</div>
      ) : (
        <div className="space-y-1">
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={s.id === currentSessionId}
              renaming={renamingId === s.id}
              renameValue={renameValue}
              onSelect={() => onSelect(s.id)}
              onRenameValueChange={onRenameValueChange}
              onStartRename={() => onStartRename(s.id, s.title)}
              onCommitRename={() => onCommitRename(s.id)}
              onCancelRename={onCancelRename}
              onDelete={() => onDelete(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// --- Transcript ----------------------------------------------------------
// Each bubble is memoized on its own message object so re-renders caused
// by unrelated state (typing in the composer, the "Thinking…" indicator
// toggling) don't re-diff every past message — only ones that actually
// changed (e.g. a proposal's status) do any work.

const MessageBubble = memo(function MessageBubble({
  message,
  onAutoConfirm,
  onProposalStatusChange,
  autoConfirming,
}: {
  message: AiChatMessage;
  onAutoConfirm?: (messageId: string, pendingProposals: AiChatMessage["proposals"]) => void;
  onProposalStatusChange: (messageId: string, proposalId: string, status: "confirmed" | "discarded") => void;
  autoConfirming?: boolean;
}) {
  // Only ever the *pending* ones — an already-confirmed proposal must never
  // be handed back to "Confirm all", or it gets logged to the ledger a
  // second time.
  const pendingProposals = message.proposals?.filter((p) => p.status === "pending") ?? [];

  return (
    <div>
      <div className={clsx("flex", message.role === "user" ? "justify-end" : "justify-start")}>
        <div
          className={clsx(
            "max-w-[88%] sm:max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
            message.role === "user" ? "bg-amber text-ink" : "bg-panel2 text-fg"
          )}
        >
          {message.imageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={message.imageDataUrl} alt="Attached receipt" className="rounded-md mb-2 max-h-48 w-full object-cover" />
          )}
          {message.text}
        </div>
      </div>
      {message.proposals && message.proposals.length > 0 && (
        <div className="mt-2 space-y-2 max-w-[88%] sm:max-w-[75%]">
          {pendingProposals.length > 0 && onAutoConfirm && (
            <Button
              variant="ghost"
              onClick={() => onAutoConfirm(message.id, pendingProposals)}
              disabled={autoConfirming}
              className="text-xs"
            >
              {autoConfirming ? (
                "Saving…"
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <BoltIcon className="w-3.5 h-3.5" /> Confirm all
                </span>
              )}
            </Button>
          )}
          {message.proposals.map((p) => (
            // Keyed on id+status, not just id: a status change coming from
            // outside this card's own form (e.g. "Auto-confirm all" writing
            // the entry then persisting its status) has to force a remount
            // to show as confirmed — the card's confirmed/discarded state
            // otherwise lives in its own useState, which a changed `entry`
            // prop alone doesn't reset.
            <ProposedEntryCard
              key={`${p.id}:${p.status}`}
              entry={p}
              onStatusChange={(status) => onProposalStatusChange(message.id, p.id, status)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default function AssistantPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager"]);
  const {
    sessions,
    currentSessionId,
    messages,
    memoryNotes,
    sending,
    error,
    clearError,
    startNewSession,
    selectSession,
    renameSession,
    deleteSession,
    sendMessage,
    forgetMemoryNote,
    autoConfirmEntries,
    updateProposalStatus,
  } = useAiAssistant();

  // Data-driven suggestions ("who owes me money that's overdue?", "any
  // unusual spending?"...) computed entirely client-side from data already
  // live here via DataContext's Firestore listeners — no model call, no AI
  // usage-cap cost. See lib/aiSuggestedQuestions.ts for the full rationale.
  const { sales, purchases, expenses, products, receivablePayments, receivableWriteOffs, payablePayments, billPayments, settings, saleReturns, stockAdjustments, supplierReturns, supplierCredits, customerDeposits, openingBalances } = useData();
  const suggestedQuestions = useMemo(
    () =>
      generateSuggestedQuestions({
        sales,
        purchases,
        expenses,
        products,
        receivablePayments,
        receivableWriteOffs,
        payablePayments,
        billPayments,
        settings,
        saleReturns,
        stockAdjustments,
        supplierReturns,
        supplierCredits,
        customerDeposits,
        openingBalances,
      }),
    [sales, purchases, expenses, products, receivablePayments, receivableWriteOffs, payablePayments, billPayments, settings, saleReturns, stockAdjustments, supplierReturns, supplierCredits, customerDeposits, openingBalances]
  );

  const [draft, setDraft] = useState("");
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [autoConfirming, setAutoConfirming] = useState(false);
  const [autoConfirmError, setAutoConfirmError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Land on the most recent conversation by default rather than an empty
  // composer with no context — matches how every chat app opens.
  useEffect(() => {
    if (!currentSessionId && sessions.length > 0) selectSession(sessions[0].id);
  }, [currentSessionId, sessions, selectSession]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    clearError();
    setDraft("");
    try {
      await sendMessage(text);
    } catch {
      // surfaced via `error` below
    }
  }, [draft, clearError, sendMessage]);

  // Fills the composer with an example rather than sending it straight
  // away, so it's plain the number is a placeholder to edit before this
  // becomes a real ledger entry — not something to fire off verbatim.
  const handleUseExample = useCallback((example: string) => {
    setDraft(example);
    textareaRef.current?.focus();
  }, []);

  const handleNewChat = useCallback(() => {
    startNewSession();
    setMobileSessionsOpen(false);
  }, [startNewSession]);

  const handleStartRename = useCallback((id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
  }, []);

  const handleCancelRename = useCallback(() => setRenamingId(null), []);

  const commitRename = useCallback(
    async (id: string) => {
      const title = renameValue.trim();
      setRenamingId(null);
      if (title) await renameSession(id, title).catch(() => {});
    },
    [renameValue, renameSession]
  );

  const handleDelete = useCallback(
    async (session: AiChatSession) => {
      if (!confirm(`Delete "${session.title}"? This can't be undone.`)) return;
      await deleteSession(session.id).catch(() => {});
    },
    [deleteSession]
  );

  const handlePickSession = useCallback(
    (id: string) => {
      selectSession(id);
      setMobileSessionsOpen(false);
    },
    [selectSession]
  );

  const handleAutoConfirm = useCallback(
    async (messageId: string, pendingProposals: AiChatMessage["proposals"]) => {
      if (autoConfirming || !pendingProposals || pendingProposals.length === 0) return;
      setAutoConfirming(true);
      setAutoConfirmError(null);
      try {
        const results = await autoConfirmEntries(pendingProposals);
        // Persist per-entry, not just on a full-batch success — a partial
        // failure (one bad entry in a batch of three) should still lock in
        // the ones that actually wrote, so they don't stay "pending" and
        // get logged a second time next time this button is clicked.
        await Promise.all(
          results
            .filter((r) => r.success)
            .map((r) => updateProposalStatus(messageId, r.id, "confirmed").catch(() => {}))
        );
        const failed = results.filter((r) => !r.success);
        if (failed.length > 0) {
          setAutoConfirmError(
            `${failed.length} entr${failed.length === 1 ? "y" : "ies"} couldn't be auto-confirmed — review ${failed.length === 1 ? "it" : "them"} below.`
          );
        }
      } catch (err) {
        setAutoConfirmError(err instanceof Error ? err.message : "Auto-confirmation failed.");
      } finally {
        setAutoConfirming(false);
      }
    },
    [autoConfirmEntries, autoConfirming, updateProposalStatus]
  );

  const handleProposalStatusChange = useCallback(
    (messageId: string, proposalId: string, status: "confirmed" | "discarded") => {
      updateProposalStatus(messageId, proposalId, status).catch(() => {
        setAutoConfirmError("Couldn't save that — it may reappear if you reopen this chat.");
      });
    },
    [updateProposalStatus]
  );

  if (guardLoading || !allowed) return null;

  const currentTitle = sessions.find((s) => s.id === currentSessionId)?.title ?? "New conversation";

  return (
    <>
      <PageHeader
        title="AI Assistant"
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setMemoryOpen(true)}>
              <span className="inline-flex items-center gap-1.5">
                <BrainIcon className="w-3.5 h-3.5" /> Memory{memoryNotes.length > 0 ? ` (${memoryNotes.length})` : ""}
              </span>
            </Button>
            <Button variant="ghost" onClick={handleNewChat}>
              + New chat
            </Button>
          </div>
        }
      />

      <div className="sm:hidden mb-4">
        <Button variant="ghost" onClick={() => setMobileSessionsOpen(true)} className="w-full justify-between">
          <span className="truncate">{currentTitle}</span>
          <span className="ml-2 shrink-0">▾</span>
        </Button>
      </div>

      <div className="flex gap-5 items-start">
        <aside className="hidden sm:block w-64 shrink-0">
          <Card>
            <SessionList
              sessions={sessions}
              currentSessionId={currentSessionId}
              renamingId={renamingId}
              renameValue={renameValue}
              onNewChat={handleNewChat}
              onSelect={selectSession}
              onRenameValueChange={setRenameValue}
              onStartRename={handleStartRename}
              onCommitRename={commitRename}
              onCancelRename={handleCancelRename}
              onDelete={handleDelete}
            />
          </Card>
        </aside>

        <div className="flex-1 min-w-0">
          <Card className="flex flex-col h-[65vh] sm:h-[70vh] p-0 overflow-hidden">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <>
                  <EmptyState
                    title="Ask me anything about your numbers"
                    body="Or tell me what you sold, bought, or paid for — I'll fill in the entry for you to review and confirm."
                  />
                  {suggestedQuestions.length > 0 && (
                    <div className="max-w-md mx-auto mt-4">
                      <div className="text-[11px] uppercase tracking-wide text-muted text-center mb-1.5">
                        Based on your data
                      </div>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {suggestedQuestions.slice(0, 4).map((q) => (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => handleUseExample(q.text)}
                            className="text-xs text-left px-2.5 py-1.5 rounded-md border border-amber-dim/60 bg-panel2 text-fg hover:border-amber-dim hover:bg-panel transition-colors"
                          >
                            {q.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                    {AI_QUICK_ENTRY_EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => handleUseExample(ex)}
                        className="text-xs text-left px-2.5 py-1.5 rounded-md border border-line bg-panel2 text-muted hover:text-fg hover:border-amber-dim transition-colors"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  onAutoConfirm={handleAutoConfirm}
                  onProposalStatusChange={handleProposalStatusChange}
                  autoConfirming={autoConfirming}
                />
              ))}
              {sending && <div className="text-xs text-muted px-1">Thinking…</div>}
            </div>

            <div className="border-t border-line p-3 shrink-0">
              {/* Only once a conversation is already underway — the empty
                  state above shows the same list under "Based on your data"
                  already, and only while the composer is empty so this
                  never sits on top of something the person is mid-typing. */}
              {messages.length > 0 && !draft.trim() && suggestedQuestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {suggestedQuestions.slice(0, 3).map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => handleUseExample(q.text)}
                      className="text-xs text-left px-2.5 py-1.5 rounded-md border border-line bg-panel2 text-muted hover:text-fg hover:border-amber-dim transition-colors inline-flex items-center gap-1.5"
                    >
                      <LightbulbIcon className="w-3.5 h-3.5 shrink-0" /> {q.text}
                    </button>
                  ))}
                </div>
              )}
              {(error || autoConfirmError) && <div className="text-xs text-bad mb-2">{error || autoConfirmError}</div>}
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask a question, or describe what happened…"
                  rows={1}
                  className="flex-1 resize-none bg-panel2 border border-line rounded-md px-3 py-2.5 text-base sm:text-sm text-fg placeholder:text-muted focus:outline-none focus:border-amber-dim max-h-32 min-h-[44px]"
                />
                <Button onClick={handleSend} disabled={sending || !draft.trim()}>
                  Send
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={mobileSessionsOpen} onClose={() => setMobileSessionsOpen(false)} title="Conversations">
        <SessionList
          sessions={sessions}
          currentSessionId={currentSessionId}
          renamingId={renamingId}
          renameValue={renameValue}
          onNewChat={handleNewChat}
          onSelect={handlePickSession}
          onRenameValueChange={setRenameValue}
          onStartRename={handleStartRename}
          onCommitRename={commitRename}
          onCancelRename={handleCancelRename}
          onDelete={handleDelete}
        />
      </Modal>

      <Modal open={memoryOpen} onClose={() => setMemoryOpen(false)} title="What the assistant remembers">
        <p className="text-sm text-muted mb-3">
          A short list of durable facts the assistant has picked up — a regular supplier, a category you always use for a
          certain cost. Delete anything you don&apos;t want it remembering.
        </p>
        {memoryNotes.length === 0 ? (
          <div className="text-sm text-muted">Nothing yet.</div>
        ) : (
          <div className="space-y-2">
            {memoryNotes.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 bg-panel2 border border-line rounded-md px-3 py-2">
                <div className="text-sm text-fg">{n.text}</div>
                <button
                  className="text-xs text-muted hover:text-bad shrink-0"
                  onClick={() => forgetMemoryNote(n.id)}
                  aria-label="Forget this"
                >
                  Forget
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}