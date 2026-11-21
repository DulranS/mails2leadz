import { randomUUID } from "crypto";
import { requireAiContext, loadBusinessContext, loadMemoryNotes, loadRecentMessages, ensureSession, addMemoryNote, appendMessage, type CompactProduct } from "@/lib/firebaseAdmin";
import type { QuerySnapshot } from "firebase-admin/firestore";
import { resolveAiKey } from "@/lib/aiKey";
import { callClaude, extractToolUses, extractText, AnthropicApiError, type AnthropicTool, type AnthropicTextBlock, type AnthropicMessage } from "@/lib/anthropic";
import { formatProductCatalogBlock, formatExpenseCategoriesBlock, formatMemoryBlock, ASSISTANT_PERSONA, APP_HELP_KNOWLEDGE } from "@/lib/aiPrompts";
import { runReport, type ReportMetric } from "@/lib/aiReport";
import { bestMatch } from "@/lib/aiMatch";
import { generateAnomalyReport } from "@/lib/aiAnomalyDetection";
import { generateConcentrationRiskReport } from "@/lib/aiGrowthRisk";
import { generateCashFlowForecast } from "@/lib/aiCashFlowPrediction";
import { computeReceivablesAging, computePayablesAging } from "@/lib/calculations";
import { generateSmartReminders } from "@/lib/aiSmartReminders";
import { sanitizeBusinessHealthSnapshot, BUSINESS_HEALTH_GUIDE } from "@/lib/aiBusinessHealth";
import { aiErrorResponse, isValidSessionId } from "@/lib/apiError";
import { isValidIsoDate } from "@/lib/periodLock";
import { enforceAiDailyLimit, refundAiDailyTurn, recordAiUsage, emptyAiUsage, addProviderUsage } from "@/lib/aiUsageLimit";
import { aiLimitsFor, type AiLimits } from "@/lib/guardrails";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import type { AiChatMessage, AiChatRequest, AiChatResponse, ProposedEntry } from "@/lib/aiTypes";
import type { Expense, Purchase, Sale, ReceivablePayment, PayablePayment, ReceivableWriteOff, BillPayment, OpeningBalance, SupplierCreditEntry, SupplierReturn, CustomerDepositEntry } from "@/lib/types";

export const runtime = "nodejs";
// Room for a few tool rounds plus the provider timeout; ignored by hosts without a limit.
export const maxDuration = 60;

const REPORT_TOOL: AnthropicTool = {
  name: "run_report",
  description: "Compute ledger numbers. Use for totals, spend, revenue, comparisons. Never estimate.",
  input_schema: {
    type: "object",
    properties: {
      metric: {
        type: "string",
        enum: ["expense_total", "expense_by_category", "sale_total", "sale_by_product", "sale_by_customer", "purchase_total", "purchase_by_supplier", "net_cashflow"],
        description: "expense_total/expense_by_category = one-off bills. sale_total/sale_by_product/sale_by_customer = sales at the invoiced price (later discounts/returns not deducted). purchase_total/purchase_by_supplier = stock/materials. net_cashflow = invoiced sales minus purchases minus one-off bills (a simple view, not profit).",
      },
      startDate: { type: "string", description: "ISO date yyyy-mm-dd. Compute from user's phrase (e.g. 'last quarter')." },
      endDate: { type: "string", description: "ISO date yyyy-mm-dd." },
      category: { type: "string", description: "Optional expense category filter." },
      productName: { type: "string", description: "Optional product name filter (fuzzy)." },
      supplier: { type: "string", description: "Optional supplier name filter (fuzzy, purchase metrics only)." },
      customer: { type: "string", description: "Optional customer name filter (fuzzy, sale metrics only)." },
    },
    required: ["metric", "startDate", "endDate"],
  },
};

