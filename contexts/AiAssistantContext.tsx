"use client";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { taxRatePctFor } from "@/lib/tax";
import { todayIso } from "@/lib/format";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, updateDoc, limit as fsLimit } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "./AuthContext";
import { useData } from "./DataContext";
import { buildBusinessHealthSnapshot } from "@/lib/aiBusinessHealth";
import { entriesNeedingCreditReview, parseAutoConfirmResponse, type AutoConfirmResult } from "@/lib/aiAutoConfirmShared";
import type { AiChatMessage, AiChatResponse, AiChatSession, AiMemoryNote, ProposedEntry } from "@/lib/aiTypes";

interface AiAssistantContextValue {
  sessions: AiChatSession[];
  currentSessionId: string | null;
  messages: AiChatMessage[];
  memoryNotes: AiMemoryNote[];
  sending: boolean;
  error: string | null;
  clearError: () => void;
  startNewSession: () => void;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  sendMessage: (text: string) => Promise<AiChatResponse>;
  forgetMemoryNote: (id: string) => Promise<void>;
  autoConfirmEntries: (entries: ProposedEntry[]) => Promise<AutoConfirmResult[]>;
  updateProposalStatus: (messageId: string, proposalId: string, status: "confirmed" | "discarded") => Promise<void>;
}

