// ---------------------------------------------------------------------------
// Standalone, public, no-auth page (see components/AppShell.tsx —
// isStandalonePage). A static draft, not a form or an editor: edit the copy
// in this file and redeploy.
//
// This is written from the point of view of the SELLER of the product
// (Syndicate Software Solutions, as named on the landing page) talking to the
// SME customer who uses it — the earlier version was a one-business
// "internal use" template ("not a public product, no member of the public
// may create an account") which contradicted selling it and left literal
// [PLACEHOLDERS] on a public page.
//
// It describes what the code actually does today: Firebase stores the data;
// the optional AI Assistant sends text to DeepSeek; trial requests store
// technical details (IP, browser) as an anti-abuse trail; Resend emails the
// operator about new trial requests and feedback. If any of those change,
// change this page.
//
// IMPORTANT — this is a plain-language draft, not legal advice, and was not
// written or reviewed by a lawyer. Have a qualified person review it for your
// jurisdiction before relying on it, especially: governing law, data-protection
// obligations where your customers are, breach notification, and liability
// limits (deliberately not included here because they are jurisdiction-specific).
// scripts/check-launch-readiness.mjs fails if a [BRACKETED] placeholder is
// ever reintroduced.
// ---------------------------------------------------------------------------

export const metadata = {
  title: "Privacy Policy & Terms — Balancr",
};

const PROVIDER = "Syndicate Software Solutions";

export default function LegalPage() {
  // Same public support address the rest of the app uses; read at build time.
  const contact = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();

  return (
    <main className="min-h-screen bg-ink text-fg px-4 py-10 sm:py-14">
      <div className="max-w-2xl mx-auto space-y-12">
        <div>
          <h1 className="text-xl font-display font-medium mb-1">Privacy Policy &amp; Terms of Service</h1>
          <p className="text-sm text-muted">
            Balancr is provided by {PROVIDER} (&quot;we&quot;, &quot;us&quot;). Last updated: 21 September 2026.
            {contact ? (
              <>
                {" "}
                Contact: <a href={`mailto:${contact}`} className="text-amber-soft hover:underline underline-offset-2">{contact}</a>.
              </>
            ) : null}
          </p>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-fg/90">
          <h2 className="text-base font-medium">Privacy Policy</h2>

          <p>
            <strong>Your business data is yours.</strong> Balancr stores the records you and your team enter — sales,
            purchases, expenses, customer and supplier names and contact details, product and pricing information,
            and, if you use those features, employee names, pay details and hours. We use this data only to run the
            service for you. We do not sell it, and we do not use it to advertise.
          </p>

          <p>
            <strong>Where it is stored.</strong> Your data is stored with Google Firebase (sign-in, database and file
            storage). Access inside your business is limited to the people the owner has invited, each with the
            role (owner, manager or staff) the owner assigned. We can access your account data when needed to provide
            support or operate the service, for example to suspend or reactivate an account.
          </p>

          <p>
            <strong>The AI Assistant (optional).</strong> When an owner or manager uses the Assistant, the text they
            type, together with the parts of your records needed to answer or fill in the request (for example product
            names and the figures a report returns), is sent to the AI provider, DeepSeek, using the key the business has added (or, for the public demo and the businesses the operator runs, the operator&apos;s key), to process that request.
            Nothing is sent unless someone uses the Assistant. The Assistant proposes entries for you to review;
            nothing is saved to your books until you confirm it.
          </p>

          <p>
            <strong>Requesting a trial.</strong> The request form asks for your name, email, and optionally your
            business name and a message. To prevent abuse we also record technical details of the submission, such as
            IP address, browser and device information, language and time zone. We use this to review and set up your
            account and to deal with spam. We email a confirmation link to the address you give; until you click it your
            request is held separately and, if you never confirm, deleted after about a week. We are notified of new
            requests and feedback by email through an email delivery provider (Resend).
          </p>

          <p>
            <strong>Other sharing.</strong> Beyond the providers above (Google Firebase, DeepSeek, Resend), we do not
            share your data with anyone except where the law requires it.
          </p>

          <p>
            <strong>Your rights and deletion.</strong> You can export your data at any time (Import/Export → Download
            full backup). If you are a customer, supplier or employee whose details appear in a business&apos;s
            records, ask that business first; you can also contact us
            {contact ? <> at {contact}</> : null} and we will pass your request on. If a business asks us to close its
            account and delete its data, we will do so.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed text-fg/90">
          <h2 className="text-base font-medium">Terms of Service</h2>

          <p>
            <strong>The service.</strong> Balancr is bookkeeping and decision-support software for small businesses.
            Accounts are set up by us after a trial request; team members join through an invitation from the
            business owner.
          </p>

          <p>
            <strong>Not professional advice, and nothing is filed anywhere.</strong> Balancr does not connect to, or
            submit anything to, any tax authority or other regulator. Figures it calculates — statements, margins,
            forecasts, reorder points, anomaly flags and anything produced by the AI Assistant — are estimates to help
            you decide. They are not audited financial statements or tax, legal or accounting advice; check them with a
            qualified professional before relying on them for tax, lending or other major decisions. Printed
            statements carry the same note.
          </p>

          <p>
            <strong>Your records and your controls.</strong> You are responsible for the accuracy of what you and your
            team enter and for who you invite. Tools such as roles, the activity log and closing a month are there to
            help you control your books; they do not replace your own review.
          </p>

          <p>
            <strong>Backups.</strong> You can download a full backup at any time. Please take backups regularly and
            keep them safe; we are not responsible for loss that a backup you did not take would have prevented.
          </p>

          <p>
            <strong>Trials, billing and suspension.</strong> Trials are free, with no card required. After a trial,
            billing is arranged directly with us (for example by invoice or bank transfer). If a trial has ended or a
            payment is overdue we may suspend access until it is sorted out; your data is not deleted by suspension.
          </p>

          <p>
            <strong>Acceptable use.</strong> Only enter data you are entitled to hold, do not share your login, and do
            not attempt to access another business&apos;s data or interfere with the service.
          </p>

          <p>
            <strong>Availability.</strong> The service is provided &quot;as is&quot;. We aim to keep it running but do
            not promise uninterrupted availability.
          </p>
        </section>
      </div>
    </main>
  );
}