const PROPOSE_ENTRIES_TOOL: AnthropicTool = {
  name: "propose_entries",
  description: "Propose ledger entries (sale/purchase/expense) from user's description.",
  input_schema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["sale", "purchase", "expense"] },
            productName: { type: "string", description: "For sale/purchase: product name." },
            name: { type: "string", description: "For expense: bill label." },
            qty: { type: "number", description: "For sale/purchase." },
            unitPrice: { type: "number", description: "For sale: price per unit. If the user stated this in a currency other than the business currency, report it in THAT currency (set `currency` below) — do not convert it yourself, the exchange rate is collected from the user on review." },
            unitCost: { type: "number", description: "For purchase: cost per unit. Same currency rule as unitPrice." },
            amount: { type: "number", description: "For expense: total." },
            category: { type: "string", description: "For expense: match category list." },
            isRecurring: { type: "boolean", description: "For expense: true if recurring bill." },
            currency: { type: "string", description: "Only if the user stated an amount in a currency other than the business currency. Never guess or convert an exchange rate yourself." },
            customer: { type: "string", description: "For sale." },
            supplier: { type: "string", description: "For purchase." },
            date: { type: "string", description: "ISO yyyy-mm-dd. Today unless specified." },
            paymentMethod: {
              type: "string",
              enum: ["cash", "card", "bank_transfer", "credit"],
              description:
                "For a sale: 'credit' means the customer will pay later. For a purchase: 'credit' means bought on supplier terms (e.g. 'on account', 'net 30', 'pay them next month') rather than paid on the spot. Leave unset if not stated.",
            },
            notes: { type: "string" },
            confidence: { type: "number", description: "0-1 certainty." },
          },
          required: ["kind", "date"],
        },
      },
    },
    required: ["entries"],
  },
};

const REMEMBER_TOOL: AnthropicTool = {
  name: "remember_note",
  description: "Save a durable fact for future conversations. Use sparingly.",
  input_schema: {
    type: "object",
    properties: { note: { type: "string", description: "Short sentence, under 240 chars." } },
    required: ["note"],
  },
};

const ANOMALY_DETECTION_TOOL: AnthropicTool = {
  name: "detect_anomalies",
  description: "Detect unusual spending patterns in expenses and purchases. Use when user asks about unusual costs, anomalies, or spending patterns.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const CONCENTRATION_RISK_TOOL: AnthropicTool = {
  name: "assess_concentration_risk",
  description:
    "Check how much of revenue rides on one customer and how much of purchasing rides on one supplier — a key scaling/growth risk. Use when the user asks about business risk, over-reliance on a customer or supplier, revenue concentration, or how ready/exposed the business is as it grows.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const BUSINESS_HEALTH_TOOL: AnthropicTool = {
  name: "get_business_health",
  description:
    "Get the business's health numbers exactly as shown on the Financial Health and Growth pages: liquidity (current/quick/cash ratio), margins, days sales/payable/inventory outstanding, debt and interest cover, EBIT/EBITDA/free cash flow, the four growth levers (cost of sales %, running costs, average selling price, average order value) compared with the previous period, and how often entries are corrected or overridden. Use when the user asks how healthy the business is, about margins, liquidity, debt, efficiency, growth levers, or data quality. Not for a single date-range total (use run_report).",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const CASH_FLOW_FORECAST_TOOL: AnthropicTool = {
  name: "forecast_cash_flow",
  description: "Generate cash flow predictions for future months. Use when user asks about cash flow, future projections, or financial forecasts.",
  input_schema: {
    type: "object",
    properties: {
      months: { type: "number", description: "Number of months to forecast (default: 3)." },
    },
    required: [],
  },
};

const SMART_REMINDERS_TOOL: AnthropicTool = {
  name: "get_reminders",
  description: "Get smart reminders for overdue payments and important business events. Use when user asks about reminders, overdue items, or things to follow up on.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const CREATE_PRODUCT_TOOL: AnthropicTool = {
  name: "create_product",
  description: "Create a new product when the user mentions a product name that doesn't exist in the catalog. Use this BEFORE propose_entries when you encounter a new product.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Product name as mentioned by the user." },
      type: { type: "string", enum: ["product", "service"], description: "Whether this is a physical product or a service. Default to 'product' unless clearly a service." },
      category: { type: "string", description: "Product category. Use 'General' if not specified." },
      defaultSellPrice: { type: "number", description: "Default selling price per unit if mentioned." },
      defaultCostPrice: { type: "number", description: "Default cost price per unit if mentioned." },
    },
    required: ["name"],
  },
};

const ASK_QUESTION_TOOL: AnthropicTool = {
  name: "ask_question",
  description: "Ask the user a clarifying question when critical information is missing for logging an entry. Use this instead of guessing or proposing incomplete entries.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "A clear, specific question to ask the user. Ask ONE question at a time." },
    },
    required: ["question"],
  },
};

function toAnthropicMessages(history: AiChatMessage[]): AnthropicMessage[] {
  return history.map((m) => ({ role: m.role, content: m.text || "(empty)" }));
}