const AiAssistantContext = createContext<AiAssistantContextValue | undefined>(undefined);

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const { user, businessId, role } = useAuth();
  // Nested inside DataProvider (see app/layout.tsx). Only read here so the
  // "skip review" shortcuts can respect customer credit limits.
  const { customerCreditStatus, settings, financialHealth, growthLevers, manualOpsSignals, products } = useData();
  // The figures the Financial Health / Growth pages already show, so the Assistant's answers match them (see lib/aiBusinessHealth.ts).
  const businessSnapshot = useMemo(
    () => buildBusinessHealthSnapshot(financialHealth, growthLevers, manualOpsSignals, settings.currency),
    [financialHealth, growthLevers, manualOpsSignals, settings.currency]
  );
  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [memoryNotes, setMemoryNotes] = useState<AiMemoryNote[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = Boolean(businessId && (role === "owner" || role === "manager"));

  // Session list — real-time so a rename/delete from another tab or device
  // (or a brand-new session created by the first sendMessage call) shows up
  // immediately without a manual refetch.
  useEffect(() => {
    if (!enabled || !businessId) {
      setSessions([]);
      return;
    }
    const { db } = getFirebase();
    const q = query(collection(db, "users", businessId, "aiChatSessions"), orderBy("updatedAt", "desc"), fsLimit(50));
    const unsub = onSnapshot(
      q,
      (snap) => setSessions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiChatSession, "id">) }))),
      (err) => console.error("aiChatSessions listener error:", err)
    );
    return unsub;
  }, [enabled, businessId]);

  // Active session's transcript — this is the durable "history" the whole
  // feature is built around: every message either side has ever sent in
  // this session, synced live, surviving a refresh or a switch to another
  // device signed into the same business.
  useEffect(() => {
    if (!enabled || !businessId || !currentSessionId) {
      setMessages([]);
      return;
    }
    const { db } = getFirebase();
    const q = query(
      collection(db, "users", businessId, "aiChatSessions", currentSessionId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiChatMessage, "id">) }))),
      (err) => console.error("aiChatSession messages listener error:", err)
    );
    return unsub;
  }, [enabled, businessId, currentSessionId]);

  // Long-term memory notes — small and fully visible, so the owner can see
  // (and delete, via forgetMemoryNote) exactly what the assistant has
  // learned about how this business likes things logged.
  useEffect(() => {
    if (!enabled || !businessId) {
      setMemoryNotes([]);
      return;
    }
    const { db } = getFirebase();
    const q = query(collection(db, "users", businessId, "aiMemory"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => setMemoryNotes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiMemoryNote, "id">) }))),
      (err) => console.error("aiMemory listener error:", err)
    );
    return unsub;
  }, [enabled, businessId]);

  const clearError = useCallback(() => setError(null), []);

  const startNewSession = useCallback(() => {
    setCurrentSessionId(crypto.randomUUID());
    setMessages([]);
  }, []);

  const selectSession = useCallback((id: string) => setCurrentSessionId(id), []);

  const renameSession = useCallback(
    async (id: string, title: string) => {
      if (!businessId) return;
      const { db } = getFirebase();
      await updateDoc(doc(db, "users", businessId, "aiChatSessions", id), { title: title.trim().slice(0, 60) || "Untitled" });
    },
    [businessId]
  );

  const deleteSession = useCallback(
    async (id: string) => {
      if (!user) return;
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        body: JSON.stringify({ sessionId: id }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Couldn't delete that conversation.");
      }
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    },
    [user, currentSessionId, businessId]
  );

  const sendMessage = useCallback(
    async (text: string): Promise<AiChatResponse> => {
      if (!user) throw new Error("Not signed in.");
      const sessionId = currentSessionId ?? crypto.randomUUID();
      if (!currentSessionId) setCurrentSessionId(sessionId);
      setSending(true);
      setError(null);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
          body: JSON.stringify({ sessionId, message: text, clientDate: todayIso(), businessSnapshot }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || "The assistant didn't respond — try again.");
        }
        // The Firestore listener above will land the same persisted
        // messages a moment later for the live transcript view — this
        // direct return is for callers (like the quick-entry modal) that
        // need the reply/proposals immediately, without racing the
        // listener's snapshot latency.
        return (await res.json()) as AiChatResponse;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        throw err;
      } finally {
        setSending(false);
      }
    },
    [user, currentSessionId, businessSnapshot, businessId]
  );

  const forgetMemoryNote = useCallback(
    async (id: string) => {
      if (!businessId) return;
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", businessId, "aiMemory", id));
    },
    [businessId]
  );

  const autoConfirmEntries = useCallback(
    async (entries: ProposedEntry[]): Promise<AutoConfirmResult[]> => {
      if (!user) throw new Error("Not signed in.");

      // A credit sale that would put a customer over their limit is never
      // "saved without reviewing": it comes back as not-confirmed, so the
      // caller leaves it pending and the person sees the warning on the review
      // form. These never reach the server.
      const holdForReview = entriesNeedingCreditReview(entries, customerCreditStatus, {
        enabled: settings.salesTaxEnabled,
        ratePct: settings.salesTaxRatePct,
        rateFor: (id) => taxRatePctFor(products.find((p) => p.id === id), settings),
      });
      const toSend = entries.filter((e) => !holdForReview.has(e.id));

      let sent: AutoConfirmResult[] = [];
      if (toSend.length > 0) {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/ai/auto-confirm", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
          body: JSON.stringify({ entries: toSend }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || "Auto-confirmation failed.");
        }
        // The route replies { results, summary } — parse it, never assume it
        // is an array (see lib/aiAutoConfirmShared.ts for why).
        sent = parseAutoConfirmResponse(await res.json());
      }

      const byId = new Map(sent.map((r) => [r.id, r]));
      return entries.map(
        (e): AutoConfirmResult =>
          holdForReview.has(e.id)
            ? { id: e.id, success: false, error: holdForReview.get(e.id) }
            : byId.get(e.id) ?? { id: e.id, success: false, error: "No result was returned for this entry — check before saving it again." }
      );
    },
    [user, customerCreditStatus, settings, products, businessId]
  );

  const updateProposalStatus = useCallback(
    async (messageId: string, proposalId: string, status: "confirmed" | "discarded") => {
      if (!businessId || !currentSessionId) return;
      const { db } = getFirebase();
      const messageRef = doc(db, "users", businessId, "aiChatSessions", currentSessionId, "messages", messageId);
      
      // Get the current message
      const messageSnap = await getDoc(messageRef);
      if (!messageSnap.exists()) return;
      
      const messageData = messageSnap.data() as AiChatMessage;
      if (!messageData.proposals) return;
      
      // Update the specific proposal's status
      const updatedProposals = messageData.proposals.map(p => 
        p.id === proposalId ? { ...p, status } : p
      );
      
      // Update the message in Firestore
      await updateDoc(messageRef, { proposals: updatedProposals });
    },
    [businessId, currentSessionId]
  );

  const value = useMemo(
    () => ({
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
    }),
    [sessions, currentSessionId, messages, memoryNotes, sending, error, clearError, startNewSession, selectSession, renameSession, deleteSession, sendMessage, forgetMemoryNote, autoConfirmEntries, updateProposalStatus]
  );

  return <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>;
}

export function useAiAssistant() {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) throw new Error("useAiAssistant must be used inside AiAssistantProvider");
  return ctx;
}
