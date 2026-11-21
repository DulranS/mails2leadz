// Server-only. Suggests a starting retail sell price for a new/edited
// product or service, to speed up pricing on the Products form.
//
// Important limitation, worth keeping front-of-mind: this does NOT look up
// a live market MSRP. The model this app talks to (see lib/anthropic.ts)
// has no web/browsing tool wired in here — its answer comes entirely from
// whatever general pricing knowledge it learned in training, which may be
// stale, US/global-skewed, and not aligned to this business's actual local
// market. It's a starting-point estimate the owner is expected to sanity-
// check and edit, never a source of truth the way WAC/COGS are elsewhere
// in this app. Framed and labeled as such below and in the UI — never
// call the field it returns "MSRP" to the user, since that implies a real
// published list price this app has no way to actually verify.
//
// Reuses the same auth + daily-cap machinery as /api/ai/chat
// (requireAiContext, enforceAiDailyLimit) rather than being a second,
// unmetered live API surface — see the note on DEFAULT_AI_DAILY_MESSAGE_LIMIT
// in lib/aiUsageLimit.ts for why an uncapped route here is a real cost risk,
// not just a theoretical one.

import { requireAiContext, loadBusinessContext } from "@/lib/firebaseAdmin";
import { enforceAiDailyLimit, refundAiDailyTurn, recordAiUsage, emptyAiUsage, addProviderUsage } from "@/lib/aiUsageLimit";
import { aiLimitsFor } from "@/lib/guardrails";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { callClaude, extractToolUses, AnthropicApiError, type AnthropicTool } from "@/lib/anthropic";
import { aiErrorResponse } from "@/lib/apiError";
import { resolveAiKey } from "@/lib/aiKey";

export const runtime = "nodejs";
// Room for a few tool rounds plus the provider timeout; ignored by hosts without a limit.
export const maxDuration = 60;

const SUGGEST_PRICE_TOOL: AnthropicTool = {
  name: "suggest_price",
  description: "Report a suggested retail sell price and the reasoning behind it.",
  input_schema: {
    type: "object",
    properties: {
      suggestedPrice: {
        type: "number",
        description: "Suggested sell price per unit, in the business's stated currency. A plain number, no symbol.",
      },
      reasoning: {
        type: "string",
        description: "One short sentence on how this was estimated (typical range, margin logic used, etc).",
      },
      lowEstimate: { type: "number", description: "Low end of a plausible price range, same currency." },
      highEstimate: { type: "number", description: "High end of a plausible price range, same currency." },
    },
    required: ["suggestedPrice", "reasoning"],
  },
};

export async function POST(req: Request) {
  // Set once this request has been counted against the daily cap, so a
  // provider failure or an unusable answer can give it back.
  let charged: { db: Awaited<ReturnType<typeof requireAiContext>>["db"]; businessId: string } | null = null;
  try {
    const { db, businessId, accountKind, adminAccount } = await requireAiContext(req);
    const aiKey = await resolveAiKey(db, businessId, accountKind);
    const { settings } = await loadBusinessContext(db, businessId);
    // Same per-kind allowance as the chat (lib/guardrails.ts), so a free account can't get past its
    // cap by using this route instead.
    const limits = aiLimitsFor(accountKind, settings.aiDailyMessageLimit, adminAccount);
    if (limits.perIpDailyTurns > 0 && (await isRateLimited("demo-ai", requestIp(req), limits.perIpDailyTurns, 24 * 60 * 60 * 1000))) {
      return Response.json({ error: "You've used the demo's AI allowance for today. Request a free trial to try it on your own books." }, { status: 429 });
    }
    // Validated BEFORE the turn is counted: an empty name is a form mistake, not a model call, and
    // used to cost the customer one of their daily messages for nothing.
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      category?: string;
      type?: "product" | "service";
      defaultCostPrice?: number;
    };
    const name = (body.name ?? "").trim();
    if (!name) {
      return Response.json({ error: "Enter a name first so there's something to price." }, { status: 400 });
    }
    await enforceAiDailyLimit(db, businessId, settings, limits.dailyTurns);
    charged = { db, businessId };

    const kind = body.type === "service" ? "service" : "product";
    const category = (body.category ?? "").trim();
    const cost = typeof body.defaultCostPrice === "number" && body.defaultCostPrice > 0 ? body.defaultCostPrice : undefined;

    const facts = [
      `Name: ${name}`,
      category ? `Category: ${category}` : null,
      `Kind: ${kind}`,
      cost ? `Known cost to the business, per unit: ${cost} ${settings.currency}` : null,
      `Business currency: ${settings.currency}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await callClaude({
      apiKey: aiKey.apiKey,
      system: [
        {
          type: "text",
          text: [
            "You help a small business owner set a starting retail sell price for something they're about to add to their price list.",
            "You have no live pricing/web data — answer from general knowledge only, and say so implicitly by keeping the reasoning honest about being an estimate, not a quote.",
            `Give the number in ${settings.currency}, as a plain figure a small/local business in that currency's typical market could plausibly charge — not a US list price converted at face value.`,
            cost
              ? "A cost is given — make sure the suggested price clears a sane retail margin above it, and say so in the reasoning."
              : "No cost was given — base the suggestion on typical retail pricing for this kind of item/service.",
            "Always call suggest_price exactly once with your answer. Never write prose outside the tool call.",
          ].join("\n"),
        },
      ],
      messages: [{ role: "user", content: facts }],
      tools: [SUGGEST_PRICE_TOOL],
      maxTokens: 400,
    });

    const [call] = extractToolUses(response);
    const usage = emptyAiUsage();
    addProviderUsage(usage, response.usage);
    if (!call || call.name !== "suggest_price") {
      await refundAiDailyTurn(db, businessId);
      await recordAiUsage(db, businessId, usage, 0);
      return Response.json({ error: "Couldn't come up with a suggestion for that — try entering more detail." }, { status: 502 });
    }
    const input = call.input as { suggestedPrice?: number; reasoning?: string; lowEstimate?: number; highEstimate?: number };
    if (typeof input.suggestedPrice !== "number" || !Number.isFinite(input.suggestedPrice) || input.suggestedPrice <= 0) {
      await refundAiDailyTurn(db, businessId);
      await recordAiUsage(db, businessId, usage, 0);
      return Response.json({ error: "Couldn't come up with a usable suggestion for that." }, { status: 502 });
    }

    await recordAiUsage(db, businessId, usage, 1);

    return Response.json({
      suggestedPrice: Math.round(input.suggestedPrice * 100) / 100,
      reasoning: input.reasoning ?? "",
      lowEstimate: typeof input.lowEstimate === "number" ? input.lowEstimate : undefined,
      highEstimate: typeof input.highEstimate === "number" ? input.highEstimate : undefined,
      currency: settings.currency,
    });
  } catch (err) {
    if (charged && err instanceof AnthropicApiError) await refundAiDailyTurn(charged.db, charged.businessId);
    return aiErrorResponse(err, "suggest-price");
  }
}
