// Shared types for the AI Assistant feature: natural-language Q&A over the
// ledger and natural-language data entry (text-only — no photo/OCR path).
// Used by both the client (contexts/AiAssistantContext.tsx, app/assistant) and the
// server routes (app/api/ai/*). Kept dependency-free so it can be imported
// from either side without pulling in firebase-admin or the Anthropic SDK.

// ---------------------------------------------------------------------------
// Chat history — persisted at users/{businessId}/aiChatSessions/{sessionId}
// and .../messages/{messageId}. This is the durable "history" half of the
// feature: every session survives a refresh, a new device, or a re-login.
// ---------------------------------------------------------------------------

export interface AiChatSession {
  id: string;
  title: string; // auto-generated from the first message, editable later
  createdAt: number;
  updatedAt: number;
  createdByUid: string;
  createdByName?: string;
  lastMessagePreview?: string;
}

export type AiMessageRole = "user" | "assistant";

export interface AiChatMessage {
  id: string;
  role: AiMessageRole;
  text: string;
  // Legacy field from the retired photo/OCR path — no longer written by
  // new messages (the assistant is text-only now), kept only so old
  // sessions that already have a stored receipt photo still render it.
  imageDataUrl?: string;
  // Present on an assistant message that proposed one or more ledger
  // entries for the user to review/confirm. Populated by /api/ai/chat.
  // Each entry tracks its own confirmed/discarded state so a
  // partially-actioned proposal renders correctly on reload.
  proposals?: ProposedEntry[];
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Proposed ledger entries — what the model produces from a natural-language
// description or a receipt photo. Never written to the ledger directly by
// the server: the client renders each one pre-filled into the same
// QuickSaleForm/QuickStockForm/QuickExpenseForm used everywhere else in the
// app, the user reviews it, and only the existing addSale/addPurchase/
// addExpense calls (same permission checks, same audit log) commit it.
// ---------------------------------------------------------------------------

export type ProposedEntryStatus = "pending" | "confirmed" | "discarded";

interface ProposedEntryBase {
  id: string; // client-generated, stable within the message
  status: ProposedEntryStatus;
  // 0-1 confidence the model reported for this specific entry — surfaced
  // as a subtle "double-check this one" hint below ~0.6, never blocking.
  confidence?: number;
  sourceNote?: string; // short reason string, e.g. "matched from receipt"
}

export interface ProposedSaleEntry extends ProposedEntryBase {
  kind: "sale";
  productName: string; // free text as understood from the prompt/receipt
  matchedProductId?: string; // resolved server-side by fuzzy name match, if any
  // 0-1 confidence lib/aiMatch.ts had in matchedProductId being the RIGHT
  // product — a different signal from `confidence` above (which is the
  // model's certainty about the entry as a whole, e.g. did the user even
  // state a price). A matchedProductId can be set from a fairly weak
  // string match (see bestMatch's 0.45 floor) while the model itself
  // reports high confidence, since it correctly read the sentence — that
  // doesn't mean the match is the right product. Kept separate rather than
  // folded into `confidence` so each can gate/hint independently. See
  // lib/aiAutoConfirm.ts's isAutoConfirmable for where this is enforced.
  matchConfidence?: number;
  qty: number;
  unitPrice: number;
  currency?: string; // only set if different from the business's base currency
  customer?: string;
  date: string; // ISO date
  paymentMethod?: "cash" | "card" | "bank_transfer" | "credit";
  notes?: string;
}

export interface ProposedPurchaseEntry extends ProposedEntryBase {
  kind: "purchase";
  productName: string;
  matchedProductId?: string;
  matchConfidence?: number; // see ProposedSaleEntry's field of the same name
  qty: number;
  unitCost: number;
  currency?: string;
  supplier?: string;
  date: string;
  // "credit" means bought on supplier terms — the purchase-side mirror of
  // ProposedSaleEntry.paymentMethod. Absent/anything else is paid on the
  // spot, which is what every purchase was implicitly treated as before a
  // credit purchase could be represented at all.
  paymentMethod?: "cash" | "card" | "bank_transfer" | "credit";
  notes?: string;
}

export interface ProposedExpenseEntry extends ProposedEntryBase {
  kind: "expense";
  name: string;
  amount: number;
  category?: string;
  isRecurring: boolean;
  date: string;
  notes?: string;
}

export type ProposedEntry = ProposedSaleEntry | ProposedPurchaseEntry | ProposedExpenseEntry;

// ---------------------------------------------------------------------------
// Long-term memory — a short, capped list of durable facts the assistant
// has learned about how this business likes things logged (a regular
// supplier, a preferred category mapping, a recurring correction). Stored
// at users/{businessId}/aiMemory/{noteId}. Deliberately small and fully
// visible/deletable by the owner in Settings → AI memory — this is context
// the model gets to read, not a hidden profile.
// ---------------------------------------------------------------------------

export interface AiMemoryNote {
  id: string;
  text: string;
  createdAt: number;
}

export const AI_MEMORY_MAX_NOTES = 40;
export const AI_MEMORY_MAX_NOTE_LENGTH = 240;

// ---------------------------------------------------------------------------
// API request/response shapes for app/api/ai/chat.
// ---------------------------------------------------------------------------

export interface AiChatRequest {
  sessionId: string;
  message: string;
  // The person's own calendar date (YYYY-MM-DD). Optional: the server falls
  // back to UTC, and ignores a value more than a day from UTC (see route).
  clientDate?: string;
  // The Financial Health / Growth figures as the browser computed them (lib/aiBusinessHealth.ts). Optional; the server
  // validates it and only then offers the get_business_health tool.
  businessSnapshot?: unknown;
}

export interface AiChatResponse {
  reply: string;
  proposals: ProposedEntry[];
  // The id of the persisted assistant message these proposals live on —
  // needed by any caller that wants to persist a later status change
  // (confirmed/discarded) back to Firestore via updateProposalStatus,
  // including callers like QuickAiEntryModal that don't go through the
  // live aiChatSessions/messages listener.
  messageId: string;
  rememberedNote?: string;
  question?: string; // When AI needs to ask for clarification
}