// The date the model and the fallbacks treat as "today". The browser sends the
// person's own calendar date so "sold 3 today" at 2 am in Colombo isn't filed
// under yesterday's UTC date. Trusted only if it is a real date within a day of
// the server's UTC date (every timezone is within +/-14h), so it can't be used
// to back-date or post-date entries.
function resolveToday(clientDate: unknown): string {
  const utc = new Date().toISOString().slice(0, 10);
  if (typeof clientDate !== "string" || !isValidIsoDate(clientDate)) return utc;
  const diffDays = Math.abs(Date.parse(clientDate + "T00:00:00Z") - Date.parse(utc + "T00:00:00Z")) / 86400000;
  return diffDays <= 1 ? clientDate : utc;
}

function normalizeProposedEntry(raw: Record<string, unknown>, products: CompactProduct[], today: string): ProposedEntry | null {
  const kind = raw.kind as string;
  const id = randomUUID();
  const confidence = typeof raw.confidence === "number" ? raw.confidence : undefined;
  // Only a real YYYY-MM-DD calendar date is accepted from the model;
  // anything else (relative words, impossible dates) falls back to today and
  // the person reviewing the proposal can change it.
  const date = isValidIsoDate(raw.date) ? raw.date : today;

  if (kind === "sale") {
    const productName = String(raw.productName ?? "").trim();
    if (!productName) return null;
    const match = bestMatch(productName, products.map((p) => ({ id: p.id, name: p.name })));
    return {
      id,
      status: "pending",
      kind: "sale",
      productName,
      matchedProductId: match.id,
      matchConfidence: match.id ? match.confidence : undefined,
      qty: Number(raw.qty) || 1,
      unitPrice: Number(raw.unitPrice) || 0,
      currency: raw.currency as string | undefined,
      customer: raw.customer as string | undefined,
      date,
      paymentMethod: raw.paymentMethod as "cash" | "card" | "bank_transfer" | "credit" | undefined,
      notes: raw.notes as string | undefined,
      confidence,
    };
  }
  if (kind === "purchase") {
    const productName = String(raw.productName ?? "").trim();
    if (!productName) return null;
    const match = bestMatch(productName, products.map((p) => ({ id: p.id, name: p.name })));
    return {
      id,
      status: "pending",
      kind: "purchase",
      productName,
      matchedProductId: match.id,
      matchConfidence: match.id ? match.confidence : undefined,
      qty: Number(raw.qty) || 1,
      unitCost: Number(raw.unitCost) || 0,
      currency: raw.currency as string | undefined,
      supplier: raw.supplier as string | undefined,
      date,
      // Previously dropped on the floor here while the sale branch mapped
      // it — so "bought 20 units from Acme on 30-day terms" silently became
      // a cash purchase no matter how clearly it was stated.
      paymentMethod: raw.paymentMethod as "cash" | "card" | "bank_transfer" | "credit" | undefined,
      notes: raw.notes as string | undefined,
      confidence,
    };
  }
  if (kind === "expense") {
    const name = String(raw.name ?? raw.productName ?? "").trim();
    if (!name) return null;
    return {
      id,
      status: "pending",
      kind: "expense",
      name,
      amount: Number(raw.amount) || 0,
      category: raw.category as string | undefined,
      isRecurring: Boolean(raw.isRecurring),
      date,
      notes: raw.notes as string | undefined,
      confidence,
    };
  }
  return null;
}

// The tools offered to the model for this account. The shared public demo is not offered the two
// that PERSIST something into the books on the visitor's say-so (remember_note, create_product): what
// one visitor teaches the assistant or adds to the catalogue would be what the next visitor finds.
// The handlers below refuse them too, so a model that names a tool it wasn't offered still gets nothing.
function toolsFor(limits: AiLimits, hasHealthSnapshot: boolean): AnthropicTool[] {
  return [
    REPORT_TOOL,
    PROPOSE_ENTRIES_TOOL,
    ...(limits.allowCreateProduct ? [CREATE_PRODUCT_TOOL] : []),
    ...(limits.allowRememberNote ? [REMEMBER_TOOL] : []),
    ANOMALY_DETECTION_TOOL,
    CONCENTRATION_RISK_TOOL,
    // Only offered when this request carried the page's own figures (the quick-entry modal and older clients don't).
    ...(hasHealthSnapshot ? [BUSINESS_HEALTH_TOOL] : []),
    CASH_FLOW_FORECAST_TOOL,
    SMART_REMINDERS_TOOL,
    ASK_QUESTION_TOOL,
  ];
}

