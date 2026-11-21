// Public: the "Try it now" button asks here for a one-time sign-in token to the shared demo business
// (see lib/demoServer.ts for why there is no shared password any more). It is open by design — a
// visitor has no account yet — so it is rate limited per IP, and every refusal or failure looks the
// same ("unavailable") so the response teaches a prober nothing about how the demo is set up. The real
// reasons (no such account, account isn't a Demo plan, Firebase not configured) go to the server log
// and, for the admin, to the "Reset demo now" button's error message.
//
// The token is minted only for the account lib/demoServer.ts has verified is a Demo-plan
// complimentary sandbox. This route takes no input at all — there is no way to ask it for a token
// for any other business.
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { openDemoSession } from "@/lib/demoServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A session that has to reset the demo first writes a few hundred documents.
export const maxDuration = 60;

const unavailable = () => Response.json({ error: "The demo is unavailable right now." }, { status: 503 });

export async function POST(req: Request) {
  try {
    // A real visitor opens the demo once or twice an hour; a script looping on this is what the limit is for.
    if (await isRateLimited("demo-session", requestIp(req), 12, 60 * 60 * 1000)) {
      return Response.json({ error: "Please try again in a little while." }, { status: 429 });
    }
    const { token } = await openDemoSession();
    return Response.json({ token });
  } catch (err) {
    console.error("[demo/session POST]", err);
    return unavailable();
  }
}
