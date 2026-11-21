// Server-only. "Write with AI": drafts a first message, a follow-up, or three post ideas from the owner's own description of
// what the business sells (Settings.offerContext). The draft is TEXT for the owner to read, edit and send themselves: nothing is
// sent, scheduled, posted or saved here.
//
// Same auth and cost controls as /api/ai/suggest-price and the chat (requireAiContext, the per-kind daily cap, the demo's
// per-IP cap, give the message back when the provider fails or the answer is unusable). The rules about what a draft may
// say live in lib/aiDraft.ts so they are tested without a model.

import { requireAiContext, loadBusinessContext } from "@/lib/firebaseAdmin";
import { enforceAiDailyLimit, refundAiDailyTurn, recordAiUsage, emptyAiUsage, addProviderUsage } from "@/lib/aiUsageLimit";
import { aiLimitsFor } from "@/lib/guardrails";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { callClaude, extractToolUses, AnthropicApiError, type AnthropicTool } from "@/lib/anthropic";
import { aiErrorResponse } from "@/lib/apiError";
import { resolveAiKey } from "@/lib/aiKey";
import { buildDraftSystemPrompt, buildDraftUserContent, finalizeDraft, offerContextProblem, validateDraftRequest } from "@/lib/aiDraft";

export const runtime = "nodejs";
export const maxDuration = 60;

const WRITE_DRAFT_TOOL: AnthropicTool = {
  name: "write_draft",
  description: "Return the finished text for the owner to review.",
  input_schema: {
    type: "object",
    properties: { text: { type: "string", description: "The finished message or post ideas, plain text." } },
    required: ["text"],
  },
};

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
    // Everything that can be refused is refused BEFORE a message is counted.
    const parsed = validateDraftRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const problem = offerContextProblem(settings.offerContext);
    if (problem) return Response.json({ error: problem }, { status: 400 });

    await enforceAiDailyLimit(db, businessId, settings, limits.dailyTurns);
    charged = { db, businessId };

    const response = await callClaude({
      apiKey: aiKey.apiKey,
      system: [{ type: "text", text: buildDraftSystemPrompt(parsed.req.kind, { name: settings.businessName, offer: settings.offerContext as string }) }],
      messages: [{ role: "user", content: buildDraftUserContent(parsed.req) }],
      tools: [WRITE_DRAFT_TOOL],
      maxTokens: parsed.req.kind === "post_ideas" ? 900 : 450,
    });

    const usage = emptyAiUsage();
    addProviderUsage(usage, response.usage);
    const [call] = extractToolUses(response);
    const text = call && call.name === "write_draft" ? finalizeDraft((call.input as { text?: unknown }).text, parsed.req.kind) : null;
    if (!text) {
      await refundAiDailyTurn(db, businessId);
      await recordAiUsage(db, businessId, usage, 0);
      return Response.json({ error: "Couldn't write a usable draft that time. Try again, or use one of the ready-written messages." }, { status: 502 });
    }
    await recordAiUsage(db, businessId, usage, 1);
    return Response.json({ text });
  } catch (err) {
    if (charged && err instanceof AnthropicApiError) await refundAiDailyTurn(charged.db, charged.businessId);
    return aiErrorResponse(err, "draft");
  }
}
