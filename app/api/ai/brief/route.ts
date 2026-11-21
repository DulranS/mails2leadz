// Server-only. The owner's weekly brief: a few plain sentences about the week, written from figures the app computed
// (lib/ownerBrief.ts). The model is not asked to calculate, and a brief quoting any figure not supplied is refused.
// Same auth, business key, demo cap and daily cap as the other AI routes. Nothing is saved or sent.
import { requireAiContext, loadBusinessContext } from "@/lib/firebaseAdmin";
import { enforceAiDailyLimit, refundAiDailyTurn, recordAiUsage, emptyAiUsage, addProviderUsage } from "@/lib/aiUsageLimit";
import { aiLimitsFor } from "@/lib/guardrails";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { callClaude, AnthropicApiError } from "@/lib/anthropic";
import { aiErrorResponse } from "@/lib/apiError";
import { resolveAiKey } from "@/lib/aiKey";
import { buildBriefPrompt, finalizeBrief, validateBriefFacts } from "@/lib/ownerBrief";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let charged: { db: Awaited<ReturnType<typeof requireAiContext>>["db"]; businessId: string } | null = null;
  try {
    const { db, businessId, accountKind, adminAccount } = await requireAiContext(req);
    const aiKey = await resolveAiKey(db, businessId, accountKind);
    const { settings } = await loadBusinessContext(db, businessId);
    const limits = aiLimitsFor(accountKind, settings.aiDailyMessageLimit, adminAccount);
    if (limits.perIpDailyTurns > 0 && (await isRateLimited("demo-ai", requestIp(req), limits.perIpDailyTurns, 24 * 60 * 60 * 1000))) {
      return Response.json({ error: "You've used the demo's AI allowance for today. Request a free trial to try it on your own books." }, { status: 429 });
    }
    const body = (await req.json().catch(() => ({}))) as { facts?: unknown };
    const facts = validateBriefFacts(body.facts);
    if (!facts) return Response.json({ error: "The week's figures could not be read. Refresh the page and try again." }, { status: 400 });

    await enforceAiDailyLimit(db, businessId, settings, limits.dailyTurns);
    charged = { db, businessId };

    const prompt = buildBriefPrompt(facts, { name: settings.businessName, currency: settings.currency });
    const response = await callClaude({
      apiKey: aiKey.apiKey,
      system: [{ type: "text", text: prompt.system }],
      messages: [{ role: "user", content: prompt.user }],
      maxTokens: 500,
    });
    const usage = emptyAiUsage();
    addProviderUsage(usage, response.usage);
    const written = response.content
      .map((block) => (block.type === "text" ? (block as { text?: string }).text ?? "" : ""))
      .join(" ");
    const text = finalizeBrief(written, facts);
    if (!text) {
      await refundAiDailyTurn(db, businessId);
      await recordAiUsage(db, businessId, usage, 0);
      return Response.json({ error: "Couldn't write a brief that matched your figures. Try again." }, { status: 502 });
    }
    await recordAiUsage(db, businessId, usage, 1);
    return Response.json({ text });
  } catch (err) {
    if (charged && err instanceof AnthropicApiError) await refundAiDailyTurn(charged.db, charged.businessId);
    return aiErrorResponse(err, "brief");
  }
}
