// Server-only. Says which outside services are switched on (keys present or not), so the Settings page can show it. Returns
// names and missing variable names only, never a key or its value. Owners and managers only, like the other financial routes.
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { aiErrorResponse } from "@/lib/apiError";
import { connectionStatuses } from "@/lib/connections";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAiContext(req);
    return Response.json({ connections: connectionStatuses(process.env) });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    return aiErrorResponse(err, "connections");
  }
}
