// Creates a new customer business — the auth login AND its bootstrap
// documents — on the server with the Admin SDK, behind the admin passcode.
//
// Why this exists: provisioning used to run in the admin's browser through a
// second client-SDK app (lib/provisioning.ts), which only worked because
// firestore.rules let ANY signed-in user create their own
// `memberships/{uid}` pointing at themselves. Firebase's web config is public,
// so anyone could call createUserWithEmailAndPassword themselves, write that
// pointer, and own a free business with no trial request, no admin approval
// and no billing record — bypassing this whole pipeline. Doing the writes
// here (the Admin SDK bypasses rules) lets firestore.rules drop that
// "brand-new business" branch entirely: a self-signed-up stranger now has a
// login but no business, and the app shows them "This login isn't linked to a
// business yet" (components/AppShell.tsx).
//
// Team members are unaffected: they still join through an owner's invite
// (app/join), which the rules validate against the exact pending invite.
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { ProvisionError, provisionOwner } from "@/lib/provisionServer";
import { siteOrigin } from "@/lib/lifecycleServer";

export const runtime = "nodejs";

// The work itself — login, business, trial date, plan and price, the lead's "provisioned"
// mark and the welcome email — lives in lib/provisionServer.ts, shared with the optional
// automatic activation in app/api/trial-requests/route.ts so the two cannot drift apart.
// This route is just the passcode-gated door for the admin panel.
export async function POST(req: Request) {
  try {
    await requireAdminPasscode(req);
    const body = await req.json().catch(() => ({}));
    const result = await provisionOwner({
      email: body?.email,
      ownerName: body?.ownerName,
      businessName: body?.businessName,
      trialDays: body?.trialDays,
      plan: body?.plan,
      billingCycle: body?.billingCycle,
      requestId: body?.requestId,
      sendWelcome: body?.sendWelcome !== false,
      origin: siteOrigin(req),
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof ProvisionError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return adminErrorResponse(err, "admin/provision POST");
  }
}