export async function POST(req: Request) {
  // Everything below — including the Firebase Admin init inside
  // requireAiContext, which throws a plain Error (not AiAuthError) if the
  // server's env vars are missing, and the second/follow-up callClaude
  // call after a tool_use turn, which previously had no try/catch at
  // all — is now covered by one handler so no failure mode reaches the
  // client as an opaque platform 500/502 with no message.
  // Set once this turn has been counted against the daily cap, so a provider
  // failure below can give it back (see refundAiDailyTurn).
  let charged: { db: Awaited<ReturnType<typeof requireAiContext>>["db"]; businessId: string } | null = null;
  // Tokens the provider billed during this turn, summed over every model call in it (see
  // lib/aiUsageLimit.ts "Usage metering"). Declared out here so the catch block can still book
  // the tokens of a turn that failed part-way.
  const usage = emptyAiUsage();
  // The key that pays for this business's assistant (see lib/aiKey.ts). Set once the caller is known, below.
  let aiApiKey: string | null = null;
  const metered: typeof callClaude = async (params) => {
    const modelParams = { ...params, apiKey: aiApiKey ?? undefined };
    const r = await callClaude(modelParams);
    addProviderUsage(usage, r.usage);
    return r;
  };
  try {
    const ctx = await requireAiContext(req);
    // Resolved before the daily turn is counted, so a business without its own key is never charged a turn.
    aiApiKey = (await resolveAiKey(ctx.db, ctx.businessId, ctx.accountKind)).apiKey;
    const body = (await req.json()) as AiChatRequest;
    const message = (body.message ?? "").trim();
    if (!message) return Response.json({ error: "Message is empty." }, { status: 400 });
    if (!isValidSessionId(body.sessionId)) return Response.json({ error: "sessionId is missing or invalid." }, { status: 400 });
    // Cost/abuse backstop alongside the daily turn cap: a single turn can't be
    // a pasted document. Real requests ("sold 3 widgets to Ann for 40 each")
    // are a few hundred characters.
    // The cap depends on the kind of account: the shared public demo allows far less (see lib/guardrails.ts).
    const limits = aiLimitsFor(ctx.accountKind);
    if (message.length > limits.maxMessageChars) {
      return Response.json(
        {
          error:
            limits.maxMessageChars < 4000
              ? `In the demo, please keep messages under ${limits.maxMessageChars.toLocaleString("en-US")} characters.`
              : "That message is too long. Please keep it under 4,000 characters, or split it into smaller entries.",
        },
        { status: 400 }
      );
    }

    const { db, businessId, uid, memberName } = ctx;

    const [{ settings, products }, memoryNotes, recentMessages] = await Promise.all([
      loadBusinessContext(db, businessId),
      loadMemoryNotes(db, businessId),
      loadRecentMessages(db, businessId, body.sessionId),
    ]);

    // Cost/abuse backstop — see lib/aiUsageLimit.ts. Checked (and recorded)
    // before ensureSession/callClaude so a business over its daily cap
    // never reaches the model and never gets a stray empty session created
    // for a turn that didn't actually happen.
    // Shared public demo: a per-visitor-IP allowance on top of the shared daily cap, so one person
    // can't use up the whole day's turns for everybody. Checked before the shared counter so a
    // refused visitor doesn't spend a turn they never got.
    if (limits.perIpDailyTurns > 0 && (await isRateLimited("demo-ai", requestIp(req), limits.perIpDailyTurns, 24 * 60 * 60 * 1000))) {
      return Response.json(
        { error: "You've used the demo's AI allowance for today. Request a free trial to try the assistant on your own books." },
        { status: 429 }
      );
    }
    const turnLimits = aiLimitsFor(ctx.accountKind, settings.aiDailyMessageLimit, ctx.adminAccount);
    await enforceAiDailyLimit(db, businessId, settings, turnLimits.dailyTurns);
    charged = { db, businessId };

    await ensureSession(db, businessId, body.sessionId, uid, memberName, message);

    const today = resolveToday(body.clientDate);
    // The page's own computed figures, checked to be plain numbers (see lib/aiBusinessHealth.ts). null = none usable.
    const healthSnapshot = sanitizeBusinessHealthSnapshot(body.businessSnapshot);
    const systemBlocks: AnthropicTextBlock[] = [
      { type: "text", text: ASSISTANT_PERSONA },
      // Fully static across every business and every turn (unlike the
      // block below, which is per-business and per-day) — its own
      // cache_control boundary so it's written to cache once and reused
      // by every subsequent turn from any business, rather than being
      // invalidated every time the product catalog or the date changes.
      { type: "text", text: APP_HELP_KNOWLEDGE, cache_control: { type: "ephemeral" } },
      {
        type: "text",
        text: `Today's date: ${today}\nBusiness currency: ${settings.currency}\n\nProduct/service catalog:\n${formatProductCatalogBlock(products)}\n\nExpense categories: ${formatExpenseCategoriesBlock()}\n\nThings you've learned about this business:\n${formatMemoryBlock(memoryNotes)}`,
        cache_control: { type: "ephemeral" },
      },
    ];

    let runningMessages: AnthropicMessage[] = [...toAnthropicMessages(recentMessages), { role: "user", content: message }];

    // Clock for the whole turn, started before the first provider call (see TURN_TIME_BUDGET_MS below).
    const turnStartedAt = Date.now();
    let response = await metered({
      system: systemBlocks,
      messages: runningMessages,
      tools: toolsFor(limits, !!healthSnapshot),
      maxTokens: 800,
    });

    let proposals: ProposedEntry[] = [];
    let rememberedNote: string | undefined;
    let question: string | undefined;

    // Ledger data for run_report is only fetched when actually needed —
    // most turns (a question that doesn't need a number, or a data-entry
    // prompt) never touch these three collections at all. Declared outside
    // the round loop below so a compound request that calls run_report in
    // two different rounds still only pays for a matching date range once.
    let ledgerData: { startDate: string; endDate: string; expenses: Expense[]; purchases: Purchase[]; sales: Sale[] } | null = null;
    const productNameById = new Map(products.map((p) => [p.id, p.name]));

    // Backing data for detect_anomalies / forecast_cash_flow — both are
    // statistical over recent history rather than a single date range the
    // model supplies, so (unlike run_report) there's no caller-given
    // window to push down into the query. A fixed 12-month lookback keeps
    // the read bounded as the ledger grows, the same cost concern
    // run_report's range query exists for, while still giving both
    // functions enough months to establish a real baseline/trend. Shared
    // across both tools if a single turn calls both.
    let recentOperationalData: { expenses: Expense[]; purchases: Purchase[]; sales: Sale[] } | null = null;
    async function loadRecentOperationalData() {
      if (recentOperationalData) return recentOperationalData;
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const since = twelveMonthsAgo.toISOString().slice(0, 10);
      // The explicit tuple annotation here (and on the two other
      // Promise.all destructures below) isn't decorative — without it,
      // TypeScript's control-flow analysis of the `let ledgerData` /
      // `let recentOperationalData` / `let overdueData` variables across
      // this `for` loop's iterations gets tangled up with inferring
      // these destructured elements' types from Promise.all, and it
      // gives up with "'expensesSnap' implicitly has type 'any' because
      // it does not have a type annotation and is referenced directly
      // or indirectly in its own initializer" (TS7022), which then
      // cascades into "Parameter 'd' implicitly has an 'any' type"
      // (TS7006) everywhere `.docs.map((d) => ...)` is used below.
      const [expensesSnap, purchasesSnap, salesSnap]: [QuerySnapshot, QuerySnapshot, QuerySnapshot] = await Promise.all([
        db.collection(`users/${businessId}/expenses`).where("startDate", ">=", since).get(),
        db.collection(`users/${businessId}/purchases`).where("date", ">=", since).get(),
        db.collection(`users/${businessId}/sales`).where("date", ">=", since).get(),
      ]);
      recentOperationalData = {
        expenses: expensesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense),
        purchases: purchasesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Purchase),
        sales: salesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sale),
      };
      return recentOperationalData;
    }

    // Backing data for get_reminders — overdue receivables/payables can
    // originate from any point in the ledger's history (an invoice from
    // eight months ago is still overdue today), so unlike the two loaders
    // above this deliberately isn't date-bounded. Mirrors the same
    // full-collection read app/api/aging/report/route.ts already does for
    // the same reminder-relevant data.
    let overdueData: { sales: Sale[]; purchases: Purchase[]; receivablePayments: ReceivablePayment[]; payablePayments: PayablePayment[]; receivableWriteOffs: ReceivableWriteOff[]; expenses: Expense[]; billPayments: BillPayment[]; openingBalances: OpeningBalance[]; supplierReturns: SupplierReturn[]; supplierCredits: SupplierCreditEntry[]; customerDeposits: CustomerDepositEntry[] } | null = null;
    async function loadOverdueData() {
      if (overdueData) return overdueData;
      const [salesSnap, purchasesSnap, receivablePaymentsSnap, payablePaymentsSnap, receivableWriteOffsSnap, expensesSnap, billPaymentsSnap, openingBalancesSnap, supplierReturnsSnap, supplierCreditsSnap, customerDepositsSnap]: [QuerySnapshot, QuerySnapshot, QuerySnapshot, QuerySnapshot, QuerySnapshot, QuerySnapshot, QuerySnapshot, QuerySnapshot, QuerySnapshot, QuerySnapshot, QuerySnapshot] = await Promise.all([
        // Only credit sales/purchases can be owed or overdue (the aging maths skips the rest), so a
        // high-volume business's cash-sale history is never read here.
        db.collection(`users/${businessId}/sales`).where("paymentMethod", "==", "credit").get(),
        db.collection(`users/${businessId}/purchases`).where("paymentMethod", "==", "credit").get(),
        db.collection(`users/${businessId}/receivablePayments`).get(),
        db.collection(`users/${businessId}/payablePayments`).get(),
        db.collection(`users/${businessId}/receivableWriteOffs`).get(),
        db.collection(`users/${businessId}/expenses`).get(),
        db.collection(`users/${businessId}/billPayments`).get(),
        db.collection(`users/${businessId}/openingBalances`).get(),
        // Credit given on goods sent back to a supplier reduces what is still owed on that bill.
        db.collection(`users/${businessId}/supplierReturns`).where("settlement", "==", "reduce_payable").get(),
        // Supplier credit used on a bill is no longer owed either.
        db.collection(`users/${businessId}/supplierCredits`).where("kind", "==", "applied").get(),
        // A customer deposit used on an invoice is no longer owed either.
        db.collection(`users/${businessId}/customerDeposits`).where("kind", "==", "applied").get(),
      ]);
      overdueData = {
        sales: salesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sale),
        purchases: purchasesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Purchase),
        receivablePayments: receivablePaymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ReceivablePayment),
        payablePayments: payablePaymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as PayablePayment),
        receivableWriteOffs: receivableWriteOffsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ReceivableWriteOff),
        expenses: expensesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense),
        billPayments: billPaymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as BillPayment),
        openingBalances: openingBalancesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as OpeningBalance),
        supplierReturns: supplierReturnsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as SupplierReturn),
        supplierCredits: supplierCreditsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as SupplierCreditEntry),
        customerDeposits: customerDepositsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as CustomerDepositEntry),
      };
      return overdueData;
    }

    // Bounded loop, not a single `if` — a compound request ("what did I
    // spend on packaging last month, and log this delivery bill too") needs
    // the model to see one tool's result before it can decide to call a
    // second tool. The previous shape here was exactly one round: initial
    // call, then (if tool_use) exactly one follow-up call, whose own result
    // was read for text only. Any tool_use in *that* follow-up — a second
    // run_report after the first, a propose_entries called only once the
    // model had the numbers in hand — was silently discarded: no error, no
    // proposal, nothing logged, same failure shape as the thinking-mode bug
    // above but with a different cause. MAX_TOOL_ROUNDS bounds the retry
    // cost if a model ever got stuck calling tools indefinitely; hitting it
    // still returns whatever text/proposals/note were already collected
    // rather than erroring the whole turn out.
    const MAX_TOOL_ROUNDS = 4;
    // Each provider call is capped at 20 s (lib/anthropic.ts) and this route
    // at maxDuration = 60, so up to five slow calls in a row could overrun
    // the host limit and skip the catch block (no refund, bare platform
    // error). Stop starting new rounds once the turn has used 35 s; what was
    // collected so far is returned, same as hitting MAX_TOOL_ROUNDS.
    const TURN_TIME_BUDGET_MS = 35_000;
    let round = 0;

    while (response.stop_reason === "tool_use" && round < MAX_TOOL_ROUNDS && Date.now() - turnStartedAt < TURN_TIME_BUDGET_MS) {
      round++;
      const toolUses = extractToolUses(response);
      const toolResults: { type: "tool_result"; tool_use_id: string; content: string }[] = [];

      for (const use of toolUses) {
        if (use.name === "run_report") {
          const input = use.input as { metric: ReportMetric; startDate?: string; endDate?: string; category?: string; productName?: string; supplier?: string; customer?: string };
          // startDate/endDate are marked "required" in the tool schema, but
          // that's only a hint to the model — DeepSeek (or any model) can
          // still omit one, and an undefined value passed straight into
          // .where() throws a hard Firestore error ("Value for argument
          // \"value\" is not a valid query constraint") before the request
          // ever reaches runReport. Fall back to a sensible bounded window
          // instead of crashing the whole turn over a malformed tool call.
          const dateRe = /^\d{4}-\d{2}-\d{2}$/;
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const safeStartDate = input.startDate && dateRe.test(input.startDate) ? input.startDate : oneYearAgo.toISOString().slice(0, 10);
          const safeEndDate = input.endDate && dateRe.test(input.endDate) ? input.endDate : today;
          if (!ledgerData || ledgerData.startDate !== safeStartDate || ledgerData.endDate !== safeEndDate) {
            // Pushed down as Firestore range queries on the date field instead
            // of `.get()`-ing the whole collection: expenses/purchases/sales
            // grow without bound over a business's lifetime, but a report
            // question only ever needs rows inside [startDate, endDate]. This
            // is the same window aiReport.ts would filter down to anyway — the
            // model already gives us the range — so pushing it into the query
            // means a "sales this month" question costs a month of reads, not
            // the business's entire sales history, no matter how many years
            // of data have piled up.
            const [expensesSnap, purchasesSnap, salesSnap]: [QuerySnapshot, QuerySnapshot, QuerySnapshot] = await Promise.all([
              db
                .collection(`users/${businessId}/expenses`)
                .where("startDate", ">=", safeStartDate)
                .where("startDate", "<=", safeEndDate)
                .get(),
              db
                .collection(`users/${businessId}/purchases`)
                .where("date", ">=", safeStartDate)
                .where("date", "<=", safeEndDate)
                .get(),
              db
                .collection(`users/${businessId}/sales`)
                .where("date", ">=", safeStartDate)
                .where("date", "<=", safeEndDate)
                .get(),
            ]);
            ledgerData = {
              startDate: safeStartDate,
              endDate: safeEndDate,
              expenses: expensesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense),
              purchases: purchasesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Purchase),
              sales: salesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sale),
            };
          }
          const result = runReport({ ...input, startDate: safeStartDate, endDate: safeEndDate, productNameById }, ledgerData, settings.currency);
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result) });
        } else if (use.name === "create_product" && !limits.allowCreateProduct) {
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Adding products isn't available in the demo." });
        } else if (use.name === "remember_note" && !limits.allowRememberNote) {
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Notes aren't saved in the demo." });
        } else if (use.name === "create_product") {
          const input = use.input as { name: string; type?: string; category?: string; defaultSellPrice?: number; defaultCostPrice?: number };
          const newProduct = {
            name: input.name,
            type: (input.type as "product" | "service") || "product",
            category: input.category || "General",
            sku: "",
            active: true,
            defaultSellPrice: input.defaultSellPrice,
            defaultCostPrice: input.defaultCostPrice,
            createdAt: Date.now(),
          };
          const docRef = await db.collection(`users/${businessId}/products`).add(newProduct);
          // Add to products list for subsequent propose_entries calls
          products.push({ id: docRef.id, name: input.name, type: newProduct.type, sku: "" });
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: `Created product "${input.name}" with ID ${docRef.id}.` });
        } else if (use.name === "propose_entries") {
          const input = use.input as { entries: Record<string, unknown>[] };
          const normalized = (input.entries ?? []).map((e) => normalizeProposedEntry(e, products, today)).filter((e): e is ProposedEntry => e !== null);
          proposals = proposals.concat(normalized);
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: `Proposed ${normalized.length} entr${normalized.length === 1 ? "y" : "ies"} for the user to review.` });
        } else if (use.name === "remember_note") {
          const input = use.input as { note: string };
          rememberedNote = input.note;
          await addMemoryNote(db, businessId, input.note);
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Saved." });
        } else if (use.name === "detect_anomalies") {
          const { expenses, purchases } = await loadRecentOperationalData();
          const report = generateAnomalyReport(expenses, purchases);
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(report) });
        } else if (use.name === "assess_concentration_risk") {
          const { sales, purchases } = await loadRecentOperationalData();
          const report = generateConcentrationRiskReport(sales, purchases);
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(report) });
        } else if (use.name === "get_business_health") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: healthSnapshot
              ? JSON.stringify({ ...healthSnapshot, guide: BUSINESS_HEALTH_GUIDE })
              : "Health figures aren't available in this view. Tell the user to open the Financial Health page.",
          });
        } else if (use.name === "forecast_cash_flow") {
          const input = use.input as { months?: number };
          const { sales, expenses, purchases } = await loadRecentOperationalData();
          // Also hand the model what is already owed to/by the business (opening
          // balances included) so it doesn't call cash flow "healthy" while
          // customers sit on overdue money. Not folded into the projection itself.
          const owed = await loadOverdueData();
          // Uses the person's own calendar date resolved at the top of this request (not the UTC date),
          // so what counts as overdue is right between midnight and 5:30 am in Colombo.
          const ar = computeReceivablesAging([], owed.sales, [], owed.receivablePayments, today, owed.receivableWriteOffs, owed.openingBalances, owed.customerDeposits);
          const ap = computePayablesAging([], owed.purchases, owed.payablePayments, today, owed.openingBalances, owed.supplierReturns, owed.supplierCredits);
          const overdueSum = (ls: { daysOverdue: number; amountOutstanding: number }[]) =>
            ls.filter((l) => l.daysOverdue > 0).reduce((s, l) => s + l.amountOutstanding, 0);
          const forecast = generateCashFlowForecast(sales, expenses, purchases, settings, input.months || 3, true, {
            receivablesOutstanding: ar.totalOutstanding,
            receivablesOverdue: overdueSum(ar.lines),
            payablesOutstanding: ap.totalOutstanding,
            payablesOverdue: overdueSum(ap.lines),
          });
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(forecast) });
        } else if (use.name === "get_reminders") {
          const { sales, purchases, receivablePayments, payablePayments, receivableWriteOffs, expenses, billPayments, openingBalances, supplierReturns, supplierCredits, customerDeposits } = await loadOverdueData();
          const reminders = generateSmartReminders(sales, purchases, receivablePayments, payablePayments, receivableWriteOffs, expenses, billPayments, openingBalances, supplierReturns, supplierCredits, customerDeposits);
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(reminders) });
        } else if (use.name === "ask_question") {
          const input = use.input as { question: string };
          question = input.question;
          toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Question noted." });
        }
      }

      runningMessages = [...runningMessages, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
      response = await metered({
        system: systemBlocks,
        messages: runningMessages,
        tools: toolsFor(limits, !!healthSnapshot),
        maxTokens: 400,
      });
    }

    // The assistant PROPOSES; a person DISPOSES. Nothing is written to the
    // ledger here — every proposal stays "pending" and comes back as the
    // usual pre-filled form (or is confirmed by an explicit click on
    // "Confirm all" / the Quick Entry checkbox, which go through
    // /api/ai/auto-confirm). This route used to log any "complete" proposal
    // on its own, in the same turn, with no click at all; that made the
    // model's guess about a product match, a quantity or a date a real
    // ledger entry before anyone had looked at it, which is the opposite of
    // how this product is described and sold (see README §7).

    let reply = extractText(response);
    if (!reply) {
      if (question) {
        reply = question;
      } else if (proposals.length) {
        reply = "Here's what I've got — check it below and save it when it looks right.";
      } else {
        reply = "Done.";
      }
    }

    const userMessage: AiChatMessage = {
      id: randomUUID(),
      role: "user",
      text: message,
      createdAt: Date.now(),
    };
    const assistantMessageId = randomUUID();
    const assistantMessage: AiChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      text: reply,
      ...(proposals.length ? { proposals } : {}),
      createdAt: Date.now() + 1,
    };
    await appendMessage(db, businessId, body.sessionId, userMessage);
    await appendMessage(db, businessId, body.sessionId, assistantMessage);

    await recordAiUsage(db, businessId, usage, 1);

    const payload: AiChatResponse = { reply, proposals, messageId: assistantMessageId, rememberedNote, question };
    return Response.json(payload);
  } catch (err) {
    // The model provider failed, so the customer got nothing for this turn:
    // don't make them pay for it out of their daily allowance.
    if (charged && err instanceof AnthropicApiError) {
      await refundAiDailyTurn(charged.db, charged.businessId);
      // The refunded turn is not a turn, but any earlier round of it was still billed by the provider.
      await recordAiUsage(charged.db, charged.businessId, usage, 0);
    }
    return aiErrorResponse(err, "api/ai/chat");
  }
}