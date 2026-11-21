import { requireAiContext, loadBusinessContext } from "@/lib/firebaseAdmin";
import { autoConfirmEntry } from "@/lib/aiAutoConfirm";
import type { ProposedEntry } from "@/lib/aiTypes";
import { aiErrorResponse } from "@/lib/apiError";
import { buildAutoConfirmResponse, type AutoConfirmResult } from "@/lib/aiAutoConfirmShared";

export const runtime = "nodejs";

interface AutoConfirmRequest {
  entries: ProposedEntry[];
}

// The explicit "skip review" path — used by the assistant page's "Confirm all"
// button and the Quick Entry modal's "Save without reviewing" checkbox, both of
// which are human-triggered and off by default, and which the *caller* is
// responsible for only invoking on proposals still in "pending" status
// (see contexts/AiAssistantContext.tsx / app/assistant/page.tsx): calling
// this twice on an already-confirmed entry would double-log it, since this
// route has no idea what's already been written.
export async function POST(req: Request) {
  try {
    const ctx = await requireAiContext(req);
    const body = (await req.json()) as AutoConfirmRequest;
    const { entries } = body;

    if (!entries || !Array.isArray(entries)) {
      return Response.json({ error: "entries array is required" }, { status: 400 });
    }

    if (entries.length === 0) {
      return Response.json(buildAutoConfirmResponse([]));
    }

    const { db, businessId, uid, memberName } = ctx;
    const { settings } = await loadBusinessContext(db, businessId);
    const deps = { db, businessId, uid, memberName, settings };
    const results: AutoConfirmResult[] = [];

    for (const entry of entries) {
      try {
        await autoConfirmEntry(deps, entry);
        results.push({ id: entry.id, success: true });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        results.push({ id: entry.id, success: false, error: errorMessage });
      }
    }

    // The shape the browser expects is defined next to its parser in
    // lib/aiAutoConfirmShared.ts — change it there, not here.
    return Response.json(buildAutoConfirmResponse(results));
  } catch (err) {
    return aiErrorResponse(err, "api/ai/auto-confirm");
  }
}
