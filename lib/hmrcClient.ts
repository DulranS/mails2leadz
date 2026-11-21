// HMRC calls for quarterly updates (v319). Each call takes the fetch to use, so the verifier mocks it and nothing reaches HMRC in a test.
// Tokens and the client secret travel in request bodies and headers only. An error carries a plain sentence and HMRC's error code, never
// a token, a secret or the response body.
import { authorizeUrl, buildQuarterlyUpdate, type HmrcSettings, type QuarterlyUpdateBody } from "./hmrcMtd";

export class HmrcError extends Error {
  readonly status: number | null;
  readonly code: string | undefined;
  constructor(message: string, status: number | null, code?: string) {
    super(message);
    this.name = "HmrcError";
    this.status = status;
    this.code = code;
  }
}

export interface HmrcTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms since the epoch
}

export type FetchImpl = typeof fetch;

const SAFETY_MS = 60_000; // refresh a token a minute before it runs out

async function readJson(res: Response): Promise<{ code?: string; [k: string]: unknown }> {
  return ((await res.json().catch(() => ({}))) as { code?: string }) ?? {};
}

/** The sign-in address for the owner. The state is generated and stored by the route; this only builds the address. */
export function hmrcAuthorizeAddress(s: HmrcSettings, state: string): string {
  return authorizeUrl({ authBase: s.authBase ?? "", clientId: s.clientId, redirectUri: s.redirectUri, state });
}

async function tokenCall(s: HmrcSettings, form: Record<string, string>, fetchImpl: FetchImpl, now: number): Promise<HmrcTokens> {
  let res: Response;
  try {
    res = await fetchImpl(`${s.authBase}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: s.clientId, client_secret: s.clientSecret, ...form }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HmrcError("Couldn't reach HMRC. Try again shortly.", null, "NETWORK");
  }
  const payload = await readJson(res);
  if (!res.ok) throw new HmrcError("HMRC did not accept the sign-in. Connect the business again.", res.status, payload.code);
  const access = payload.access_token as string | undefined;
  const refresh = payload.refresh_token as string | undefined;
  const expiresIn = Number(payload.expires_in ?? 0);
  if (!access || !refresh || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new HmrcError("HMRC's answer was incomplete. Connect the business again.", res.status, "NO_TOKENS");
  return { accessToken: access, refreshToken: refresh, expiresAt: now + expiresIn * 1000 };
}

/** Trades the code HMRC sent back for tokens. */
export function exchangeCode(s: HmrcSettings, code: string, fetchImpl: FetchImpl = fetch, now = Date.now()): Promise<HmrcTokens> {
  return tokenCall(s, { grant_type: "authorization_code", code, redirect_uri: s.redirectUri }, fetchImpl, now);
}

/** Gets a new access token from the refresh token. */
export function refreshTokens(s: HmrcSettings, refreshToken: string, fetchImpl: FetchImpl = fetch, now = Date.now()): Promise<HmrcTokens> {
  return tokenCall(s, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl, now);
}

/** The tokens to use now: the stored ones, or a refreshed pair when the access token has run out (or is about to). */
export async function usableTokens(s: HmrcSettings, stored: HmrcTokens, fetchImpl: FetchImpl = fetch, now = Date.now()): Promise<{ tokens: HmrcTokens; refreshed: boolean }> {
  if (stored.expiresAt - SAFETY_MS > now) return { tokens: stored, refreshed: false };
  return { tokens: await refreshTokens(s, stored.refreshToken, fetchImpl, now), refreshed: true };
}

export interface SubmitInput {
  accessToken: string;
  nino: string;
  businessId: string;
  taxYear: string; // e.g. 2026-27
  from: string;
  to: string;
  turnover: number;
  expenses: number;
  headers: Record<string, string>; // the Gov-Client-* and Gov-Vendor-* headers (lib/hmrcMtd.ts govHeaders)
}

/** Sends one quarter's update. Refuses (throws) when the figures are not valid, before any call is made. */
export async function submitQuarterlyUpdate(s: HmrcSettings, i: SubmitInput, fetchImpl: FetchImpl = fetch): Promise<{ status: number; body: QuarterlyUpdateBody }> {
  const built = buildQuarterlyUpdate({ from: i.from, to: i.to, turnover: i.turnover, expenses: i.expenses });
  if ("error" in built) throw new HmrcError(built.error, null, "BAD_PERIOD");
  const url = `${s.apiBase}/individuals/business/self-employment/${encodeURIComponent(i.nino)}/${encodeURIComponent(i.businessId)}/periods?taxYear=${encodeURIComponent(i.taxYear)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.hmrc.1.0+json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${i.accessToken}`,
        ...i.headers,
      },
      body: JSON.stringify(built.body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new HmrcError("Couldn't reach HMRC. Nothing was sent. Try again shortly.", null, "NETWORK");
  }
  if (!res.ok) {
    const payload = await readJson(res);
    throw new HmrcError(`HMRC did not accept the quarter (${res.status}${payload.code ? `, ${payload.code}` : ""}). Check the figures and try again.`, res.status, payload.code);
  }
  return { status: res.status, body: built.body };
}
