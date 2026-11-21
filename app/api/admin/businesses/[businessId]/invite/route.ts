// "Send sign-in link" — gives an owner a fresh link to choose their password, by email, and
// hands the same link back to the admin so it can be pasted into WhatsApp when email is off.
//
// This is the one-press answer to the commonest onboarding problem: a customer who never
// opened the welcome email, or opened it after its link had died. The link is OURS and stays
// valid for days (lib/signedToken.ts, app/api/start/route.ts), and it stops working the
// moment the owner has signed in once — so it is refused here for someone who already has
// (they use "Forgot password" on the login page, which is the right tool for that).
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { signInLinkEmail } from "@/lib/lifecycle";
import { emailOwnerDetailed, loadOwner, ownerHasSignedIn, siteOrigin } from "@/lib/lifecycleServer";
import { buildSignInLink } from "@/lib/provisionServer";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { businessId: string } }) {
  try {
    await requireAdminPasscode(req);
    const { businessId } = params;
    const body = await req.json().catch(() => ({}));
    const send = body?.send !== false;

    const owner = await loadOwner(businessId);
    if (!owner) {
      return Response.json({ error: "That account has no owner email on file." }, { status: 404 });
    }
    if ((await ownerHasSignedIn(businessId)) === true) {
      return Response.json(
        { error: "They have already signed in, so a set-password link won't work for them. They can use “Forgot password” on the login page.", signedIn: true },
        { status: 409 }
      );
    }

    const origin = siteOrigin(req);
    const link = await buildSignInLink(businessId, owner.email, origin);
    // Never hand out nothing: without a link there is nothing to send or copy, so say what to fix.
    if (!link.url) {
      return Response.json(
        { error: "Couldn't make a sign-in link. Set LINK_SIGNING_SECRET (or check FIREBASE_PRIVATE_KEY) on the server, then try again." },
        { status: 500 }
      );
    }
    // A Firebase link (no signing secret) lasts about an hour; say so, because it shows "expired" once that has passed.
    const warning = link.days
      ? null
      : "This link works for about an hour only. Opened later, it shows Firebase's “expired” page. Set LINK_SIGNING_SECRET so the link lasts 7 days.";
    const emailResult = send
      ? await emailOwnerDetailed(
          businessId,
          // Only a long-lived link is described as such; Firebase's own lasts about an hour, so
          // when that is all we have the email just sends them to "Forgot password".
          (ctx) => signInLinkEmail({ ...ctx, startUrl: link.days ? link.url : null }),
          req,
          owner
        )
      : null;

    return Response.json({
      to: owner.email,
      email: emailResult?.status ?? null,
      // Why the email failed, in words (admin-only response). Null when it sent or wasn't attempted.
      emailError: emailResult?.reason ?? null,
      link: link.url,
      validDays: link.days,
      validFor: link.days ? `${link.days} days` : "about one hour",
      warning,
    });
  } catch (err) {
    return adminErrorResponse(err, "admin/businesses/invite POST");
  }
}
