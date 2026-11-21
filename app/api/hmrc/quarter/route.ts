// Server-only (v319). One quarter of the self-employment figures for HMRC.
//   GET  ?taxYearStart=2026&index=1 : the figures from the books for that quarter. Calls nothing at HMRC.
//   POST { taxYearStart, index, confirmed: true } : sends that quarter to HMRC. Refused, before any call, unless HMRC_SUBMIT_ENABLED is
//        "true", the owner has confirmed the figures, the business is connected and its ID is saved. The figures are read again from the
//        books here, never taken from the browser. Owner only; never the public demo.
import { aiErrorResponse } from "@/lib/apiError";
import { AiAuthError } from "@/lib/firebaseAdmin";
import { requireFeedOwner } from "@/lib/bankFeedServer";
import { hmrcSettings, quarterFor, submitRefusal, taxYearLabel, govHeaders, normaliseBusinessId, normaliseNino } from "@/lib/hmrcMtd";
import { submitQuarterlyUpdate, usableTokens, HmrcError } from "@/lib/hmrcClient";
import { hmrcStateRef, openTokens, quarterFromBooks, sealKey, sealTokens, type HmrcStateDoc } from "@/lib/hmrcServer";
import { openValue } from "@/lib/secretBox";
import { isRateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const APP_VERSION = "319";

function parsePeriod(taxYearStart: unknown, index: unknown) {
  const y = Number(taxYearStart);
  const i = Number(index);
  if (!Number.isInteger(y) || y < 2000 || y > 2100 || !Number.isInteger(i) || i < 1 || i > 4) throw new AiAuthError("Choose a tax year and a quarter.", 400);
  const q = quarterFor(y, i);
  if (!q) throw new AiAuthError("Choose a tax year and a quarter.", 400);
  return { y, i, q, taxYear: taxYearLabel(y) };
}

export async function GET(req: Request) {
  try {
    const ctx = await requireFeedOwner(req);
    const url = new URL(req.url);
    const { q, taxYear } = parsePeriod(url.searchParams.get("taxYearStart"), url.searchParams.get("index"));
    const figures = await quarterFromBooks(ctx.db, ctx.businessId, q);
    return Response.json({ taxYear, quarter: q, ...figures, submitEnabled: hmrcSettings(process.env).submitEnabled });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    return aiErrorResponse(err, "hmrc-quarter-read");
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireFeedOwner(req);
    const body = (await req.json().catch(() => ({}))) as { taxYearStart?: unknown; index?: unknown; confirmed?: unknown };
    const { q, taxYear } = parsePeriod(body.taxYearStart, body.index);
    const s = hmrcSettings(process.env);
    // The switch is checked first, so with it off nothing else runs and nothing is sent.
    if (!s.submitEnabled) {
      return Response.json({ ok: false, sent: false, error: submitRefusal({ submitEnabled: false, confirmed: false, connected: false, hasBusiness: false }) }, { status: 403 });
    }
    if (!s.configured) return Response.json({ error: `HMRC isn't set up on this server yet. The operator needs to set ${s.missing.join(", ")}.` }, { status: 503 });
    const key = sealKey(process.env.BALANCR_ENC_KEY);
    if (!key) return Response.json({ error: "The server's secret key isn't set, so the HMRC details can't be read." }, { status: 503 });

    const stateRef = hmrcStateRef(ctx.db, ctx.businessId);
    const doc = ((await stateRef.get()).data() ?? {}) as HmrcStateDoc;
    const nino = doc.ninoSealed ? normaliseNino(openValue(doc.ninoSealed, key) ?? "") : null;
    const businessId = doc.businessId ? normaliseBusinessId(doc.businessId) : null;
    const stored = openTokens(doc, key);
    const refusal = submitRefusal({ submitEnabled: true, confirmed: body.confirmed === true, connected: !!stored, hasBusiness: !!(nino && businessId) });
    if (refusal) return Response.json({ ok: false, sent: false, error: refusal }, { status: 409 });
    if (await isRateLimited("hmrc-submit", ctx.businessId, 20, 24 * 60 * 60 * 1000)) {
      return Response.json({ ok: false, sent: false, error: "Too many submissions today. Try again tomorrow." }, { status: 429 });
    }

    const figures = await quarterFromBooks(ctx.db, ctx.businessId, q);
    const usable = await usableTokens(s, stored as NonNullable<typeof stored>);
    if (usable.refreshed) await stateRef.set(sealTokens(usable.tokens, key), { merge: true });
    try {
      await submitQuarterlyUpdate(s, {
        accessToken: usable.tokens.accessToken,
        nino: nino as string,
        businessId: businessId as string,
        taxYear,
        from: q.from,
        to: q.to,
        turnover: figures.turnover,
        expenses: figures.expenses,
        headers: govHeaders({ appVersion: APP_VERSION, userId: ctx.uid }),
      });
    } catch (err) {
      const reason = err instanceof HmrcError ? err.message : "The quarter could not be sent.";
      await stateRef.set({ lastSubmission: { at: Date.now(), taxYear, index: q.index, turnover: figures.turnover, expenses: figures.expenses, status: "failed", reason } }, { merge: true });
      return Response.json({ ok: false, sent: false, error: reason }, { status: 502 });
    }
    await stateRef.set({ lastSubmission: { at: Date.now(), taxYear, index: q.index, turnover: figures.turnover, expenses: figures.expenses, status: "sent" } }, { merge: true });
    return Response.json({ ok: true, sent: true, taxYear, quarter: q, turnover: figures.turnover, expenses: figures.expenses });
  } catch (err) {
    if (err instanceof AiAuthError) return Response.json({ error: err.message }, { status: err.status });
    return aiErrorResponse(err, "hmrc-quarter-submit");
  }
}
